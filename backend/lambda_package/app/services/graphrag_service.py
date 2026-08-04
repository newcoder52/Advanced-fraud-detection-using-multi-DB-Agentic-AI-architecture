"""GraphRAG service via Amazon Bedrock Knowledge Bases + Neptune Analytics.

Implements multi-hop knowledge retrieval that combines graph traversal with
RAG over unstructured fraud investigation documents. Uses Bedrock Knowledge
Bases (GA March 2025) with Neptune Analytics as the graph store.

Reference: https://aws.amazon.com/blogs/machine-learning/combat-financial-fraud-with-graphrag-on-amazon-bedrock-knowledge-bases/
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
KNOWLEDGE_BASE_ID = os.environ.get("BEDROCK_KNOWLEDGE_BASE_ID", "")
S3_BUCKET = os.environ.get("GRAPHRAG_S3_BUCKET", "multidb-poc-fraud-docs")
CLAUDE_MODEL = os.environ.get("BEDROCK_CLAUDE_MODEL", "us.anthropic.claude-sonnet-4-6")


class GraphRAGService:
    """Multi-hop knowledge retrieval combining Neptune graph + Bedrock KB.

    Architecture:
    1. User query → Bedrock KB retrieves relevant document chunks (vector search)
    2. Extracted entities → Neptune graph traversal for relationship context
    3. Combined context → Claude generates comprehensive answer with citations
    """

    def __init__(self):
        config = Config(connect_timeout=5, read_timeout=30, retries={"max_attempts": 2})
        self.neptune_client = boto3.client("neptune-graph", region_name=REGION, config=config)
        self.bedrock_agent_client = boto3.client("bedrock-agent-runtime", region_name=REGION, config=config)
        self.bedrock_client = boto3.client("bedrock-runtime", region_name=REGION, config=config)
        self.s3_client = boto3.client("s3", region_name=REGION)
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

    def _invoke_claude(self, prompt: str, max_tokens: int = 4096) -> str:
        """Invoke Bedrock Claude for synthesis."""
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

    def query(self, question: str, max_hops: int = 3, top_k: int = 5) -> dict:
        """Execute a GraphRAG query combining KB retrieval + graph traversal.

        Steps:
        1. Retrieve relevant chunks from Bedrock Knowledge Base
        2. Extract entities mentioned in retrieved chunks
        3. Traverse Neptune graph from those entities
        4. Synthesize answer using graph context + retrieved documents
        """
        start = time.time()

        # Step 1: Retrieve from Bedrock Knowledge Base
        kb_results = []
        if KNOWLEDGE_BASE_ID:
            try:
                response = self.bedrock_agent_client.retrieve(
                    knowledgeBaseId=KNOWLEDGE_BASE_ID,
                    retrievalQuery={"text": question},
                    retrievalConfiguration={
                        "vectorSearchConfiguration": {
                            "numberOfResults": top_k,
                        }
                    },
                )
                kb_results = [
                    {
                        "content": r["content"]["text"],
                        "score": r.get("score", 0.0),
                        "source": r.get("location", {}).get("s3Location", {}).get("uri", "unknown"),
                    }
                    for r in response.get("retrievalResults", [])
                ]
            except Exception as e:
                kb_results = [{"error": str(e)}]

        # Step 2: Extract entities from the question and KB results
        combined_text = question + "\n" + "\n".join([r.get("content", "") for r in kb_results if "content" in r])
        entity_prompt = f"""Extract entity IDs, account names, or identifiers from this fraud investigation context.
Return ONLY a JSON array of strings (entity identifiers). No explanation.

Context:
{combined_text[:3000]}"""

        entity_text = self._invoke_claude(entity_prompt, max_tokens=512)
        try:
            import re
            json_match = re.search(r'\[[\s\S]*?\]', entity_text)
            entities = json.loads(json_match.group()) if json_match else []
        except (json.JSONDecodeError, AttributeError):
            entities = []

        # Step 3: Multi-hop graph traversal from extracted entities
        graph_context = []
        for entity_id in entities[:5]:  # Limit to 5 entities
            # Traverse up to max_hops from each entity
            traverse_query = f"""
                MATCH (start {{id: '{entity_id}'}})-[r*1..{max_hops}]-(connected)
                RETURN start.id as source,
                       collect(DISTINCT {{
                           id: connected.id,
                           type: labels(connected)[0],
                           risk_score: connected.risk_score,
                           status: connected.status
                       }})[..10] as connections,
                       count(DISTINCT connected) as total_connections
            """
            result = self._execute_query(traverse_query)
            if result.get("results"):
                graph_context.append({
                    "entity": entity_id,
                    "graph_data": result["results"],
                })

        # Step 4: Synthesize answer with combined context
        synthesis_prompt = f"""You are a fraud investigation analyst with access to both document archives and a live fraud graph database.

