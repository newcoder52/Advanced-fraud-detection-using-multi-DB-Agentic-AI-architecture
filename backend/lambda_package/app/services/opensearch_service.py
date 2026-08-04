"""OpenSearch Serverless service for vector analytics and historical pattern search."""

import json
import os
from typing import List, Optional
from datetime import datetime, timezone

import boto3
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials
import urllib.request

REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
COLLECTION_ENDPOINT = os.environ.get("OPENSEARCH_ENDPOINT", "")
INDEX_NAME = "threat-patterns"


class OpenSearchService:
    """Manages OpenSearch Serverless vector operations."""

    def __init__(self):
        self._session = boto3.Session()
        self._credentials = None

    def _get_credentials(self):
        if self._credentials is None:
            self._credentials = self._session.get_credentials().get_frozen_credentials()
        return self._credentials

    def _signed_request(self, method: str, path: str, body: Optional[dict] = None) -> dict:
        """Make a SigV4-signed request to OpenSearch Serverless."""
        if not COLLECTION_ENDPOINT:
            return {"error": "OpenSearch endpoint not configured"}

        url = f"{COLLECTION_ENDPOINT}/{path}"
        payload = json.dumps(body) if body else None

        request = AWSRequest(method=method, url=url, data=payload,
                             headers={"Content-Type": "application/json"} if payload else {})
        credentials = self._get_credentials()
        SigV4Auth(credentials, "aoss", REGION).add_auth(request)

        req = urllib.request.Request(
            url=url, method=method,
            data=payload.encode() if payload else None,
            headers=dict(request.headers)
        )
        try:
            with urllib.request.urlopen(req, timeout=3) as resp:
                return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    def create_index(self) -> dict:
        """Create the vector index if it doesn't exist."""
        body = {
            "settings": {
                "index": {"knn": True, "knn.algo_param.ef_search": 512}
            },
            "mappings": {
                "properties": {
                    "embedding": {"type": "knn_vector", "dimension": 1024, "method": {"name": "hnsw", "engine": "faiss", "parameters": {"m": 16, "ef_construction": 512}}},
                    "entity_id": {"type": "keyword"},
                    "domain": {"type": "keyword"},
                    "content": {"type": "text"},
                    "event_type": {"type": "keyword"},
                    "risk_score": {"type": "float"},
                    "decision": {"type": "keyword"},
                    "timestamp": {"type": "date"},
                }
            }
        }
        return self._signed_request("PUT", INDEX_NAME, body)

    def index_pattern(self, entity_id: str, domain: str, embedding: List[float],
                      content: str, event_type: str, risk_score: float, decision: str) -> dict:
        """Index a threat pattern for historical analytics."""
        doc = {
            "entity_id": entity_id,
            "domain": domain,
            "embedding": embedding,
            "content": content,
            "event_type": event_type,
            "risk_score": risk_score,
            "decision": decision,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return self._signed_request("POST", f"{INDEX_NAME}/_doc", doc)

    def search_similar(self, embedding: List[float], domain: str = "", k: int = 5) -> dict:
        """Search for similar historical patterns using kNN."""
        query: dict = {
            "size": k,
            "query": {
                "knn": {
                    "embedding": {"vector": embedding, "k": k}
                }
            }
        }
        if domain:
            query["query"] = {
                "bool": {
                    "must": [{"knn": {"embedding": {"vector": embedding, "k": k}}}],
                    "filter": [{"term": {"domain": domain}}]
                }
            }
        return self._signed_request("POST", f"{INDEX_NAME}/_search", query)

    def get_analytics(self, domain: str = "") -> dict:
        """Get aggregated threat analytics."""
        query: dict = {
            "size": 0,
            "aggs": {
                "by_decision": {"terms": {"field": "decision"}},
                "avg_risk": {"avg": {"field": "risk_score"}},
                "by_event_type": {"terms": {"field": "event_type"}},
                "over_time": {"date_histogram": {"field": "timestamp", "calendar_interval": "hour"}}
            }
        }
        if domain:
            query["query"] = {"term": {"domain": domain}}
        return self._signed_request("POST", f"{INDEX_NAME}/_search", query)


opensearch_service = OpenSearchService()
