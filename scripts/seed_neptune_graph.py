"""
Seed Neptune Analytics with fraud entity graph data.

This script:
1. Connects to Neptune Analytics via boto3 neptune-graph client
2. Creates entity nodes (accounts, devices, IPs, emails, phones)
3. Creates relationship edges (SHARES_DEVICE, SAME_IP, LINKED_TO, etc.)
4. Builds known fraud rings and clusters for graph traversal

Usage:
    python scripts/seed_neptune_graph.py

Environment variables:
    NEPTUNE_GRAPH_ID - Neptune Analytics graph identifier
    AWS_REGION - default us-east-1
"""

import os
import sys
import json
import time
from typing import List, Dict

import boto3

# ─── Configuration ─────────────────────────────────────────────────────────────

GRAPH_ID = os.environ.get("NEPTUNE_GRAPH_ID", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

# ─── Entity Definitions ────────────────────────────────────────────────────────

# Legitimate entities (known-good)
LEGIT_ACCOUNTS = [
    {"id": "ACCT-0001", "label": "account", "domain": "dating_platform", "status": "clean", "created_days_ago": 730, "activity_score": 0.1},
    {"id": "ACCT-0002", "label": "account", "domain": "dating_platform", "status": "clean", "created_days_ago": 450, "activity_score": 0.05},
    {"id": "ACCT-0003", "label": "account", "domain": "ticketing_platform", "status": "clean", "created_days_ago": 1200, "activity_score": 0.02},
    {"id": "ACCT-0004", "label": "account", "domain": "music_streaming", "status": "clean", "created_days_ago": 900, "activity_score": 0.08},
    {"id": "ACCT-0005", "label": "account", "domain": "gaming_platform", "status": "clean", "created_days_ago": 600, "activity_score": 0.15},
]

# Fraud accounts — romance scam ring
ROMANCE_SCAM_RING = [
    {"id": "USR-FAKE-001", "label": "account", "domain": "dating_platform", "status": "blocked", "created_days_ago": 2, "activity_score": 0.95},
    {"id": "USR-FAKE-004", "label": "account", "domain": "dating_platform", "status": "blocked", "created_days_ago": 1, "activity_score": 0.92},
    {"id": "USR-FAKE-007", "label": "account", "domain": "dating_platform", "status": "flagged", "created_days_ago": 3, "activity_score": 0.88},
    {"id": "USR-FAKE-010", "label": "account", "domain": "dating_platform", "status": "flagged", "created_days_ago": 1, "activity_score": 0.90},
    {"id": "USR-FAKE-013", "label": "account", "domain": "dating_platform", "status": "blocked", "created_days_ago": 4, "activity_score": 0.93},
    {"id": "USR-FAKE-016", "label": "account", "domain": "dating_platform", "status": "flagged", "created_days_ago": 2, "activity_score": 0.87},
]

# Fraud accounts — scalper bot ring
SCALPER_RING = [
    {"id": "SESS-BOT-001", "label": "account", "domain": "ticketing_platform", "status": "blocked", "created_days_ago": 0, "activity_score": 0.98},
    {"id": "SESS-BOT-005", "label": "account", "domain": "ticketing_platform", "status": "blocked", "created_days_ago": 0, "activity_score": 0.97},
    {"id": "SESS-BOT-009", "label": "account", "domain": "ticketing_platform", "status": "blocked", "created_days_ago": 1, "activity_score": 0.96},
    {"id": "SESS-BOT-014", "label": "account", "domain": "ticketing_platform", "status": "flagged", "created_days_ago": 0, "activity_score": 0.94},
    {"id": "SESS-BOT-022", "label": "account", "domain": "ticketing_platform", "status": "blocked", "created_days_ago": 1, "activity_score": 0.99},
]

# Fraud accounts — stream farming ring
STREAM_FARM_RING = [
    {"id": "BOT-FARM-001", "label": "account", "domain": "music_streaming", "status": "blocked", "created_days_ago": 2, "activity_score": 0.96},
    {"id": "BOT-FARM-015", "label": "account", "domain": "music_streaming", "status": "blocked", "created_days_ago": 1, "activity_score": 0.95},
    {"id": "BOT-FARM-023", "label": "account", "domain": "music_streaming", "status": "flagged", "created_days_ago": 3, "activity_score": 0.91},
    {"id": "BOT-FARM-038", "label": "account", "domain": "music_streaming", "status": "blocked", "created_days_ago": 1, "activity_score": 0.97},
    {"id": "BOT-FARM-042", "label": "account", "domain": "music_streaming", "status": "flagged", "created_days_ago": 2, "activity_score": 0.89},
]

# Fraud accounts — gaming cheaters
GAMING_FRAUD_RING = [
    {"id": "AIMBOT-001", "label": "account", "domain": "gaming_platform", "status": "blocked", "created_days_ago": 5, "activity_score": 0.94},
    {"id": "AIMBOT-005", "label": "account", "domain": "gaming_platform", "status": "blocked", "created_days_ago": 3, "activity_score": 0.96},
    {"id": "ACCT-FARM-03", "label": "account", "domain": "gaming_platform", "status": "flagged", "created_days_ago": 1, "activity_score": 0.88},
    {"id": "VBUCK-FRAUD-7", "label": "account", "domain": "gaming_platform", "status": "blocked", "created_days_ago": 2, "activity_score": 0.92},
    {"id": "HWID-SPOOF-22", "label": "account", "domain": "gaming_platform", "status": "blocked", "created_days_ago": 0, "activity_score": 0.99},
]

# Shared infrastructure (devices, IPs)
DEVICES = [
    {"id": "DEV-ROMANCE-01", "label": "device", "type": "mobile", "fingerprint": "android-samsung-a52"},
    {"id": "DEV-ROMANCE-02", "label": "device", "type": "mobile", "fingerprint": "iphone-se-clone"},
    {"id": "DEV-SCALPER-01", "label": "device", "type": "headless", "fingerprint": "puppeteer-chromium-118"},
    {"id": "DEV-SCALPER-02", "label": "device", "type": "headless", "fingerprint": "selenium-firefox-119"},
    {"id": "DEV-FARM-01", "label": "device", "type": "emulator", "fingerprint": "android-emulator-nox"},
    {"id": "DEV-FARM-02", "label": "device", "type": "emulator", "fingerprint": "android-emulator-bluestacks"},
    {"id": "DEV-FARM-03", "label": "device", "type": "vm", "fingerprint": "docker-alpine-linux"},
    {"id": "DEV-GAMING-01", "label": "device", "type": "desktop", "fingerprint": "hwid-spoof-amd-rx580"},
    {"id": "DEV-GAMING-02", "label": "device", "type": "desktop", "fingerprint": "hwid-spoof-nvidia-3060"},
]

IPS = [
    {"id": "IP-TOR-EXIT-1", "label": "ip", "type": "tor", "geo": "unknown", "risk": "high"},
    {"id": "IP-VPN-POOL-3", "label": "ip", "type": "vpn", "geo": "NL", "risk": "medium"},
    {"id": "IP-DATACENTER-7", "label": "ip", "type": "datacenter", "geo": "US-VA", "risk": "high"},
    {"id": "IP-RESIDENTIAL-PROXY", "label": "ip", "type": "residential_proxy", "geo": "US-NJ", "risk": "medium"},
    {"id": "IP-NIGERIAN-ISP", "label": "ip", "type": "isp", "geo": "NG", "risk": "high"},
    {"id": "IP-FARM-SUBNET", "label": "ip", "type": "datacenter", "geo": "US-OR", "risk": "high"},
]

PAYMENT_METHODS = [
    {"id": "PAY-BIN-4532", "label": "payment", "type": "credit_card", "bin": "4532-81xx", "risk": "high"},
    {"id": "PAY-BIN-5412", "label": "payment", "type": "credit_card", "bin": "5412-23xx", "risk": "medium"},
    {"id": "PAY-CRYPTO-WALLET-1", "label": "payment", "type": "crypto", "address": "0x7a3b...f912", "risk": "high"},
]

# ─── Relationships ─────────────────────────────────────────────────────────────

EDGES = [
    # Romance scam ring — shared devices and IPs
    {"from": "USR-FAKE-001", "to": "DEV-ROMANCE-01", "type": "USES_DEVICE"},
    {"from": "USR-FAKE-004", "to": "DEV-ROMANCE-01", "type": "USES_DEVICE"},
    {"from": "USR-FAKE-007", "to": "DEV-ROMANCE-01", "type": "USES_DEVICE"},
    {"from": "USR-FAKE-010", "to": "DEV-ROMANCE-02", "type": "USES_DEVICE"},
    {"from": "USR-FAKE-013", "to": "DEV-ROMANCE-02", "type": "USES_DEVICE"},
    {"from": "USR-FAKE-016", "to": "DEV-ROMANCE-02", "type": "USES_DEVICE"},
    {"from": "USR-FAKE-001", "to": "IP-NIGERIAN-ISP", "type": "CONNECTS_FROM"},
    {"from": "USR-FAKE-004", "to": "IP-NIGERIAN-ISP", "type": "CONNECTS_FROM"},
    {"from": "USR-FAKE-007", "to": "IP-VPN-POOL-3", "type": "CONNECTS_FROM"},
    {"from": "USR-FAKE-010", "to": "IP-NIGERIAN-ISP", "type": "CONNECTS_FROM"},
    {"from": "USR-FAKE-013", "to": "IP-VPN-POOL-3", "type": "CONNECTS_FROM"},
    {"from": "USR-FAKE-016", "to": "IP-TOR-EXIT-1", "type": "CONNECTS_FROM"},
    # Romance ring internal links
    {"from": "USR-FAKE-001", "to": "USR-FAKE-004", "type": "LINKED_TO"},
    {"from": "USR-FAKE-004", "to": "USR-FAKE-007", "type": "REFERRED_BY"},
    {"from": "USR-FAKE-010", "to": "USR-FAKE-013", "type": "LINKED_TO"},
    {"from": "USR-FAKE-013", "to": "USR-FAKE-016", "type": "REFERRED_BY"},
    {"from": "USR-FAKE-001", "to": "PAY-CRYPTO-WALLET-1", "type": "RECEIVES_TO"},
    {"from": "USR-FAKE-010", "to": "PAY-CRYPTO-WALLET-1", "type": "RECEIVES_TO"},

    # Scalper bot ring — shared devices and payment
    {"from": "SESS-BOT-001", "to": "DEV-SCALPER-01", "type": "USES_DEVICE"},
    {"from": "SESS-BOT-005", "to": "DEV-SCALPER-01", "type": "USES_DEVICE"},
    {"from": "SESS-BOT-009", "to": "DEV-SCALPER-02", "type": "USES_DEVICE"},
    {"from": "SESS-BOT-014", "to": "DEV-SCALPER-02", "type": "USES_DEVICE"},
    {"from": "SESS-BOT-022", "to": "DEV-SCALPER-01", "type": "USES_DEVICE"},
    {"from": "SESS-BOT-001", "to": "IP-DATACENTER-7", "type": "CONNECTS_FROM"},
    {"from": "SESS-BOT-005", "to": "IP-DATACENTER-7", "type": "CONNECTS_FROM"},
    {"from": "SESS-BOT-009", "to": "IP-RESIDENTIAL-PROXY", "type": "CONNECTS_FROM"},
    {"from": "SESS-BOT-014", "to": "IP-RESIDENTIAL-PROXY", "type": "CONNECTS_FROM"},
    {"from": "SESS-BOT-022", "to": "IP-DATACENTER-7", "type": "CONNECTS_FROM"},
    {"from": "SESS-BOT-001", "to": "PAY-BIN-4532", "type": "PAYS_WITH"},
    {"from": "SESS-BOT-005", "to": "PAY-BIN-4532", "type": "PAYS_WITH"},
    {"from": "SESS-BOT-009", "to": "PAY-BIN-4532", "type": "PAYS_WITH"},
    {"from": "SESS-BOT-014", "to": "PAY-BIN-5412", "type": "PAYS_WITH"},
    {"from": "SESS-BOT-022", "to": "PAY-BIN-4532", "type": "PAYS_WITH"},

    # Stream farm ring — shared devices
    {"from": "BOT-FARM-001", "to": "DEV-FARM-01", "type": "USES_DEVICE"},
    {"from": "BOT-FARM-015", "to": "DEV-FARM-01", "type": "USES_DEVICE"},
    {"from": "BOT-FARM-023", "to": "DEV-FARM-02", "type": "USES_DEVICE"},
    {"from": "BOT-FARM-038", "to": "DEV-FARM-02", "type": "USES_DEVICE"},
    {"from": "BOT-FARM-042", "to": "DEV-FARM-03", "type": "USES_DEVICE"},
    {"from": "BOT-FARM-001", "to": "IP-FARM-SUBNET", "type": "CONNECTS_FROM"},
    {"from": "BOT-FARM-015", "to": "IP-FARM-SUBNET", "type": "CONNECTS_FROM"},
    {"from": "BOT-FARM-023", "to": "IP-FARM-SUBNET", "type": "CONNECTS_FROM"},
    {"from": "BOT-FARM-038", "to": "IP-FARM-SUBNET", "type": "CONNECTS_FROM"},
    {"from": "BOT-FARM-042", "to": "IP-FARM-SUBNET", "type": "CONNECTS_FROM"},

    # Gaming fraud — shared HWID-spoofed devices
    {"from": "AIMBOT-001", "to": "DEV-GAMING-01", "type": "USES_DEVICE"},
    {"from": "AIMBOT-005", "to": "DEV-GAMING-01", "type": "USES_DEVICE"},
    {"from": "HWID-SPOOF-22", "to": "DEV-GAMING-01", "type": "USES_DEVICE"},
    {"from": "ACCT-FARM-03", "to": "DEV-GAMING-02", "type": "USES_DEVICE"},
    {"from": "VBUCK-FRAUD-7", "to": "DEV-GAMING-02", "type": "USES_DEVICE"},
    {"from": "VBUCK-FRAUD-7", "to": "PAY-BIN-4532", "type": "PAYS_WITH"},

    # Cross-ring connections (devices/IPs shared across fraud types)
    {"from": "USR-FAKE-001", "to": "BOT-FARM-001", "type": "LINKED_TO"},  # same operator
    {"from": "SESS-BOT-001", "to": "AIMBOT-001", "type": "SHARES_IP"},  # same infrastructure
]


# ─── Neptune Graph Operations ──────────────────────────────────────────────────

def create_vertex(client, graph_id: str, node: Dict) -> bool:
    """Create a vertex in Neptune Analytics."""
    properties = {k: v for k, v in node.items() if k not in ('id', 'label')}
    query = f"""
    MERGE (n:{node['label']} {{id: $id}})
    SET n += $props
    RETURN n.id
    """
    try:
        client.execute_query(
            graphIdentifier=graph_id,
            queryString=query,
            parameters={"id": node["id"], "props": properties},
            language="OPEN_CYPHER",
        )
        return True
    except Exception as e:
        print(f"   ❌ Vertex {node['id']}: {str(e)[:60]}")
        return False


def create_edge(client, graph_id: str, edge: Dict) -> bool:
    """Create an edge in Neptune Analytics."""
    query = f"""
    MATCH (a {{id: $from_id}}), (b {{id: $to_id}})
    MERGE (a)-[r:{edge['type']}]->(b)
    RETURN type(r)
    """
    try:
        client.execute_query(
            graphIdentifier=graph_id,
            queryString=query,
            parameters={"from_id": edge["from"], "to_id": edge["to"]},
            language="OPEN_CYPHER",
        )
        return True
    except Exception as e:
        print(f"   ❌ Edge {edge['from']}→{edge['to']}: {str(e)[:60]}")
        return False


def main():
    print("=" * 70)
    print("  SEED NEPTUNE ANALYTICS — Fraud Entity Graph")
    print("=" * 70)

    if not GRAPH_ID:
        print("\n❌ ERROR: NEPTUNE_GRAPH_ID environment variable not set.")
        print("   Find your graph ID in the Neptune Analytics console.")
        print("   export NEPTUNE_GRAPH_ID=g-xxxxxxxxxx")
        sys.exit(1)

    print(f"\n📡 Connecting to Neptune Analytics graph: {GRAPH_ID} ({AWS_REGION})...")
    client = boto3.client("neptune-graph", region_name=AWS_REGION)

    # Collect all nodes
    all_nodes = [
        *LEGIT_ACCOUNTS,
        *ROMANCE_SCAM_RING,
        *SCALPER_RING,
        *STREAM_FARM_RING,
        *GAMING_FRAUD_RING,
        *DEVICES,
        *IPS,
        *PAYMENT_METHODS,
    ]

    # Create vertices
    print(f"\n📝 Creating {len(all_nodes)} vertices...")
    v_success = 0
    for i, node in enumerate(all_nodes):
        if create_vertex(client, GRAPH_ID, node):
            v_success += 1
        if (i + 1) % 10 == 0:
            print(f"   [{i+1}/{len(all_nodes)}] vertices created")
            time.sleep(0.5)

    # Create edges
    print(f"\n🔗 Creating {len(EDGES)} edges...")
    e_success = 0
    for i, edge in enumerate(EDGES):
        if create_edge(client, GRAPH_ID, edge):
            e_success += 1
        if (i + 1) % 10 == 0:
            print(f"   [{i+1}/{len(EDGES)}] edges created")
            time.sleep(0.5)

    # Summary
    print(f"\n{'=' * 70}")
    print(f"  SEEDING COMPLETE")
    print(f"  ✅ Vertices: {v_success}/{len(all_nodes)}")
    print(f"  ✅ Edges:    {e_success}/{len(EDGES)}")
    print(f"{'=' * 70}")

    print("\n📊 Graph structure:")
    print(f"   • Fraud rings: 4 (romance, scalper, stream-farm, gaming)")
    print(f"   • Shared devices: {len(DEVICES)}")
    print(f"   • Shared IPs: {len(IPS)}")
    print(f"   • Payment methods: {len(PAYMENT_METHODS)}")
    print(f"   • Cross-ring links: 2 (same operator connections)")
    print(f"\n✅ Neptune Analytics is seeded and ready for graph traversal.")


if __name__ == "__main__":
    main()
