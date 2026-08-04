"""DynamoDB client for event ingestion and streaming."""

import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

import boto3
from botocore.config import Config as BotoConfig

from app.config import settings
from app.models import CustomerDomain, EventIngest, EventResponse


# Table name mapping per customer domain
TABLE_NAMES = {
    CustomerDomain.PRESS_DISTRIBUTION: "press_release_events",
    CustomerDomain.DATING_PLATFORM: "user_interaction_events",
    CustomerDomain.MUSIC_STREAMING: "stream_events",
    CustomerDomain.CINEMA_BOOKING: "purchase_events",
    CustomerDomain.NEWS_PLATFORM: "content_engagement_events",
    CustomerDomain.TWITCH: "viewer_activity_events",
    CustomerDomain.TICKETING_PLATFORM: "ticket_purchase_events",
    CustomerDomain.EPIC_GAMES: "player_activity_events",
}

# Partition key mapping per domain
PK_FIELDS = {
    CustomerDomain.PRESS_DISTRIBUTION: "release_id",
    CustomerDomain.DATING_PLATFORM: "user_id",
    CustomerDomain.MUSIC_STREAMING: "account_id",
    CustomerDomain.CINEMA_BOOKING: "session_id",
    CustomerDomain.NEWS_PLATFORM: "content_id",
    CustomerDomain.TWITCH: "viewer_id",
    CustomerDomain.TICKETING_PLATFORM: "buyer_id",
    CustomerDomain.EPIC_GAMES: "player_id",
}


class DynamoDBClient:
    """Manages DynamoDB operations for event ingestion."""

    def __init__(self):
        kwargs = {
            "region_name": settings.aws_region,
            "config": BotoConfig(retries={"max_attempts": 3, "mode": "adaptive"}),
        }
        if settings.dynamodb_endpoint:
            kwargs["endpoint_url"] = settings.dynamodb_endpoint

        self.client = boto3.resource("dynamodb", **kwargs)
        self._tables: Dict[str, Any] = {}

    def _get_table_name(self, domain: CustomerDomain) -> str:
        return f"{settings.dynamodb_table_prefix}_{TABLE_NAMES[domain]}"

    def _get_table(self, domain: CustomerDomain):
        table_name = self._get_table_name(domain)
        if table_name not in self._tables:
            self._tables[table_name] = self.client.Table(table_name)
        return self._tables[table_name]

    async def ingest_event(self, event: EventIngest) -> EventResponse:
        """Ingest an event into the appropriate DynamoDB table."""
        table = self._get_table(event.domain)
        event_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc)

        pk_field = PK_FIELDS[event.domain]
        pk_value = event.payload.get(pk_field, event_id)

        item = {
            "pk": str(pk_value),
            "sk": f"{timestamp.isoformat()}#{event.event_type}",
            "event_id": event_id,
            "event_type": event.event_type,
            "domain": event.domain.value,
            "payload": event.payload,
            "metadata": event.metadata or {},
            "timestamp": timestamp.isoformat(),
            "ttl": int(timestamp.timestamp()) + 86400 * 30,  # 30 days
        }

        table.put_item(Item=item)

        return EventResponse(
            event_id=event_id,
            domain=event.domain,
            event_type=event.event_type,
            payload=event.payload,
            metadata=event.metadata,
            timestamp=timestamp,
            status="ingested",
        )

    async def get_event(self, domain: CustomerDomain, event_id: str) -> Optional[Dict]:
        """Retrieve an event by ID using a scan (for demo purposes)."""
        table = self._get_table(domain)

        response = table.scan(
            FilterExpression="event_id = :eid",
            ExpressionAttributeValues={":eid": event_id},
            Limit=1,
        )

        items = response.get("Items", [])
        return items[0] if items else None

    async def get_recent_events(self, domain: CustomerDomain, limit: int = 50) -> List[Dict]:
        """Get recent events for a domain."""
        table = self._get_table(domain)

        response = table.scan(Limit=limit)
        items = response.get("Items", [])
        return sorted(items, key=lambda x: x.get("timestamp", ""), reverse=True)

    async def create_tables(self):
        """Create DynamoDB tables for all domains (local dev / initial setup)."""
        existing = [t.name for t in self.client.tables.all()]

        for domain in CustomerDomain:
            table_name = self._get_table_name(domain)
            if table_name in existing:
                continue

            self.client.create_table(
                TableName=table_name,
                KeySchema=[
                    {"AttributeName": "pk", "KeyType": "HASH"},
                    {"AttributeName": "sk", "KeyType": "RANGE"},
                ],
                AttributeDefinitions=[
                    {"AttributeName": "pk", "AttributeType": "S"},
                    {"AttributeName": "sk", "AttributeType": "S"},
                    {"AttributeName": "event_id", "AttributeType": "S"},
                ],
                GlobalSecondaryIndexes=[
                    {
                        "IndexName": "event_id_index",
                        "KeySchema": [
                            {"AttributeName": "event_id", "KeyType": "HASH"},
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {
                            "ReadCapacityUnits": 5,
                            "WriteCapacityUnits": 5,
                        },
                    }
                ],
                ProvisionedThroughput={
                    "ReadCapacityUnits": 5,
                    "WriteCapacityUnits": 5,
                },
                StreamSpecification={
                    "StreamEnabled": True,
                    "StreamViewType": "NEW_AND_OLD_IMAGES",
                },
            )


# Singleton instance
dynamodb_client = DynamoDBClient()
