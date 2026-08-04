"""Agentic Investigation API endpoints (Neptune MCP pattern).

Natural language interface for AI agents to query and investigate
the fraud graph. Supports autonomous multi-step investigation workflows
and explainable risk assessments.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.services.mcp_service import mcp_agent_service

router = APIRouter()


@router.post("/query")
async def agent_query(body: dict):
    """Natural language query translated to graph operations.

    Converts a plain English question into an openCypher query,
    executes it against Neptune, and returns results with explanation.

    Request body:
    - question: Natural language question (required)

    Example questions:
    - "Show me all accounts connected to device D-12345 within 3 hops"
    - "Which entities have risk scores above 0.8?"
    - "Find the shortest path between account A-001 and account A-099"
    - "How many flagged accounts share a device with account A-050?"
    """
    question = body.get("question")
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    try:
        result = mcp_agent_service.natural_language_query(question=question)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent query failed: {str(e)}")


@router.post("/investigate")
async def agent_investigate(body: dict):
    """Run an autonomous multi-step fraud investigation.

    The AI agent:
    1. Plans investigation steps based on the question
    2. Executes graph queries at each step
    3. Evaluates findings and decides next actions
    4. Produces a final verdict with recommendations

    Request body:
    - question: Investigation question (required)
    - entity_id: Target entity to investigate (optional)

    Returns a complete investigation report with:
    - Investigation plan and executed steps
    - Evidence gathered at each step
    - Final verdict (LEGITIMATE/SUSPICIOUS/FRAUDULENT)
    - Confidence score and recommended actions
    """
    question = body.get("question")
    entity_id = body.get("entity_id")

    if not question and not entity_id:
        raise HTTPException(status_code=400, detail="question or entity_id is required")

    if not question:
        question = f"Investigate entity {entity_id} for potential fraud"

    try:
        result = mcp_agent_service.investigate(
            question=question,
            entity_id=entity_id,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Investigation failed: {str(e)}")


@router.get("/explain/{entity_id}")
async def explain_entity(entity_id: str):
    """Generate a comprehensive explainable risk assessment.

    Provides a human-readable explanation of why an entity is flagged,
    including:
    - Entity summary (who/what this entity is)
    - Risk factors with specific evidence
    - Network/graph-based risk analysis
    - Plain language explanation suitable for analysts
    - Recommended action (MONITOR/INVESTIGATE/RESTRICT/BLOCK)
    """
    if not entity_id or len(entity_id.strip()) < 1:
        raise HTTPException(status_code=400, detail="entity_id is required")

    try:
        result = mcp_agent_service.explain_entity(entity_id=entity_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Explanation failed: {str(e)}")