QUESTION: {question}

DOCUMENT EVIDENCE (from knowledge base):
{json.dumps(kb_results[:3], indent=2, default=str)}

GRAPH INTELLIGENCE (entity relationships from Neptune):
{json.dumps(graph_context, indent=2, default=str)}

Provide a comprehensive answer that:
1. Cites specific documents and their findings
2. Shows graph relationships that support or contradict the findings
3. Identifies multi-hop connections (e.g., "Entity A connects to Entity B through shared device C")
4. Assesses the confidence level of the conclusion
5. Recommends next investigation steps

Format as JSON:
{{
    "answer": "...",
    "citations": [{{"source": "...", "relevant_text": "..."}}],
    "graph_evidence": [{{"path": "A->B->C", "relationship": "...", "significance": "..."}}],
    "confidence": 0.0-1.0,
    "next_steps": ["..."]
}}"""

        synthesis_text = self._invoke_claude(synthesis_prompt)
        try:
            import re
            json_match = re.search(r'\{[\s\S]*\}', synthesis_text)
            synthesis = json.loads(json_match.group()) if json_match else {"answer": synthesis_text}
        except (json.JSONDecodeError, AttributeError):
            synthesis = {"answer": synthesis_text}

        latency = (time.time() - start) * 1000
        return {
            "question": question,
            "synthesis": synthesis,
            "kb_chunks_retrieved": len(kb_results),
            "entities_extracted": entities,
            "graph_hops_traversed": max_hops,
            "graph_entities_explored": len(graph_context),
            "latency_ms": latency,
        }

    def ingest_document(self, content: str, title: str, doc_type: str = "investigation_report",
                        metadata: Optional[Dict] = None) -> dict:
        """Ingest a fraud investigation document into the knowledge base.

        Uploads to S3 (which triggers Bedrock KB sync) and optionally
        extracts entities to link in the Neptune graph.
        """
        start = time.time()
        doc_id = str(uuid.uuid4())[:8]
        s3_key = f"documents/{doc_type}/{doc_id}_{title.replace(' ', '_')}.txt"

        # Prepare document with metadata header
        doc_content = f"""---
title: {title}
type: {doc_type}
id: {doc_id}
ingested_at: {datetime.now(timezone.utc).isoformat()}
metadata: {json.dumps(metadata or {})}
---

{content}"""

        # Upload to S3
        try:
            self.s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=s3_key,
                Body=doc_content.encode("utf-8"),
                ContentType="text/plain",
                Metadata={
                    "doc_type": doc_type,
                    "doc_id": doc_id,
                    "title": title,
                },
            )
        except Exception as e:
            return {"error": f"S3 upload failed: {str(e)}", "doc_id": doc_id}

        # Extract entities and link in graph
        entity_prompt = f"""Extract all entity identifiers (account IDs, device fingerprints, IP addresses,
transaction IDs, names) from this fraud document. Return as JSON array of objects:
[{{"id": "...", "type": "Account|Device|IP|Transaction|Person", "context": "brief context"}}]

