"""GraphStorm GNN API endpoints.

Provides access to GNN-based fraud detection capabilities:
- Export graph data for training
- Trigger SageMaker training jobs
- Get GNN-powered fraud predictions
- Check training job status
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.services.graphstorm_service import graphstorm_service

router = APIRouter()


@router.post("/train")
async def trigger_training(body: dict = None):
    """Trigger a GNN training job using GraphStorm + SageMaker.

    Exports graph data from Neptune to S3, then launches a SageMaker
    training job with the GraphStorm container for fraud detection.

    Request body (optional):
    - task_type: "node_classification" (default) or "link_prediction"
    - instance_type: SageMaker instance (default: "ml.g4dn.xlarge")
    """
    params = body or {}
    task_type = params.get("task_type", "node_classification")
    instance_type = params.get("instance_type", "ml.g4dn.xlarge")

    if task_type not in ["node_classification", "link_prediction", "node_regression"]:
        raise HTTPException(status_code=400, detail="Invalid task_type. Use: node_classification, link_prediction, node_regression")

    try:
        result = graphstorm_service.trigger_training(
            task_type=task_type,
            instance_type=instance_type,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training trigger failed: {str(e)}")


@router.get("/status")
async def get_training_status(job_name: Optional[str] = Query(None, description="Specific job name to check")):
    """Get status of GNN training job(s).

    Without job_name: returns all tracked training jobs.
    With job_name: returns detailed status from SageMaker.
    """
    result = graphstorm_service.get_training_status(job_name=job_name)
    return result


@router.get("/predict/{entity_id}")
async def predict_fraud(entity_id: str):
    """Get GNN-based fraud prediction for an entity.

    If a trained model exists, returns learned classification and score.
    Falls back to structural graph heuristics if no model is trained yet.

    Returns:
    - prediction_source: "gnn_model" or "structural_heuristic"
    - fraud_score: 0.0-1.0 probability of fraud
    - classification: predicted class label
    """
    if not entity_id or len(entity_id.strip()) < 1:
        raise HTTPException(status_code=400, detail="entity_id is required")

    result = graphstorm_service.predict(entity_id=entity_id)
    return result


@router.post("/load-embeddings")
async def load_embeddings(body: dict):
    """Load trained GNN embeddings back into Neptune.

    After a training job completes, call this to write the learned
    embeddings and classifications as node properties in Neptune.

    Request body:
    - model_output_path: S3 path to model predictions (e.g., "s3://bucket/models/abc123/")
    """
    model_path = body.get("model_output_path")
    if not model_path:
        raise HTTPException(status_code=400, detail="model_output_path is required")

    try:
        result = graphstorm_service.load_embeddings_to_neptune(model_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding load failed: {str(e)}")


@router.post("/export")
async def export_graph(body: dict = None):
    """Export graph data to S3 for external processing.

    Useful for data scientists who want to run custom GNN experiments
    outside of the managed pipeline.

    Request body (optional):
    - task_type: "node_classification" (default) or "link_prediction"
    """
    task_type = (body or {}).get("task_type", "node_classification")
    result = graphstorm_service.export_graph_for_training(task_type=task_type)
    return result
