"""Event ingestion endpoints — the front door of the system.

Architecture:
    Customer Platform → POST /api/v1/events/ingest → Kinesis Data Stream
                                                         │
                                                    ┌────┴────┐
                                                    ▼         ▼
                                              Lambda       Firehose
                                            (detection)    (S3 archive)

Events are published to Kinesis, NOT written directly to DynamoDB.
DynamoDB only receives flagged/blocked events AFTER the detection pipeline runs.
This keeps ingestion cost low and decouples producers from processing.
"""

from fastapi import APIRouter, HTTPException
from typing import Optional

from app.services.kinesis_service import kinesis_service
from app.services.dynamodb_service import dynamodb_service

router = APIRouter()


@router.post("/ingest")
async def ingest_event(body: dict):
    """Publish an event to Kinesis for real-time fraud detection.

    This is the primary ingestion endpoint. Events flow:
    1. → Kinesis Data Stream (real-time detection pipeline)
    2. → Firehose → S3 (cold archive for compliance)

    DynamoDB is NOT written here — only flagged events get persisted
    after the detection pipeline scores them.

    Request body:
        domain: str — customer vertical (dating_platform, ticketing_platform, etc.)
        event_type: str — what happened (profile_created, ticket_purchased, etc.)
        entity_id: str — who did it (user_id, buyer_id, etc.)
        payload: dict — raw event data
        content: str — text content for semantic analysis (optional)
        metadata: dict — device/IP/session info (optional)
    """
    domain = body.get("domain", "press_distribution")
    event_type = body.get("event_type", "unknown")
    entity_id = body.get("entity_id", "")
    payload = body.get("payload", {})
    content = body.get("content", "")
    metadata = body.get("metadata", {})

    if not entity_id:
        # Try to extract entity_id from payload based on domain
        entity_fields = {
            "dating_platform": "user_id",
            "ticketing_platform": "buyer_id",
            "press_distribution": "release_id",
            "music_streaming": "account_id",
            "cinema_booking": "session_id",
            "news_platform": "content_id",
            "live_streaming": "viewer_id",
            "gaming_platform": "player_id",
        }
        field = entity_fields.get(domain, "entity_id")
        entity_id = str(payload.get(field, ""))

    # Publish to Kinesis (non-blocking, ~5ms)
    result = kinesis_service.publish_event(
        domain=domain,
        event_type=event_type,
        entity_id=entity_id,
        payload=payload,
        content=content,
        metadata=metadata,
    )

    return {
        **result,
        "domain": domain,
        "event_type": event_type,
        "entity_id": entity_id,
        "note": "Event published to stream. Detection pipeline will process asynchronously.",
    }


@router.get("/flagged")
async def list_flagged_events(domain: str = "press_distribution", limit: int = 50):
    """List recently flagged/blocked events from DynamoDB.

    Only events that the detection pipeline scored as FLAG or BLOCK
    are stored in DynamoDB. This keeps the hot store small and cheap.
    """
    events = dynamodb_service.get_recent_events(domain, limit)
    return {"events": events, "count": len(events), "domain": domain, "store": "dynamodb_hot"}


@router.get("/{event_id}")
async def get_event(event_id: str, domain: str = "press_distribution"):
    """Retrieve a specific flagged event by ID.

    Only returns events that were flagged/blocked (stored in DynamoDB).
    For ALLOWED events, check the S3 archive.
    """
    event = dynamodb_service.get_event(domain, event_id)
    if not event:
        raise HTTPException(
            status_code=404,
            detail="Event not found in hot store. If it was ALLOWED, check S3 archive.",
        )
    return event


@router.get("/")
async def list_events(domain: str = "press_distribution", limit: int = 50):
    """List recent events (flagged/blocked only from DynamoDB hot store)."""
    events = dynamodb_service.get_recent_events(domain, limit)
    return {"events": events, "count": len(events), "domain": domain}


@router.get("/stream/status")
async def stream_status():
    """Check Kinesis stream health and throughput."""
    info = kinesis_service.get_stream_info()
    return info
