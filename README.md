# Real-Time Threat Intelligence Platform
### Multi-DB Agentic AI Architecture for Trust & Safety

A two-layer threat intelligence system combining real-time multi-database scoring (<500ms) with AI-powered autonomous investigation. Built on AWS with Neptune Analytics, Aurora PostgreSQL (pgvector), ElastiCache Valkey, and Bedrock.

- **Layer 1 — Real-Time Detection**: Stop threats in <500ms using a cache-gate pattern with parallel database checks
- **Layer 2 — AI Intelligence**: Understand and investigate flagged events using semantic ontology, GNN, GraphRAG, and agentic investigation

---

## Architecture

![Pipeline Architecture](docs/architecture-diagram.png)

<details>
<summary>Architecture diagram (text version)</summary>

```
Event → Kinesis → Lambda → Valkey ─┬─ CACHE HIT → Composite Score → Decision
                                    │               (fast path ~5ms)      │
                                    │                                     ├→ ALLOW → S3 (archive all)
                                    └─ CACHE MISS ─┬─ Aurora pgvector ─┐  │
                                                   │  (similarity,15ms) ├→ Score → Decision
                                                   └─ Neptune ─────────┘  │
                                                      (graph, 25ms)       ├→ FLAG ──→ DynamoDB + Layer 2
                                                      [PARALLEL]          └→ BLOCK ─→ DynamoDB + Layer 2
                                                                                          │
┌─────────────────────────────────────────────────────────────────────────────────────────┘
│
▼  LAYER 2 (sequential, FLAG/BLOCK events only)
Flagged Event → Semantic Ontology → GNN Prediction → GraphRAG Evidence → Agentic Investigation → Brief
                (classify type)     (predict spread)  (retrieve evidence)  (synthesize narrative)
```

</details>

### Cache-Gate Pattern

Valkey is a **gate**, not a parallel lane:

| Path | When | Latency | What happens |
|------|------|---------|--------------|
| **Fast path** | Cache HIT (~85-95% after warmup) | ~5ms | Cached score returned immediately, skip all DB checks |
| **Slow path** | Cache MISS (cold start / TTL expiry) | ~45ms | Fan out to pgvector AND Neptune in parallel, merge at Composite Score |

After ~5 minutes of streaming, the entity pool saturates and the vast majority of events resolve in single-digit milliseconds.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.12, FastAPI, Mangum (Lambda adapter), boto3 |
| **Frontend** | TypeScript, React 18, Vite, Tailwind CSS, Canvas 2D |
| **Infrastructure** | AWS CDK (TypeScript) |
| **Databases** | ElastiCache Valkey, Aurora PostgreSQL + pgvector, Neptune Analytics, DynamoDB, S3 |
| **AI/ML** | Bedrock Titan Embeddings V2, Bedrock Claude, SageMaker GraphStorm |
| **Streaming** | Kinesis Data Streams, Kinesis Firehose |
| **Compute** | Lambda (orchestrator), API Gateway |

---

## Prerequisites

- Node.js 18+
- Python 3.12+
- AWS CLI v2 configured with appropriate credentials
- AWS CDK CLI (`npm install -g aws-cdk`)
- Docker (optional, for local development)

---

## Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:8000
```

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # configure database endpoints
uvicorn app.main:app --reload --port 8000
```

### Infrastructure (AWS)

```bash
cd infrastructure
npm install
cdk bootstrap          # first time only
cdk deploy --all       # deploys both stacks
```

---

## Project Structure

