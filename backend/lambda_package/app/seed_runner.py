"""Seed runner - populates all databases with demo data after deployment."""

import sys
import time
import json
from app.seed_data import ALL_EVENTS, ALL_KNOWN_PATTERNS, get_neptune_graph_data
from app.services.dynamodb_service import dynamodb_service
from app.services.aurora_service import aurora_service
from app.services.neptune_service import neptune_service
from app.services.bedrock import bedrock_service


def seed_dynamodb():
    """Seed all DynamoDB tables with events."""
    print("\n=== Seeding DynamoDB ===")
    total = 0
    for domain, events in ALL_EVENTS.items():
        count = 0
        for event in events:
            try:
                dynamodb_service.ingest_event(
                    domain=domain,
                    event_type=event["event_type"],
                    payload=event["payload"],
                    metadata={"source": "seed_data", "seeded": True},
                )
                count += 1
            except Exception as e:
                print(f"  [WARN] {domain}: {e}")
        total += count
        print(f"  ✓ {domain}: {count} events ingested")
    print(f"  Total: {total} events across 5 tables")


def seed_aurora_schemas():
    """Initialize all Aurora pgvector schemas."""
    print("\n=== Initializing Aurora Schemas ===")
    domains = ["press_distribution", "dating_platform", "music_streaming", "cinema_booking", "news_platform"]
    for domain in domains:
        try:
            aurora_service.initialize_schema(domain)
            print(f"  ✓ {domain}: schema created")
        except Exception as e:
            print(f"  [WARN] {domain}: {e}")


def seed_aurora_embeddings():
    """Generate and store embeddings for known patterns in Aurora pgvector."""
    print("\n=== Seeding Aurora pgvector Embeddings ===")
    total = 0
    for domain, patterns in ALL_KNOWN_PATTERNS.items():
        count = 0
        for pattern in patterns:
            try:
                # Generate embedding via Bedrock Titan
                embedding = bedrock_service.get_embedding(pattern["content"])
                aurora_service.store_embedding(
                    domain=domain,
                    record_id=pattern["id"],
                    embedding=embedding,
                    content=pattern["content"],
                    metadata={"type": pattern["type"], "seeded": True},
                )
                count += 1
                time.sleep(0.2)  # Rate limit for Bedrock
            except Exception as e:
                print(f"  [WARN] {domain}/{pattern['id']}: {e}")
        total += count
        print(f"  ✓ {domain}: {count} embeddings stored")
    print(f"  Total: {total} embeddings with Titan V2 vectors")


def seed_neptune_graph():
    """Seed Neptune Analytics with graph data for all domains."""
    print("\n=== Seeding Neptune Analytics Graph ===")

    # Ensure graph exists
    graph_id = neptune_service.graph_id
    if not graph_id:
        print("  Creating Neptune graph...")
        try:
            graph_id = neptune_service.create_graph("multidb-poc-graph")
            print(f"  ✓ Graph created: {graph_id}")
            print("  Waiting 60s for graph to become available...")
            time.sleep(60)
        except Exception as e:
            print(f"  [WARN] Graph creation: {e}")
            return

    domains = ["press_distribution", "dating_platform", "music_streaming", "cinema_booking", "news_platform"]
    for domain in domains:
        nodes, edges = get_neptune_graph_data(domain)
        try:
            neptune_service.seed_graph_data(domain, nodes, edges)
            print(f"  ✓ {domain}: {len(nodes)} nodes, {len(edges)} edges")
        except Exception as e:
            print(f"  [WARN] {domain}: {e}")


def seed_all():
    """Run full seed pipeline."""
    print("=" * 60)
    print("  Multi-DB AI POC - Seed Data Runner")
    print("=" * 60)
    start = time.time()

    seed_dynamodb()
    seed_aurora_schemas()
    seed_aurora_embeddings()
    seed_neptune_graph()

    elapsed = time.time() - start
    print(f"\n{'=' * 60}")
    print(f"  Seeding complete in {elapsed:.1f}s")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    seed_all()
