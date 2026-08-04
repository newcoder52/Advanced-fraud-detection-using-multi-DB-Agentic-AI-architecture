# Multi-Database for AI: M&E Vertical POC — User Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Getting Started](#getting-started)
4. [Frontend UI Guide](#frontend-ui-guide)
5. [API Reference](#api-reference)
6. [Demo Scenarios](#demo-scenarios)
7. [MCP Integration](#mcp-integration)
8. [Infrastructure Management](#infrastructure-management)
9. [Customization](#customization)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This POC demonstrates a 4-tier multi-database architecture that powers AI-driven anomaly and fraud detection across 5 Media & Entertainment customers. A single reusable codebase adapts to each customer's domain by swapping data models and detection scenarios.

### Supported Customers

| Customer | Use Case | Detection Type |
|----------|----------|---------------|
| Business Wire | Embargo breach detection | Insider trading / information leakage |
| Match Group | Romance scam ring detection | Coordinated fake accounts |
| Universal Music Group | Stream farm detection | Bot-driven royalty fraud |
| IMAX | Scalper bot network detection | Automated ticket purchasing |
| Particle Media | Misinformation detection | AI-generated content amplification |

### Performance

- End-to-end pipeline: **<400ms** (warm)
- Bedrock embedding generation: ~125ms
- Aurora pgvector similarity search: ~135ms
- Neptune graph traversal: ~100ms
- Composite scoring: <1ms

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│  DynamoDB   │────▶│ Aurora pgvector   │────▶│ Neptune Analytics │────▶│ ElastiCache     │
│  (Tier 1)   │     │   (Tier 2)       │     │    (Tier 3)       │     │  Valkey (Tier 4)│
│             │     │                  │     │                   │     │                 │
│ Event       │     │ Semantic         │     │ Graph             │     │ Real-Time       │
│ Ingestion   │     │ Similarity       │     │ Intelligence      │     │ Scoring         │
└─────────────┘     └──────────────────┘     └───────────────────┘     └─────────────────┘
       │                     │                        │                        │
       │            Bedrock Titan V2           openCypher Queries        Composite Score
       │            1024-dim embeddings        Community Detection       Decision Matrix
       ▼                     ▼                        ▼                        ▼
   DynamoDB Streams    Cosine Similarity         Louvain/PageRank      ALLOW/FLAG/CHALLENGE/BLOCK
```

### AWS Services Used

| Service | Role | Configuration |
|---------|------|---------------|
| DynamoDB | Event storage | On-demand, 5 tables, streams enabled |
| Aurora PostgreSQL 16 | Vector similarity | Serverless v2 (2-8 ACU), pgvector extension |
| Neptune Analytics | Graph analysis | 32 m-NCUs, IAM-protected |
| ElastiCache Valkey | Score caching | Serverless (existing cluster) |
| Amazon Bedrock | AI embeddings + briefings | Titan V2 (embeddings), Claude Haiku 4.5 (briefings) |
| Lambda | Compute | 512MB API, 1024MB Pipeline |
| API Gateway | API frontend | Regional, IP-restricted |

---

## Getting Started

### Prerequisites

- AWS CLI configured with valid credentials
- Node.js 18+ and npm
- Python 3.9+
- Access to AWS account `723470608645`

### Quick Start

```bash
# 1. Start the frontend
cd ~/DMS_local_converter/multi-db-poc/frontend
npm install   # first time only
npm run dev
# Opens at http://localhost:5173

# 2. Verify API health
curl https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1/health
# Expected: {"status":"ok"}
```

### Environment Details

| Component | Endpoint |
|-----------|----------|
| API Gateway | `https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1` |
| Aurora Cluster | `multidbpocstack-auroracluster23d869c0-cm3wxycswcgl.cluster-chdlrmt08fn7.us-east-1.rds.amazonaws.com` |
| Neptune Graph | `g-01a1sdys47` (endpoint: `g-01a1sdys47.us-east-1.neptune-graph.amazonaws.com`) |
| ElastiCache | `test-new-lahvej.serverless.use1.cache.amazonaws.com:6379` |
| Region | us-east-1 |
| Account | 723470608645 |

---

## Frontend UI Guide

### Page 1: Dashboard

The home page shows real-time metrics and service health.

- **Metrics cards**: Events ingested, detections, rings discovered, average latency, cache hit rate
- **Service health**: Green/yellow/red indicators for each tier
- **Architecture diagram**: Visual representation of the 4-tier pipeline

**Usage**: Select a customer from the sidebar dropdown to filter metrics by domain.

### Page 2: Event Ingestion

Submit events and view recent activity.

- **Event form**: Fields adapt per customer domain (e.g., `release_id` for Business Wire, `user_id` for Match Group)
- **Response panel**: Shows the raw JSON response including assigned `event_id`
- **Recent events table**: Click "Refresh" to load latest events from DynamoDB

**Usage**: Fill in the domain-specific fields and click "Ingest Event". The event is stored in the corresponding DynamoDB table.

### Page 3: Semantic Analysis

Test vector similarity search powered by Aurora pgvector.

- **Content input**: Enter text to analyze (e.g., a scam message, press release content)
- **Threshold slider**: Adjust cosine similarity cutoff (0.0 - 1.0)
- **Results panel**: Shows matched records with cosine scores, color-coded by risk:
  - Red (>90%): Near-identical match to known pattern
  - Yellow (80-90%): Strong similarity
  - Green (<80%): Moderate match

**Usage**: Paste suspicious content, set threshold to 0.6-0.7, click "Run Similarity Search". Lower thresholds catch more variants but may produce false positives.

### Page 4: Graph Intelligence

Explore entity relationships via Neptune Analytics.

- **Entity ID input**: Enter an entity to investigate (e.g., `USR-FAKE-001`, `BOT-FARM-001`)
- **Algorithm selector**: Louvain (communities), PageRank (influence), WCC (connected components), Shortest Path
- **Depth slider**: How many hops to traverse (1-5)
- **Results panel**: Shows graph structure as JSON (nodes, edges, communities)

**Usage**: Enter a known entity ID, select Louvain algorithm, set depth to 3, click "Run Graph Analysis". The results show all entities in the same community/ring.

### Page 5: Real-Time Scoring

Look up cached composite scores.

- **Entity ID input**: Look up an entity's score
- **Score gauge**: Visual representation of composite risk (0-100)
- **Components breakdown**: Graph score, similarity score, behavioral score, velocity score
- **Decision indicator**: ALLOW / FLAG / CHALLENGE / BLOCK with color coding

**Usage**: After running a pipeline, look up the entity ID to see its cached score and decision breakdown.

### Page 6: Investigation Briefing

Generate AI-powered investigation reports via Claude (Bedrock).

- **Entity ID input**: The entity to investigate
- **Generated briefing**: Full narrative report including:
  - Executive summary
  - Entity profile
  - Evidence timeline
  - Risk assessment with justification
  - Prioritized recommended actions

**Usage**: Enter an entity ID that has been through the pipeline (e.g., `USR-FAKE-001`), click "Generate Briefing". Takes 3-5 seconds for Claude to generate.

### Page 7: Demo Walkthrough

One-click full pipeline execution with pre-loaded scenarios.

- **Scenario card**: Shows the pre-configured scenario for the selected customer
- **Execute button**: Runs the complete 4-tier pipeline
- **Stage results**: Animated display of each pipeline stage with status, latency, and result
- **Final verdict**: Total latency, risk score, and decision

**Usage**: Select a customer from the sidebar, navigate to Demo Walkthrough, click "Execute Full Pipeline". Each stage appears in sequence with its results.

---

## API Reference

Base URL: `https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1`

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/events/ingest` | Ingest a new event |
| GET | `/api/v1/events/{event_id}?domain=X` | Get event by ID |
| GET | `/api/v1/events/?domain=X&limit=50` | List recent events |

**Ingest Event Request:**
```json
{
  "domain": "match_group",
  "event_type": "message_sent",
  "payload": {
    "user_id": "USR-001",
    "recipient_id": "USR-002"
  },
  "metadata": {"source": "app"}
}
```

### Semantic Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/analysis/semantic/` | Run similarity search |
| POST | `/api/v1/analysis/semantic/embed` | Generate embedding only |

**Similarity Search Request:**
```json
{
  "domain": "match_group",
  "content": "Hello beautiful, I am a military officer...",
  "similarity_threshold": 0.6,
  "top_k": 10
}
```

### Graph Intelligence

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/analysis/graph/` | Run graph analysis |
| GET | `/api/v1/analysis/graph/{entity_id}/community` | Get community |
| GET | `/api/v1/analysis/graph/{entity_id}/neighbors` | Get neighbors |

**Graph Analysis Request:**
```json
{
  "entity_id": "USR-FAKE-001",
  "algorithm": "louvain",
  "max_depth": 3
}
```

### Scoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/scores/{entity_id}` | Get cached score |
| POST | `/api/v1/scores/{entity_id}` | Set/update score |
| DELETE | `/api/v1/scores/{entity_id}` | Flush cached score |

### Pipeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/pipeline/execute` | Execute full 4-tier pipeline |

**Pipeline Request:**
```json
{
  "domain": "match_group",
  "event_type": "message_sent",
  "content": "Text content for semantic analysis",
  "payload": {"user_id": "USR-001"},
  "entity_id": "USR-FAKE-001"
}
```

**Pipeline Response:**
```json
{
  "execution_id": "uuid",
  "domain": "match_group",
  "entity_id": "USR-FAKE-001",
  "status": "completed",
  "stages": [
    {"stage": "cache_check", "status": "miss", "latency_ms": 0.01},
    {"stage": "ingest", "status": "success", "latency_ms": 8.0},
    {"stage": "embedding", "status": "success", "latency_ms": 125.0},
    {"stage": "similarity_search", "status": "success", "latency_ms": 135.0},
    {"stage": "graph_analysis", "status": "success", "latency_ms": 100.0},
    {"stage": "scoring", "status": "success", "latency_ms": 0.04}
  ],
  "total_latency_ms": 370.0,
  "final_score": {
    "composite_score": 0.74,
    "decision": "CHALLENGE",
    "components": {
      "graph_score": 1.0,
      "similarity_score": 1.0,
      "behavioral_score": 0.3,
      "velocity_score": 0.2
    }
  }
}
```

### Briefing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/briefing/{entity_id}?domain=X` | Generate AI briefing |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/admin/seed/dynamodb` | Seed DynamoDB tables |
| POST | `/api/v1/admin/seed/aurora` | Seed Aurora embeddings |
| POST | `/api/v1/admin/seed/neptune` | Seed Neptune graph |
| POST | `/api/v1/admin/seed/all` | Seed all databases |
| POST | `/api/v1/admin/seed-embeddings` | Robust embedding seeder |
| GET | `/api/v1/admin/verify` | Verify embedding counts |
| GET | `/api/v1/admin/status` | Service status check |

---

## Demo Scenarios

### Pre-loaded Entity IDs for Each Domain

| Domain | Entity ID | What it demonstrates |
|--------|-----------|---------------------|
| match_group | `USR-FAKE-001` | Romance scammer in 15-member ring |
| business_wire | `J-UNKNOWN-443` | Unauthorized journalist in leak network |
| umg | `BOT-FARM-001` | Bot account in 47-account stream farm |
| imax | `SESS-BOT-001` | Scalper bot in 23-device network |
| particle_media | `PM-BOT-001` | Bot in 50-account amplification network |

### Expected Results per Scenario

| Domain | Similarity | Graph | Composite | Decision |
|--------|-----------|-------|-----------|----------|
| Match Group | 100% | 100% | 0.74 | CHALLENGE |
| Business Wire | 100% | 100% | 0.74 | CHALLENGE |
| UMG | 100% | 100% | 0.63 | CHALLENGE |
| IMAX | 100% | 100% | 0.55 | FLAG |
| Particle Media | 100% | 100% | 0.74 | CHALLENGE |

### Decision Matrix

| Score Range | Decision | Action |
|-------------|----------|--------|
| 0.0 - 0.3 | ALLOW | No action needed |
| 0.3 - 0.6 | FLAG | Review required |
| 0.6 - 0.8 | CHALLENGE | Identity verification required |
| 0.8 - 1.0 | BLOCK | Immediate block |

### Score Weights per Domain

| Domain | Graph | Similarity | Behavioral | Velocity |
|--------|-------|-----------|-----------|----------|
| Business Wire | 35% | 30% | 20% | 15% |
| Match Group | 30% | 35% | 20% | 15% |
| UMG | 25% | 25% | 30% | 20% |
| IMAX | 20% | 20% | 25% | 35% |
| Particle Media | 30% | 35% | 20% | 15% |

---

## MCP Integration

The Aurora PostgreSQL MCP Server is configured for interactive database access during development.

### Configuration

Located at: `~/DMS_local_converter/.kiro/settings/mcp.json`

```json
{
  "mcpServers": {
    "awslabs.postgres-mcp-server": {
      "command": "/Users/haliasgh/Library/Python/3.9/bin/uvx",
      "args": ["awslabs.postgres-mcp-server@latest", "--allow_write_query"],
      "env": {
        "AWS_PROFILE": "team_account",
        "AWS_REGION": "us-east-1",
        "FASTMCP_LOG_LEVEL": "ERROR"
      }
    }
  }
}
```

### Usage (in Kiro chat)

After reconnecting MCP servers (Command Palette → "MCP: Reconnect"):

```
"Connect to database named multidb_poc in Aurora PostgreSQL cluster 
multidbpocstack-auroracluster23d869c0-cm3wxycswcgl using rdsapi as 
connection method in us-east-1 region"
```

Then you can:
- "Show me all tables with row counts"
- "What scam scripts are stored in message_embeddings?"
- "Run a similarity search for romance scam content"
- "Create an HNSW index on the message_embeddings table"

---

## Infrastructure Management

### Deploying Changes

```bash
cd ~/DMS_local_converter/multi-db-poc

# Rebuild Lambda package
rm -rf backend/lambda_package/app
cp -r backend/app backend/lambda_package/app
cd backend/lambda_package
zip -qr /tmp/lambda-code.zip .

# Deploy code update
aws lambda update-function-code \
  --function-name multidb-poc-api \
  --zip-file fileb:///tmp/lambda-code.zip \
  --region us-east-1

# Or full CDK deploy (if infrastructure changes)
cd infrastructure
npx cdk deploy --require-approval never
```

### Re-seeding Data

```bash
# Seed all databases
curl -X POST https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1/api/v1/admin/seed/all

# Seed only embeddings (most common)
curl -X POST https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1/api/v1/admin/seed-embeddings

# Verify counts
curl https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1/api/v1/admin/verify
```

### Monitoring

```bash
# Check Lambda logs
aws logs tail /aws/lambda/multidb-poc-api --region us-east-1 --follow

# Check Aurora status
aws rds describe-db-clusters --db-cluster-identifier multidbpocstack-auroracluster23d869c0-cm3wxycswcgl \
  --region us-east-1 --query "DBClusters[0].Status"

# Check Neptune status
aws neptune-graph get-graph --graph-identifier g-01a1sdys47 --region us-east-1 --query "status"
```

### Cost Management

| Service | Approximate Cost | Notes |
|---------|-----------------|-------|
| Aurora Serverless v2 | ~$1.50/hr (2 ACU min) | Scales down when idle |
| Neptune Analytics | ~$0.30/hr (32 m-NCU) | Fixed provisioned |
| DynamoDB | ~$0.01/day | On-demand, minimal traffic |
| Lambda | ~$0.001/invocation | Pay per use |
| API Gateway | ~$0.001/request | Pay per use |
| Bedrock | ~$0.001/embedding, ~$0.01/briefing | Pay per token |

**Estimated demo environment: ~$45/day**

To reduce costs when not demoing:
```bash
# Scale Aurora to minimum
aws rds modify-db-cluster \
  --db-cluster-identifier multidbpocstack-auroracluster23d869c0-cm3wxycswcgl \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=4 \
  --apply-immediately --region us-east-1

# Or tear down entirely
cd ~/DMS_local_converter/multi-db-poc/infrastructure
npx cdk destroy
aws neptune-graph delete-graph --graph-identifier g-01a1sdys47 --region us-east-1 --skip-snapshot
```

---

## Customization

### Adding a New Customer Domain

1. **Define tables** in `backend/app/services/aurora_service.py` → `initialize_schema()`
2. **Add DynamoDB table** in `infrastructure/lib/infrastructure-stack.ts` → `tableNames` array
3. **Create seed data** in `backend/app/seed_data.py` → add to `ALL_EVENTS` and `ALL_KNOWN_PATTERNS`
4. **Define graph model** in `seed_data.py` → `get_neptune_graph_data()`
5. **Add scoring weights** in `backend/app/services/cache_service.py` → `SCORE_WEIGHTS`
6. **Update frontend** in `frontend/src/App.tsx` → `DOMAINS` array
7. **Add demo scenario** in `frontend/src/pages/DemoWalkthrough.tsx` → `SCENARIOS`

### Adjusting Detection Sensitivity

Edit `backend/app/services/cache_service.py`:

```python
# Decision thresholds
DECISION_MATRIX = {
    "ALLOW": (0.0, 0.3),
    "FLAG": (0.3, 0.6),
    "CHALLENGE": (0.6, 0.8),
    "BLOCK": (0.8, 1.0),
}
```

Lower the BLOCK threshold for more aggressive blocking, or raise FLAG threshold for fewer false positives.

### Adjusting Similarity Threshold

In `backend/app/routers/pipeline.py`, change:
```python
matches = aurora_service.similarity_search(domain, embedding, threshold=0.6, top_k=5)
```

Lower threshold = more matches (higher recall, lower precision).

---

## Troubleshooting

### API returns "Endpoint request timed out"

- **Cause**: API Gateway has a 29s hard limit. Cold starts on the first request per Lambda instance can be slow.
- **Fix**: Retry the request. Second call will be fast (warm Lambda). If persistent, check Aurora ACU scaling:
  ```bash
  aws rds modify-db-cluster --db-cluster-identifier multidbpocstack-auroracluster23d869c0-cm3wxycswcgl \
    --serverless-v2-scaling-configuration MinCapacity=2,MaxCapacity=8 \
    --apply-immediately --region us-east-1
  ```

### Similarity search returns 0 matches

- **Cause**: Embeddings not seeded, or threshold too high.
- **Fix**:
  ```bash
  curl -X POST https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1/api/v1/admin/seed-embeddings
  curl https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1/api/v1/admin/verify
  ```

### Neptune returns "Could not connect to endpoint"

- **Cause**: Neptune public connectivity disabled or graph not available.
- **Fix**:
  ```bash
  aws neptune-graph get-graph --graph-identifier g-01a1sdys47 --region us-east-1
  # If publicConnectivity is false:
  aws neptune-graph update-graph --graph-identifier g-01a1sdys47 --public-connectivity --region us-east-1
  ```

### Claude briefing fails

- **Cause**: Bedrock model access issue.
- **Fix**: Verify the model works:
  ```bash
  aws bedrock-runtime invoke-model \
    --model-id us.anthropic.claude-haiku-4-5-20251001-v1:0 \
    --region us-east-1 \
    --content-type application/json \
    --accept application/json \
    --cli-binary-format raw-in-base64-out \
    --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":50,"messages":[{"role":"user","content":"Hi"}]}' \
    /tmp/test.json && cat /tmp/test.json
  ```

### AWS credentials expired

- **Symptom**: "Unable to locate credentials" or 401 errors
- **Fix**: Run `mwinit` to refresh Isengard credentials

### Frontend can't reach API

- **Cause**: IP restriction on API Gateway. Your IP may have changed.
- **Fix**: Check current IP and update CDK stack:
  ```bash
  curl -s https://checkip.amazonaws.com
  # Update the IP in update_policy.py and run: python3 update_policy.py
  # Or update infrastructure/lib/infrastructure-stack.ts and redeploy
  ```

---

## Project Structure

```
multi-db-poc/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI application
│   │   ├── lambda_handler.py    # AWS Lambda entry point
│   │   ├── models.py            # Pydantic models
│   │   ├── config.py            # Configuration
│   │   ├── seed_data.py         # Demo data definitions
│   │   ├── seed_runner.py       # CLI seeder
│   │   ├── routers/
│   │   │   ├── events.py        # DynamoDB event endpoints
│   │   │   ├── semantic.py      # pgvector similarity endpoints
│   │   │   ├── graph.py         # Neptune graph endpoints
│   │   │   ├── scores.py        # ElastiCache scoring endpoints
│   │   │   ├── pipeline.py      # Full pipeline orchestration
│   │   │   ├── briefing.py      # Claude AI briefing endpoint
│   │   │   ├── dashboard.py     # Metrics endpoint
│   │   │   ├── admin.py         # Seeding/admin endpoints
│   │   │   └── seed_robust.py   # Robust embedding seeder
│   │   └── services/
│   │       ├── bedrock.py       # Titan V2 + Claude integration
│   │       ├── dynamodb_service.py  # DynamoDB operations
│   │       ├── aurora_service.py    # pgvector via RDS Data API
│   │       ├── neptune_service.py   # Neptune Analytics operations
│   │       └── cache_service.py     # ElastiCache Valkey scoring
│   ├── lambda_package/          # Deployable Lambda zip contents
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Main app with routing
│   │   ├── api.ts               # API client
│   │   └── pages/
│   │       ├── Dashboard.tsx
│   │       ├── EventIngestion.tsx
│   │       ├── SemanticAnalysis.tsx
│   │       ├── GraphIntelligence.tsx
│   │       ├── Scoring.tsx
│   │       ├── Briefing.tsx
│   │       └── DemoWalkthrough.tsx
│   └── package.json
├── infrastructure/
│   ├── lib/infrastructure-stack.ts  # CDK stack definition
│   └── bin/infrastructure.ts        # CDK app entry point
├── docs/
│   └── USER_GUIDE.md               # This file
├── DEMO_SCRIPT.md                   # Demo talking points
├── deploy.sh                        # Deployment script
├── docker-compose.yml               # Local dev environment
└── README.md
```
