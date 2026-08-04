"""Real-time scoring endpoints using ElastiCache Valkey."""

from fastapi import APIRouter, HTTPException

from app.services.cache_service import cache_service
from app.routers.pipeline import _score_cache

router = APIRouter()


@router.get("/{entity_id}")
async def get_score(entity_id: str, domain: str = "press_distribution"):
    """Get cached composite score for an entity."""
    cache_key = f"{domain}:{entity_id}"
    if cache_key in _score_cache:
        return _score_cache[cache_key]['final_score']

    for key, val in _score_cache.items():
        if key.endswith(f":{entity_id}"):
            return val['final_score']

    return {
        "entity_id": entity_id,
        "message": "No cached score found. Run pipeline to generate score.",
        "cache_hit": False,
    }


@router.post("/{entity_id}")
async def set_score(entity_id: str, body: dict):
    """Set/update score for an entity."""
    domain = body.get("domain", "press_distribution")
    graph_score = body.get("graph_score", 0.0)
    similarity_score = body.get("similarity_score", 0.0)
    behavioral_score = body.get("behavioral_score", 0.0)
    velocity_score = body.get("velocity_score", 0.0)

    try:
        result = cache_service.set_score(
            entity_id=entity_id,
            domain=domain,
            graph_score=graph_score,
            similarity_score=similarity_score,
            behavioral_score=behavioral_score,
            velocity_score=velocity_score,
        )
        return result
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Cache unavailable: {str(e)}")


@router.delete("/{entity_id}")
async def flush_score(entity_id: str):
    """Remove cached score for an entity."""
    try:
        success = cache_service.flush_entity(entity_id)
        return {"entity_id": entity_id, "flushed": success}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Cache unavailable: {str(e)}")
