"""Kinesis Data Streams service for event ingestion and streaming.

This is the entry point for ALL events. Every event flows through Kinesis first,
then the Lambda consumer (pipeline) processes them. This decouples ingestion from
processing, handles burst traffic, and provides replay capability.

Architecture role:
    Event Source → Kinesis → Lambda Consumer → Detection Pipeline
                         └→ S3 (Firehose, cold archive of ALL events)
"""

import os
import json
import uuid
import time
from datetime import datetime, timezone
from typing import Optional

import boto3

REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
STREAM_NAME = os.environ.get("KINESIS_STREAM_NAME", "multidb-fraud-events")
FIREHOSE_NAME = os.environ.get("KINESIS_FIREHOSE_NAME", "multidb-fraud-archive")


class KinesisService:
    """Manages event streaming via Kinesis Data Streams.

    Responsibilities:
    - Publish raw events to the detection stream (real-time processing)
    - Archive all events to S3 via Firehose (compliance, replay)
    - Partition by entity_id for ordered processing per entity
    """

    def __init__(self):
        self._kinesis = boto3.client("kinesis", region_name=REGION)
        self._firehose = boto3.client("firehose", region_name=REGION)

    def publish_event(
        self,
        domain: str,
        event_type: str,
        entity_id: str,
        payload: dict,
        content: str = "",
        metadata: Optional[dict] = None,
    ) -> dict:
        """Publish an event to Kinesis for real-time processing.

        The event is partitioned by entity_id so all events for the same entity
        are processed in order by the same Lambda shard consumer.

        Args:
            domain: Customer vertical (dating_platform, ticketing_platform, etc.)
            event_type: Type of event (profile_created, ticket_purchased, etc.)
            entity_id: The primary entity being evaluated (user_id, buyer_id, etc.)
            payload: Raw event data from the customer platform
            content: Text content for semantic analysis (bio, message, etc.)
            metadata: Additional context (device info, IP, session data)

        Returns:
            dict with event_id, shard_id, sequence_number, and timestamp
        """
        event_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()

        record = {
            "event_id": event_id,
            "domain": domain,
            "event_type": event_type,
            "entity_id": entity_id or event_id,
            "payload": payload,
            "content": content,
            "metadata": metadata or {},
            "timestamp": timestamp,
            "ingested_at": time.time(),
        }

        try:
            response = self._kinesis.put_record(
                StreamName=STREAM_NAME,
                Data=json.dumps(record).encode("utf-8"),
                PartitionKey=entity_id or event_id,
            )

            return {
                "event_id": event_id,
                "stream": STREAM_NAME,
                "shard_id": response.get("ShardId", ""),
                "sequence_number": response.get("SequenceNumber", ""),
                "timestamp": timestamp,
                "partition_key": entity_id or event_id,
                "status": "published",
            }
        except self._kinesis.exceptions.ResourceNotFoundException:
            # Stream doesn't exist — fall through to local mode
            return {
                "event_id": event_id,
                "stream": STREAM_NAME,
                "shard_id": "local",
                "sequence_number": "local",
                "timestamp": timestamp,
                "partition_key": entity_id or event_id,
                "status": "published_local",
                "note": "Kinesis stream not found — running in local/demo mode",
            }
        except Exception as e:
            # Graceful degradation: return event_id so pipeline can still process
            return {
                "event_id": event_id,
                "stream": STREAM_NAME,
                "timestamp": timestamp,
                "status": "degraded",
                "error": str(e)[:200],
            }

    def archive_event(self, record: dict) -> dict:
        """Send event to Firehose for S3 archival (all events, not just flagged).

        This runs asynchronously — the detection pipeline doesn't wait for it.
        Firehose buffers and batches writes to S3 in Parquet format.

        Args:
            record: The full event record to archive

        Returns:
            dict with archive status
        """
        try:
            response = self._firehose.put_record(
                DeliveryStreamName=FIREHOSE_NAME,
                Record={"Data": (json.dumps(record) + "\n").encode("utf-8")},
            )
            return {
                "status": "archived",
                "record_id": response.get("RecordId", ""),
            }
        except Exception as e:
            return {
                "status": "archive_failed",
                "error": str(e)[:200],
            }

    def get_stream_info(self) -> dict:
        """Get stream metadata for monitoring/health checks."""
        try:
            response = self._kinesis.describe_stream_summary(StreamName=STREAM_NAME)
            summary = response.get("StreamDescriptionSummary", {})
            return {
                "stream_name": STREAM_NAME,
                "status": summary.get("StreamStatus", "UNKNOWN"),
                "shard_count": summary.get("OpenShardCount", 0),
                "retention_hours": summary.get("RetentionPeriodHours", 24),
                "consumer_count": summary.get("ConsumerCount", 0),
            }
        except Exception as e:
            return {
                "stream_name": STREAM_NAME,
                "status": "unavailable",
                "error": str(e)[:200],
            }


kinesis_service = KinesisService()
