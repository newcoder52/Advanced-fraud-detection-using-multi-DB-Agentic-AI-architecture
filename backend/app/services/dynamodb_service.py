"""DynamoDB service for event ingestion."""

import uuid
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
TABLE_PREFIX = os.environ.get("DYNAMODB_TABLE_PREFIX", "multidb_poc")
# Single-table design: use DYNAMODB_TABLE_NAME if set (CDK deploys one table for all domains)
SINGLE_TABLE = os.environ.get("DYNAMODB_TABLE_NAME", "multidb-poc-events")

TABLE_MAP = {
    "press_distribution": "press_release_events",
    "dating_platform": "user_interaction_events",
    "music_streaming": "stream_events",
    "cinema_booking": "purchase_events",
    "news_platform": "content_engagement_events",
    "live_streaming": "viewer_activity_events",
    "ticketing_platform": "ticket_purchase_events",
    "gaming_platform": "player_activity_events",
}

PK_FIELDS = {
    "press_distribution": "release_id",
    "dating_platform": "user_id",
    "music_streaming": "account_id",
    "cinema_booking": "session_id",
    "news_platform": "content_id",
    "live_streaming": "viewer_id",
    "ticketing_platform": "buyer_id",
    "gaming_platform": "player_id",
}


class DynamoDBService:
    def __init__(self):
        from botocore.config import Config
        config = Config(connect_timeout=5, read_timeout=10, retries={'max_attempts': 0})
        self._client = boto3.client("dynamodb", region_name=REGION, config=config)
        self.resource = boto3.resource("dynamodb", region_name=REGION, config=config)
        self._tables = {}

    def _get_table(self, domain: str):
        table_name = SINGLE_TABLE if SINGLE_TABLE else f"{TABLE_PREFIX}_{TABLE_MAP[domain]}"
        if table_name not in self._tables:
            self._tables[table_name] = self.resource.Table(table_name)
        return self._tables[table_name]

    def ingest_event(self, domain: str, event_type: str, payload: dict, metadata: dict = None) -> dict:
        table_name = SINGLE_TABLE if SINGLE_TABLE else f"{TABLE_PREFIX}_{TABLE_MAP[domain]}"
        event_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()

        pk_field = PK_FIELDS.get(domain, "event_id")
        pk_value = str(payload.get(pk_field, event_id))

        # Convert floats to strings for DynamoDB client API
        def to_dynamodb_item(obj):
            if isinstance(obj, str):
                return {"S": obj}
            elif isinstance(obj, bool):
                return {"BOOL": obj}
            elif isinstance(obj, (int, float)):
                return {"N": str(obj)}
            elif isinstance(obj, dict):
                return {"M": {k: to_dynamodb_item(v) for k, v in obj.items()}}
            elif isinstance(obj, list):
                return {"L": [to_dynamodb_item(i) for i in obj]}
            elif obj is None:
                return {"NULL": True}
            return {"S": str(obj)}

        # Use correct key schema based on table design
        if SINGLE_TABLE:
            # CDK table uses domain (HASH) + event_id (RANGE)
            item = {
                "domain": {"S": domain},
                "event_id": {"S": event_id},
                "event_type": {"S": event_type},
                "entity_id": {"S": str(payload.get("entity_id", payload.get(pk_field, event_id)))},
                "payload": to_dynamodb_item(payload),
                "metadata": to_dynamodb_item(metadata or {}),
                "timestamp": {"S": timestamp},
                "ttl": {"N": str(int(datetime.now(timezone.utc).timestamp()) + 86400 * 30)},
            }
        else:
            item = {
                "pk": {"S": pk_value},
                "sk": {"S": f"{timestamp}#{event_type}"},
                "event_id": {"S": event_id},
                "event_type": {"S": event_type},
                "domain": {"S": domain},
                "payload": to_dynamodb_item(payload),
                "metadata": to_dynamodb_item(metadata or {}),
                "timestamp": {"S": timestamp},
                "ttl": {"N": str(int(datetime.now(timezone.utc).timestamp()) + 86400 * 30)},
            }

        self._client.put_item(TableName=table_name, Item=item)

        return {
            "event_id": event_id,
            "domain": domain,
            "event_type": event_type,
            "timestamp": timestamp,
            "status": "ingested",
        }

    def get_event(self, domain: str, event_id: str) -> Optional[dict]:
        table = self._get_table(domain)
        response = table.query(
            IndexName="event_id_index",
            KeyConditionExpression=Key("event_id").eq(event_id),
            Limit=1,
        )
        items = response.get("Items", [])
        if items:
            return self._decimal_to_float(items[0])
        return None

    def get_recent_events(self, domain: str, limit: int = 50) -> List[dict]:
        table = self._get_table(domain)
        response = table.scan(Limit=limit)
        items = response.get("Items", [])
        return [self._decimal_to_float(i) for i in sorted(items, key=lambda x: x.get("timestamp", ""), reverse=True)]

    @staticmethod
    def _decimal_to_float(obj):
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, dict):
            return {k: DynamoDBService._decimal_to_float(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [DynamoDBService._decimal_to_float(i) for i in obj]
        return obj


dynamodb_service = DynamoDBService()