```
multi-db-poc/
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── LiveStream.tsx                 # Main demo — real-time event stream + all AI panels
│       │   ├── GraphNetworkViz.tsx            # Force-directed graph with ontology integration
│       │   ├── Architecture.tsx               # Animated two-layer pipeline diagram
│       │   ├── OntologyClassificationPanel.tsx # Fraud type classification (self-learning taxonomy)
│       │   ├── InvestigationBriefPanel.tsx    # BLOCK event investigation brief
│       │   ├── GNNPredictionOverlay.tsx       # GNN fraud propagation prediction
│       │   ├── GraphRAGEvidencePanel.tsx      # Graph-augmented evidence retrieval
│       │   ├── AILayerStatusBar.tsx           # Layer 2 activity indicator
│       │   ├── Dashboard.tsx                  # Summary metrics
│       │   ├── AgentMemory.tsx                # Agent investigation memory viewer
│       │   ├── AgentInvestigation.tsx         # Agentic investigation interface
│       │   ├── OntologyExplorer.tsx           # Interactive ontology browser
│       │   └── ...
│       ├── api.ts                             # Backend API client
│       ├── App.tsx                            # Router + layout
│       └── main.tsx                           # Entry point
├── backend/
│   └── app/
│       ├── main.py                            # FastAPI application
│       ├── routers/                           # API route handlers
│       ├── services/                          # Scoring, embedding, graph services
│       ├── db/                                # Database connection managers
│       ├── models.py                          # Pydantic models
│       ├── config.py                          # Environment configuration
│       ├── seed_data.py                       # Demo data seeding
│       └── lambda_handler.py                  # Mangum Lambda entry
├── infrastructure/
│   ├── lib/
│   │   ├── infrastructure-stack.ts            # Core infra (VPC, databases, networking)
│   │   └── fraud-detection-stack.ts           # Fraud-specific (Lambda, API GW, Kinesis)
│   └── bin/infrastructure.ts                  # CDK app entry point
├── docs/                                      # Documentation + generated guides
├── docker-compose.yml                         # Local dev (Redis, PostgreSQL)
├── deploy.sh                                  # Full-stack deployment script
├── update_lambda.sh                           # Backend-only redeployment
└── README.md
```

---

## Demo Guide

### Live Stream (Main Demo Page)

1. **Select a domain** from the dropdown (Dating Platform, Press Distribution, UMG Streaming, IMAX Ticketing, News Platform, Twitch, Ticketing, Epic Games)
2. **Press ▶️ Start** to begin the live event stream
3. **Watch the Graph Network** build in real-time:
   - Nodes appear with risk-colored fills (green/yellow/red/purple)
   - Edges pulse as relationships are discovered
   - Force simulation organizes the graph naturally
4. **Observe AI Layer activation** on FLAG/BLOCK events:
   - Ontology Classification panel shows fraud type + severity + indicators
   - GNN Prediction overlay shows propagation risk
   - Graph nodes get colored **ontology rings** (orange=financial, cyan=content, magenta=social eng, blue=platform abuse)
   - **Semantic edges** (dashed glowing lines) connect entities sharing the same fraud classification
   - **Floating labels** appear over same-classification clusters
5. **On BLOCK events** specifically:
   - **Investigation Brief** slides in with full analyst-ready report
   - **GraphRAG Evidence** panel shows retrieved case precedents
6. **Click any event** in the feed to see:
   - Full pipeline breakdown (sequential stages with latency)
   - "Why was this flagged?" explanation with signal sources
   - Entity profile with decision history

### Key Behaviors to Demo

| Behavior | What to point out |
|----------|------------------|
| **Cache warmup** | Early events show "Cache miss" stages. After ~30s, most show "Cache hit" with 2 stages instead of 8. |
| **Latency drop** | Average latency visibly drops as cache hit rate climbs to 85-95%. |
| **Ontology clustering** | Same-category nodes drift toward each other in the force simulation. |
| **Parallel investigation** | FLAG/BLOCK fires ontology + GNN + GraphRAG panels simultaneously. |
| **Progressive enrichment** | Each AI layer adds context — brief has everything. |

### Architecture Page

- Animated particle flow showing the two-layer pipeline
- **Click any node** for detailed description + latency + throughput
- Watch particles hit Valkey first:
  - Fast path (green, small, fast) → cache hit, skips databases
  - Slow path (splits into TWO particles) → pgvector + Neptune in parallel → merge at fusion
- Purple particles flow through Layer 2 when FLAG/BLOCK occurs
- Cache hit rate counter shows warmup progression in real-time

---

## Layer 2: AI Intelligence Pipeline

