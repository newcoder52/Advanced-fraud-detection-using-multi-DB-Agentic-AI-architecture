"""Pydantic models for API request/response schemas."""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# --- Enums ---

class CustomerDomain(str, Enum):
    PRESS_DISTRIBUTION = "press_distribution"
    DATING_PLATFORM = "dating_platform"
    MUSIC_STREAMING = "music_streaming"
    CINEMA_BOOKING = "cinema_booking"
    NEWS_PLATFORM = "news_platform"
    TWITCH = "live_streaming"
    TICKETING_PLATFORM = "ticketing_platform"
    EPIC_GAMES = "gaming_platform"


class DecisionAction(str, Enum):
    ALLOW = "ALLOW"
    FLAG = "FLAG"
    CHALLENGE = "CHALLENGE"
    BLOCK = "BLOCK"


class PipelineStatus(str, Enum):
    PENDING = "pending"
    INGESTING = "ingesting"
    EMBEDDING = "embedding"
    ANALYZING_SIMILARITY = "analyzing_similarity"
    ANALYZING_GRAPH = "analyzing_graph"
    SCORING = "scoring"
    COMPLETED = "completed"
    FAILED = "failed"


class GraphAlgorithm(str, Enum):
    LOUVAIN = "louvain"
    PAGERANK = "pagerank"
    SHORTEST_PATH = "shortest_path"
    WCC = "wcc"


# --- Event Models ---

class EventBase(BaseModel):
    domain: CustomerDomain
    event_type: str
    payload: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = None


class EventIngest(EventBase):
    """Request model for event ingestion."""
    pass


class EventResponse(EventBase):
    """Response model for ingested events."""
    event_id: str
    timestamp: datetime
    status: str = "ingested"


# --- Semantic Analysis Models ---

class SemanticSearchRequest(BaseModel):
    event_id: str
    similarity_threshold: float = Field(default=0.75, ge=0.0, le=1.0)
    top_k: int = Field(default=10, ge=1, le=100)


class SimilarityMatch(BaseModel):
    matched_id: str
    content_preview: str
    cosine_score: float
    matched_at: datetime
    metadata: Optional[Dict[str, Any]] = None


class SemanticSearchResponse(BaseModel):
    event_id: str
    query_embedding_preview: List[float] = Field(default_factory=list, max_length=5)
    matches: List[SimilarityMatch]
    search_latency_ms: float
    total_matches: int


# --- Graph Analysis Models ---

class GraphAnalysisRequest(BaseModel):
    entity_id: str
    algorithm: GraphAlgorithm = GraphAlgorithm.LOUVAIN
    max_depth: int = Field(default=3, ge=1, le=10)


class GraphNode(BaseModel):
    node_id: str
    label: str
    node_type: str
    properties: Dict[str, Any] = Field(default_factory=dict)
    community_id: Optional[int] = None
    pagerank_score: Optional[float] = None


class GraphEdge(BaseModel):
    source: str
    target: str
    relationship: str
    weight: float = 1.0
    properties: Dict[str, Any] = Field(default_factory=dict)


class CommunityResult(BaseModel):
    community_id: int
    member_count: int
    members: List[GraphNode]
    edges: List[GraphEdge]
    risk_score: float
    description: Optional[str] = None


class GraphAnalysisResponse(BaseModel):
    entity_id: str
    algorithm: GraphAlgorithm
    communities: List[CommunityResult]
    total_nodes: int
    total_edges: int
    analysis_latency_ms: float


# --- Scoring Models ---

class ScoreComponents(BaseModel):
    graph_score: float = Field(ge=0.0, le=1.0)
    similarity_score: float = Field(ge=0.0, le=1.0)
    behavioral_score: float = Field(ge=0.0, le=1.0)
    velocity_score: float = Field(ge=0.0, le=1.0)


class EntityScore(BaseModel):
    entity_id: str
    composite_score: float = Field(ge=0.0, le=1.0)
    components: ScoreComponents
    decision: DecisionAction
    cache_hit: bool
    latency_ms: float
    last_updated: datetime
    ttl_remaining_seconds: Optional[int] = None


# --- Pipeline Models ---

class PipelineExecuteRequest(BaseModel):
    domain: CustomerDomain
    event: EventIngest
    execute_full: bool = True


class PipelineStageResult(BaseModel):
    stage: str
    status: str
    latency_ms: float
    result_summary: Optional[str] = None
    error: Optional[str] = None


class PipelineExecutionResponse(BaseModel):
    execution_id: str
    domain: CustomerDomain
    status: PipelineStatus
    stages: List[PipelineStageResult] = Field(default_factory=list)
    total_latency_ms: float = 0
    final_score: Optional[EntityScore] = None
    started_at: datetime
    completed_at: Optional[datetime] = None


# --- Briefing Models ---

class InvestigatorBriefing(BaseModel):
    entity_id: str
    title: str
    narrative: str
    evidence_chain: List[Dict[str, Any]]
    risk_assessment: str
    recommended_actions: List[str]
    generated_at: datetime
    confidence_score: float


# --- Dashboard Models ---

class DashboardMetrics(BaseModel):
    total_events_ingested: int
    total_detections: int
    total_rings_discovered: int
    avg_pipeline_latency_ms: float
    events_last_hour: int
    detections_last_hour: int
    cache_hit_rate: float
    service_health: Dict[str, str]  # service_name -> "healthy" | "degraded" | "down"


# --- WebSocket Models ---

class WSMessage(BaseModel):
    type: str  # "event", "detection", "score_update"
    data: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
