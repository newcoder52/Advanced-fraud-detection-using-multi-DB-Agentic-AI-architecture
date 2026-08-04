"""Semantic analysis endpoints using pgvector."""

import time
from fastapi import APIRouter, HTTPException

from app.services.bedrock import bedrock_service
from app.services.aurora_service import aurora_service

router = APIRouter()


@router.post("/")
async def trigger_semantic_analysis(body: dict):
    """Trigger semantic similarity search."""
    event_id = body.get("event_id")
    content = body.get("content", "")
    domain = body.get("domain", "press_distribution")
    threshold = body.get("similarity_threshold", 0.55)
    top_k = body.get("top_k", 10)

    if not content:
        raise HTTPException(status_code=400, detail="Content is required for semantic analysis")

    start = time.time()

    # Generate embedding via Bedrock
    embedding = bedrock_service.get_embedding(content)

    # Store the embedding
    if event_id:
        aurora_service.store_embedding(domain, event_id, embedding, content)

    # Search for similar content
    matches = aurora_service.similarity_search(domain, embedding, threshold, top_k)

    latency = (time.time() - start) * 1000

    return {
        "event_id": event_id,
        "domain": domain,
        "embedding_preview": embedding[:5],
        "matches": matches,
        "search_latency_ms": latency,
        "total_matches": len(matches),
    }


@router.get("/{event_id}/results")
async def get_semantic_results(event_id: str, domain: str = "press_distribution"):
    """Get stored similarity matches for an event."""
    # For now, re-run the search using stored embedding
    return {
        "event_id": event_id,
        "domain": domain,
        "message": "Use POST /api/v1/analysis/semantic to trigger analysis",
    }


@router.post("/embed")
async def generate_embedding(body: dict):
    """Generate an embedding for given text (utility endpoint)."""
    text = body.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    embedding = bedrock_service.get_embedding(text)
    return {
        "text_preview": text[:100],
        "embedding_dimensions": len(embedding),
        "embedding_preview": embedding[:10],
    }
