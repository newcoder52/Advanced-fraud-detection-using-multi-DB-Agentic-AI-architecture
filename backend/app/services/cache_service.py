"""ElastiCache Valkey (Redis-compatible) service for real-time scoring with IAM auth."""

import os
import time
from typing import Optional, Dict, Tuple, Union
from datetime import datetime, timezone
from urllib.parse import ParseResult, urlencode, urlunparse

import botocore.session
import redis
from botocore.model import ServiceId
from botocore.signers import RequestSigner
from cachetools import TTLCache, cached

ENDPOINT = os.environ.get("ELASTICACHE_ENDPOINT", "test-new-lahvej.serverless.use1.cache.amazonaws.com")
CACHE_NAME = os.environ.get("ELASTICACHE_CACHE_NAME", "test-new")
PORT = int(os.environ.get("ELASTICACHE_PORT", "6379"))
TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "3600"))
IAM_USER = os.environ.get("ELASTICACHE_IAM_USER", "iam-user-01")
REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")

# Decision thresholds
DECISION_MATRIX = {
    "ALLOW": (0.0, 0.3),
    "FLAG": (0.3, 0.6),
    "CHALLENGE": (0.6, 0.8),
    "BLOCK": (0.8, 1.0),
}

# Score weights per domain
SCORE_WEIGHTS = {
    "press_distribution": {"graph": 0.35, "similarity": 0.30, "behavioral": 0.20, "velocity": 0.15},
    "dating_platform": {"graph": 0.30, "similarity": 0.35, "behavioral": 0.20, "velocity": 0.15},
    "music_streaming": {"graph": 0.25, "similarity": 0.25, "behavioral": 0.30, "velocity": 0.20},
    "cinema_booking": {"graph": 0.20, "similarity": 0.20, "behavioral": 0.25, "velocity": 0.35},
    "news_platform": {"graph": 0.30, "similarity": 0.35, "behavioral": 0.20, "velocity": 0.15},
    "ticketing_platform": {"graph": 0.20, "similarity": 0.20, "behavioral": 0.25, "velocity": 0.35},
}


class ElastiCacheIAMProvider(redis.CredentialProvider):
    """IAM-based credential provider for ElastiCache Serverless."""

    def __init__(self, user, cache_name, is_serverless=True, region="us-east-1"):
        self.user = user
        self.cache_name = cache_name
        self.is_serverless = is_serverless
        self.region = region

        session = botocore.session.get_session()
        self.request_signer = RequestSigner(
            ServiceId("elasticache"),
            self.region,
            "elasticache",
            "v4",
            session.get_credentials(),
            session.get_component("event_emitter"),
        )

    # Generated IAM tokens are valid for 15 minutes
    @cached(cache=TTLCache(maxsize=128, ttl=900))
    def get_credentials(self) -> Union[Tuple[str], Tuple[str, str]]:
        query_params = {"Action": "connect", "User": self.user}
        if self.is_serverless:
            query_params["ResourceType"] = "ServerlessCache"
        url = urlunparse(
            ParseResult(
                scheme="https",
                netloc=self.cache_name,
                path="/",
                query=urlencode(query_params),
                params="",
                fragment="",
            )
        )
        signed_url = self.request_signer.generate_presigned_url(
            {"method": "GET", "url": url, "body": {}, "headers": {}, "context": {}},
            operation_name="connect",
            expires_in=900,
            region_name=self.region,
        )
        # Strip https:// prefix — ElastiCache only accepts URL without protocol
        return (self.user, signed_url.removeprefix("https://"))


