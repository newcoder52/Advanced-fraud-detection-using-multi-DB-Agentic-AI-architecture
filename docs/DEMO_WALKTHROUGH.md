# Multi-Database for AI POC — Complete Demo Walkthrough

This is a step-by-step walkthrough showing exactly how to use every feature of the POC application, with real examples and expected outputs.

---

## Step 0: Launch the Application

```bash
cd ~/DMS_local_converter/multi-db-poc/frontend
npm run dev
```

Open your browser to **http://localhost:5173**

You'll see the sidebar with:
- Customer domain selector (dropdown at top)
- Navigation links for all 7 pages
- Architecture tier indicators at the bottom

---

## Step 1: Dashboard Overview

**Click: Dashboard (first nav item)**

This is your command center. You'll see:

- **5 metric cards** across the top: Events Ingested, Detections, Rings Discovered, Avg Latency, Cache Hit Rate
- **Service Health panel**: Green dots for each working tier (DynamoDB, Aurora pgvector, Neptune Analytics, ElastiCache Valkey, Bedrock)
- **Architecture diagram**: The 4-tier pipeline visualization showing data flow from ingestion to scoring

**What to demonstrate**: "This dashboard gives us real-time visibility into all 4 database tiers. Everything is serverless — we pay only for what we use."

---

## Step 2: Event Ingestion — Submit a Suspicious Event

**Click: Events (sidebar)**

### Example: Submit a Romance Scam Message (Match Group)

1. **Set domain** to "Match Group" in the sidebar dropdown
2. Fill in the form fields:
   - `user_id`: `USR-SUSPICIOUS-100`
   - `recipient_id`: `USR-REAL-005`
   - `message_text`: `I am deployed overseas`
3. Click **"Ingest Event"**

**Expected response** (right panel):
```json
{
  "event_id": "a1b2c3d4-...",
  "domain": "match_group",
  "event_type": "message_sent",
  "timestamp": "2026-06-05T...",
  "status": "ingested"
}
```

4. Click **"Refresh"** in the Recent Events section to see your event in the table

**What to demonstrate**: "Every event is immediately captured in DynamoDB with sub-10ms latency. DynamoDB Streams then trigger the downstream analysis pipeline."

### Example: Submit an Embargo Access (Business Wire)

1. Change domain to **"Business Wire"**
2. Fill in:
   - `release_id`: `PR-2024-SECRET`
   - `journalist_id`: `J-UNAUTHORIZED-99`
   - `access_type`: `unauthorized_early_access`
   - `content`: `M&A announcement accessed before embargo lift`
3. Click **"Ingest Event"**

---

## Step 3: Semantic Analysis — Detect Similar Content

**Click: Semantic (sidebar)**

### Example: Detect a Romance Scam Script

1. Set domain to **"Match Group"**
2. In the textarea, paste:
   ```
   Hi sweetheart, I'm a US Army captain deployed overseas. Looking for someone real to share my life with when I return home. You caught my eye. Can we talk on WhatsApp?
   ```
3. Set **Similarity Threshold** to **0.6** (using the slider)
4. Click **"Run Similarity Search"**

**Expected results** (right panel):
```
SCAM-007    92.3%  ← Red highlight (near-identical to known scam)
SCAM-001    87.1%  ← Red highlight
SCAM-005    79.5%  ← Yellow highlight
```

**What to demonstrate**: "This message was never seen before, but pgvector finds it's 92% semantically identical to a known romance scam script. The 1024-dimensional embedding from Bedrock Titan V2 captures meaning, not just keywords."

### Example: Detect Misinformation (Particle Media)

1. Switch domain to **"Particle Media"**
2. Paste:
   ```
   SHOCKING: Government study confirms 5G towers emit radiation causing cancer in 85% of nearby residents. Exposed documents prove decade-long cover-up by telecom companies.
   ```
3. Set threshold to **0.5**
4. Click **"Run Similarity Search"**

**Expected**: Matches to known AI-generated misinformation patterns with 70-95% similarity scores.

### Example: Detect Bot Farm Activity (UMG)

1. Switch to **"Universal Music"**
2. Paste:
   ```
   Bot account streaming 500000 times daily with 2 second average listen time from a device shared with 30 other accounts streaming the same AI-generated tracks
   ```
3. Threshold: **0.5**
4. Click search