Document:
{content[:4000]}"""

        extracted_entities = []
        try:
            entity_text = self._invoke_claude(entity_prompt, max_tokens=1024)
            import re
            json_match = re.search(r'\[[\s\S]*?\]', entity_text)
            if json_match:
                extracted_entities = json.loads(json_match.group())
        except (json.JSONDecodeError, AttributeError):
            pass

        # Create document node and link to entities in Neptune
        doc_node_query = f"""
            MERGE (d:Document {{id: '{doc_id}'}})
            SET d.title = '{title}',
                d.type = '{doc_type}',
                d.s3_path = 's3://{S3_BUCKET}/{s3_key}',
                d.ingested_at = '{datetime.now(timezone.utc).isoformat()}'
        """
        self._execute_query(doc_node_query)

        linked_entities = 0
        for entity in extracted_entities[:20]:  # Limit links
            entity_id = entity.get("id", "")
            if entity_id:
                link_query = f"""
                    MATCH (d:Document {{id: '{doc_id}'}})
                    MATCH (e {{id: '{entity_id}'}})
                    MERGE (d)-[:MENTIONS {{context: '{entity.get("context", "")[:100]}'}}]->(e)
                """
                result = self._execute_query(link_query)
                if "error" not in result:
                    linked_entities += 1

        latency = (time.time() - start) * 1000
        return {
            "status": "ingested",
            "doc_id": doc_id,
            "s3_path": f"s3://{S3_BUCKET}/{s3_key}",
            "entities_extracted": len(extracted_entities),
            "entities_linked_in_graph": linked_entities,
            "doc_type": doc_type,
            "note": "Bedrock KB will sync on next scheduled ingestion cycle.",
            "latency_ms": latency,
        }

    def investigate_entity(self, entity_id: str) -> dict:
        """Run a comprehensive GraphRAG investigation on an entity.

        Combines:
        1. All documents mentioning this entity (KB retrieval)
        2. Graph neighborhood analysis (Neptune traversal)
        3. Historical pattern matching (similar cases)
        """
        start = time.time()

        # Get graph context
        graph_query = f"""
            MATCH (n {{id: '{entity_id}'}})-[r*1..3]-(connected)
            WITH n, connected, r
            RETURN n.id as entity_id, labels(n)[0] as entity_type,
                   properties(n) as entity_props,
                   collect(DISTINCT {{
                       id: connected.id,
                       type: labels(connected)[0],
                       status: connected.status,
                       risk_score: connected.risk_score
                   }})[..20] as network
        """
        graph_data = self._execute_query(graph_query).get("results", [])

        # Get documents mentioning this entity
        doc_query = f"""
            MATCH (d:Document)-[:MENTIONS]->(e {{id: '{entity_id}'}})
            RETURN d.id as doc_id, d.title as title, d.type as doc_type,
                   d.ingested_at as ingested_at
            ORDER BY d.ingested_at DESC
            LIMIT 10
        """
        documents = self._execute_query(doc_query).get("results", [])

        # Query KB for related information
        kb_context = []
        if KNOWLEDGE_BASE_ID:
            try:
                response = self.bedrock_agent_client.retrieve(
                    knowledgeBaseId=KNOWLEDGE_BASE_ID,
                    retrievalQuery={"text": f"fraud investigation entity {entity_id}"},
                    retrievalConfiguration={
                        "vectorSearchConfiguration": {"numberOfResults": 3}
                    },
                )
                kb_context = [
                    {"content": r["content"]["text"], "score": r.get("score", 0.0)}
                    for r in response.get("retrievalResults", [])
                ]
            except Exception:
                pass

        # Synthesize investigation report
        investigation_prompt = f"""Generate a fraud investigation summary for entity {entity_id}.

GRAPH INTELLIGENCE:
{json.dumps(graph_data, indent=2, default=str)}

RELATED DOCUMENTS:
{json.dumps(documents, indent=2, default=str)}

KNOWLEDGE BASE CONTEXT:
{json.dumps(kb_context, indent=2, default=str)}

Provide a structured investigation report as JSON:
{{
    "entity_summary": "...",
    "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
    "key_findings": ["..."],
    "connected_cases": ["..."],
    "timeline": [{{"date": "...", "event": "..."}}],
    "recommendation": "..."
}}"""

        report_text = self._invoke_claude(investigation_prompt)
        try:
            import re
            json_match = re.search(r'\{[\s\S]*\}', report_text)
            report = json.loads(json_match.group()) if json_match else {"entity_summary": report_text}
        except (json.JSONDecodeError, AttributeError):
            report = {"entity_summary": report_text}

        latency = (time.time() - start) * 1000
        return {
            "entity_id": entity_id,
            "investigation_report": report,
            "graph_connections": len(graph_data[0].get("network", [])) if graph_data else 0,
            "related_documents": len(documents),
            "kb_chunks_found": len(kb_context),
            "latency_ms": latency,
        }


# Singleton
graphrag_service = GraphRAGService()
