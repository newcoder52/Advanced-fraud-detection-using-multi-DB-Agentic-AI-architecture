"""Neptune MCP Service for Agentic Fraud Investigation.

Provides a natural language interface for AI agents to query and investigate
the fraud graph. Translates natural language queries to openCypher, executes
them, and generates explainable investigation narratives.

Implements the Model Context Protocol (MCP) pattern for tool-use by AI agents,
enabling autonomous multi-step fraud investigation workflows.

Reference: https://aws.amazon.com/about-aws/whats-new/2025/05/amazon-neptune-mcp-server/
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
CLAUDE_MODEL = os.environ.get("BEDROCK_CLAUDE_MODEL", "us.anthropic.claude-sonnet-4-6")


class MCPAgentService:
    """Natural language interface for AI agent fraud investigation.

    Capabilities:
    - Translate natural language to openCypher queries
    - Execute multi-step investigation workflows autonomously
    - Generate explainable risk assessments
    - Maintain investigation context across queries
    """

    def __init__(self):
        config = Config(connect_timeout=5, read_timeout=30, retries={"max_attempts": 2})
        self.neptune_client = boto3.client("neptune-graph", region_name=REGION, config=config)
        self.bedrock_client = boto3.client("bedrock-runtime", region_name=REGION, config=config)
        self._graph_id = GRAPH_ID
        # In-memory investigation sessions (production would use DynamoDB)
        self._sessions: Dict[str, dict] = {}

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

    def _invoke_claude(self, prompt: str, max_tokens: int = 4096, system: str = "") -> str:
        """Invoke Bedrock Claude with optional system prompt."""
        messages = [{"role": "user", "content": prompt}]
        body_dict = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "messages": messages,
            "temperature": 0.1,
        }
        if system:
            body_dict["system"] = system

        body = json.dumps(body_dict)
        response = self.bedrock_client.invoke_model(
            modelId=CLAUDE_MODEL,
            body=body,
            contentType="application/json",
            accept="application/json",
        )
        result = json.loads(response["body"].read())
        return result["content"][0]["text"]

    # ──────────────────────────────────────────────────────────────────────
    # Natural Language → Graph Query
    # ──────────────────────────────────────────────────────────────────────

    def natural_language_query(self, question: str) -> dict:
        """Convert a natural language question to openCypher, execute, and explain.

        Example questions:
        - "Show me all accounts connected to device D-12345 within 3 hops"
        - "Which entities have risk scores above 0.8?"
        - "Find the shortest path between account A-001 and account A-099"
        """
        start = time.time()

        # Step 1: Translate NL to openCypher
        schema_context = """
Graph Schema:
- Node labels: Account, Device, IP, Transaction, Document
- Node properties: id, risk_score (float), status (ACTIVE/FLAGGED/BLOCKED), domain, created_at
- Edge types: SHARES_DEVICE, USES_DEVICE, CONNECTS_FROM, TRANSACTS_WITH, MENTIONS, RELATED_TO
- Edge properties: weight (float), timestamp, discovered (bool)
"""
        translate_prompt = f"""{schema_context}

Convert this natural language question to a valid openCypher query.
IMPORTANT: Return ONLY the openCypher query, no explanation, no markdown formatting.
If the question is ambiguous, make reasonable assumptions.
Limit results to 50 rows max.

Question: {question}"""

        system = "You are a Neptune Analytics openCypher expert. Output only valid openCypher queries."
        cypher_query = self._invoke_claude(translate_prompt, max_tokens=1024, system=system).strip()

        # Clean up potential markdown formatting
        if cypher_query.startswith("```"):
            lines = cypher_query.split("\n")
            cypher_query = "\n".join(lines[1:-1]) if len(lines) > 2 else lines[1] if len(lines) > 1 else ""

        # Step 2: Execute the query
        query_result = self._execute_query(cypher_query)

        # Step 3: Generate explanation
        explain_prompt = f"""Given this fraud graph query and its results, provide a clear natural language explanation.

Question: {question}
Query executed: {cypher_query}
Results: {json.dumps(query_result.get('results', [])[:10], default=str)}