**Expected**: Matches to `BOT-PAT-001`, `BOT-PAT-003` with 60-100% scores.

---

## Step 4: Graph Intelligence — Map Criminal Networks

**Click: Graph (sidebar)**

### Example: Discover the Romance Scam Ring

1. Set domain to **"Match Group"**
2. Enter Entity ID: `USR-FAKE-001`
3. Algorithm: **Louvain** (community detection)
4. Max Depth: **3**
5. Click **"Run Graph Analysis"**

**Expected result**:
```json
{
  "entity_id": "USR-FAKE-001",
  "algorithm": "louvain",
  "results": [
    {"node_id": "USR-FAKE-001", "label": "User", "props": {"type": "scam", "device": "DEV-SHARED-0"}},
    {"node_id": "USR-FAKE-004", "label": "User", "props": {"type": "scam", "device": "DEV-SHARED-1"}},
    {"node_id": "USR-FAKE-007", "label": "User", "props": {"type": "scam", "device": "DEV-SHARED-1"}},
    {"node_id": "DEV-SHARED-0", "label": "Device", "props": {"type": "shared_device"}},
    {"node_id": "USR-REAL-003", "label": "User", "props": {"type": "legitimate", "name": "Amanda"}}
  ],
  "latency_ms": 98.5
}
```

**What to demonstrate**: "Neptune Analytics discovers that USR-FAKE-001 shares a device with multiple other fake accounts. This is a coordinated ring — 15 members sharing just 3 devices. A traditional database can't traverse these relationships in real-time."

### Example: Map the Embargo Leak Network

1. Switch to **"Business Wire"**
2. Entity ID: `J-UNKNOWN-443`
3. Algorithm: **Louvain**, Depth: **3**
4. Run

**Expected**: Shows J-UNKNOWN-443 connected to J-006 and J-007 via shared IP, all connected to multiple embargoed releases.

### Example: PageRank — Find the Ring Leader

1. Domain: **"Match Group"**
2. Entity ID: `USR-FAKE-001`
3. Algorithm: **PageRank**
4. Run

**Expected**: Nodes ranked by influence. The entity with the most connections (highest PageRank) is the likely ring coordinator.

---

## Step 5: Real-Time Scoring — Check Entity Risk

**Click: Scoring (sidebar)**

### Example: Look Up a Known Scammer's Score

1. Enter Entity ID: `USR-FAKE-001`
2. Click **"Get Score"**

**Expected** (if pipeline has been run for this entity):
```
Composite Score: 74
Decision: CHALLENGE (yellow/orange badge)

Components:
  Graph Score:      ████████████████████ 100%
  Similarity Score: ████████████████████ 100%
  Behavioral Score: ██████               30%
  Velocity Score:   ████                 20%

⚡ Cache Hit | 0.04ms
```

**What to demonstrate**: "The composite score combines signals from all 4 tiers. Graph and similarity are maxed out because this entity is in a known ring AND sent content matching known scam scripts. The decision matrix maps this 0.74 score to CHALLENGE — the platform should require identity verification."

### Example: Check a Clean Entity

1. Enter: `USR-REAL-001`
2. Click **"Get Score"**

**Expected**: "No cached score found. Run pipeline to generate score."

This shows that legitimate users who haven't triggered the pipeline have no risk score.

---

## Step 6: Full Pipeline Execution — The Main Event

**Click: Demo (sidebar)**

This is the most impressive demonstration. Each domain has a pre-loaded scenario.

### Walkthrough: Match Group — "The Romance Scam Ring"

1. Ensure domain is set to **"Match Group"**
2. Read the scenario card:
   > "Known scammer sends message → 100% similarity to known scripts → 15-member ring detected via shared devices → CHALLENGE/BLOCK"
3. Click **"▶️ Execute Full Pipeline"**
4. Watch stages appear one by one:

| Stage | Status | Latency | Result |
|-------|--------|---------|--------|
| Cache Check | MISS | 0ms | First time — no cached score |
| Ingest | SUCCESS | 8ms | Event stored in DynamoDB |
| Embedding | SUCCESS | 125ms | 1024-dim vector via Bedrock Titan V2 |
| Similarity Search | SUCCESS | 135ms | **1 match found, max score: 1.00** |
| Graph Analysis | SUCCESS | 100ms | **Graph score: 1.00** (part of large ring) |
| Scoring | SUCCESS | 0.04ms | **Composite: 0.74, Decision: CHALLENGE** |

