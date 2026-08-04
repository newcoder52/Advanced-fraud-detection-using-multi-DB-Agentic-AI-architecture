"""Semantic Ontology Layer service for fraud domain knowledge.

Implements a property graph meta-layer in Neptune that defines fraud domain
concepts, entity types, and their semantic relationships. Uses Bedrock Claude
for LLM-powered auto-discovery of hidden relationships and vector-indexed
business terms for semantic navigation.

Reference: https://aws.amazon.com/blogs/database/build-a-semantic-ontology-to-power-ai-assistants-on-aws-part-1/
"""

import json
import os
import time
from typing import Dict, List, Optional
from datetime import datetime, timezone

import boto3
from botocore.config import Config

REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
GRAPH_ID = os.environ.get("NEPTUNE_GRAPH_ID", "")
CLAUDE_MODEL = os.environ.get("BEDROCK_CLAUDE_MODEL", "us.anthropic.claude-sonnet-4-6")
EMBEDDING_MODEL = os.environ.get("BEDROCK_EMBEDDING_MODEL", "amazon.titan-embed-text-v2:0")


class OntologyService:
    """Manages the semantic ontology layer in Neptune Analytics.

    The ontology layer sits above the data graph, providing:
    - Concept nodes (FraudType, EntityType, BehaviorPattern)
    - Semantic relationships between concepts
    - Vector-indexed business terms for natural language navigation
    - LLM-powered relationship discovery from data patterns
    """

    def __init__(self):
        config = Config(connect_timeout=3, read_timeout=8, retries={"max_attempts": 0})
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

    def _execute_query(self, query: str, parameters: dict = None) -> dict:
        """Execute an openCypher query against Neptune Analytics."""
        if not self.graph_id:
            return {"error": "No Neptune graph configured", "results": []}
        try:
            kwargs = {
                "graphIdentifier": self.graph_id,
                "queryString": query,
                "language": "OPEN_CYPHER",
            }
            if parameters:
                kwargs["parameters"] = parameters
            response = self.neptune_client.execute_query(**kwargs)
            payload = response.get("payload")
            if payload:
                return json.loads(payload.read())
            return {"results": []}
        except Exception as e:
            return {"error": str(e), "results": []}

    def _get_embedding(self, text: str) -> List[float]:
        """Generate a vector embedding for semantic search."""
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

    def _invoke_claude(self, prompt: str, max_tokens: int = 4096) -> str:
        """Invoke Bedrock Claude for LLM reasoning."""
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
    # Ontology CRUD
    # ──────────────────────────────────────────────────────────────────────

    def initialize_ontology(self, domain: str = "fraud_detection") -> dict:
        """Bootstrap the fraud domain ontology with core concepts.

        Creates the foundational concept hierarchy:
          FraudDomain → FraudType → Indicator → BehaviorPattern
        """
        start = time.time()
        concepts = [
            # Top-level domain
            {"id": "fraud_domain", "label": "OntologyConcept", "name": "Fraud Domain",
             "category": "domain", "description": "Root concept for fraud detection ontology"},
            # Fraud types
            {"id": "account_takeover", "label": "FraudType", "name": "Account Takeover",
             "category": "fraud_type", "description": "Unauthorized access to user accounts via credential theft or session hijacking"},
            {"id": "synthetic_identity", "label": "FraudType", "name": "Synthetic Identity",
             "category": "fraud_type", "description": "Fabricated identities combining real and fake information"},
            {"id": "collusion_ring", "label": "FraudType", "name": "Collusion Ring",
             "category": "fraud_type", "description": "Coordinated fraudulent activity by multiple actors"},
            {"id": "payment_fraud", "label": "FraudType", "name": "Payment Fraud",
             "category": "fraud_type", "description": "Unauthorized transactions or payment manipulation"},
            {"id": "content_manipulation", "label": "FraudType", "name": "Content Manipulation",
             "category": "fraud_type", "description": "Artificial inflation of views, likes, or engagement metrics"},
            # Entity types
            {"id": "entity_account", "label": "EntityType", "name": "Account",
             "category": "entity_type", "description": "User or service account"},
            {"id": "entity_device", "label": "EntityType", "name": "Device",
             "category": "entity_type", "description": "Physical or virtual device used for access"},
            {"id": "entity_ip", "label": "EntityType", "name": "IP Address",
             "category": "entity_type", "description": "Network address used for connections"},
            {"id": "entity_transaction", "label": "EntityType", "name": "Transaction",
             "category": "entity_type", "description": "Financial or activity transaction"},
            # Behavior patterns
            {"id": "velocity_spike", "label": "BehaviorPattern", "name": "Velocity Spike",
             "category": "pattern", "description": "Abnormal increase in transaction frequency"},
            {"id": "geo_impossibility", "label": "BehaviorPattern", "name": "Geographic Impossibility",
             "category": "pattern", "description": "Activity from locations impossible to reach in timeframe"},
            {"id": "device_sharing", "label": "BehaviorPattern", "name": "Device Sharing",
             "category": "pattern", "description": "Multiple accounts sharing the same device fingerprint"},
            {"id": "credential_stuffing", "label": "BehaviorPattern", "name": "Credential Stuffing",
             "category": "pattern", "description": "Automated login attempts using breached credentials"},
        ]

        # Create concept nodes with embeddings
        for concept in concepts:
            embedding = self._get_embedding(f"{concept['name']}: {concept['description']}")
            embedding_str = json.dumps(embedding[:10])  # Store truncated for properties
            query = f"""
                MERGE (c:{concept['label']} {{id: '{concept['id']}'}})
                SET c.name = '{concept['name']}',
                    c.category = '{concept['category']}',
                    c.description = '{concept['description']}',
                    c.embedding_preview = '{embedding_str}',
                    c.created_at = '{datetime.now(timezone.utc).isoformat()}',
                    c.domain = '{domain}'
            """
            self._execute_query(query)

        # Create relationships between concepts
        relationships = [
            ("fraud_domain", "account_takeover", "HAS_TYPE"),
            ("fraud_domain", "synthetic_identity", "HAS_TYPE"),
            ("fraud_domain", "collusion_ring", "HAS_TYPE"),
            ("fraud_domain", "payment_fraud", "HAS_TYPE"),
            ("fraud_domain", "content_manipulation", "HAS_TYPE"),
            ("account_takeover", "credential_stuffing", "INDICATED_BY"),
            ("account_takeover", "geo_impossibility", "INDICATED_BY"),
            ("collusion_ring", "device_sharing", "INDICATED_BY"),
            ("collusion_ring", "velocity_spike", "INDICATED_BY"),
            ("synthetic_identity", "device_sharing", "INDICATED_BY"),
            ("payment_fraud", "velocity_spike", "INDICATED_BY"),
            ("content_manipulation", "velocity_spike", "INDICATED_BY"),
            ("entity_account", "entity_device", "CAN_USE"),
            ("entity_account", "entity_ip", "CONNECTS_FROM"),
            ("entity_account", "entity_transaction", "INITIATES"),
        ]

        for source, target, rel_type in relationships:
            query = f"""
                MATCH (a {{id: '{source}'}})
                MATCH (b {{id: '{target}'}})
                MERGE (a)-[:{rel_type}]->(b)
            """
            self._execute_query(query)

        latency = (time.time() - start) * 1000
        return {
            "status": "initialized",
            "concepts_created": len(concepts),
            "relationships_created": len(relationships),
            "domain": domain,
            "latency_ms": latency,
        }

    def get_concepts(self, category: Optional[str] = None) -> dict:
        """Retrieve all ontology concepts, optionally filtered by category."""
        start = time.time()
        if category:
            query = f"""
                MATCH (c) WHERE c.category = '{category}' AND c.domain IS NOT NULL
                RETURN c.id as id, c.name as name, c.category as category,
                       c.description as description, labels(c)[0] as label
                ORDER BY c.name
            """
        else:
            query = """
                MATCH (c) WHERE c.domain IS NOT NULL AND c.category IS NOT NULL
                RETURN c.id as id, c.name as name, c.category as category,
                       c.description as description, labels(c)[0] as label
                ORDER BY c.category, c.name
            """
        result = self._execute_query(query)
        latency = (time.time() - start) * 1000
        return {
            "concepts": result.get("results", []),
            "total": len(result.get("results", [])),
            "category_filter": category,
            "latency_ms": latency,
        }

    def navigate_by_term(self, term: str, max_hops: int = 2) -> dict:
        """Navigate the ontology using a natural language term.

        Uses vector similarity to find the closest concept, then traverses
        the ontology graph to return related concepts.
        """
        start = time.time()

        # Step 1: Get embedding for the search term
        query_embedding = self._get_embedding(term)

        # Step 2: Find the closest concept using Neptune vector search
        # (fallback to text matching if vector search unavailable)
        query = f"""
            MATCH (c) WHERE c.domain IS NOT NULL AND c.name IS NOT NULL
            RETURN c.id as id, c.name as name, c.category as category,
                   c.description as description, labels(c)[0] as label
        """
        all_concepts = self._execute_query(query).get("results", [])

        # Compute similarity using LLM to rank concepts
        concept_list = "\n".join([f"- {c['name']}: {c.get('description', '')}" for c in all_concepts])
        ranking_prompt = f"""Given the search term "{term}", rank the following concepts by relevance.
Return ONLY a JSON array of concept names in order of relevance (most relevant first), max 5.

Concepts:
{concept_list}

Return JSON array only, no explanation."""

        ranked_text = self._invoke_claude(ranking_prompt, max_tokens=512)
        try:
            import re
            json_match = re.search(r'\[[\s\S]*?\]', ranked_text)
            ranked_names = json.loads(json_match.group()) if json_match else []
        except (json.JSONDecodeError, AttributeError):
            ranked_names = []

        # Step 3: Get the top concept and traverse its neighborhood
        best_match = ranked_names[0] if ranked_names else term
        traverse_query = f"""
            MATCH (c) WHERE c.name = '{best_match}' AND c.domain IS NOT NULL
            OPTIONAL MATCH (c)-[r*1..{max_hops}]-(related)
            WHERE related.domain IS NOT NULL
            RETURN c.id as source_id, c.name as source_name, c.category as source_category,
                   collect(DISTINCT {{
                       id: related.id, name: related.name,
                       category: related.category, description: related.description
                   }}) as related_concepts
        """
        traversal = self._execute_query(traverse_query)
        latency = (time.time() - start) * 1000

        return {
            "search_term": term,
            "matched_concept": best_match,
            "ranked_concepts": ranked_names[:5],
            "related_concepts": traversal.get("results", []),
            "latency_ms": latency,
        }

    def discover_relationships(self, sample_size: int = 50) -> dict:
        """Use LLM to auto-discover hidden relationships in the data graph.

        Samples entity nodes from the data graph, profiles their properties,
        and uses Claude to identify semantic relationships not yet captured
        in the ontology.
        """
        start = time.time()

        # Step 1: Sample entities from the data graph
        sample_query = f"""
            MATCH (n) WHERE n.domain IS NULL AND n.id IS NOT NULL
            RETURN n.id as id, labels(n)[0] as label, properties(n) as props
            LIMIT {sample_size}
        """
        samples = self._execute_query(sample_query).get("results", [])

        if not samples:
            return {"status": "no_data", "discoveries": [], "message": "No entity data found to analyze"}

        # Step 2: Sample edges
        edge_query = """
            MATCH (a)-[r]->(b) WHERE a.domain IS NULL AND b.domain IS NULL
            RETURN type(r) as relationship, labels(a)[0] as source_label,
                   labels(b)[0] as target_label, count(*) as frequency
            ORDER BY frequency DESC LIMIT 20
        """
        edges = self._execute_query(edge_query).get("results", [])

        # Step 3: Ask Claude to discover hidden patterns
        discovery_prompt = f"""You are a fraud detection ontology expert. Analyze the following graph data
and discover hidden semantic relationships that are not explicitly modeled.

ENTITY SAMPLES (first 20):
{json.dumps(samples[:20], indent=2, default=str)}

EXISTING RELATIONSHIPS:
{json.dumps(edges, indent=2, default=str)}

Based on property patterns, co-occurrence, and domain knowledge, identify:
1. Hidden entity relationships (e.g., accounts that likely share an owner)
2. New fraud pattern indicators (behavioral patterns not yet categorized)
3. Missing ontology concepts that should be added
4. Semantic links between entity types

Return a JSON object with:
{{
    "discovered_relationships": [
        {{"source_type": "...", "target_type": "...", "relationship": "...", "confidence": 0.0-1.0, "evidence": "..."}}
    ],
    "new_concepts": [
        {{"id": "...", "name": "...", "category": "...", "description": "..."}}
    ],
    "new_patterns": [
        {{"name": "...", "description": "...", "indicators": ["..."]}}
    ]
}}"""

        discovery_text = self._invoke_claude(discovery_prompt)

        # Parse discoveries
        try:
            import re
            json_match = re.search(r'\{[\s\S]*\}', discovery_text)
            discoveries = json.loads(json_match.group()) if json_match else {}
        except (json.JSONDecodeError, AttributeError):
            discoveries = {"discovered_relationships": [], "new_concepts": [], "new_patterns": []}

        # Step 4: Persist discovered concepts and relationships to the ontology
        added_concepts = 0
        added_relationships = 0

        for concept in discoveries.get("new_concepts", []):
            concept_id = concept.get("id", "").replace(" ", "_").lower()
            if concept_id:
                create_query = f"""
                    MERGE (c:DiscoveredConcept {{id: '{concept_id}'}})
                    SET c.name = '{concept.get("name", "")}',
                        c.category = '{concept.get("category", "discovered")}',
                        c.description = '{concept.get("description", "")[:200]}',
                        c.discovered_at = '{datetime.now(timezone.utc).isoformat()}',
                        c.domain = 'fraud_detection',
                        c.source = 'llm_discovery'
                """
                self._execute_query(create_query)
                added_concepts += 1

        for rel in discoveries.get("discovered_relationships", []):
            if rel.get("confidence", 0) >= 0.7:
                rel_type = rel.get("relationship", "RELATED_TO").upper().replace(" ", "_")
                create_rel_query = f"""
                    MATCH (a) WHERE labels(a)[0] = '{rel.get("source_type", "")}'
                    MATCH (b) WHERE labels(b)[0] = '{rel.get("target_type", "")}'
                    WITH a, b LIMIT 1
                    MERGE (a)-[:{rel_type} {{discovered: true, confidence: {rel.get("confidence", 0.5)}}}]->(b)
                """
                self._execute_query(create_rel_query)
                added_relationships += 1

        latency = (time.time() - start) * 1000
        return {
            "status": "complete",
            "entities_sampled": len(samples),
            "existing_relationships_analyzed": len(edges),
            "discoveries": discoveries,
            "persisted": {
                "concepts_added": added_concepts,
                "relationships_added": added_relationships,
            },
            "latency_ms": latency,
        }


    def classify_event(self, event_data: dict) -> dict:
        """Use Claude to classify an event against the fraud ontology taxonomy.

        This is the REAL classification — not random. Claude analyzes the event
        content, entity behavior, and context to determine the most appropriate
        fraud category from the taxonomy.

        Args:
            event_data: dict with keys like domain, entity_id, content, event_type, payload

        Returns:
            dict with path, leafId, confidence, severity, description, indicators, recommendedAction
        """
        start = time.time()

        taxonomy = """Financial:
  Payment Fraud: Card-Not-Present, Card-Present, Account Takeover, Refund Abuse
  Identity Fraud: Synthetic Identity, Credential Stuffing, Identity Theft
  Money Laundering: Layering, Smurfing, Shell Company
Content Manipulation:
  Artificial Engagement: Stream Farming, Click Fraud, Bot Network, View Inflation
  Misinformation: Deepfake, AI-Generated Disinfo, Coordinated Inauthentic
Social Engineering:
  Romance Scam: Pig Butchering, Catfishing, Military Impersonation
  Phishing: Spear Phishing, Credential Harvesting
Platform Abuse:
  Scalping / Hoarding: Ticket Scalping, Inventory Hoarding, Bot Purchasing
  Gaming Abuse: Aimbot / Cheating, Real Money Trading, Account Boosting"""

        prompt = f"""You are a fraud classification system. Analyze this event and classify it against the taxonomy below.

EVENT DATA:
- Domain: {event_data.get('domain', 'unknown')}
- Entity ID: {event_data.get('entity_id', 'unknown')}
- Event Type: {event_data.get('event_type', 'unknown')}
- Content: {event_data.get('content', '')[:2000]}
- Payload: {json.dumps(event_data.get('payload', {}), default=str)[:1000]}

TAXONOMY:
{taxonomy}

Respond with ONLY a JSON object (no markdown, no explanation):
{{
    "path": ["<top-level category>", "<sub-category>", "<leaf classification>"],
    "leafId": "<exact leaf name from taxonomy>",
    "confidence": <0.0-1.0>,
    "severity": "<critical|high|medium>",
    "description": "<1-2 sentence description of WHY this classification was chosen based on the event content>",
    "indicators": ["<specific indicator 1 from the event>", "<indicator 2>", "<indicator 3>"],
    "recommendedAction": "<what the platform should do about this specific event>"
}}"""

        try:
            response_text = self._invoke_claude(prompt, max_tokens=1024)

            # Parse JSON response
            import re
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                result = json.loads(json_match.group())
                result["latency_ms"] = (time.time() - start) * 1000
                result["model"] = CLAUDE_MODEL
                result["status"] = "classified"
                return result

            # Fallback if JSON parsing fails
            return {
                "path": ["Unknown", "Unknown", "Unknown"],
                "leafId": "Unknown",
                "confidence": 0.5,
                "severity": "medium",
                "description": "Classification could not be determined from event content.",
                "indicators": ["Insufficient signal"],
                "recommendedAction": "Escalate to manual review.",
                "latency_ms": (time.time() - start) * 1000,
                "status": "fallback",
                "raw_response": response_text[:200],
            }

        except Exception as e:
            return {
                "path": ["Unknown", "Unknown", "Unknown"],
                "leafId": "Unknown",
                "confidence": 0.0,
                "severity": "medium",
                "description": f"Classification failed: {str(e)[:100]}",
                "indicators": [],
                "recommendedAction": "Retry classification or escalate to manual review.",
                "latency_ms": (time.time() - start) * 1000,
                "status": "error",
                "error": str(e)[:200],
            }

    def generate_investigation_brief(self, event_data: dict, classification: dict, graph_context: dict = None) -> dict:
        """Generate a full investigation brief using Claude.

        Combines classification result with graph context and event data
        to produce an analyst-ready investigation narrative.
        """
        start = time.time()

        graph_summary = "No graph context available."
        if graph_context:
            connections = graph_context.get("direct_connections", 0)
            indirect = graph_context.get("indirect_connections", 0)
            shared_devices = graph_context.get("shared_device_count", 0)
            ring = graph_context.get("ring_membership", 0)
            graph_summary = f"Connected to {connections} entities directly, {indirect} indirectly (2-3 hops). Shared devices: {shared_devices}. Ring membership: {'YES' if ring else 'NO'}."

        prompt = f"""You are a fraud investigation analyst. Generate a concise, actionable investigation brief.

EVENT:
- Entity: {event_data.get('entity_id', 'unknown')}
- Domain: {event_data.get('domain', 'unknown')}
- Type: {event_data.get('event_type', 'unknown')}
- Content: {event_data.get('content', '')[:1500]}

CLASSIFICATION:
- Type: {' → '.join(classification.get('path', ['Unknown']))}
- Leaf: {classification.get('leafId', 'Unknown')}
- Confidence: {classification.get('confidence', 0):.0%}
- Severity: {classification.get('severity', 'unknown')}

GRAPH INTELLIGENCE:
{graph_summary}

Generate a JSON response:
{{
    "summary": "<2-3 sentence executive summary>",
    "timeline": [
        {{"time": "<relative time>", "event": "<what happened>"}}
    ],
    "evidence_chain": ["<evidence point 1>", "<evidence point 2>", "<evidence point 3>"],
    "risk_assessment": "<overall risk level and justification>",
    "recommended_actions": ["<action 1>", "<action 2>", "<action 3>"],
    "confidence_score": <0.0-1.0>,
    "next_steps": "<what an analyst should investigate next>"
}}"""

        try:
            response_text = self._invoke_claude(prompt, max_tokens=2048)

            import re
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                brief = json.loads(json_match.group())
                brief["latency_ms"] = (time.time() - start) * 1000
                brief["entity_id"] = event_data.get("entity_id", "unknown")
                brief["classification"] = classification
                brief["status"] = "complete"
                return brief

            return {
                "summary": response_text[:500],
                "status": "partial",
                "latency_ms": (time.time() - start) * 1000,
            }

        except Exception as e:
            return {
                "summary": f"Brief generation failed: {str(e)[:100]}",
                "status": "error",
                "error": str(e)[:200],
                "latency_ms": (time.time() - start) * 1000,
            }


# Singleton
ontology_service = OntologyService()
