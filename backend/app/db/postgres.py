"""Aurora PostgreSQL + pgvector client for semantic analysis."""

from typing import List, Optional, Tuple
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
import numpy as np

from app.config import settings
from app.models import CustomerDomain, SimilarityMatch


# SQL schemas per domain
SCHEMA_SQL = {
    CustomerDomain.PRESS_DISTRIBUTION: """
        CREATE TABLE IF NOT EXISTS content_embeddings (
            id SERIAL PRIMARY KEY,
            release_id VARCHAR(255) NOT NULL,
            content_type VARCHAR(50) NOT NULL,
            content_text TEXT,
            embedding vector(1024),
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS journalist_profiles (
            id SERIAL PRIMARY KEY,
            journalist_id VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(255),
            organization VARCHAR(255),
            access_pattern_embedding vector(1024),
            behavior_embedding vector(1024),
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS embargo_access_patterns (
            id SERIAL PRIMARY KEY,
            release_id VARCHAR(255) NOT NULL,
            accessor_id VARCHAR(255) NOT NULL,
            access_type VARCHAR(50),
            access_embedding vector(1024),
            timestamp TIMESTAMP DEFAULT NOW(),
            metadata JSONB DEFAULT '{}'
        );
    """,
    CustomerDomain.DATING_PLATFORM: """
        CREATE TABLE IF NOT EXISTS message_embeddings (
            id SERIAL PRIMARY KEY,
            message_id VARCHAR(255) NOT NULL,
            sender_id VARCHAR(255) NOT NULL,
            recipient_id VARCHAR(255),
            message_text TEXT,
            embedding vector(1024),
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS user_behavior_embeddings (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) UNIQUE NOT NULL,
            behavior_embedding vector(1024),
            profile_embedding vector(1024),
            last_updated TIMESTAMP DEFAULT NOW(),
            metadata JSONB DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS known_scam_scripts (
            id SERIAL PRIMARY KEY,
            script_id VARCHAR(255) UNIQUE NOT NULL,
            category VARCHAR(100),
            content TEXT,
            embedding vector(1024),
            confidence FLOAT DEFAULT 0.0,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """,
    CustomerDomain.MUSIC_STREAMING: """
        CREATE TABLE IF NOT EXISTS listening_patterns (
            id SERIAL PRIMARY KEY,
            account_id VARCHAR(255) NOT NULL,
            pattern_embedding vector(1024),
            pattern_type VARCHAR(50),
            streams_per_day INT DEFAULT 0,
            unique_tracks INT DEFAULT 0,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS known_bot_patterns (
            id SERIAL PRIMARY KEY,
            pattern_id VARCHAR(255) UNIQUE NOT NULL,
            pattern_embedding vector(1024),
            bot_type VARCHAR(100),
            confidence FLOAT DEFAULT 0.0,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS track_embeddings (
            id SERIAL PRIMARY KEY,
            track_id VARCHAR(255) UNIQUE NOT NULL,
            artist VARCHAR(255),
            title VARCHAR(255),
            audio_embedding vector(1024),
            is_ai_generated BOOLEAN DEFAULT FALSE,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        );
    """,
    CustomerDomain.CINEMA_BOOKING: """
        CREATE TABLE IF NOT EXISTS session_behaviors (
            id SERIAL PRIMARY KEY,
            session_id VARCHAR(255) NOT NULL,
            behavior_embedding vector(1024),
            interaction_speed_ms FLOAT,
            navigation_pattern TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS known_bot_sessions (
            id SERIAL PRIMARY KEY,
            pattern_id VARCHAR(255) UNIQUE NOT NULL,
            behavior_embedding vector(1024),
            bot_type VARCHAR(100),
            confidence FLOAT DEFAULT 0.0,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """,
    CustomerDomain.NEWS_PLATFORM: """
        CREATE TABLE IF NOT EXISTS content_embeddings (
            id SERIAL PRIMARY KEY,
            content_id VARCHAR(255) NOT NULL,
            author_id VARCHAR(255),
            content_text TEXT,
            embedding vector(1024),
            is_ai_generated_score FLOAT DEFAULT 0.0,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS author_behavior_patterns (
            id SERIAL PRIMARY KEY,
            author_id VARCHAR(255) UNIQUE NOT NULL,
            behavior_embedding vector(1024),
            posting_frequency FLOAT,
            account_age_days INT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS known_bot_content (
            id SERIAL PRIMARY KEY,
            pattern_id VARCHAR(255) UNIQUE NOT NULL,
            content_embedding vector(1024),
            bot_type VARCHAR(100),
            confidence FLOAT DEFAULT 0.0,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """,
}