5. Final results panel shows:
   - **370ms** total latency
   - **74** risk score
   - **CHALLENGE** decision (orange)

**What to demonstrate**: "In 370 milliseconds, across 4 purpose-built databases and an AI embedding model, we identified this as a known scam script, mapped the full criminal ring, and issued a CHALLENGE decision. Legacy databases can't do vector similarity AND graph traversal in a single sub-second pipeline."

---

### Walkthrough: Business Wire — "The Embargo Breach"

1. Switch domain to **"Business Wire"**
2. Click **"Execute Full Pipeline"**

**Expected stages:**
- Similarity: 100% match to known breach access patterns
- Graph: J-UNKNOWN-443 part of 3-node leak network
- Decision: **CHALLENGE** (0.74)

**Talking point**: "In the real Business Wire hack (2010-2015), it took years to detect 150,000 stolen press releases and charge 32 defendants. This system catches it in 377ms."

---

### Walkthrough: Universal Music — "The Stream Farm"

1. Switch to **"Universal Music"**
2. Execute pipeline

**Expected:**
- Similarity: 100% match to bot farm listening pattern
- Graph: BOT-FARM-001 in 47-account network
- Decision: **CHALLENGE** (0.63)

**Talking point**: "Michael Smith pled guilty in March 2026 to $8M in streaming fraud. Apple demonetized 2 billion fake streams. This catches the bot farm before a single fraudulent royalty is paid."

---

### Walkthrough: IMAX — "The Scalper Bot Network"

1. Switch to **"IMAX"**
2. Execute pipeline

**Expected:**
- Similarity: 100% match to bot behavioral patterns (85ms interaction speed vs 3000ms human average)
- Graph: 23-session coordinated network
- Decision: **FLAG** (0.55)

**Talking point**: "51% of web traffic is now automated. When premium IMAX tickets go on sale, 200 bot sessions hit in 30 seconds. pgvector catches the inhuman behavioral pattern, Neptune maps the device-sharing network."

---

### Walkthrough: Particle Media — "The Misinformation Campaign"

1. Switch to **"Particle Media"**
2. Execute pipeline

**Expected:**
- Similarity: 100% match to known AI-generated misinformation
- Graph: PM-BOT-001 in 50-account amplification network
- Decision: **CHALLENGE** (0.74)

**Talking point**: "40+ false AI-generated stories detected by Reuters, linked to fraudulent GoFundMe campaigns. The content embedding detects AI-generated text signatures. The graph reveals the coordinated amplification — 50 accounts all created the same week, all sharing the same content."

---

## Step 7: AI Investigator Briefing — Claude-Generated Report

**Click: Briefing (sidebar)**

### Example: Generate Briefing for Romance Scam Ring Leader

1. Enter Entity ID: `USR-FAKE-001`
2. Click **"Generate Briefing"**
3. Wait 3-5 seconds for Claude to generate

**Expected output** (full investigator-grade report):

**Title**: "Investigator Briefing: Romance Scam Ring Detection"

**Narrative** includes:
- Executive summary identifying USR-FAKE-001 as primary node in active scam ring
- Entity profile (classification, ring position, connected accounts)
- Operational context (methodology, target platform, attack vector)

**Evidence Chain** (4-event timeline):
1. Infrastructure Establishment — Shared device provisioned
2. Multi-Profile Deployment — Coordinated fake accounts created
3. Victim Engagement — Contact with legitimate user Amanda
4. Coordinated Messaging — Scripted outreach campaigns

**Risk Assessment**: Critical (0.94)

**Recommended Actions** (8 prioritized items):
1. Immediate account suspension (within 2 hours)
2. Victim notification (within 1 hour)
3. Device forensics (within 24 hours)
4. Law enforcement escalation (FBI IC3)
5. Ring expansion investigation
6. Messaging pattern analysis
7. Financial transaction tracing
8. Platform-wide detection rules

**What to demonstrate**: "Claude synthesizes evidence from all 4 tiers into a production-quality investigation report. An analyst who would spend hours writing this gets it in 5 seconds. The recommended actions are specific, prioritized, and assigned to teams."

### Example: Briefing for Embargo Breach

1. Entity ID: `J-UNKNOWN-443`
2. Domain should be set to **"Business Wire"**
3. Generate

