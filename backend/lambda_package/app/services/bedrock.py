"""Amazon Bedrock service for embeddings and Claude briefings."""

import json
import os
import boto3
from typing import List, Optional

BEDROCK_REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
EMBEDDING_MODEL = os.environ.get("BEDROCK_EMBEDDING_MODEL", "amazon.titan-embed-text-v2:0")
CLAUDE_MODEL = os.environ.get("BEDROCK_CLAUDE_MODEL", "us.anthropic.claude-sonnet-4-6")
EMBEDDING_LAMBDA = os.environ.get("EMBEDDING_LAMBDA_NAME", "")


class BedrockService:
    """Handles Bedrock API calls for embeddings and text generation."""

    def __init__(self):
        self._client = None
        self._lambda_client = None

    @property
    def client(self):
        if self._client is None:
            from botocore.config import Config
            config = Config(connect_timeout=5, read_timeout=25, retries={'max_attempts': 1})
            self._client = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION, config=config)
        return self._client

    def _get_lambda_client(self):
        if self._lambda_client is None:
            from botocore.config import Config
            config = Config(connect_timeout=5, read_timeout=30, retries={'max_attempts': 0})
            self._lambda_client = boto3.client("lambda", region_name=BEDROCK_REGION, config=config)
        return self._lambda_client

    def get_embedding(self, text: str, dimensions: int = 1024) -> List[float]:
        """Generate embedding — via external Lambda if configured, else direct Bedrock."""
        if EMBEDDING_LAMBDA:
            # Call the non-VPC embedding Lambda
            resp = self._get_lambda_client().invoke(
                FunctionName=EMBEDDING_LAMBDA,
                InvocationType="RequestResponse",
                Payload=json.dumps({"content": text[:2000]}),
            )
            result = json.loads(resp["Payload"].read())
            return result["embedding"]

        body = json.dumps({
            "inputText": text[:2000],
            "dimensions": dimensions,
            "normalize": True,
        })

        response = self.client.invoke_model(
            modelId=EMBEDDING_MODEL,
            body=body,
            contentType="application/json",
            accept="application/json",
        )

        result = json.loads(response["body"].read())
        return result["embedding"]

    def generate_briefing(
        self,
        entity_id: str,
        entity_type: str,
        evidence: List[dict],
        domain_context: str,
    ) -> str:
        """Generate an investigator briefing using Claude."""
        prompt = f"""You are a fraud/anomaly investigation analyst. Generate a detailed investigator briefing for the following entity.

Entity ID: {entity_id}
Entity Type: {entity_type}
Domain Context: {domain_context}

Evidence collected:
{json.dumps(evidence, indent=2)}

Generate a briefing with:
1. Executive Summary (2-3 sentences)
2. Entity Profile
3. Evidence Chain (timeline of suspicious activities)
4. Risk Assessment (Low/Medium/High/Critical with justification)
5. Recommended Actions (numbered list)
6. Confidence Score (0.0-1.0)

Format as structured JSON with keys: title, narrative, evidence_chain, risk_assessment, recommended_actions, confidence_score"""

        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
        })

        response = self.client.invoke_model(
            modelId=CLAUDE_MODEL,
            body=body,
            contentType="application/json",
            accept="application/json",
        )

        result = json.loads(response["body"].read())
        return result["content"][0]["text"]

    def analyze_content(self, content: str, analysis_type: str = "fraud_detection") -> dict:
        """Use Claude to analyze content for anomalies."""
        prompt = f"""Analyze the following content for {analysis_type}. Return a JSON object with:
- risk_score (0.0-1.0)
- indicators (list of suspicious indicators found)
- summary (brief description)
- recommended_action (ALLOW/FLAG/CHALLENGE/BLOCK)

Content:
{content[:4000]}"""

        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1024,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
        })

        response = self.client.invoke_model(
            modelId=CLAUDE_MODEL,
            body=body,
            contentType="application/json",
            accept="application/json",
        )

        result = json.loads(response["body"].read())
        text = result["content"][0]["text"]

        try:
            # Try to parse JSON from response
            import re
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                return json.loads(json_match.group())
        except (json.JSONDecodeError, AttributeError):
            pass

        return {
            "risk_score": 0.5,
            "indicators": [],
            "summary": text[:200],
            "recommended_action": "FLAG",
        }


# Singleton
bedrock_service = BedrockService()