Sequential — each step's output feeds the next:

| Step | What it does | Output |
|------|-------------|--------|
| **Semantic Ontology** | Classifies fraud type from self-learning taxonomy (28+ categories) | Classification path, severity, indicators, recommended action |
| **GNN Prediction** | Graph Neural Network predicts fraud probability and propagation risk | Risk score, likely next targets, network spread estimate |
| **GraphRAG Evidence** | Graph-augmented retrieval over case history — follows multi-hop relationship paths | Similar cases, evidence chains, regulatory precedents |
| **Agentic Investigation** | Claude-powered autonomous investigator synthesizing all signals | Narrative report with timeline and confidence assessment |
| **Investigation Brief** | Final analyst-ready deliverable | Classification + evidence + actions + confidence score |

### Self-Learning Ontology

In production, the fraud taxonomy evolves automatically:

- **Neptune semantic ontology**: Bottom-up pattern discovery from graph data (community detection, label propagation)
- **GNN embedding clusters**: When dense clusters form far from known categories, new fraud types are proposed
- **Analyst feedback loops**: Human overrides converge → system proposes new taxonomy branches
- **Batch evolution jobs**: Weekly comparison of graph structure vs taxonomy coverage → merge/split/add suggestions

The demo uses a static pre-seeded taxonomy for illustration. Production would fetch the current taxonomy from an API that evolves over time.

---

## Ontology Classification Details

When a FLAG/BLOCK event fires, the ontology classifies it into one of 28 leaf categories across 4 top-level branches:

| Category | Color Ring | Examples |
|----------|-----------|----------|
| **Financial** | 🟠 Orange/Amber | Account Takeover, Credential Stuffing, Layering, Smurfing |
| **Content Manipulation** | 🔵 Cyan/Teal | Stream Farming, Click Fraud, Bot Network, Deepfake |
| **Social Engineering** | 🟣 Magenta/Pink | Pig Butchering, Catfishing, Spear Phishing |
| **Platform Abuse** | 🔷 Deep Blue | Ticket Scalping, Bot Purchasing, Aimbot, Real Money Trading |

Each classification includes:
- **Description**: What this fraud type is
- **Indicators**: 2-3 specific behavioral signals that triggered classification
- **Recommended Action**: What the platform should do
- **Severity**: Critical / High / Medium (based on victim harm potential)
- **Historical Rate**: Pattern match frequency from case database

---

## Environment Variables

### Backend (`backend/.env`)

```env
DYNAMODB_TABLE=fraud-events
NEPTUNE_ENDPOINT=your-neptune-cluster.region.neptune.amazonaws.com
AURORA_HOST=your-aurora-cluster.region.rds.amazonaws.com
AURORA_DB=fraud_detection
AURORA_USER=postgres
AURORA_PASSWORD=your-password
VALKEY_ENDPOINT=your-elasticache.region.cache.amazonaws.com
VALKEY_PORT=6379
BEDROCK_REGION=us-east-1
S3_BUCKET=fraud-events-archive
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=https://your-api-gateway-url.execute-api.region.amazonaws.com
```

---

## Deployment

### Full Stack

```bash
./deploy.sh    # builds backend, deploys CDK, uploads frontend
```

### Backend Only (Lambda update)

```bash
./update_lambda.sh
```

### Infrastructure Only

```bash
cd infrastructure
cdk deploy --all
```

### Frontend Only

