#!/bin/bash
set -e

API_URL="${API_URL:-https://87qsjnhxaf.execute-api.us-east-1.amazonaws.com/v1}"
echo "=== Multi-DB POC: Full Data Seeding ==="
echo "API: $API_URL"
echo ""

# Phase 1: Seed Neptune graph (fraud rings + entity relationships)
echo "--- Phase 1: Seeding Neptune Analytics graph ---"
echo "Seeding all 6 domains..."
RESULT=$(curl -s --max-time 120 -X POST "$API_URL/api/v1/admin/seed/neptune")
echo "$RESULT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f\"  Graph ID: {d.get('graph_id','?')}\")
for domain, info in d.get('results',{}).items():
    if 'error' in info:
        print(f\"  {domain}: ERROR - {info['error'][:60]}\")
    else:
        print(f\"  {domain}: {info.get('nodes',0)} nodes, {info.get('edges',0)} edges\")
"
echo ""

# Phase 2: Seed Aurora pgvector (known fraud pattern embeddings)
echo "--- Phase 2: Seeding Aurora pgvector (embeddings via Bedrock Titan) ---"
echo "This takes 30-60s (generating embeddings)..."
RESULT=$(curl -s --max-time 180 -X POST "$API_URL/api/v1/admin/seed/aurora")
echo "$RESULT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for domain, info in d.get('results',{}).items():
    if 'error' in info:
        print(f\"  {domain}: ERROR - {info['error'][:60]}\")
    else:
        print(f\"  {domain}: schema={info.get('schema','?')}, embeddings={info.get('embeddings',0)}/{info.get('total_patterns',0)}\")
"
echo ""

# Phase 3: Seed DynamoDB (event history for velocity computation)
echo "--- Phase 3: Seeding DynamoDB (event history) ---"
RESULT=$(curl -s --max-time 120 -X POST "$API_URL/api/v1/admin/seed/dynamodb")
echo "$RESULT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for domain, info in d.get('results',{}).items():
    if 'errors' in info and info['errors']:
        print(f\"  {domain}: {info.get('ingested',0)} ingested, errors: {info['errors'][0][:50]}\")
    else:
        print(f\"  {domain}: {info.get('ingested',0)}/{info.get('total',0)} events ingested\")
"
echo ""

# Phase 4: Warm the cache by running pipeline for key suspicious entities
echo "--- Phase 4: Warming ElastiCache (running pipeline for suspicious entities) ---"
ENTITIES=(
  "press_distribution|J-UNKNOWN-443|embargo_access|CONFIDENTIAL: Unauthorized access to embargoed M&A release. Bulk download 12 releases in 3 minutes via Tor exit node."
  "dating_platform|USR-FAKE-001|message_sent|Hello beautiful, I am a widowed military officer stationed overseas. I can only message during layovers. Give me your number so we can move to WhatsApp."
  "music_streaming|BOT-FARM-001|stream|Bot farm pattern detected: 661000 streams per day from single account, 0.3 second average duration, same device shared across 47 accounts."
  "cinema_booking|SESS-BOT-001|purchase_attempt|Scalper bot network: 200 simultaneous sessions within 30 seconds targeting same premium showing. All sessions share 5 device fingerprints."
  "news_platform|PM-BOT-001|content_published|BREAKING: Sources confirm leaked documents show massive cover-up. AI-generated misinformation amplification network detected across 50 accounts."
  "ticketing_platform|SCALP-TM-005|purchase_attempt|API abuse: SCALP-TM-005 hitting availability endpoint 200x/second to snipe released tickets for Oasis Reunion Tour."
)

for entry in "${ENTITIES[@]}"; do
  IFS='|' read -r domain entity event_type content <<< "$entry"
  echo -n "  $entity ($domain): "
  RESULT=$(curl -s --max-time 30 -X POST "$API_URL/api/v1/pipeline/execute" \
    -H "Content-Type: application/json" \
    -d "{\"domain\":\"$domain\",\"entity_id\":\"$entity\",\"event_type\":\"$event_type\",\"content\":\"$content\",\"skip_cache\":true}")
  SCORE=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); fs=d.get('final_score',{}); print(f\"{fs.get('decision','?')} ({fs.get('composite_score',0):.2f})\")" 2>/dev/null || echo "TIMEOUT")
  echo "$SCORE"
done

echo ""
echo "=== Seeding complete! ==="
echo "All services populated:"
echo "  - Neptune Analytics: entity graphs + fraud rings"
echo "  - Aurora pgvector: known fraud embeddings"  
echo "  - DynamoDB: event history"
echo "  - ElastiCache Valkey: pre-warmed entity scores"
echo ""
echo "Try the Live Stream at http://localhost:5173/live"
