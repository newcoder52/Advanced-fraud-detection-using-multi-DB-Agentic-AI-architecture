"""GraphRAG API endpoints.

Multi-hop knowledge retrieval combining Neptune graph traversal
with Bedrock Knowledge Bases for fraud investigation intelligence.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.services.graphrag_service import graphrag_service

router = APIRouter()


@router.post("/query")
async def graphrag_query(body: dict):
    """Execute a GraphRAG query combining KB retrieval + graph traversal.

    Natural language query that:
    1. Retrieves relevant document chunks from Bedrock Knowledge Base
    2. Extracts entities and traverses the Neptune fraud graph
    3. Synthesizes a comprehensive answer with citations and graph evidence

    Request body:
    - question: Natural language question (required)
    - max_hops: Graph traversal depth (default: 3, max: 5)
    - top_k: Number of KB chunks to retrieve (default: 5, max: 20)

    Example questions:
    - "What fraud patterns have we seen involving shared devices?"
    - "Are there any cases linking account A-001 to known fraud rings?"
    - "What's the history of payment fraud in the gaming domain?"
    """
    question = body.get("question")
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    max_hops = min(body.get("max_hops", 3), 5)
    top_k = min(body.get("top_k", 5), 20)

    try:
        result = graphrag_service.query(
            question=question,
            max_hops=max_hops,
            top_k=top_k,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GraphRAG query failed: {str(e)}")


@router.post("/ingest")
async def ingest_document(body: dict):
    """Ingest a fraud investigation document into the knowledge base.

    Uploads document to S3 (triggers Bedrock KB sync), extracts entities,
    and links them in the Neptune graph for future GraphRAG queries.

    Request body:
    - content: Document text content (required)
    - title: Document title (required)
    - doc_type: Type of document (default: "investigation_report")
      Options: investigation_report, fraud_alert, regulatory_filing, analyst_note, case_resolution
    - metadata: Optional metadata dict
    """
    content = body.get("content")
    title = body.get("title")

    if not content or not title:
        raise HTTPException(status_code=400, detail="content and title are required")

    doc_type = body.get("doc_type", "investigation_report")
    metadata = body.get("metadata")

    try:
        result = graphrag_service.ingest_document(
            content=content,
            title=title,
            doc_type=doc_type,
            metadata=metadata,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document ingestion failed: {str(e)}")


@router.get("/investigate/{entity_id}")
async def investigate_entity(entity_id: str):
    """Run a comprehensive GraphRAG investigation on an entity.

    Combines:
    - All documents mentioning this entity (KB retrieval)
    - Graph neighborhood analysis (Neptune traversal)
    - LLM-synthesized investigation report

    Returns a structured investigation report with risk level,
    key findings, connected cases, timeline, and recommendations.
    """
    if not entity_id or len(entity_id.strip()) < 1:
        raise HTTPException(status_code=400, detail="entity_id is required")

    try:
        result = graphrag_service.investigate_entity(entity_id=entity_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Investigation failed: {str(e)}")
