"""Aurora PostgreSQL + pgvector service for semantic analysis."""

import os
import json
import time
from typing import List, Optional
from datetime import datetime, timezone

import boto3

REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
SECRET_ARN = os.environ.get("AURORA_SECRET_ARN", "")
CLUSTER_ENDPOINT = os.environ.get("AURORA_CLUSTER_ENDPOINT", "localhost")
DB_NAME = os.environ.get("AURORA_DB_NAME", "multidb_poc")


class AuroraService:
    """Manages Aurora PostgreSQL + pgvector operations via Data API or psycopg2."""

    def __init__(self):
        self.rds_client = boto3.client("rds-data", region_name=REGION)
        self.secrets_client = boto3.client("secretsmanager", region_name=REGION)
        self._cluster_arn = None
        self._secret_arn = SECRET_ARN

    def _get_cluster_arn(self) -> str:
        if self._cluster_arn:
            return self._cluster_arn
        rds = boto3.client("rds", region_name=REGION)
        clusters = rds.describe_db_clusters()
        for cluster in clusters.get("DBClusters", []):
            if "multidb" in cluster.get("DBClusterIdentifier", "").lower():
                self._cluster_arn = cluster["DBClusterArn"]
                return self._cluster_arn
        # Fallback
        self._cluster_arn = f"arn:aws:rds:{REGION}:723470608645:cluster:multidbpocstack-auroracluster"
        return self._cluster_arn

    def execute_sql(self, sql: str, parameters: list = None) -> dict:
        """Execute SQL via RDS Data API."""
        try:
            kwargs = {
                "resourceArn": self._get_cluster_arn(),
                "secretArn": self._secret_arn,
                "database": DB_NAME,
                "sql": sql,
            }
            if parameters:
                kwargs["parameters"] = parameters

            return self.rds_client.execute_statement(**kwargs)
        except Exception as e:
            return {"error": str(e), "records": []}

    def initialize_schema(self, domain: str):
        """Create tables and enable pgvector for a domain."""
        self.execute_sql("CREATE EXTENSION IF NOT EXISTS vector")

        schemas = {
            "press_distribution": [
                """CREATE TABLE IF NOT EXISTS content_embeddings (
                    id SERIAL PRIMARY KEY,
                    release_id VARCHAR(255) NOT NULL,
                    content_type VARCHAR(50) DEFAULT 'press_release',
                    content_text TEXT,
                    embedding vector(1024),
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW()
                )""",
                """CREATE TABLE IF NOT EXISTS journalist_profiles (
                    id SERIAL PRIMARY KEY,
                    journalist_id VARCHAR(255) UNIQUE NOT NULL,
                    name VARCHAR(255),
                    organization VARCHAR(255),
                    access_pattern_embedding vector(1024),
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW()
                )""",
            ],
            "dating_platform": [
                """CREATE TABLE IF NOT EXISTS message_embeddings (
                    id SERIAL PRIMARY KEY,
                    message_id VARCHAR(255) NOT NULL,
                    sender_id VARCHAR(255) NOT NULL,
                    message_text TEXT,
                    embedding vector(1024),
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW()
                )""",
                """CREATE TABLE IF NOT EXISTS known_scam_scripts (
                    id SERIAL PRIMARY KEY,
                    script_id VARCHAR(255) UNIQUE NOT NULL,
                    category VARCHAR(100),
                    content TEXT,
                    embedding vector(1024),
                    confidence FLOAT DEFAULT 0.0,
                    created_at TIMESTAMP DEFAULT NOW()
                )""",
            ],
            "music_streaming": [
                """CREATE TABLE IF NOT EXISTS listening_patterns (
                    id SERIAL PRIMARY KEY,
                    account_id VARCHAR(255) NOT NULL,
                    pattern_embedding vector(1024),
                    pattern_type VARCHAR(50),
                    streams_per_day INT DEFAULT 0,
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW()
                )""",
                """CREATE TABLE IF NOT EXISTS known_bot_patterns (
                    id SERIAL PRIMARY KEY,
                    pattern_id VARCHAR(255) UNIQUE NOT NULL,
                    pattern_embedding vector(1024),
                    bot_type VARCHAR(100),
                    confidence FLOAT DEFAULT 0.0,
                    created_at TIMESTAMP DEFAULT NOW()
                )""",
            ],
            "cinema_booking": [
                """CREATE TABLE IF NOT EXISTS session_behaviors (
                    id SERIAL PRIMARY KEY,
                    session_id VARCHAR(255) NOT NULL,
                    behavior_embedding vector(1024),
                    interaction_speed_ms FLOAT,
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW()
                )""",
                """CREATE TABLE IF NOT EXISTS known_bot_sessions (
                    id SERIAL PRIMARY KEY,
                    pattern_id VARCHAR(255) UNIQUE NOT NULL,
                    behavior_embedding vector(1024),
                    bot_type VARCHAR(100),
                    confidence FLOAT DEFAULT 0.0,
                    created_at TIMESTAMP DEFAULT NOW()
                )""",
            ],
            "news_platform": [
                """CREATE TABLE IF NOT EXISTS pm_content_embeddings (
                    id SERIAL PRIMARY KEY,
                    content_id VARCHAR(255) NOT NULL,
                    author_id VARCHAR(255),
                    content_text TEXT,
                    embedding vector(1024),
                    is_ai_generated_score FLOAT DEFAULT 0.0,
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW()
                )""",
                """CREATE TABLE IF NOT EXISTS known_bot_content (
                    id SERIAL PRIMARY KEY,
                    pattern_id VARCHAR(255) UNIQUE NOT NULL,
                    content_embedding vector(1024),
                    bot_type VARCHAR(100),
                    confidence FLOAT DEFAULT 0.0,
                    created_at TIMESTAMP DEFAULT NOW()
                )""",
            ],
            "ticketing_platform": [
                """CREATE TABLE IF NOT EXISTS tm_purchase_behaviors (
                    id SERIAL PRIMARY KEY,
                    session_id VARCHAR(255) NOT NULL,
                    buyer_id VARCHAR(255),
                    behavior_embedding vector(1024),
                    interaction_speed_ms FLOAT,
                    ticket_quantity INT DEFAULT 1,
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW()
                )""",
                """CREATE TABLE IF NOT EXISTS tm_known_bot_patterns (
                    id SERIAL PRIMARY KEY,
                    pattern_id VARCHAR(255) UNIQUE NOT NULL,
                    behavior_embedding vector(1024),
                    bot_type VARCHAR(100),
                    confidence FLOAT DEFAULT 0.0,
                    created_at TIMESTAMP DEFAULT NOW()
                )""",
            ],
        }

        for sql in schemas.get(domain, []):
            self.execute_sql(sql)

    def store_embedding(self, domain: str, record_id: str, embedding: List[float], content: str = "", metadata: dict = None) -> str:
        """Store an embedding in the appropriate table."""
        emb_str = f"[{','.join(str(x) for x in embedding)}]"
        content_escaped = content.replace("'", "''")[:500]
        meta_str = json.dumps(metadata or {}).replace("'", "''")

        # Domain-specific INSERT with correct column names and vector columns
        sql_map = {
            "press_distribution": f"INSERT INTO content_embeddings (release_id, content_type, content_text, embedding, metadata) VALUES ('{record_id}', 'event', '{content_escaped}', '{emb_str}'::vector, '{meta_str}'::jsonb)",
            "dating_platform": f"INSERT INTO message_embeddings (message_id, sender_id, message_text, embedding, metadata) VALUES ('{record_id}', 'pipeline', '{content_escaped}', '{emb_str}'::vector, '{meta_str}'::jsonb)",
            "music_streaming": f"INSERT INTO listening_patterns (account_id, pattern_embedding, pattern_type, streams_per_day, metadata) VALUES ('{record_id}', '{emb_str}'::vector, 'event', 0, '{meta_str}'::jsonb)",
            "cinema_booking": f"INSERT INTO session_behaviors (session_id, behavior_embedding, interaction_speed_ms, metadata) VALUES ('{record_id}', '{emb_str}'::vector, 0, '{meta_str}'::jsonb)",
            "news_platform": f"INSERT INTO pm_content_embeddings (content_id, author_id, content_text, embedding, is_ai_generated_score, metadata) VALUES ('{record_id}', 'pipeline', '{content_escaped}', '{emb_str}'::vector, 0.0, '{meta_str}'::jsonb)",
            "live_streaming": f"INSERT INTO content_embeddings (release_id, content_type, content_text, embedding, metadata) VALUES ('{record_id}', 'twitch_event', '{content_escaped}', '{emb_str}'::vector, '{meta_str}'::jsonb)",
            "ticketing_platform": f"INSERT INTO content_embeddings (release_id, content_type, content_text, embedding, metadata) VALUES ('{record_id}', 'ticket_event', '{content_escaped}', '{emb_str}'::vector, '{meta_str}'::jsonb)",
            "gaming_platform": f"INSERT INTO content_embeddings (release_id, content_type, content_text, embedding, metadata) VALUES ('{record_id}', 'game_event', '{content_escaped}', '{emb_str}'::vector, '{meta_str}'::jsonb)",
        }

        sql = sql_map.get(domain)
        if sql:
            self.execute_sql(sql)
        return record_id

    def similarity_search(self, domain: str, embedding: List[float], threshold: float = 0.75, top_k: int = 10) -> List[dict]:
        """Perform cosine similarity search."""
        emb_str = f"[{','.join(str(x) for x in embedding)}]"
        # table, id_col, content_col, vector_col
        table_map = {
            "press_distribution": ("content_embeddings", "release_id", "content_text", "embedding"),
            "dating_platform": ("message_embeddings", "message_id", "message_text", "embedding"),
            "music_streaming": ("listening_patterns", "account_id", "pattern_type", "pattern_embedding"),
            "cinema_booking": ("session_behaviors", "session_id", "interaction_speed_ms", "behavior_embedding"),
            "news_platform": ("pm_content_embeddings", "content_id", "content_text", "embedding"),
            "live_streaming": ("content_embeddings", "release_id", "content_text", "embedding"),
            "ticketing_platform": ("content_embeddings", "release_id", "content_text", "embedding"),
            "gaming_platform": ("content_embeddings", "release_id", "content_text", "embedding"),
        }
        table, id_col, content_col, vec_col = table_map.get(domain, ("content_embeddings", "release_id", "content_text", "embedding"))

        start = time.time()

        # First store the query vector in a temp row, then use subquery for similarity
        # This avoids the 64KB SQL limit issue with 1024-dim vector literals
        temp_id = f"__query_temp_{int(time.time() * 1000)}"

        # Store query vector
        store_sql_map = {
            "press_distribution": f"INSERT INTO content_embeddings (release_id, content_type, content_text, embedding) VALUES ('{temp_id}', '__query__', '', '{emb_str}'::vector)",
            "dating_platform": f"INSERT INTO message_embeddings (message_id, sender_id, message_text, embedding) VALUES ('{temp_id}', '__query__', '', '{emb_str}'::vector)",
            "music_streaming": f"INSERT INTO listening_patterns (account_id, pattern_embedding, pattern_type) VALUES ('{temp_id}', '{emb_str}'::vector, '__query__')",
            "cinema_booking": f"INSERT INTO session_behaviors (session_id, behavior_embedding) VALUES ('{temp_id}', '{emb_str}'::vector)",
            "news_platform": f"INSERT INTO pm_content_embeddings (content_id, author_id, content_text, embedding) VALUES ('{temp_id}', '__query__', '', '{emb_str}'::vector)",
            "live_streaming": f"INSERT INTO content_embeddings (release_id, content_type, content_text, embedding) VALUES ('{temp_id}', '__query__', '', '{emb_str}'::vector)",
            "ticketing_platform": f"INSERT INTO content_embeddings (release_id, content_type, content_text, embedding) VALUES ('{temp_id}', '__query__', '', '{emb_str}'::vector)",
            "gaming_platform": f"INSERT INTO content_embeddings (release_id, content_type, content_text, embedding) VALUES ('{temp_id}', '__query__', '', '{emb_str}'::vector)",
        }
        self.execute_sql(store_sql_map[domain])

        # Now search using subquery (avoids inline vector literal in WHERE clause)
        # Exclude temp rows AND pipeline-stored events — only match against seeded threat patterns
        exclude_clause_map = {
            "press_distribution": f"AND {id_col} != '{temp_id}' AND content_type != 'event' AND content_type != '__query__'",
            "dating_platform": f"AND {id_col} != '{temp_id}' AND sender_id != 'pipeline' AND sender_id != '__query__'",
            "music_streaming": f"AND {id_col} != '{temp_id}' AND pattern_type != 'event' AND pattern_type != '__query__'",
            "cinema_booking": f"AND {id_col} != '{temp_id}'",
            "news_platform": f"AND {id_col} != '{temp_id}' AND author_id != 'pipeline' AND author_id != '__query__'",
            "ticketing_platform": f"AND {id_col} != '{temp_id}' AND content_type != 'ticket_event' AND content_type != '__query__'",
        }
        exclude_clause = exclude_clause_map.get(domain, f"AND {id_col} != '{temp_id}'")

        sql = f"""SELECT {id_col}, COALESCE(CAST({content_col} AS TEXT), ''),
                         1 - ({vec_col} <=> (SELECT {vec_col} FROM {table} WHERE {id_col} = '{temp_id}')) as score,
                         created_at
                  FROM {table}
                  WHERE 1=1
                    {exclude_clause}
                    AND 1 - ({vec_col} <=> (SELECT {vec_col} FROM {table} WHERE {id_col} = '{temp_id}')) >= {threshold}
                  ORDER BY {vec_col} <=> (SELECT {vec_col} FROM {table} WHERE {id_col} = '{temp_id}')
                  LIMIT {top_k}"""

        result = self.execute_sql(sql)

        # Clean up temp row
        self.execute_sql(f"DELETE FROM {table} WHERE {id_col} = '{temp_id}'")

        latency = (time.time() - start) * 1000

        matches = []
        for record in result.get("records", []):
            matches.append({
                "matched_id": str(record[0].get("stringValue", record[0].get("longValue", ""))),
                "content_preview": str(record[1].get("stringValue", ""))[:200],
                "cosine_score": float(record[2].get("doubleValue", 0)),
                "latency_ms": latency,
            })

        return matches


aurora_service = AuroraService()
