"""Graph intelligence endpoints using Neptune Analytics."""

from fastapi import APIRouter, HTTPException

from app.services.neptune_service import neptune_service

router = APIRouter()


@router.post("/")
async def trigger_graph_analysis(body: dict):
    """Trigger Neptune graph analysis."""
    entity_id = body.get("entity_id")
    algorithm = body.get("algorithm", "louvain")
    max_depth = body.get("max_depth", 3)

    if not entity_id:
        raise HTTPException(status_code=400, detail="entity_id is required")

    result = neptune_service.community_detection(entity_id, algorithm, max_depth)
    return result


@router.get("/{entity_id}/community")
async def get_community(entity_id: str, algorithm: str = "louvain", max_depth: int = 3):
    """Get community/ring detection results for an entity."""
    result = neptune_service.community_detection(entity_id, algorithm, max_depth)
    return result


@router.get("/{entity_id}/neighbors")
async def get_neighbors(entity_id: str, depth: int = 2):
    """Get entity neighbors up to depth."""
    result = neptune_service.get_entity_neighbors(entity_id, depth)
    return result


@router.post("/query")
async def execute_graph_query(body: dict):
    """Execute a raw openCypher query (admin/debug)."""
    query = body.get("query")
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    
    result = neptune_service.execute_query(query)
    return result