class CacheService:
    """Manages ElastiCache Valkey for scoring and caching with IAM auth."""

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                creds_provider = ElastiCacheIAMProvider(
                    user=IAM_USER,
                    cache_name=CACHE_NAME,
                    is_serverless=True,
                    region=REGION,
                )
                c = redis.Redis(
                    host=ENDPOINT,
                    port=PORT,
                    credential_provider=creds_provider,
                    ssl=True,
                    ssl_cert_reqs="none",
                    decode_responses=True,
                    socket_connect_timeout=2,
                    socket_timeout=2,
                    retry_on_timeout=False,
                    health_check_interval=0,
                )
                c.ping()
                self._client = c
            except Exception as e:
                import logging
                logging.getLogger().warning(f"ElastiCache connection failed: {e}")
                self._client = False
        if self._client is False:
            return None
        return self._client

    def get_score(self, entity_id: str) -> Optional[Dict]:
        """Get cached score for an entity."""
        start = time.time()
        if not self.client:
            return None
        try:
            key = f"score:{entity_id}"
            data = self.client.hgetall(key)
            latency = (time.time() - start) * 1000

            if data:
                ttl = self.client.ttl(key)
                return {
                    "entity_id": entity_id,
                    "composite_score": float(data.get("composite_score", 0)),
                    "components": {
                        "graph_score": float(data.get("graph_score", 0)),
                        "similarity_score": float(data.get("similarity_score", 0)),
                        "behavioral_score": float(data.get("behavioral_score", 0)),
                        "velocity_score": float(data.get("velocity_score", 0)),
                    },
                    "decision": data.get("decision", "ALLOW"),
                    "cache_hit": True,
                    "latency_ms": latency,
                    "last_updated": data.get("last_updated", ""),
                    "ttl_remaining_seconds": ttl if ttl > 0 else None,
                }
            return None
        except Exception:
            return None

    def set_score(
        self,
        entity_id: str,
        domain: str,
        graph_score: float = 0.0,
        similarity_score: float = 0.0,
        behavioral_score: float = 0.0,
        velocity_score: float = 0.0,
    ) -> Dict:
        """Calculate composite score and cache it."""
        start = time.time()
        weights = SCORE_WEIGHTS.get(domain, SCORE_WEIGHTS["press_distribution"])

        composite = (
            graph_score * weights["graph"]
            + similarity_score * weights["similarity"]
            + behavioral_score * weights["behavioral"]
            + velocity_score * weights["velocity"]
        )

        # Convergence amplification — multiple signals agreeing = high confidence
        convergence = sum([
            1 if similarity_score > 0.5 else 0,
            1 if graph_score > 0.3 else 0,
            1 if behavioral_score > 0.3 else 0,
            1 if velocity_score > 0.3 else 0,
        ])
        if convergence >= 3:
            composite = min(1.0, composite * 2.2)
        elif convergence >= 2:
            composite = min(1.0, composite * 1.7)

        composite = min(max(composite, 0.0), 1.0)

        # Determine decision
        decision = "ALLOW"
        for action, (low, high) in DECISION_MATRIX.items():
            if low <= composite < high:
                decision = action
                break
        if composite >= 0.8:
            decision = "BLOCK"

        now = datetime.now(timezone.utc).isoformat()
        key = f"score:{entity_id}"

        try:
            if self.client:
                self.client.hset(key, mapping={
                    "composite_score": str(composite),
                    "graph_score": str(graph_score),
                    "similarity_score": str(similarity_score),
                    "behavioral_score": str(behavioral_score),
                    "velocity_score": str(velocity_score),
                    "decision": decision,
                    "domain": domain,
                    "last_updated": now,
                })
                self.client.expire(key, TTL_SECONDS)
        except Exception:
            pass

        latency = (time.time() - start) * 1000

        return {
            "entity_id": entity_id,
            "composite_score": composite,
            "components": {
                "graph_score": graph_score,
                "similarity_score": similarity_score,
                "behavioral_score": behavioral_score,
                "velocity_score": velocity_score,
            },
            "decision": decision,
            "cache_hit": False,
            "latency_ms": latency,
            "last_updated": now,
            "ttl_remaining_seconds": TTL_SECONDS,
        }

    def get_metrics(self) -> Dict:
        """Get cache metrics."""
        if not self.client:
            return {"hit_rate": 0.0, "status": "unavailable"}
        try:
            info = self.client.info()
            return {
                "connected_clients": info.get("connected_clients", 0),
                "used_memory_mb": info.get("used_memory", 0) / 1024 / 1024,
                "keyspace_hits": info.get("keyspace_hits", 0),
                "keyspace_misses": info.get("keyspace_misses", 0),
                "hit_rate": info.get("keyspace_hits", 0) / max(info.get("keyspace_hits", 0) + info.get("keyspace_misses", 0), 1),
            }
        except Exception:
            return {"hit_rate": 0.0, "error": "Cannot connect to cache"}

    def flush_entity(self, entity_id: str) -> bool:
        """Remove cached score for an entity."""
        try:
            return bool(self.client.delete(f"score:{entity_id}"))
        except Exception:
            return False


cache_service = CacheService()
