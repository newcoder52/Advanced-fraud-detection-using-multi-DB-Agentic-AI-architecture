# Demo Script: Advanced Fraud Detection

## Setup (Before Demo)

```bash
docker-compose up -d    # Start local services
cd backend && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```

Open browser: `http://localhost:5173`

---

## Demo Flow (15 minutes)

### Part 1: "The Problem" (2 min)

> "Every platform has fraud. Let me show you what happens on a dating platform."

Switch domain selector to **Dating Platform**.

Show the Dashboard — point out:
- Events per minute
- Current threat level
- Active investigations

> "Right now, most platforms use rules: 'if account age < 1 day AND messages > 5, flag it.' That catches obvious bots. But sophisticated scammers? They slip through."

---

### Part 2: "Layer 1 — Real-Time Detection" (5 min)

Navigate to **Events** → Click "Ingest Event"

Paste this payload (fake profile creation):
```json
{
  "domain": "dating_platform",
  "event_type": "profile_created",
  "entity_id": "user_9847",
  "content": "Looking for a serious relationship. I love traveling, cooking, and long walks on the beach. Recently moved to your city and looking to meet new people.",
  "payload": {
    "user_id": "user_9847",
    "bio": "Looking for a serious relationship...",
    "photos": 3,
    "device_fingerprint": "fp_abc123",
    "ip_address": "45.33.94.12"
  },
  "metadata": {
    "device": "iPhone 15",
    "os": "iOS 17.4",
    "session_duration_ms": 47000
  }
}
```

> "Watch what happens. The event hits Kinesis, and the detection pipeline fires."

Navigate to **Live Stream** — show real-time processing:

> "Three databases are queried in parallel — each answering a different question:"

1. **ElastiCache**: "Have we seen user_9847 before?" → Cache MISS (new entity)
2. **pgvector**: "Does this bio match known scam templates?" → 94% match to template #12
3. **Neptune**: "Is this device connected to flagged accounts?" → Shared with 7 accounts

> "The composite score: 0.91 → BLOCK. Under 500ms. No human involved."

Navigate to **Scoring** — show the signal breakdown:
- Similarity score: 0.94
- Graph score: 0.72
- Velocity score: 0.15 (low — first event)
- Composite: 0.91

> "Key insight: ANY ONE signal alone might not trigger a block. It's the convergence of 3 signals that gives confidence."

---

### Part 3: "Layer 2 — AI Investigation" (5 min)

> "Now the system doesn't just block — it investigates."

Navigate to **Agent** page.

Type: "Investigate user_9847 — why was it blocked?"

Show the AI agent's response:
- Graph traversal executed (queries shown)
- Related entities found
- Pattern classification
- Historical correlation
- Recommended actions

> "The agent autonomously explored the fraud graph, found 23 connected accounts, identified this as part of a bot ring, and drafted an investigation brief — all without a human analyst."

Navigate to **Memory** page — show:
> "And now the system remembers. Next time it sees the same device fingerprint, same IP range, or same bio pattern — it catches it instantly."

---

### Part 4: "Why Multi-DB?" (3 min)

Navigate to **Architecture** page.

> "Why not just use one database? Or just call an LLM?"

Point to the comparison:
- **LLM-only**: 3-5 seconds, $0.03/call, no relationships, no memory
- **Multi-DB + AI**: <500ms, $0.001/call, 3-hop graph, persistent memory

> "Each database exists because it answers a question the others can't:
> - Graph traversal? SQL needs 3-5 seconds for 3-hop queries. Neptune: 150ms.
> - Semantic similarity? You can't 'SELECT * WHERE bio MEANS the same as a scam.' pgvector can.
> - Sub-ms caching? 90% of events are repeat entities. Valkey handles those without touching the pipeline."

---

### Part 5: "Customer Scenarios" (Demo variations)

Switch to **Ticketing Platform**:
```json
{
  "domain": "ticketing_platform",
  "event_type": "bulk_purchase",
  "entity_id": "buyer_3821",
  "content": "50 tickets purchased in 120 seconds",
  "payload": {
    "buyer_id": "buyer_3821",
    "ticket_count": 50,
    "time_window_seconds": 120,
    "payment_methods": 5,
    "shipping_addresses": 1
  },
  "metadata": {
    "mouse_movement": false,
    "avg_click_interval_ms": 87
  }
}
```

> "Scalper bot. Velocity alone would catch it, but Neptune shows this buyer shares payment cards with 4 other accounts. That's a ring."

---

## Key Talking Points

1. **"Why not just rules?"** — Rules catch yesterday's fraud. This catches tomorrow's.
2. **"Why not just one ML model?"** — ML sees individual transactions. Graph sees the network.
3. **"What's the AI layer for?"** — Detection says WHAT. Investigation says WHY and WHAT NEXT.
4. **"What about cost?"** — $583/mo for 1M events/day. Compare to $50K+/mo for a fraud team investigating manually.
5. **"Is this production-ready?"** — The AWS reference architectures (linked in README) use the same patterns at Mastercard, Delivery Hero, and payment processors.
