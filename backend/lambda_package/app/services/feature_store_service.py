"""SageMaker Feature Store service for feature persistence and retrieval."""

import os
import time
import boto3
from typing import Dict, Optional

REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
FEATURE_GROUP_NAME = "multidb-poc-fraud-features"


class FeatureStoreService:
    """Manages SageMaker Feature Store operations."""

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from botocore.config import Config
            config = Config(connect_timeout=3, read_timeout=5, retries={'max_attempts': 0})
            self._client = boto3.client("sagemaker-featurestore-runtime", region_name=REGION, config=config)
        return self._client

    def put_features(self, entity_id: str, domain: str, features: Dict, score: float, decision: str) -> bool:
        """Write feature record to the online+offline store."""
        try:
            record = [
                {"FeatureName": "entity_id", "ValueAsString": f"{domain}:{entity_id}"},
                {"FeatureName": "domain", "ValueAsString": domain},
                {"FeatureName": "similarity_score", "ValueAsString": str(features.get("similarity_score", 0.0))},
                {"FeatureName": "graph_score", "ValueAsString": str(features.get("graph_score", 0.0))},
                {"FeatureName": "velocity_5min", "ValueAsString": str(int(features.get("velocity_5min", 0)))},
                {"FeatureName": "device_novelty", "ValueAsString": str(features.get("device_novelty", 0.0))},
                {"FeatureName": "content_risk_keywords", "ValueAsString": str(int(features.get("content_risk_keyword_count", 0)))},
                {"FeatureName": "off_hours", "ValueAsString": str(features.get("off_hours", 0.0))},
                {"FeatureName": "prior_flags", "ValueAsString": str(int(features.get("prior_flags", 0)))},
                {"FeatureName": "composite_score", "ValueAsString": str(score)},
                {"FeatureName": "decision", "ValueAsString": decision},
                {"FeatureName": "event_time", "ValueAsString": str(time.time())},
            ]
            self.client.put_record(FeatureGroupName=FEATURE_GROUP_NAME, Record=record)
            return True
        except Exception:
            return False

    def get_features(self, entity_id: str, domain: str) -> Optional[Dict]:
        """Retrieve latest features for an entity from online store."""
        try:
            resp = self.client.get_record(
                FeatureGroupName=FEATURE_GROUP_NAME,
                RecordIdentifierValueAsString=f"{domain}:{entity_id}",
            )
            if "Record" in resp:
                return {r["FeatureName"]: r["ValueAsString"] for r in resp["Record"]}
        except Exception:
            pass
        return None


feature_store_service = FeatureStoreService()