```bash
cd frontend
npm run build
# upload dist/ to S3 + CloudFront invalidation
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/pipeline/execute` | Execute full detection pipeline for an event |
| GET | `/api/v1/ontology/concepts` | List all ontology concepts |
| POST | `/api/v1/ontology/discover` | Run ontology discovery on domain |
| GET | `/api/v1/ontology/navigate/{term}` | Semantic search in ontology |
| GET | `/api/v1/briefing/{entity_id}` | Generate investigation briefing |
| POST | `/api/v1/agent/investigate` | Trigger agentic investigation |
| GET | `/api/v1/agent/memory/{entity_id}` | Retrieve agent memory for entity |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Valkey as cache gate (not parallel lane) | Most entities are repeat visitors — cache hit skips expensive DB calls entirely |
| pgvector + Neptune in parallel on miss | Neither depends on the other's output; parallel cuts worst-case latency by ~40% |
| Composite score fusion (not voting) | Weighted signals with convergence amplification — multiple DBs agreeing = exponential confidence |
| Layer 2 sequential (not parallel) | Each step enriches context for the next — ontology informs GNN which informs GraphRAG |
| Canvas 2D for graph visualization | 60fps force simulation with 50+ nodes; DOM/SVG would be too slow |
| Module-level state in LiveStream | Persists across React navigation — stream doesn't restart when switching tabs |
| Static entity pool in demo | Small fixed pool ensures cache warmup is visible within minutes |

---

## Supported Domains

The system is domain-agnostic. Demo includes pre-built event generators for:

| Domain | Fraud Types Detected |
|--------|---------------------|
| Dating Platform | Romance scams, pig butchering, military impersonation, catfishing |
| Press Distribution | Embargo violation, insider trading signals, credential stuffing |
| UMG Streaming | Stream farming, bot networks, royalty fraud, artificial inflation |
| IMAX Ticketing | Ticket scalping, bot purchasing, inventory hoarding, CAPTCHA bypass |
| News Platform | AI-generated disinformation, coordinated inauthentic behavior |
| Twitch | Viewbotting, hate raids, donation fraud, follow-bot networks |
| Ticketing | Bulk scalping, queue manipulation, credit card fraud |
| Epic Games | Aimbot/cheating, account farming, V-Bucks fraud, RMT |

---

## Customer Scenarios

Detailed end-to-end examples showing how both layers work together:

### Dating Platform: Romance Scam Detection

```
Event: USR-FAKE-001 sent message to USR-0847
  ├── Message: "I am a US military officer stationed overseas. Can we move to WhatsApp?"
  ├── Account age: 2 hours
  ├── Profile: Single photo, no bio, location set to "deployed"
  └── Pattern: 14 messages sent to different users in 30 minutes

Layer 1 (real-time):
  ├── Valkey: Velocity spike → 14 messages in 30min (new account, no prior cache)
  ├── pgvector: Content embedding → 94% cosine similarity to known romance scam templates
  ├── Neptune: 3-hop traversal → USR-FAKE-001 shares device with 4 blocked accounts
  └── Decision: BLOCK (score: 0.92)

Layer 2 (investigation):
  ├── Ontology: "Social Engineering → Romance Scam → Military Impersonation" (confidence: 93%)
  │     Severity: CRITICAL
  │     Indicators: Claims deployment prevents video calls, off-platform request in first message,
  │                 military persona using stolen photos
  ├── GNN: Predicts 3 additional connected accounts likely compromised (propagation risk: HIGH)
  ├── GraphRAG: "Matches pattern from military romance scam ring Case #4821 (12 victims, $340K losses)"
  └── Agent Brief: "Military impersonation romance scam. Account created 2h ago, mass-messaging
                    pattern, content matches known scam scripts verbatim. Connected to 4 previously
                    blocked accounts via shared device. Recommend: immediate suspension, preserve
                    message history for law enforcement, notify matched users."
```

### Ticketing Platform: Scalper Bot Detection

```
Event: SESS-BOT-001 attempting 200 tickets for "Taylor Swift Eras Tour"
  ├── Checkout speed: 150ms (human average: 4.2 seconds)
  ├── Device fingerprint: HEADLESS-FP-3 (Puppeteer detected)
  ├── Payment: Same BIN (4532-XX) across 30 separate sessions
  └── Behavior: No mouse movement, no scroll events, direct form submission

Layer 1 (real-time):
  ├── Valkey: Entity seen 47 times in last 5 minutes → cached score: 0.89
  ├── (Cache HIT — skips pgvector and Neptune)
  └── Decision: BLOCK (cached composite: 0.89)

Layer 2 (investigation):
  ├── Ontology: "Platform Abuse → Scalping → Bot Purchasing" (confidence: 96%)
  │     Severity: MEDIUM
  │     Indicators: Form completion in <200ms, headless browser UA, session replay pattern
  ├── GNN: Connected to 150 simultaneous sessions sharing 4 payment BINs
  ├── GraphRAG: "Same fingerprint HEADLESS-FP-3 seen in Super Bowl LVIII scalping (Case #9012)"
  └── Agent Brief: "Automated scalper bot. 200 tickets in 150ms checkout. Puppeteer-based,
                    sharing payment BIN with 30 other sessions. Previously seen in Case #9012.
                    Recommend: cancel all orders from this BIN, ban fingerprint, implement
                    progressive delay on checkout, report to event organizer."
```

