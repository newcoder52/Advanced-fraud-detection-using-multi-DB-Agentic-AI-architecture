"""AI-generated investigator briefing endpoints."""

import json
import logging
import os
import time
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
import boto3

from app.services.bedrock import bedrock_service
from app.services.neptune_service import neptune_service
from app.services.cache_service import cache_service

logger = logging.getLogger()
logger.setLevel(logging.INFO)

router = APIRouter()

BRIEFING_TABLE = "multidb_poc_briefings"
BRIEFING_TTL_HOURS = 24
_dynamo = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION_NAME", "us-east-1"))
_briefing_table = _dynamo.Table(BRIEFING_TABLE)

DOMAIN_CONTEXTS = {
    "press_distribution": "Financial press release embargo breach detection. Investigating potential insider trading through leaked embargoed information.",
    "dating_platform": "Romance scam ring detection on dating platforms. Investigating coordinated fraud using fake profiles and scripted messages.",
    "music_streaming": "Music streaming fraud detection. Investigating bot farms artificially inflating stream counts for royalty fraud.",
    "cinema_booking": "Ticket scalper bot network detection. Investigating coordinated bot purchases of premium movie tickets.",
    "news_platform": "AI-generated misinformation detection. Investigating coordinated amplification networks spreading false content.",
    "ticketing_platform": "Ticket scalper bot network detection. Investigating coordinated automated purchases of premium event tickets using shared device fingerprints, superhuman interaction speeds, and bulk purchase patterns to resell at inflated prices.",
}


def _cache_briefing(cache_key: str, result: dict):
    """Store briefing in DynamoDB with TTL."""
    try:
        import decimal

        def _clean(obj):
            """Recursively remove empty strings and convert for DynamoDB."""
            if isinstance(obj, dict):
                return {k: _clean(v) for k, v in obj.items() if v != '' and v is not None}
            elif isinstance(obj, list):
                return [_clean(i) for i in obj if i != '' and i is not None]
            return obj

        item = {**result, "entity_id": cache_key, "ttl": int(time.time()) + BRIEFING_TTL_HOURS * 3600}
        item = _clean(item)
        item = json.loads(json.dumps(item, default=str), parse_float=decimal.Decimal)
        _briefing_table.put_item(Item=item)
        logger.info(f"Cached briefing for {cache_key}")
    except Exception as e:
        logger.error(f"Cache write failed for {cache_key}: {e}")


@router.get("/{entity_id}")
async def get_briefing(entity_id: str, domain: str = "press_distribution"):
    """Get AI-generated investigator briefing for an entity."""

    # Check DynamoDB cache first
    cache_key = f"{domain}:{entity_id}"
    try:
        cached = _briefing_table.get_item(Key={"entity_id": cache_key})
        if "Item" in cached:
            logger.info(f"Cache HIT for {cache_key}")
            item = cached["Item"]
            item.pop("ttl", None)
            item["entity_id"] = entity_id  # restore original entity_id
            return item
    except Exception as e:
        logger.error(f"Cache read failed: {e}")

    # Gather evidence from all tiers
    evidence = []

    # Get score from cache
    try:
        score = cache_service.get_score(entity_id)
        if score:
            evidence.append({
                "source": "ElastiCache Scoring",
                "data": {
                    "composite_score": score.get("composite_score"),
                    "decision": score.get("decision"),
                    "components": score.get("components"),
                },
            })
    except Exception:
        pass

    # Get graph connections (with timeout to avoid blocking)
    try:
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(neptune_service.get_entity_neighbors, entity_id, 2)
            try:
                graph_data = future.result(timeout=5)
                if graph_data.get("results"):
                    evidence.append({
                        "source": "Neptune Graph Analysis",
                        "data": {
                            "connected_entities": len(graph_data["results"]),
                            "sample_connections": graph_data["results"][:5],
                        },
                    })
            except concurrent.futures.TimeoutError:
                logger.warning(f"Neptune query timed out for {entity_id}, skipping graph evidence")
    except Exception:
        pass

    if not evidence:
        evidence.append({
            "source": "System",
            "data": {"note": "Limited evidence available. Entity may be new or not yet fully analyzed."},
        })

    # Generate briefing with Claude
    try:
        domain_context = DOMAIN_CONTEXTS.get(domain, "General anomaly detection.")
        logger.info(f"Calling Bedrock for {entity_id}, evidence items: {len(evidence)}")
        briefing_text = bedrock_service.generate_briefing(
            entity_id=entity_id,
            entity_type="entity",
            evidence=evidence,
            domain_context=domain_context,
        )
        logger.info(f"Bedrock returned {len(briefing_text)} chars")

        # Try to parse JSON response
        try:
            import re
            json_match = re.search(r'\{[\s\S]*\}', briefing_text)
            if json_match:
                briefing_data = json.loads(json_match.group())
                narrative = briefing_data.get("narrative", briefing_text)
                if isinstance(narrative, dict):
                    narrative = narrative.get("executive_summary", json.dumps(narrative))
                confidence = briefing_data.get("confidence_score", 0.5)
                if isinstance(confidence, dict):
                    confidence = confidence.get("value", 0.5)
                risk = briefing_data.get("risk_assessment", "Unknown")
                if isinstance(risk, dict):
                    risk = risk.get("overall_risk_level", "Unknown")
                actions = briefing_data.get("recommended_actions", [])
                if actions and isinstance(actions[0], dict):
                    actions = [a.get("action", a.get("detail", str(a))) for a in actions]
                result = {
                    "entity_id": entity_id,
                    "domain": domain,
                    "title": briefing_data.get("title", f"Investigation Briefing: {entity_id}"),
                    "narrative": narrative,
                    "evidence_chain": briefing_data.get("evidence_chain", evidence),
                    "risk_assessment": risk,
                    "recommended_actions": actions,
                    "confidence_score": confidence,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                }
                _cache_briefing(cache_key, result)
                return result
        except (json.JSONDecodeError, AttributeError):
            pass

        result = {
            "entity_id": entity_id,
            "domain": domain,
            "title": f"Investigation Briefing: {entity_id}",
            "narrative": briefing_text,
            "evidence_chain": evidence,
            "risk_assessment": "Requires Review",
            "recommended_actions": ["Review evidence chain", "Escalate if high risk"],
            "confidence_score": 0.5,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        _cache_briefing(cache_key, result)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Briefing generation failed: {str(e)}")