Provide a concise explanation of what was found, highlighting any fraud-relevant patterns.
Keep it under 200 words."""

        explanation = self._invoke_claude(explain_prompt, max_tokens=512)

        latency = (time.time() - start) * 1000
        return {
            "question": question,
            "cypher_query": cypher_query,
            "results": query_result.get("results", [])[:50],
            "result_count": len(query_result.get("results", [])),
            "explanation": explanation,
            "error": query_result.get("error"),
            "latency_ms": latency,
        }

    # ──────────────────────────────────────────────────────────────────────
    # Autonomous Investigation Workflow
    # ──────────────────────────────────────────────────────────────────────

    def investigate(self, question: str, entity_id: Optional[str] = None) -> dict:
        """Run an autonomous multi-step fraud investigation.

        The agent:
        1. Plans investigation steps based on the question
        2. Executes graph queries at each step
        3. Evaluates findings and decides next steps
        4. Produces a final assessment with recommendations
        """
        start = time.time()
        session_id = str(uuid.uuid4())[:8]
        investigation_log = []

        # Step 1: Plan the investigation
        plan_prompt = f"""You are a fraud investigation AI agent with access to a graph database.
Plan a step-by-step investigation for this question/entity.

Question: {question}
{f'Target Entity: {entity_id}' if entity_id else ''}

Available graph operations:
1. Find entity by ID and get properties
2. Get neighbors (1-3 hops)
3. Detect communities/rings
4. Find shared devices/IPs
5. Check risk scores of connected entities
6. Find shortest path between entities

Return a JSON array of investigation steps:
[{{"step": 1, "action": "...", "query_type": "neighbors|community|risk|path|properties", "target": "..."}}]
Max 5 steps."""

        plan_text = self._invoke_claude(plan_prompt, max_tokens=1024)
        try:
            import re
            json_match = re.search(r'\[[\s\S]*?\]', plan_text)
            plan = json.loads(json_match.group()) if json_match else []
        except (json.JSONDecodeError, AttributeError):
            plan = [{"step": 1, "action": "Get entity properties", "query_type": "properties", "target": entity_id or "unknown"}]

        # Step 2: Execute each investigation step
        for step in plan[:5]:
            step_start = time.time()
            target = step.get("target", entity_id or "")
            query_type = step.get("query_type", "properties")

            if query_type == "properties":
                query = f"""
                    MATCH (n {{id: '{target}'}})
                    RETURN n.id as id, labels(n)[0] as type, properties(n) as props
                """
            elif query_type == "neighbors":
                query = f"""
                    MATCH (n {{id: '{target}'}})-[r]-(neighbor)
                    RETURN neighbor.id as id, labels(neighbor)[0] as type,
                           type(r) as relationship, neighbor.risk_score as risk_score,
                           neighbor.status as status
                    LIMIT 20
                """
            elif query_type == "community":
                query = f"""
                    MATCH (n {{id: '{target}'}})-[*1..3]-(connected)
                    RETURN DISTINCT connected.id as id, labels(connected)[0] as type,
                           connected.risk_score as risk_score, connected.status as status
                    LIMIT 30
                """
            elif query_type == "risk":
                query = f"""
                    MATCH (n {{id: '{target}'}})-[*1..2]-(connected)
                    WHERE connected.risk_score > 0.5 OR connected.status IN ['FLAGGED', 'BLOCKED']
                    RETURN connected.id as id, connected.risk_score as risk_score,
                           connected.status as status, labels(connected)[0] as type
                    ORDER BY connected.risk_score DESC
                    LIMIT 10
                """
            elif query_type == "path":
                query = f"""
                    MATCH (start {{id: '{target}'}})-[*1..4]-(bad)
                    WHERE bad.status IN ['FLAGGED', 'BLOCKED']
                    MATCH path = shortestPath((start)-[*..4]-(bad))
                    RETURN [n IN nodes(path) | n.id] as path_nodes,
                           [r IN relationships(path) | type(r)] as path_rels,
                           length(path) as distance
                    ORDER BY distance LIMIT 5
                """
            else:
                query = f"MATCH (n {{id: '{target}'}}) RETURN properties(n) as props"

            result = self._execute_query(query)
            step_latency = (time.time() - step_start) * 1000

            investigation_log.append({
                "step": step.get("step"),
                "action": step.get("action"),
                "query_type": query_type,
                "target": target,
                "results_count": len(result.get("results", [])),
                "findings": result.get("results", [])[:10],
                "latency_ms": step_latency,
            })

        # Step 3: Synthesize final assessment
        assessment_prompt = f"""Based on this fraud investigation, provide a final assessment.