class PostgresClient:
    """Manages Aurora PostgreSQL + pgvector operations."""

    def __init__(self):
        self.engine = create_async_engine(
            settings.postgres_url,
            echo=settings.debug,
            pool_size=10,
            max_overflow=20,
        )
        self.session_factory = async_sessionmaker(self.engine, class_=AsyncSession)

    async def initialize(self):
        """Initialize database with pgvector extension and domain schemas."""
        async with self.engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

            domain = CustomerDomain(settings.customer_domain)
            if domain in SCHEMA_SQL:
                for statement in SCHEMA_SQL[domain].strip().split(";"):
                    stmt = statement.strip()
                    if stmt:
                        await conn.execute(text(stmt))

    async def initialize_all_domains(self):
        """Initialize schemas for all domains."""
        async with self.engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            for domain, sql in SCHEMA_SQL.items():
                for statement in sql.strip().split(";"):
                    stmt = statement.strip()
                    if stmt:
                        await conn.execute(text(stmt))

    async def store_embedding(
        self,
        domain: CustomerDomain,
        table: str,
        record_id: str,
        embedding: List[float],
        content: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> str:
        """Store an embedding vector in the appropriate table."""
        embedding_str = f"[{','.join(str(x) for x in embedding)}]"

        async with self.session_factory() as session:
            if domain == CustomerDomain.PRESS_DISTRIBUTION and table == "content_embeddings":
                result = await session.execute(
                    text("""
                        INSERT INTO content_embeddings (release_id, content_type, content_text, embedding, metadata)
                        VALUES (:rid, 'press_release', :content, :emb::vector, :meta::jsonb)
                        RETURNING id
                    """),
                    {"rid": record_id, "content": content, "emb": embedding_str, "meta": str(metadata or {})},
                )
            elif domain == CustomerDomain.DATING_PLATFORM and table == "message_embeddings":
                result = await session.execute(
                    text("""
                        INSERT INTO message_embeddings (message_id, sender_id, message_text, embedding, metadata)
                        VALUES (:mid, :sid, :content, :emb::vector, :meta::jsonb)
                        RETURNING id
                    """),
                    {
                        "mid": record_id,
                        "sid": metadata.get("sender_id", "unknown") if metadata else "unknown",
                        "content": content,
                        "emb": embedding_str,
                        "meta": str(metadata or {}),
                    },
                )
            else:
                # Generic insert for other combinations
                result = await session.execute(
                    text(f"""
                        INSERT INTO {table} (embedding, metadata, created_at)
                        VALUES (:emb::vector, :meta::jsonb, NOW())
                        RETURNING id
                    """),
                    {"emb": embedding_str, "meta": str(metadata or {})},
                )

            await session.commit()
            row = result.fetchone()
            return str(row[0]) if row else record_id

    async def similarity_search(
        self,
        domain: CustomerDomain,
        embedding: List[float],
        threshold: float = 0.75,
        top_k: int = 10,
    ) -> List[SimilarityMatch]:
        """Perform cosine similarity search using pgvector."""
        embedding_str = f"[{','.join(str(x) for x in embedding)}]"

        # Determine which table to search based on domain
        table_map = {
            CustomerDomain.PRESS_DISTRIBUTION: ("content_embeddings", "release_id", "content_text"),
            CustomerDomain.DATING_PLATFORM: ("message_embeddings", "message_id", "message_text"),
            CustomerDomain.MUSIC_STREAMING: ("listening_patterns", "account_id", "pattern_type"),
            CustomerDomain.CINEMA_BOOKING: ("session_behaviors", "session_id", "navigation_pattern"),
            CustomerDomain.NEWS_PLATFORM: ("content_embeddings", "content_id", "content_text"),
        }

        table_name, id_col, content_col = table_map[domain]

        async with self.session_factory() as session:
            result = await session.execute(
                text(f"""
                    SELECT
                        {id_col} as matched_id,
                        COALESCE({content_col}, '') as content_preview,
                        1 - (embedding <=> :emb::vector) as cosine_score,
                        created_at
                    FROM {table_name}
                    WHERE 1 - (embedding <=> :emb::vector) >= :threshold
                    ORDER BY embedding <=> :emb::vector
                    LIMIT :top_k
                """),
                {"emb": embedding_str, "threshold": threshold, "top_k": top_k},
            )

            matches = []
            for row in result.fetchall():
                matches.append(
                    SimilarityMatch(
                        matched_id=str(row[0]),
                        content_preview=row[1][:200] if row[1] else "",
                        cosine_score=float(row[2]),
                        matched_at=row[3] or datetime.now(timezone.utc),
                    )
                )

            return matches

    async def close(self):
        await self.engine.dispose()


# Singleton
postgres_client = PostgresClient()
