"""Semantic Ontology Layer API endpoints.

Provides access to the fraud domain ontology — a property graph meta-layer
that defines concepts, entity types, and their semantic relationships.
Supports LLM-powered auto-discovery and natural language navigation.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.services.ontology_service import ontology_service

router = APIRouter()


@router.post("/initialize")
async def initialize_ontology(body: dict = None):
    """Bootstrap the fraud domain ontology with core concepts.

    Creates foundational concept hierarchy: FraudType, EntityType,
    BehaviorPattern nodes and their semantic relationships.
    Only needs to be called once during setup.
    """
    domain = (body or {}).get("domain", "fraud_detection")
    try:
        result = ontology_service.initialize_ontology(domain=domain)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ontology initialization failed: {str(e)}")


@router.get("/concepts")
async def get_concepts(category: Optional[str] = Query(None, description="Filter by category: fraud_type, entity_type, pattern, domain")):
    """Retrieve all ontology concepts, optionally filtered by category.

    Categories:
    - domain: Top-level fraud domain concepts
    - fraud_type: Types of fraud (account takeover, synthetic identity, etc.)
    - entity_type: Types of entities (Account, Device, IP, Transaction)
    - pattern: Behavioral patterns (velocity spike, geo impossibility, etc.)
    """
    result = ontology_service.get_concepts(category=category)
    return result


@router.get("/navigate/{term}")
async def navigate_ontology(term: str, max_hops: int = Query(2, ge=1, le=5)):
    """Navigate the ontology using a natural language term.

    Uses vector similarity to find the closest concept, then traverses
    the ontology graph to return related concepts within max_hops.

    Examples:
    - /navigate/money laundering → finds payment_fraud and related patterns
    - /navigate/bot attacks → finds credential_stuffing and velocity_spike
    """
    if not term or len(term.strip()) < 2:
        raise HTTPException(status_code=400, detail="Search term must be at least 2 characters")

    result = ontology_service.navigate_by_term(term=term, max_hops=max_hops)
    return result


@router.post("/discover")
async def discover_relationships(body: dict = None):
    """Trigger LLM-powered auto-discovery of hidden relationships.

    Samples entity nodes from the data graph, profiles their properties,
    and uses Claude to identify semantic relationships not yet captured
    in the ontology. Discovered concepts and relationships are persisted
    automatically.

    Request body (optional):
    - sample_size: Number of entities to sample (default: 50, max: 200)
    """
    sample_size = min((body or {}).get("sample_size", 50), 200)

    try:
        result = ontology_service.discover_relationships(sample_size=sample_size)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Discovery failed: {str(e)}")


@router.post("/classify")
async def classify_event(body: dict):
    """Classify an event against the fraud ontology using Claude.

    Takes event data (domain, entity_id, content, event_type, payload)
    and returns a structured classification with path, confidence,
    severity, indicators, and recommended action.

    This is a REAL AI classification — Claude analyzes the event content
    and maps it to the most appropriate fraud category in the taxonomy.
    """
    if not body:
        raise HTTPException(status_code=400, detail="Request body required")

    try:
        result = ontology_service.classify_event(body)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")


@router.post("/investigate")
async def investigate_event(body: dict):
    """Generate a full investigation brief for a flagged/blocked event.

    Combines ontology classification with graph context to produce
    an analyst-ready investigation narrative.

    Request body:
    - event_data: dict with domain, entity_id, content, event_type, payload
    - classification: dict (output from /classify, or will be generated)
    - graph_context: dict (optional, from Neptune graph features)
    """
    if not body:
        raise HTTPException(status_code=400, detail="Request body required")

    event_data = body.get("event_data", body)
    classification = body.get("classification")
    graph_context = body.get("graph_context")

    # If no classification provided, generate one
    if not classification:
        classification = ontology_service.classify_event(event_data)

    try:
        result = ontology_service.generate_investigation_brief(
            event_data=event_data,
            classification=classification,
            graph_context=graph_context,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Investigation failed: {str(e)}")