Investigation Question: {question}
Entity: {entity_id or 'N/A'}

Investigation Steps & Findings:
{json.dumps(investigation_log, indent=2, default=str)}

Provide a JSON assessment:
{{
    "verdict": "LEGITIMATE|SUSPICIOUS|FRAUDULENT",
    "confidence": 0.0-1.0,
    "risk_score": 0.0-1.0,
    "key_findings": ["..."],
    "evidence_summary": "...",
    "recommended_actions": ["..."],
    "investigation_complete": true/false,
    "needs_human_review": true/false
}}"""

        assessment_text = self._invoke_claude(assessment_prompt)
        try:
            import re
            json_match = re.search(r'\{[\s\S]*\}', assessment_text)
            assessment = json.loads(json_match.group()) if json_match else {"verdict": "UNKNOWN"}
        except (json.JSONDecodeError, AttributeError):
            assessment = {"verdict": "UNKNOWN", "evidence_summary": assessment_text}

        # Save session
        total_latency = (time.time() - start) * 1000
        self._sessions[session_id] = {
            "question": question,
            "entity_id": entity_id,
            "plan": plan,
            "investigation_log": investigation_log,
            "assessment": assessment,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "latency_ms": total_latency,
        }

        return {
            "session_id": session_id,
            "question": question,
            "entity_id": entity_id,
            "investigation_steps": len(investigation_log),
            "investigation_log": investigation_log,
            "assessment": assessment,
            "latency_ms": total_latency,
        }

    def explain_entity(self, entity_id: str) -> dict:
        """Generate a comprehensive explainable risk assessment for an entity.

        Provides human-readable explanation of why an entity is flagged,
        with evidence trails and confidence scoring.
        """
        start = time.time()

        # Gather all evidence
        evidence_query = f"""
            MATCH (n {{id: '{entity_id}'}})
            OPTIONAL MATCH (n)-[r]-(neighbor)
            WITH n, collect({{
                id: neighbor.id, type: labels(neighbor)[0],
                relationship: type(r), risk: neighbor.risk_score,
                status: neighbor.status
            }}) as connections
            RETURN n.id as id, labels(n)[0] as type, properties(n) as props,
                   connections, size(connections) as degree
        """
        evidence = self._execute_query(evidence_query).get("results", [])

        # Check for ring membership
        ring_query = f"""
            MATCH (n {{id: '{entity_id}'}})-[*1..3]-(flagged)
            WHERE flagged.status IN ['FLAGGED', 'BLOCKED'] AND flagged.id <> '{entity_id}'
            RETURN count(DISTINCT flagged) as flagged_connections,
                   collect(DISTINCT flagged.id)[..5] as flagged_ids
        """
        ring_data = self._execute_query(ring_query).get("results", [])

        # Generate explanation
        explain_prompt = f"""Generate a clear, explainable risk assessment for entity {entity_id}.

Entity Evidence:
{json.dumps(evidence, indent=2, default=str)}

Ring/Network Risk:
{json.dumps(ring_data, indent=2, default=str)}

Write a human-readable explanation that:
1. Summarizes who/what this entity is
2. Lists specific risk indicators with evidence
3. Explains graph-based risk (who they're connected to)
4. Provides an overall risk rating with justification
5. Uses simple language an analyst can act on

Format as JSON:
{{
    "entity_id": "{entity_id}",
    "entity_summary": "...",
    "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
    "risk_score": 0.0-1.0,
    "risk_factors": [{{"factor": "...", "evidence": "...", "weight": 0.0-1.0}}],
    "network_risk": "...",
    "plain_language_explanation": "...",
    "recommended_action": "MONITOR|INVESTIGATE|RESTRICT|BLOCK"
}}"""

        explanation_text = self._invoke_claude(explain_prompt)
        try:
            import re
            json_match = re.search(r'\{[\s\S]*\}', explanation_text)
            explanation = json.loads(json_match.group()) if json_match else {}
        except (json.JSONDecodeError, AttributeError):
            explanation = {"plain_language_explanation": explanation_text}

        latency = (time.time() - start) * 1000
        explanation["latency_ms"] = latency
        return explanation


# Singleton
mcp_agent_service = MCPAgentService()
