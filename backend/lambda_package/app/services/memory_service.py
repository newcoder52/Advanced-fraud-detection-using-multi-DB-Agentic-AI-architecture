"""Mem0 Agent Memory service for persistent fraud investigation memory.

Implements graph-native long-term memory for fraud investigation AI agents.
Stores investigation histories, learned patterns, and cross-case correlations
in Neptune, enabling agents to:
- Remember prior investigations across sessions
- Detect cross-case patterns ("this looks like the scheme from 3 months ago")
- Build institutional knowledge from resolved cases

Reference: https://aws.amazon.com/about-aws/whats-new/2025/07/amazon-neptune-analytics-mem0-graph-native-memory-in-genai-applications
"""

import json
import os
import time
import uuid
from typing import Dict, List, Optional
from datetime import datetime, timezone

import boto3
from botocore.config import Config

REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
GRAPH_ID = os.environ.get("NEPTUNE_GRAPH_ID", "")
EMBEDDING_MODEL = os.environ.get("BEDROCK_EMBEDDING_MODEL", "amazon.titan-embed-text-v2:0")
CLAUDE_MODEL = os.environ.get("BEDROCK_CLAUDE_MODEL", "us.anthropic.claude-sonnet-4-6")


class MemoryService:
    """Graph-native long-term memory for fraud investigation agents.

    Memory Architecture (stored in Neptune):
    - MemoryNode: Individual memory entries with embeddings
    - InvestigationSession: Groups of memories from one investigation
    - PatternNode: Discovered cross-case patterns
    - Links to entity nodes for contextual recall

    Memory Types:
    - investigation_finding: Key finding from an investigation
    - fraud_pattern: Recognized fraud pattern
    - resolution: How a case was resolved
    - analyst_note: Human analyst annotation
    """

    def __init__(self):
        config = Config(connect_timeout=5, read_timeout=30, retries={"max_attempts": 2})
        self.neptune_client = boto3.client("neptune-graph", region_name=REGION, config=config)
        self.bedrock_client = boto3.client("bedrock-runtime", region_name=REGION, config=config)
        self._graph_id = GRAPH_ID

    @property
    def graph_id(self) -> str:
        if self._graph_id:
            return self._graph_id
        try:
            graphs = self.neptune_client.list_graphs()
            for g in graphs.get("graphs", []):
                if "multidb" in g.get("name", "").lower():
                    self._graph_id = g["id"]
                    return self._graph_id
        except Exception:
            pass
        return self._graph_id

    def _execute_query(self, query: str) -> dict:
        """Execute an openCypher query against Neptune Analytics."""
        if not self.graph_id:
            return {"error": "No Neptune graph configured", "results": []}
        try:
            response = self.neptune_client.execute_query(
                graphIdentifier=self.graph_id,
                queryString=query,
                language="OPEN_CYPHER",
            )
            payload = response.get("payload")
            if payload:
                return json.loads(payload.read())
            return {"results": []}
        except Exception as e:
            return {"error": str(e), "results": []}

    def _get_embedding(self, text: str) -> List[float]:
        """Generate vector embedding for semantic memory search."""
        body = json.dumps({
            "inputText": text[:2000],
            "dimensions": 1024,
            "normalize": True,
        })
        response = self.bedrock_client.invoke_model(
            modelId=EMBEDDING_MODEL,
            body=body,
            contentType="application/json",
            accept="application/json",
        )
        result = json.loads(response["body"].read())
        return result["embedding"]

    def _invoke_claude(self, prompt: str, max_tokens: int = 2048) -> str:
        """Invoke Claude for memory synthesis."""
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
        })
        response = self.bedrock_client.invoke_model(
            modelId=CLAUDE_MODEL,
            body=body,
            contentType="application/json",
            accept="application/json",
        )
        result = json.loads(response["body"].read())
        return result["content"][0]["text"]

    # ──────────────────────────────────────────────────────────────────────
    # Memory Storage
    # ──────────────────────────────────────────────────────────────────────

    def store_memory(self, content: str, memory_type: str = "investigation_finding",
                     entity_ids: Optional[List[str]] = None,
                     session_id: Optional[str] = None,
                     metadata: Optional[Dict] = None) -> dict:
        """Store a memory entry in the Neptune graph.

        Creates a MemoryNode linked to relevant entities, enabling
        contextual recall during future investigations.
        """
        start = time.time()
        memory_id = f"mem_{str(uuid.uuid4())[:8]}"
        timestamp = datetime.now(timezone.utc).isoformat()

        # Generate embedding for semantic search
        embedding = self._get_embedding(content)
        # Store first 10 dims as preview (full embedding for vector search)
        embedding_preview = json.dumps(embedding[:10])

        # Create memory node
        escaped_content = content.replace("'", "\\'").replace("\n", " ")[:500]
        meta_str = json.dumps(metadata or {}).replace("'", "\\'")

        create_query = f"""
            CREATE (m:MemoryNode {{
                id: '{memory_id}',
                content: '{escaped_content}',
                memory_type: '{memory_type}',
                session_id: '{session_id or "none"}',
                created_at: '{timestamp}',
                embedding_preview: '{embedding_preview}',
                metadata: '{meta_str}',
                access_count: 0,
                relevance_score: 1.0
            }})
            RETURN m.id as id
        """
        self._execute_query(create_query)

        # Link memory to entities
        linked_entities = 0
        for entity_id in (entity_ids or []):
            link_query = f"""
                MATCH (m:MemoryNode {{id: '{memory_id}'}})
                MATCH (e {{id: '{entity_id}'}})
                CREATE (m)-[:REMEMBERS {{
                    created_at: '{timestamp}',
                    memory_type: '{memory_type}'
                }}]->(e)
            """
            result = self._execute_query(link_query)
            if "error" not in result:
                linked_entities += 1

        # Link to session if provided
        if session_id:
            session_query = f"""
                MERGE (s:InvestigationSession {{id: '{session_id}'}})
                ON CREATE SET s.created_at = '{timestamp}'
                WITH s
                MATCH (m:MemoryNode {{id: '{memory_id}'}})
                CREATE (s)-[:CONTAINS_MEMORY]->(m)
            """
            self._execute_query(session_query)

        latency = (time.time() - start) * 1000
        return {
            "memory_id": memory_id,
            "memory_type": memory_type,
            "content_preview": content[:100],
            "entities_linked": linked_entities,
            "session_id": session_id,
            "timestamp": timestamp,
            "latency_ms": latency,
        }

    # ──────────────────────────────────────────────────────────────────────
    # Memory Recall
    # ──────────────────────────────────────────────────────────────────────

    def recall(self, entity_id: str, memory_type: Optional[str] = None,
               limit: int = 10) -> dict:
        """Recall memories associated with an entity.

        Retrieves memories linked to the entity, ordered by relevance
        and recency. Also finds memories from connected entities (1 hop).
        """
        start = time.time()

        # Direct memories for this entity
        type_filter = f"AND m.memory_type = '{memory_type}'" if memory_type else ""
        direct_query = f"""
            MATCH (m:MemoryNode)-[:REMEMBERS]->(e {{id: '{entity_id}'}})
            WHERE m.content IS NOT NULL {type_filter}
            RETURN m.id as memory_id, m.content as content, m.memory_type as type,
                   m.created_at as created_at, m.session_id as session_id,
                   m.relevance_score as relevance, 'direct' as recall_type
            ORDER BY m.created_at DESC
            LIMIT {limit}
        """
        direct_memories = self._execute_query(direct_query).get("results", [])

        # Connected entity memories (1 hop — memories from related entities)
        connected_query = f"""
            MATCH (e {{id: '{entity_id}'}})-[*1..2]-(related)
            MATCH (m:MemoryNode)-[:REMEMBERS]->(related)
            WHERE m.content IS NOT NULL AND NOT (m)-[:REMEMBERS]->(e)
            {type_filter.replace('AND', 'AND')}
            RETURN DISTINCT m.id as memory_id, m.content as content, m.memory_type as type,
                   m.created_at as created_at, m.session_id as session_id,
                   related.id as via_entity, 'connected' as recall_type
            ORDER BY m.created_at DESC
            LIMIT {limit // 2}
        """
        connected_memories = self._execute_query(connected_query).get("results", [])

        # Update access count for recalled memories
        for mem in direct_memories:
            if mem.get("memory_id"):
                self._execute_query(f"""
                    MATCH (m:MemoryNode {{id: '{mem["memory_id"]}'}})
                    SET m.access_count = coalesce(m.access_count, 0) + 1,
                        m.last_accessed = '{datetime.now(timezone.utc).isoformat()}'
                """)

        all_memories = direct_memories + connected_memories
        latency = (time.time() - start) * 1000

        return {
            "entity_id": entity_id,
            "direct_memories": len(direct_memories),
            "connected_memories": len(connected_memories),
            "memories": all_memories,
            "memory_type_filter": memory_type,
            "latency_ms": latency,
        }

    def semantic_recall(self, query: str, limit: int = 5) -> dict:
        """Recall memories semantically similar to a query.

        Uses LLM to match the query against stored memories when
        Neptune vector search is not available for MemoryNodes.
        """
        start = time.time()

        # Get recent memories
        recent_query = """
            MATCH (m:MemoryNode)
            WHERE m.content IS NOT NULL
            RETURN m.id as memory_id, m.content as content, m.memory_type as type,
                   m.created_at as created_at
            ORDER BY m.created_at DESC
            LIMIT 50
        """
        recent = self._execute_query(recent_query).get("results", [])

        if not recent:
            return {"query": query, "memories": [], "latency_ms": (time.time() - start) * 1000}

        # Use Claude to rank memories by relevance
        memory_list = "\n".join([
            f"[{i}] ({m.get('type', 'unknown')}) {m.get('content', '')[:150]}"
            for i, m in enumerate(recent)
        ])
        rank_prompt = f"""Given this investigation query, rank the following memories by relevance.
Return ONLY a JSON array of indices (integers) for the top {limit} most relevant memories.

Query: {query}

Memories:
{memory_list}

Return JSON array of indices only."""

        rank_text = self._invoke_claude(rank_prompt, max_tokens=256)
        try:
            import re
            json_match = re.search(r'\[[\s\S]*?\]', rank_text)
            ranked_indices = json.loads(json_match.group()) if json_match else []
        except (json.JSONDecodeError, AttributeError):
            ranked_indices = list(range(min(limit, len(recent))))

        # Return ranked memories
        ranked_memories = []
        for idx in ranked_indices[:limit]:
            if isinstance(idx, int) and 0 <= idx < len(recent):
                ranked_memories.append(recent[idx])

        latency = (time.time() - start) * 1000
        return {
            "query": query,
            "memories": ranked_memories,
            "total_searched": len(recent),
            "latency_ms": latency,
        }

    # ──────────────────────────────────────────────────────────────────────
    # Cross-Case Pattern Detection
    # ──────────────────────────────────────────────────────────────────────

    def detect_patterns(self, min_occurrences: int = 2) -> dict:
        """Detect cross-case patterns from stored memories.

        Analyzes memories across multiple investigations to identify
        recurring fraud patterns, techniques, and indicators.
        """
        start = time.time()

        # Get all investigation memories grouped by session
        session_query = """
            MATCH (s:InvestigationSession)-[:CONTAINS_MEMORY]->(m:MemoryNode)
            WHERE m.content IS NOT NULL
            RETURN s.id as session_id, collect(m.content) as memories,
                   count(m) as memory_count
            ORDER BY memory_count DESC
            LIMIT 20
        """
        sessions = self._execute_query(session_query).get("results", [])

        if len(sessions) < 2:
            return {
                "status": "insufficient_data",
                "message": f"Need at least 2 investigation sessions. Found {len(sessions)}.",
                "sessions_analyzed": len(sessions),
                "patterns": [],
            }

        # Use Claude to identify cross-case patterns
        session_summaries = json.dumps([
            {"session": s.get("session_id"), "memories": s.get("memories", [])[:5]}
            for s in sessions[:10]
        ], default=str)

        pattern_prompt = f"""Analyze these fraud investigation memories from multiple cases.
Identify RECURRING patterns that appear across multiple investigations.

Investigation Sessions:
{session_summaries}

For each pattern found, provide:
1. Pattern name
2. Description of the pattern
3. Which sessions it appears in
4. Indicators/signals that suggest this pattern
5. Recommended response

Return JSON:
{{
    "patterns": [
        {{
            "name": "...",
            "description": "...",
            "occurrences": 0,
            "sessions": ["..."],
            "indicators": ["..."],
            "severity": "LOW|MEDIUM|HIGH|CRITICAL",
            "recommended_response": "..."
        }}
    ],
    "cross_case_links": [
        {{"session_a": "...", "session_b": "...", "connection": "..."}}
    ]
}}"""

        pattern_text = self._invoke_claude(pattern_prompt)
        try:
            import re
            json_match = re.search(r'\{[\s\S]*\}', pattern_text)
            patterns = json.loads(json_match.group()) if json_match else {"patterns": []}
        except (json.JSONDecodeError, AttributeError):
            patterns = {"patterns": [], "cross_case_links": []}

        # Persist discovered patterns as PatternNodes in Neptune
        patterns_stored = 0
        for pattern in patterns.get("patterns", []):
            if pattern.get("occurrences", 0) >= min_occurrences:
                pattern_id = f"pattern_{str(uuid.uuid4())[:6]}"
                pattern_name = pattern.get("name", "").replace("'", "\\'")
                pattern_desc = pattern.get("description", "").replace("'", "\\'")[:300]

                store_query = f"""
                    MERGE (p:PatternNode {{name: '{pattern_name}'}})
                    ON CREATE SET p.id = '{pattern_id}',
                                  p.description = '{pattern_desc}',
                                  p.severity = '{pattern.get("severity", "MEDIUM")}',
                                  p.occurrences = {pattern.get("occurrences", 0)},
                                  p.discovered_at = '{datetime.now(timezone.utc).isoformat()}',
                                  p.indicators = '{json.dumps(pattern.get("indicators", []))}'
                    ON MATCH SET p.occurrences = {pattern.get("occurrences", 0)},
                                 p.last_seen = '{datetime.now(timezone.utc).isoformat()}'
                """
                self._execute_query(store_query)
                patterns_stored += 1

        latency = (time.time() - start) * 1000
        return {
            "status": "complete",
            "sessions_analyzed": len(sessions),
            "patterns_discovered": len(patterns.get("patterns", [])),
            "patterns_stored": patterns_stored,
            "patterns": patterns.get("patterns", []),
            "cross_case_links": patterns.get("cross_case_links", []),
            "min_occurrences_threshold": min_occurrences,
            "latency_ms": latency,
        }

    def get_entity_memory_summary(self, entity_id: str) -> dict:
        """Get a summary of all memory context for an entity.

        Useful for agents starting a new investigation — provides
        historical context from prior investigations involving this entity.
        """
        start = time.time()

        # Count memories and get summary
        summary_query = f"""
            MATCH (m:MemoryNode)-[:REMEMBERS]->(e {{id: '{entity_id}'}})
            WITH count(m) as total_memories,
                 collect(m.memory_type) as types,
                 collect(m.content)[..5] as recent_content,
                 collect(m.session_id) as sessions
            RETURN total_memories, types, recent_content,
                   size(collect(DISTINCT sessions)) as unique_sessions
        """
        summary = self._execute_query(summary_query).get("results", [])

        # Check for known patterns involving this entity
        pattern_query = f"""
            MATCH (e {{id: '{entity_id}'}})-[*1..3]-(other)
            MATCH (m:MemoryNode)-[:REMEMBERS]->(other)
            MATCH (s:InvestigationSession)-[:CONTAINS_MEMORY]->(m)
            RETURN DISTINCT s.id as session_id, count(m) as related_memories
            ORDER BY related_memories DESC
            LIMIT 5
        """
        related_sessions = self._execute_query(pattern_query).get("results", [])

        latency = (time.time() - start) * 1000

        if summary:
            row = summary[0]
            return {
                "entity_id": entity_id,
                "total_memories": row.get("total_memories", 0),
                "memory_types": row.get("types", []),
                "recent_memories": row.get("recent_content", []),
                "unique_investigation_sessions": row.get("unique_sessions", 0),
                "related_investigation_sessions": related_sessions,
                "has_prior_history": row.get("total_memories", 0) > 0,
                "latency_ms": latency,
            }

        return {
            "entity_id": entity_id,
            "total_memories": 0,
            "has_prior_history": False,
            "message": "No prior investigation memory for this entity",
            "latency_ms": latency,
        }


# Singleton
memory_service = MemoryService()