**Expected**: Report about unauthorized journalist with evidence of accessing multiple embargoed M&A releases, connected to leak network via shared IP.

---

## Step 8: Advanced — Custom Scenarios

### Create Your Own Detection Scenario

You can test any content against the system:

1. Go to **Events** page
2. Set domain to Match Group
3. Enter a creative variation of a scam message:
   ```
   user_id: CUSTOM-TEST-001
   recipient_id: USR-REAL-002
   message_text: testing custom scam
   ```
4. Ingest the event
5. Go to **Semantic** page
6. Paste a new scam variation you wrote:
   ```
   Dear beautiful lady, I am a Navy SEAL currently serving in Afghanistan. 
   I saw your profile and felt an instant connection. My wife died 2 years ago 
   and I'm ready to love again. Please add me on Google Hangouts.
   ```
7. Set threshold to 0.6, search
8. **Expected**: 70-90% match to existing scam scripts (semantic similarity catches meaning variations even with different wording)

### Test a Legitimate Message (False Positive Check)

1. Go to **Semantic** (domain: Match Group)
2. Paste a normal dating message:
   ```
   Hey! I noticed we both like hiking and coffee. I work downtown as a designer. 
   Would you want to grab a drink sometime this week?
   ```
3. Threshold: 0.6
4. **Expected**: 0 matches (legitimate messages don't trigger the scam patterns)

**What to demonstrate**: "The system has high precision — it catches real threats without flagging normal user activity."

---

## Step 9: Using the API Directly (for Technical Audience)

### Full Pipeline via curl

```bash
# Romance scam detection
curl -X POST 'https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1/api/v1/pipeline/execute' \
  -H 'Content-Type: application/json' \
  -d '{
    "domain": "match_group",
    "event_type": "message_sent",
    "content": "Hello gorgeous, I am a petroleum engineer on an offshore rig. Looking for true love.",
    "payload": {"user_id": "TEST-001"},
    "entity_id": "USR-FAKE-001"
  }'
```

### Embedding generation

```bash
# See the raw 1024-dim vector
curl -X POST 'https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1/api/v1/analysis/semantic/embed' \
  -H 'Content-Type: application/json' \
  -d '{"text": "Any text you want to embed"}'
```

### Graph query

```bash
# Community detection
curl -X POST 'https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1/api/v1/analysis/graph/' \
  -H 'Content-Type: application/json' \
  -d '{"entity_id": "USR-FAKE-001", "algorithm": "louvain", "max_depth": 3}'
```

### Claude briefing

```bash
curl 'https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1/api/v1/briefing/USR-FAKE-001?domain=match_group'
```

---

## Key Talking Points Summary

| Point | Evidence |
|-------|----------|
| "Sub-400ms end-to-end detection" | Pipeline stages total 340-380ms warm |
| "4 purpose-built databases, one pipeline" | Each tier handles what it's best at |
| "AI-powered semantic understanding" | Bedrock Titan V2 catches meaning variations, not just keywords |
| "Graph intelligence finds hidden networks" | Neptune maps device/IP sharing rings invisible to flat queries |
| "One codebase, 5 customers" | Domain selector swaps everything — same infrastructure |
| "Serverless, pay-per-use" | DynamoDB on-demand, Aurora scales to 0.5 ACU, Lambda per-invocation |
| "Production investigation reports in seconds" | Claude generates analyst-grade briefings from evidence |

---

## Demo Timing Guide

| Section | Time | Priority |
|---------|------|----------|
| Dashboard overview | 1 min | Must |
| Demo Walkthrough (Match Group) | 3 min | Must |
| Demo Walkthrough (Business Wire) | 2 min | Must |
| Demo Walkthrough (1-2 more domains) | 3 min | Should |
| Semantic Analysis deep-dive | 2 min | Should |
| Claude Briefing generation | 2 min | Must (wow factor) |
| Graph Intelligence | 2 min | If time allows |
| API/Technical deep-dive | 3 min | For technical audience |
| **Total** | **~15 min** | |

---

## Quick Reference: Entity IDs for Each Demo

Copy-paste these entity IDs for each demo section:

```
Match Group:    USR-FAKE-001
Business Wire:  J-UNKNOWN-443
UMG:            BOT-FARM-001
IMAX:           SESS-BOT-001
Particle Media: PM-BOT-001
```
