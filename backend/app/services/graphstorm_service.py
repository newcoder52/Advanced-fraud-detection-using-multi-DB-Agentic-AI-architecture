"""GraphStorm GNN Integration service for learned fraud detection.

Integrates Amazon Neptune Analytics with GraphStorm for training Graph Neural
Networks (GNNs) that learn fraud patterns from graph structure. Unlike
hand-crafted feature engineering, GNNs learn node embeddings and classifications
directly from the topology of the fraud graph.

Reference: https://aws.amazon.com/about-aws/whats-new/2025/06/amazon-neptune-analytics-integrates-graphstorm
"""

import json
import os
import time
import uuid
from typing import Dict, List, Optional
from datetime import datetime, timezone

import boto3
from botocore.config import Config

REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
GRAPH_ID = os.environ.get("NEPTUNE_GRAPH_ID", "")
S3_BUCKET = os.environ.get("GNN_S3_BUCKET", "multidb-poc-gnn-data")
SAGEMAKER_ROLE = os.environ.get("SAGEMAKER_EXECUTION_ROLE", "")
GRAPHSTORM_IMAGE = os.environ.get(
    "GRAPHSTORM_IMAGE",
    "533267195093.dkr.ecr.us-east-1.amazonaws.com/graphstorm:0.5-gpu"
)


