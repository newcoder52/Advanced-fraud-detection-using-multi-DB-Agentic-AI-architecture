"""Neptune Analytics service for graph intelligence."""

import os
import time
import json
from typing import List, Optional

import boto3

REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
GRAPH_ID = os.environ.get("NEPTUNE_GRAPH_ID", "")


class NeptuneService:
    """Manages Neptune Analytics graph operations."""

    def __init__(self):
        self._client = None
        self._graph_id = GRAPH_ID

    @property
    def client(self):
        if self._client is None:
            self._client = boto3.client("neptune-graph", region_name=REGION)
        return self._client

    @property
    def graph_id(self):
        if self._graph_id:
            return self._graph_id
        # Try to discover graph
        try:
            graphs = self.client.list_graphs()
            for g in graphs.get("graphs", []):
                if "multidb" in g.get("name", "").lower():
                    self._graph_id = g["id"]
                    return self._graph_id
        except Exception:
            pass
        return self._graph_id

    def execute_query(self, query: str, parameters: dict = None) -> dict:
        """Execute an openCypher query against Neptune Analytics."""
        if not self.graph_id:
            return {"error": "No Neptune graph configured", "results": []}

        try:
            kwargs = {
                "graphIdentifier": self.graph_id,
                "queryString": query,
                "language": "OPEN_CYPHER",
            }
            if parameters:
                kwargs["parameters"] = parameters

            response = self.client.execute_query(**kwargs)
            # Parse the response payload
            payload = response.get("payload")
            if payload:
                result = json.loads(payload.read())
                return result
            return {"results": []}
        except self.client.exceptions.ValidationException as e:
            return {"error": f"Query validation error: {e}", "results": []}
        except Exception as e:
            return {"error": str(e), "results": []}

    def create_graph(self, graph_name: str = "multidb-poc-graph") -> str:
        """Create a Neptune Analytics graph."""
        try:
            response = self.client.create_graph(
                graphName=graph_name,
                provisionedMemory=32,  # Minimum 32 m-NCUs
                publicConnectivity=False,
                replicaCount=0,
                deletionProtection=False,
            )
            self._graph_id = response["id"]
            return self._graph_id
        except self.client.exceptions.ConflictException:
            # Graph already exists, find it
            graphs = self.client.list_graphs()
            for g in graphs.get("graphs", []):
                if g.get("name") == graph_name:
                    self._graph_id = g["id"]
                    return self._graph_id
            raise

    def seed_graph_data(self, domain: str, nodes: List[dict], edges: List[dict]):
        """Seed graph with nodes and edges for a domain."""
        # Create nodes
        for node in nodes:
            props = ", ".join([f"{k}: '{v}'" for k, v in node.get("properties", {}).items()])
            query = f"MERGE (n:{node['label']} {{id: '{node['id']}', {props}}})"
            self.execute_query(query)

        # Create edges
        for edge in edges:
            query = f"""
                MATCH (a {{id: '{edge['source']}'}})
                MATCH (b {{id: '{edge['target']}'}})
                MERGE (a)-[:{edge['relationship']} {{weight: {edge.get('weight', 1.0)}}}]->(b)
            """
            self.execute_query(query)

    def community_detection(self, entity_id: str, algorithm: str = "louvain", max_depth: int = 3) -> dict:
        """Run community detection centered on an entity."""
        start = time.time()

        if algorithm == "louvain":
            # Get connected component first, then analyze community
            query = f"""
                MATCH (start {{id: '{entity_id}'}})-[*1..{max_depth}]-(connected)
                WITH collect(DISTINCT connected) + collect(DISTINCT start) as nodes
                UNWIND nodes as n
                MATCH (n)-[r]-(m) WHERE m IN nodes
                RETURN n.id as node_id, labels(n)[0] as label, 
                       properties(n) as props,
                       type(r) as rel_type,
                       m.id as connected_to
            """
        elif algorithm == "pagerank":
            query = f"""
                MATCH (start {{id: '{entity_id}'}})-[*1..{max_depth}]-(connected)
                WITH collect(DISTINCT connected) + collect(DISTINCT start) as nodes
                UNWIND nodes as n
                MATCH (n)-[r]-(m)
                RETURN n.id as node_id, labels(n)[0] as label,
                       count(r) as degree,
                       properties(n) as props
                ORDER BY degree DESC
            """
        elif algorithm == "wcc":
            query = f"""
                MATCH (start {{id: '{entity_id}'}})-[*1..{max_depth}]-(connected)
                RETURN DISTINCT connected.id as node_id, labels(connected)[0] as label,
                       properties(connected) as props
            """
        else:  # shortest_path
            query = f"""
                MATCH path = shortestPath((start {{id: '{entity_id}'}})-[*..{max_depth}]-(end))
                WHERE start <> end
                RETURN [n in nodes(path) | n.id] as path_nodes,
                       [r in relationships(path) | type(r)] as path_rels,
                       length(path) as distance
                ORDER BY distance
                LIMIT 20
            """

        result = self.execute_query(query)
        latency = (time.time() - start) * 1000

        return {
            "entity_id": entity_id,
            "algorithm": algorithm,
            "results": result.get("results", []),
            "latency_ms": latency,
            "error": result.get("error"),
        }

    def get_entity_neighbors(self, entity_id: str, depth: int = 2) -> dict:
        """Get all neighbors of an entity up to a certain depth."""
        query = f"""
            MATCH (start {{id: '{entity_id}'}})-[r*1..{depth}]-(neighbor)
            RETURN DISTINCT neighbor.id as id, labels(neighbor)[0] as label,
                   properties(neighbor) as props
            LIMIT 100
        """
        return self.execute_query(query)

    def get_graph_features(self, entity_id: str) -> dict:
        """Extract rich graph features for an entity (3-hop traversal)."""
        features = {
            'degree': 0,
            'direct_connections': 0,
            'indirect_connections': 0,
            'component_size': 0,
            'shared_device_count': 0,
            'ring_membership': 0.0,
            'hops_to_bad_node': -1,
            'graph_score': 0.0,
        }

        if not self.graph_id:
            return features

        # Query 1: Direct (1-hop) vs Indirect (2-3 hop) connections
        try:
            query = f"""
                MATCH (n {{id: '{entity_id}'}})-[]-(direct)
                WITH count(DISTINCT direct) as degree, collect(DISTINCT direct.id) as direct_ids
                OPTIONAL MATCH (n2 {{id: '{entity_id}'}})-[*2..3]-(indirect)
                WHERE NOT indirect.id IN direct_ids AND indirect.id <> '{entity_id}'
                WITH degree, direct_ids, count(DISTINCT indirect) as indirect_count
                RETURN degree, indirect_count, degree + indirect_count as total_network
            """
            result = self.execute_query(query)
            rows = result.get("results", [])
            if rows:
                features['degree'] = rows[0].get('degree', 0)
                features['direct_connections'] = rows[0].get('degree', 0)
                features['indirect_connections'] = rows[0].get('indirect_count', 0)
                features['component_size'] = rows[0].get('total_network', 0)
        except Exception:
            pass

        # Query 2: Shared devices within 3 hops (discovered via indirect traversal)
        try:
            query = f"""
                MATCH (n {{id: '{entity_id}'}})-[*1..3]-(other)-[:SHARES_DEVICE|USES_DEVICE]-(device)
                WHERE device.id <> '{entity_id}' AND other.id <> '{entity_id}'
                RETURN count(DISTINCT device) as shared_devices
            """
            result = self.execute_query(query)
            rows = result.get("results", [])
            if rows:
                features['shared_device_count'] = rows[0].get('shared_devices', 0)
        except Exception:
            pass

        # Query 3: Ring membership — bad nodes within 3 hops
        try:
            query = f"""
                MATCH (n {{id: '{entity_id}'}})-[*1..3]-(member)
                WHERE member.status IN ['FLAGGED', 'BLOCKED'] OR member.risk_score > 0.7
                RETURN count(DISTINCT member) as bad_neighbors
            """
            result = self.execute_query(query)
            rows = result.get("results", [])
            if rows and rows[0].get('bad_neighbors', 0) > 0:
                features['ring_membership'] = 1.0
                try:
                    path_query = f"""
                        MATCH path = shortestPath((n {{id: '{entity_id}'}})-[*1..3]-(bad))
                        WHERE bad.status IN ['FLAGGED', 'BLOCKED'] OR bad.risk_score > 0.7
                        RETURN length(path) as hops
                        ORDER BY hops LIMIT 1
                    """
                    path_result = self.execute_query(path_query)
                    path_rows = path_result.get("results", [])
                    if path_rows:
                        features['hops_to_bad_node'] = path_rows[0].get('hops', -1)
                except Exception:
                    features['hops_to_bad_node'] = 1
        except Exception:
            pass

        # Compute composite graph_score
        degree_score = min(features['degree'] / 10.0, 1.0)
        component_score = min(features['component_size'] / 20.0, 1.0)
        device_score = min(features['shared_device_count'] / 5.0, 1.0)
        features['graph_score'] = min(1.0, (
            degree_score * 0.2 +
            component_score * 0.3 +
            device_score * 0.3 +
            features['ring_membership'] * 0.2
        ))

        return features


neptune_service = NeptuneService()