### Content/Streaming Platform: Artificial Engagement Detection

```
Event: Track "summer_vibes_remix" received 50,000 streams in 1 hour
  ├── Source: 847 unique accounts, all created in last 48 hours
  ├── Listening pattern: exact 31-second plays (minimum for royalty count)
  ├── Geographic cluster: 94% from same /16 IP subnet
  └── Content: AI-generated audio (spectral analysis flag)

Layer 1 (real-time):
  ├── Valkey: Velocity spike → 50,000 streams/hour (normal for this artist: 200/hour)
  ├── pgvector: Audio fingerprint → 87% similar to known AI-generated template
  ├── Neptune: 847 accounts share 3 devices, 2 IPs, created within same 4-hour window
  └── Decision: BLOCK (score: 0.95)

Layer 2 (investigation):
  ├── Ontology: "Content Manipulation → Artificial Engagement → Stream Farming" (confidence: 91%)
  │     Severity: HIGH
  │     Indicators: Streams from 100+ accounts on shared device fingerprint, playback
  │                 duration exactly at minimum royalty threshold (31s), zero genre diversity
  ├── GNN: Network of 847 accounts forms single connected component (isolation score: 0.98)
  ├── GraphRAG: "Matches pattern from K-pop streaming farm dismantled 2024-11 (Case #7832)"
  └── Agent Brief: "Coordinated stream farming operation. 847 bot accounts, 3 devices,
                    AI-generated content. Estimated fraudulent royalties: $12,400.
                    Recommend: void streams, suspend royalty payments, ban device cluster,
                    report to content integrity team."
```

### Press Distribution: Embargo Leak Detection

```
Event: J-UNKNOWN-443 accessed embargoed press release PR-2024-8821
  ├── Timing: 4 hours before embargo lift (scheduled 9:00 AM ET)
  ├── Access method: Tor exit node, no registered API key
  ├── Pattern: Same IP downloaded 12 embargoed releases in 3 minutes
  └── Context: PR-2024-8821 contains market-moving M&A announcement

Layer 1 (real-time):
  ├── Valkey: Entity unknown (MISS) → full pipeline
  ├── pgvector: Access pattern → 91% similar to 2023 insider trading case (pre-trade intelligence)
  ├── Neptune: IP subnet linked to 3 prior SEC referral investigations, 7 flagged entities
  └── Decision: BLOCK (score: 0.88)

Layer 2 (investigation):
  ├── Ontology: "Financial → Identity Fraud → Credential Stuffing" (confidence: 85%)
  │     Severity: CRITICAL
  │     Indicators: Login attempts from 200+ IPs in <1 hour, access to financial-sector
  │                 embargoes only, timing correlation with market movements
  ├── GNN: Access pattern predicts 3 additional embargoed releases likely targeted next
  ├── GraphRAG: "Same IP subnet appeared in SEC referral Case #2024-0891. Known insider
  │              trading network. Previous case resulted in $2.3M fine."
  └── Agent Brief: "Pre-embargo access to market-moving M&A release via Tor. Sequential
                    bulk download pattern targeting financial sector only. IP linked to
                    known insider trading network (SEC Case #2024-0891). Estimated market
                    impact if leaked: $400M+ in affected securities.
                    Recommend: revoke all access, notify SEC/FINRA, preserve access logs,
                    alert issuing company, trigger compliance hold on release."
```

---

## License

Proprietary. All rights reserved.
