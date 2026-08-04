"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings with AWS service endpoints."""

    # App
    app_name: str = "Multi-DB AI POC"
    debug: bool = True
    customer_domain: str = "press_distribution"  # press_distribution, dating_platform, music_streaming, cinema_booking, news_platform, ticketing_platform

    # AWS
    aws_region: str = "us-east-2"
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None

    # Kinesis (Event Ingestion — Layer 1 entry point)
    kinesis_stream_name: str = "multidb-fraud-events"
    kinesis_firehose_name: str = "multidb-fraud-archive"
    s3_archive_bucket: str = "multidb-poc-event-archive"

    # DynamoDB
    dynamodb_endpoint: Optional[str] = "http://localhost:8001"  # Local DynamoDB
    dynamodb_table_prefix: str = "multidb_poc"

    # Aurora PostgreSQL + pgvector
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "multidb_poc"
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"

    # Neptune Analytics
    neptune_endpoint: Optional[str] = None
    neptune_graph_id: Optional[str] = None

    # ElastiCache Valkey (Redis-compatible)
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: Optional[str] = None

    # Bedrock
    bedrock_model_id: str = "amazon.titan-embed-text-v2:0"
    bedrock_claude_model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0"
    bedrock_embedding_dimensions: int = 1024

    # Pipeline
    pipeline_timeout_ms: int = 540
    cache_ttl_seconds: int = 3600

    # ──────────────────────────────────────────────────────────────────
    # AI/Agentic Enhancement Settings
    # ──────────────────────────────────────────────────────────────────

    # GraphStorm GNN
    gnn_s3_bucket: str = "multidb-poc-gnn-data"
    sagemaker_execution_role: Optional[str] = None
    graphstorm_image: str = "533267195093.dkr.ecr.us-east-1.amazonaws.com/graphstorm:0.5-gpu"
    gnn_instance_type: str = "ml.g4dn.xlarge"

    # GraphRAG (Bedrock Knowledge Bases)
    bedrock_knowledge_base_id: Optional[str] = None
    graphrag_s3_bucket: str = "multidb-poc-fraud-docs"

    # Agent Memory (Mem0 pattern)
    memory_ttl_days: int = 90  # How long to keep memories
    memory_max_per_entity: int = 100  # Max memories per entity

    # OpenSearch Serverless
    opensearch_endpoint: Optional[str] = None
    opensearch_index_name: str = "threat-patterns"

    @property
    def postgres_url(self) -> str:
        return f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    @property
    def redis_url(self) -> str:
        auth = f":{self.redis_password}@" if self.redis_password else ""
        return f"redis://{auth}{self.redis_host}:{self.redis_port}/0"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
