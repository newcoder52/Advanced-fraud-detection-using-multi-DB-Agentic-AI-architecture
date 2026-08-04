"""FastAPI application for Multi-Database AI POC."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import events, semantic, graph, scores, pipeline, briefing, dashboard, admin
from app.routers import seed_robust
# New AI/Agentic routers - import with fallback for Lambda cold start
try:
    from app.routers import ontology, gnn, graphrag, agent, memory
    _agentic_available = True
except Exception:
    _agentic_available = False

app = FastAPI(
    title="Real-Time Threat Intelligence Platform",
    description="""Multi-database agentic AI architecture for trust & safety.

## Architecture
- **DynamoDB** — Event ingestion & streaming
- **Aurora PostgreSQL + pgvector** — Semantic analysis (vector similarity)
- **Neptune Analytics** — Graph intelligence (community detection, ontology, GNN)
- **ElastiCache Valkey** — Real-time scoring & caching (cache-gate pattern)
- **Bedrock** — LLM reasoning, embeddings, agentic investigation
- **OpenSearch Serverless** — Vector analytics & historical patterns

## AI/Agentic Capabilities
- **Semantic Ontology** — Self-learning taxonomy with LLM-powered discovery
- **GraphStorm GNN** — Learned threat detection via Graph Neural Networks
- **GraphRAG** — Multi-hop knowledge retrieval (Bedrock KB + Neptune)
- **Agentic Investigation** — Autonomous AI fraud investigation (MCP pattern)
- **Agent Memory** — Persistent cross-session investigation memory (Mem0)
""",
    version="2.0.0",
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────────────
# Core Routers (v1)
# ──────────────────────────────────────────────────────────────────────
app.include_router(events.router, prefix="/api/v1/events", tags=["Events"])
app.include_router(semantic.router, prefix="/api/v1/analysis/semantic", tags=["Semantic Analysis"])
app.include_router(graph.router, prefix="/api/v1/analysis/graph", tags=["Graph Intelligence"])
app.include_router(scores.router, prefix="/api/v1/scores", tags=["Scoring"])
app.include_router(pipeline.router, prefix="/api/v1/pipeline", tags=["Pipeline"])
app.include_router(briefing.router, prefix="/api/v1/briefing", tags=["Briefing"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(seed_robust.router, prefix="/api/v1/admin", tags=["Admin"])

# ──────────────────────────────────────────────────────────────────────
# AI/Agentic Routers (v2)
# ──────────────────────────────────────────────────────────────────────
if _agentic_available:
    app.include_router(ontology.router, prefix="/api/v1/ontology", tags=["Semantic Ontology"])
    app.include_router(gnn.router, prefix="/api/v1/gnn", tags=["GraphStorm GNN"])
    app.include_router(graphrag.router, prefix="/api/v1/graphrag", tags=["GraphRAG"])
    app.include_router(agent.router, prefix="/api/v1/agent", tags=["Agentic Investigation"])
    app.include_router(memory.router, prefix="/api/v1/memory", tags=["Agent Memory"])


@app.get("/")
async def root():
    return {
        "status": "healthy",
        "service": "multi-db-ai-poc",
        "version": "2.0.0",
        "capabilities": {
            "core": ["events", "semantic_analysis", "graph_intelligence", "scoring", "pipeline"],
            "ai_agentic": ["ontology", "gnn", "graphrag", "agent", "memory"],
        },
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
