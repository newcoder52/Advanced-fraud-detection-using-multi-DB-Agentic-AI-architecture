"""Admin endpoints for seeding and initialization."""

import time
from fastapi import APIRouter

from app.services.dynamodb_service import dynamodb_service
from app.services.aurora_service import aurora_service
from app.services.neptune_service import neptune_service
from app.services.bedrock import bedrock_service
from app.seed_data import ALL_EVENTS, ALL_KNOWN_PATTERNS, get_neptune_graph_data

router = APIRouter()


@router.post("/seed/dynamodb")
async def seed_dynamodb(domain: str = None):
    """Seed DynamoDB tables with demo events."""
    results = {}
    domains = [domain] if domain else list(ALL_EVENTS.keys())

    for d in domains:
        events = ALL_EVENTS.get(d, [])
        count = 0
        errors = []
        for event in events:
            try:
                dynamodb_service.ingest_event(
                    domain=d,
                    event_type=event["event_type"],
                    payload=event["payload"],
                    metadata={"source": "seed_data"},
                )
                count += 1
            except Exception as e:
                errors.append(str(e))
                if len(errors) > 3:
                    break
        results[d] = {"ingested": count, "total": len(events), "errors": errors[:3]}

    return {"status": "done", "results": results}


@router.post("/seed/aurora")
async def seed_aurora(domain: str = None):
    """Initialize Aurora schemas and seed embeddings."""
    results = {}
    domains = [domain] if domain else list(ALL_KNOWN_PATTERNS.keys())

    for d in domains:
        try:
            aurora_service.initialize_schema(d)
            patterns = ALL_KNOWN_PATTERNS.get(d, [])
            count = 0
            for pattern in patterns:
                try:
                    embedding = bedrock_service.get_embedding(pattern["content"])
                    aurora_service.store_embedding(
                        domain=d,
                        record_id=pattern["id"],
                        embedding=embedding,
                        content=pattern["content"],
                        metadata={"type": pattern["type"]},
                    )
                    count += 1
                    time.sleep(0.1)
                except Exception as e:
                    results[d] = {"error": str(e), "embedded": count}
                    break
            if d not in results:
                results[d] = {"schema": "created", "embeddings": count, "total_patterns": len(patterns)}
        except Exception as e:
            results[d] = {"error": str(e)}

    return {"status": "done", "results": results}


@router.post("/seed/neptune")
async def seed_neptune(domain: str = None):
    """Seed Neptune graph with nodes and edges."""
    results = {}
    domains = [domain] if domain else ["press_distribution", "dating_platform", "music_streaming", "cinema_booking", "news_platform", "ticketing_platform"]

    graph_id = neptune_service.graph_id
    if not graph_id:
        try:
            graph_id = neptune_service.create_graph("multidb-poc-graph")
            results["graph_created"] = graph_id
        except Exception as e:
            return {"status": "error", "message": f"No graph available: {e}"}

    for d in domains:
        nodes, edges = get_neptune_graph_data(d)
        try:
            neptune_service.seed_graph_data(d, nodes, edges)
            results[d] = {"nodes": len(nodes), "edges": len(edges)}
        except Exception as e:
            results[d] = {"error": str(e)}

    return {"status": "done", "graph_id": graph_id, "results": results}


@router.post("/seed/all")
async def seed_all(domain: str = None):
    """Seed all databases for a domain or all domains."""
    start = time.time()

    dynamo_result = await seed_dynamodb(domain)
    aurora_result = await seed_aurora(domain)
    neptune_result = await seed_neptune(domain)

    return {
        "status": "complete",
        "total_time_seconds": time.time() - start,
        "dynamodb": dynamo_result,
        "aurora": aurora_result,
        "neptune": neptune_result,
    }


@router.get("/status")
async def get_admin_status():
    """Get status of all services and data."""
    status = {"services": {}}

    # DynamoDB
    try:
        events = dynamodb_service.get_recent_events("press_distribution", limit=1)
        status["services"]["dynamodb"] = {"status": "ok", "has_data": len(events) > 0}
    except Exception as e:
        status["services"]["dynamodb"] = {"status": "error", "error": str(e)}

    # Neptune
    try:
        gid = neptune_service.graph_id
        status["services"]["neptune"] = {"status": "ok" if gid else "no_graph", "graph_id": gid}
    except Exception as e:
        status["services"]["neptune"] = {"status": "error", "error": str(e)}

    return status
