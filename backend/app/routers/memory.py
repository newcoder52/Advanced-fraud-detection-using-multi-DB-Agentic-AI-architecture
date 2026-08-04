"""Agent Memory API endpoints (Mem0 pattern).

Graph-native long-term memory for fraud investigation agents.
Enables persistent memory across sessions, cross-case pattern
detection, and contextual recall during investigations.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List

from app.services.memory_service import memory_service

router = APIRouter()


@router.post("/store")
async def store_memory(body: dict):
    """Store a memory entry linked to entities in the fraud graph.

    Request body:
    - content: Memory content text (required)
    - memory_type: Type of memory (default: "investigation_finding")
      Options: investigation_finding, fraud_pattern, resolution, analyst_note
    - entity_ids: List of entity IDs to link this memory to (optional)
    - session_id: Investigation session ID to group memories (optional)
    - metadata: Additional metadata dict (optional)

    Example:
    {
        "content": "Account A-001 was found to share device fingerprint with 5 blocked accounts",
        "memory_type": "investigation_finding",
        "entity_ids": ["A-001"],
        "session_id": "inv-2024-001"
    }
    """
    content = body.get("content")
    if not content:
        raise HTTPException(status_code=400, detail="content is required")

    memory_type = body.get("memory_type", "investigation_finding")
    valid_types = ["investigation_finding", "fraud_pattern", "resolution", "analyst_note"]
    if memory_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid memory_type. Use: {', '.join(valid_types)}")

    try:
        result = memory_service.store_memory(
            content=content,
            memory_type=memory_type,
            entity_ids=body.get("entity_ids"),
            session_id=body.get("session_id"),
            metadata=body.get("metadata"),
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Memory storage failed: {str(e)}")


@router.get("/recall/{entity_id}")
async def recall_memories(
    entity_id: str,
    memory_type: Optional[str] = Query(None, description="Filter by memory type"),
    limit: int = Query(10, ge=1, le=50),
):
    """Recall memories associated with an entity.

    Retrieves:
    - Direct memories: explicitly linked to this entity
    - Connected memories: from entities within 2 hops (related investigations)

    Useful for providing historical context at the start of a new investigation.
    """
    if not entity_id or len(entity_id.strip()) < 1:
        raise HTTPException(status_code=400, detail="entity_id is required")

    result = memory_service.recall(
        entity_id=entity_id,
        memory_type=memory_type,
        limit=limit,
    )
    return result


@router.post("/recall/semantic")
async def semantic_recall(body: dict):
    """Recall memories semantically similar to a query.

    Uses LLM-powered ranking to find the most relevant memories
    regardless of explicit entity links.

    Request body:
    - query: Search query (required)
    - limit: Max results (default: 5, max: 20)

    Example:
    {"query": "cases involving shared device fingerprints and velocity spikes"}
    """
    query = body.get("query")
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    limit = min(body.get("limit", 5), 20)

    try:
        result = memory_service.semantic_recall(query=query, limit=limit)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Semantic recall failed: {str(e)}")


@router.get("/patterns")
async def detect_patterns(min_occurrences: int = Query(2, ge=1, le=10)):
    """Detect cross-case patterns from stored investigation memories.

    Analyzes memories across multiple investigation sessions to identify
    recurring fraud patterns, techniques, and indicators.

    Discovered patterns are automatically stored as PatternNodes in Neptune
    for future reference.

    Parameters:
    - min_occurrences: Minimum times a pattern must appear to be reported (default: 2)
    """
    try:
        result = memory_service.detect_patterns(min_occurrences=min_occurrences)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pattern detection failed: {str(e)}")


@router.get("/summary/{entity_id}")
async def entity_memory_summary(entity_id: str):
    """Get a memory context summary for an entity.

    Quick overview of all historical memory context:
    - Total memories and their types
    - Recent memory content
    - Number of unique investigation sessions
    - Related investigation sessions (via connected entities)

    Use this before starting a new investigation to check for prior history.
    """
    if not entity_id or len(entity_id.strip()) < 1:
        raise HTTPException(status_code=400, detail="entity_id is required")

    result = memory_service.get_entity_memory_summary(entity_id=entity_id)
    return result