class GraphStormService:
    """Manages GNN training and inference via GraphStorm + SageMaker.

    Workflow:
    1. Export graph data from Neptune Analytics to S3 (Parquet/CSV)
    2. Trigger SageMaker training job with GraphStorm container
    3. Load trained embeddings/classifications back into Neptune
    4. Serve predictions via real-time inference endpoint
    """

    def __init__(self):
        config = Config(connect_timeout=5, read_timeout=60, retries={"max_attempts": 2})
        self.neptune_client = boto3.client("neptune-graph", region_name=REGION, config=config)
        self.s3_client = boto3.client("s3", region_name=REGION)
        self.sagemaker_client = boto3.client("sagemaker", region_name=REGION, config=config)
        self._graph_id = GRAPH_ID
        self._training_jobs: Dict[str, dict] = {}

    @property
    def graph_id(self) -> str:
        if self._graph_id:
            return self._graph_id
        try:
            graphs = self.neptune_client.list_graphs()
            for g in graphs.get("graphs", []):
                if "multidb" in g.get("name", "").lower():
                    self._graph_id = g["id"]
                    return self._graph_id
        except Exception:
            pass
        return self._graph_id

    def _execute_query(self, query: str) -> dict:
        """Execute an openCypher query against Neptune Analytics."""
        if not self.graph_id:
            return {"error": "No Neptune graph configured", "results": []}
        try:
            response = self.neptune_client.execute_query(
                graphIdentifier=self.graph_id,
                queryString=query,
                language="OPEN_CYPHER",
            )
            payload = response.get("payload")
            if payload:
                return json.loads(payload.read())
            return {"results": []}
        except Exception as e:
            return {"error": str(e), "results": []}

    def export_graph_for_training(self, task_type: str = "node_classification") -> dict:
        """Export Neptune graph data to S3 for GraphStorm training.

        Exports nodes and edges in the format GraphStorm expects:
        - nodes.parquet: node_id, node_type, features, label
        - edges.parquet: source_id, target_id, edge_type
        """
        start = time.time()
        export_id = str(uuid.uuid4())[:8]
        s3_prefix = f"exports/{export_id}"

        # Query nodes with features
        node_query = """
            MATCH (n) WHERE n.id IS NOT NULL AND n.domain IS NULL
            RETURN n.id as node_id, labels(n)[0] as node_type,
                   n.risk_score as risk_score,
                   n.status as status,
                   CASE WHEN n.status IN ['FLAGGED', 'BLOCKED'] THEN 1 ELSE 0 END as is_fraud
            LIMIT 100000
        """
        nodes = self._execute_query(node_query).get("results", [])

        # Query edges
        edge_query = """
            MATCH (a)-[r]->(b) WHERE a.domain IS NULL AND b.domain IS NULL
            RETURN a.id as source_id, b.id as target_id, type(r) as edge_type,
                   r.weight as weight
            LIMIT 500000
        """
        edges = self._execute_query(edge_query).get("results", [])

        # Upload to S3 as JSON (GraphStorm supports JSON, CSV, Parquet)
        try:
            node_data = json.dumps(nodes, default=str)
            self.s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=f"{s3_prefix}/nodes.json",
                Body=node_data.encode(),
                ContentType="application/json",
            )

            edge_data = json.dumps(edges, default=str)
            self.s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=f"{s3_prefix}/edges.json",
                Body=edge_data.encode(),
                ContentType="application/json",
            )

            # Write GraphStorm config
            gs_config = {
                "version": "graphstorm-0.5",
                "graph": {
                    "nodes": [
                        {"type": "Account", "files": [f"s3://{S3_BUCKET}/{s3_prefix}/nodes.json"],
                         "features": ["risk_score"], "labels": ["is_fraud"]},
                    ],
                    "edges": [
                        {"source_type": "Account", "target_type": "Account",
                         "files": [f"s3://{S3_BUCKET}/{s3_prefix}/edges.json"]},
                    ],
                },
                "task": task_type,
                "model": {
                    "type": "rgcn",
                    "hidden_size": 128,
                    "num_layers": 3,
                    "dropout": 0.3,
                },
                "training": {
                    "epochs": 100,
                    "batch_size": 1024,
                    "learning_rate": 0.001,
                    "early_stopping_patience": 10,
                },
            }
            self.s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=f"{s3_prefix}/config.json",
                Body=json.dumps(gs_config, indent=2).encode(),
                ContentType="application/json",
            )
        except Exception as e:
            return {"error": f"S3 export failed: {str(e)}", "export_id": export_id}

        latency = (time.time() - start) * 1000
        return {
            "status": "exported",
            "export_id": export_id,
            "s3_path": f"s3://{S3_BUCKET}/{s3_prefix}/",
            "nodes_exported": len(nodes),
            "edges_exported": len(edges),
            "task_type": task_type,
            "latency_ms": latency,
        }

    def trigger_training(self, task_type: str = "node_classification",
                         instance_type: str = "ml.g4dn.xlarge") -> dict:
        """Trigger a SageMaker training job with GraphStorm.

        Launches a training job that:
        1. Loads graph from S3
        2. Trains an R-GCN model for fraud node classification
        3. Outputs learned embeddings and model artifacts to S3
        """
        start = time.time()

        # First export the data
        export_result = self.export_graph_for_training(task_type)
        if "error" in export_result:
            return export_result

        job_name = f"fraud-gnn-{export_result['export_id']}-{int(time.time())}"
        s3_output = f"s3://{S3_BUCKET}/models/{export_result['export_id']}/"

        try:
            training_params = {
                "TrainingJobName": job_name,
                "AlgorithmSpecification": {
                    "TrainingImage": GRAPHSTORM_IMAGE,
                    "TrainingInputMode": "File",
                },
                "RoleArn": SAGEMAKER_ROLE,
                "InputDataConfig": [
                    {
                        "ChannelName": "train",
                        "DataSource": {
                            "S3DataSource": {
                                "S3DataType": "S3Prefix",
                                "S3Uri": export_result["s3_path"],
                                "S3DataDistributionType": "FullyReplicated",
                            }
                        },
                    }
                ],
                "OutputDataConfig": {"S3OutputPath": s3_output},
                "ResourceConfig": {
                    "InstanceType": instance_type,
                    "InstanceCount": 1,
                    "VolumeSizeInGB": 50,
                },
                "StoppingCondition": {"MaxRuntimeInSeconds": 3600},
                "HyperParameters": {
                    "task_type": task_type,
                    "model_type": "rgcn",
                    "hidden_size": "128",
                    "num_layers": "3",
                    "num_epochs": "100",
                    "lr": "0.001",
                    "fanout": "10,25",
                },
            }

            self.sagemaker_client.create_training_job(**training_params)

            # Track the job
            self._training_jobs[job_name] = {
                "status": "InProgress",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "export_id": export_result["export_id"],
                "task_type": task_type,
                "s3_output": s3_output,
            }

        except Exception as e:
            return {
                "status": "failed",
                "error": str(e),
                "message": "SageMaker training job creation failed. Ensure SAGEMAKER_EXECUTION_ROLE is configured.",
            }

        latency = (time.time() - start) * 1000
        return {
            "status": "training_started",
            "job_name": job_name,
            "export": export_result,
            "instance_type": instance_type,
            "s3_output": s3_output,
            "latency_ms": latency,
        }

    def get_training_status(self, job_name: Optional[str] = None) -> dict:
        """Get status of GNN training job(s)."""
        if job_name:
            try:
                response = self.sagemaker_client.describe_training_job(
                    TrainingJobName=job_name
                )
                return {
                    "job_name": job_name,
                    "status": response["TrainingJobStatus"],
                    "secondary_status": response.get("SecondaryStatus", ""),
                    "creation_time": response.get("CreationTime", "").isoformat() if response.get("CreationTime") else None,
                    "training_time_seconds": response.get("TrainingTimeInSeconds"),
                    "model_artifacts": response.get("ModelArtifacts", {}).get("S3ModelArtifacts"),
                }
            except Exception as e:
                return {"error": str(e), "job_name": job_name}
        else:
            # Return all tracked jobs
            return {
                "jobs": self._training_jobs,
                "total_jobs": len(self._training_jobs),
            }

    def predict(self, entity_id: str) -> dict:
        """Get GNN-based fraud prediction for an entity.

        If a trained model exists, uses the learned embeddings and
        classification scores. Falls back to graph-feature-based prediction.
        """
        start = time.time()

        # Check if entity has GNN embeddings stored
        embedding_query = f"""
            MATCH (n {{id: '{entity_id}'}})
            RETURN n.gnn_embedding as embedding,
                   n.gnn_fraud_score as fraud_score,
                   n.gnn_classification as classification,
                   n.gnn_model_version as model_version
        """
        result = self._execute_query(embedding_query)
        rows = result.get("results", [])

        if rows and rows[0].get("fraud_score") is not None:
            # GNN predictions available
            latency = (time.time() - start) * 1000
            return {
                "entity_id": entity_id,
                "prediction_source": "gnn_model",
                "fraud_score": rows[0]["fraud_score"],
                "classification": rows[0].get("classification", "unknown"),
                "model_version": rows[0].get("model_version"),
                "embedding_available": rows[0].get("embedding") is not None,
                "latency_ms": latency,
            }

        # Fallback: compute graph-structure-based prediction
        structure_query = f"""
            MATCH (n {{id: '{entity_id}'}})
            OPTIONAL MATCH (n)-[r]-(neighbor)
            WITH n, count(DISTINCT neighbor) as degree,
                 collect(DISTINCT labels(neighbor)[0]) as neighbor_types
            OPTIONAL MATCH (n)-[*1..3]-(bad)
            WHERE bad.status IN ['FLAGGED', 'BLOCKED']
            WITH n, degree, neighbor_types, count(DISTINCT bad) as bad_neighbors
            RETURN degree, neighbor_types, bad_neighbors,
                   CASE WHEN bad_neighbors > 0 THEN
                       toFloat(bad_neighbors) / (degree + 1)
                   ELSE 0.0 END as structural_risk
        """
        structure = self._execute_query(structure_query)
        struct_rows = structure.get("results", [])

        latency = (time.time() - start) * 1000
        if struct_rows:
            row = struct_rows[0]
            return {
                "entity_id": entity_id,
                "prediction_source": "structural_heuristic",
                "fraud_score": min(row.get("structural_risk", 0.0), 1.0),
                "degree": row.get("degree", 0),
                "bad_neighbors": row.get("bad_neighbors", 0),
                "neighbor_types": row.get("neighbor_types", []),
                "message": "GNN model not yet trained. Using structural heuristics.",
                "latency_ms": latency,
            }

        return {
            "entity_id": entity_id,
            "prediction_source": "none",
            "fraud_score": 0.0,
            "message": "Entity not found in graph",
            "latency_ms": latency,
        }

    def load_embeddings_to_neptune(self, model_output_path: str) -> dict:
        """Load trained GNN embeddings back into Neptune graph nodes.

        After training completes, this reads the model output from S3
        and writes embeddings/scores as node properties.
        """
        start = time.time()
        updated_count = 0

        try:
            # List prediction files in S3
            bucket, prefix = model_output_path.replace("s3://", "").split("/", 1)
            response = self.s3_client.list_objects_v2(Bucket=bucket, Prefix=prefix)
            prediction_files = [
                obj["Key"] for obj in response.get("Contents", [])
                if "predictions" in obj["Key"] or "embeddings" in obj["Key"]
            ]

            for file_key in prediction_files:
                obj = self.s3_client.get_object(Bucket=bucket, Key=file_key)
                data = json.loads(obj["Body"].read())

                for entry in data:
                    node_id = entry.get("node_id")
                    fraud_score = entry.get("fraud_score", 0.0)
                    classification = entry.get("classification", "unknown")

                    if node_id:
                        update_query = f"""
                            MATCH (n {{id: '{node_id}'}})
                            SET n.gnn_fraud_score = {fraud_score},
                                n.gnn_classification = '{classification}',
                                n.gnn_model_version = 'v1_{int(time.time())}',
                                n.gnn_updated_at = '{datetime.now(timezone.utc).isoformat()}'
                        """
                        self._execute_query(update_query)
                        updated_count += 1

        except Exception as e:
            return {"error": str(e), "updated_count": updated_count}

        latency = (time.time() - start) * 1000
        return {
            "status": "complete",
            "nodes_updated": updated_count,
            "model_path": model_output_path,
            "latency_ms": latency,
        }


# Singleton
graphstorm_service = GraphStormService()
