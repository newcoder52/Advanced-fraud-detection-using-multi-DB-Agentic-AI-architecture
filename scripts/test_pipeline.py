"""
End-to-end pipeline test script.

Tests the deployed Lambda function with events from each domain,
verifying both Layer 1 (real-time detection) and Layer 2 (AI classification).

Usage:
    python scripts/test_pipeline.py

Environment:
    AWS_REGION - default us-east-1
    FUNCTION_NAME - default multidb-fraud-pipeline
"""

import boto3
import json
import time
import sys
import os
import base64

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
FUNCTION_NAME = os.environ.get("FUNCTION_NAME", "multidb-fraud-pipeline")

lambda_client = boto3.client("lambda", region_name=AWS_REGION)

# ─── API Gateway Event Wrapper ─────────────────────────────────────────────────

def make_api_gw_event(payload: dict) -> dict:
    """Wrap a pipeline payload in API Gateway format for Mangum."""
    return {
        "httpMethod": "POST",
        "path": "/api/v1/pipeline/execute",
        "headers": {"content-type": "application/json", "host": "lambda.local"},
        "body": json.dumps(payload),
        "isBase64Encoded": False,
        "requestContext": {"stage": "prod", "httpMethod": "POST", "path": "/api/v1/pipeline/execute"},
        "pathParameters": None,
        "queryStringParameters": None,
        "multiValueQueryStringParameters": None,
        "resource": "/api/v1/pipeline/execute",
    }


def invoke_pipeline(payload: dict) -> dict:
    """Invoke the Lambda with API GW format and parse the response."""
    api_event = make_api_gw_event(payload)

    response = lambda_client.invoke(
        FunctionName=FUNCTION_NAME,
        InvocationType="RequestResponse",
        LogType="Tail",
        Payload=json.dumps(api_event).encode(),
    )

    # Check for Lambda-level errors
    if response.get("FunctionError"):
        raw = response["Payload"].read().decode("utf-8")
        return {"error": f"Lambda error: {raw[:500]}", "status": "failed"}

    # Parse the API Gateway response envelope
    raw = response["Payload"].read().decode("utf-8")
    api_response = json.loads(raw)

    status_code = api_response.get("statusCode", 0)
    if status_code != 200:
        body_text = api_response.get("body", "")
        return {"error": f"HTTP {status_code}: {body_text[:300]}", "status": "failed"}

    # The actual pipeline result is JSON-encoded inside 'body'
    body = json.loads(api_response.get("body", "{}"))
    return body


# ─── Test Events (using unique entity IDs to avoid cache hits) ─────────────────

TEST_EVENTS = [
    {
        "name": "Dating - Romance Scam (Military + Crypto)",
        "expect_decision": "FLAG_OR_BLOCK",
        "expect_classification": "Social Engineering",
        "payload": {
            "event_type": "message_sent",
            "domain": "dating_platform",
            "entity_id": f"USR-TEST-{int(time.time())}-001",
            "content": "Hello beautiful, I am a US military officer stationed overseas in Syria. I cannot access my bank account here due to security protocols. Can we move to WhatsApp? I want to show you my crypto investment platform that has made me $50K this month. Just invest a small amount to start.",
            "payload": {
                "user_id": f"USR-TEST-{int(time.time())}-001",
                "recipient_id": "USR-VICTIM-001",
            },
            "skip_cache": True,
        }
    },
    {
        "name": "Ticketing - Bot Purchasing (Scalper)",
        "expect_decision": "FLAG_OR_BLOCK",
        "expect_classification": "Platform Abuse",
        "payload": {
            "event_type": "ticket_purchase",
            "domain": "ticketing_platform",
            "entity_id": f"USR-TEST-{int(time.time())}-002",
            "content": "200 ticket purchases in 45 seconds from automated session. No mouse movement, 147ms checkout speed. Headless browser detected (Puppeteer). Same payment BIN 4532-81xx across 30 sessions. Resale listing appeared on StubHub within 3 minutes of purchase.",
            "payload": {
                "session_id": f"USR-TEST-{int(time.time())}-002",
                "tickets_count": 200,
                "checkout_speed_ms": 147,
                "device_fingerprint": "puppeteer-chromium-118",
            },
            "skip_cache": True,
        }
    },
    {
        "name": "Streaming - Stream Farming (Bot Network)",
        "expect_decision": "FLAG_OR_BLOCK",
        "expect_classification": "Content Manipulation",
        "payload": {
            "event_type": "stream",
            "domain": "music_streaming",
            "entity_id": f"USR-TEST-{int(time.time())}-003",
            "content": "847 accounts streaming same track on loop. All accounts created within 4-hour window. Playback duration exactly 31 seconds (minimum royalty threshold). Zero genre diversity. All from same /16 subnet in AWS us-east-1 datacenter. Night-only activity 2-5 AM. Estimated fraudulent royalties: $12,400.",
            "payload": {
                "account_id": f"USR-TEST-{int(time.time())}-003",
                "track_id": "AI-TRK-TEST",
                "streams_per_day": 445000,
                "device_id": "EMULATOR-07",
            },
            "skip_cache": True,
        }
    },
    {
        "name": "Press - Embargo Breach (Insider Trading)",
        "expect_decision": "FLAG_OR_BLOCK",
        "expect_classification": "Financial",
        "payload": {
            "event_type": "embargo_access",
            "domain": "press_distribution",
            "entity_id": f"USR-TEST-{int(time.time())}-004",
            "content": "Unauthorized access to embargoed M&A press release from Tor exit node. 4 hours before embargo lift. Same IP downloaded 12 embargoed financial releases in 3 minutes. Sequential alphabetical access pattern. IP subnet linked to SEC referral Case #2024-0891. Known insider trading network.",
            "payload": {
                "journalist_id": f"USR-TEST-{int(time.time())}-004",
                "release_id": "PR-2024-8821",
                "access_type": "unauthorized_early_access",
            },
            "skip_cache": True,
        }
    },
    {
        "name": "News - AI Disinformation Campaign",
        "expect_decision": "FLAG_OR_BLOCK",
        "expect_classification": "Content Manipulation",
        "payload": {
            "event_type": "content_published",
            "domain": "news_platform",
            "entity_id": f"USR-TEST-{int(time.time())}-005",
            "content": "BREAKING: Leaked classified documents confirm massive government cover-up spanning 15 years. Sources inside confirm systematic suppression of safety data. Mainstream media won't tell you the truth. Share before this gets censored. Published from breaking-truth-news.com, 200 articles/hour from this source.",
            "payload": {
                "author_id": f"USR-TEST-{int(time.time())}-005",
                "content_id": "MISINFO-TEST",
                "source_url": "breaking-truth-news.com",
            },
            "skip_cache": True,
        }
    },
    {
        "name": "Gaming - Aimbot Cheating",
        "expect_decision": "FLAG_OR_BLOCK",
        "expect_classification": "Platform Abuse",
        "payload": {
            "event_type": "player_activity",
            "domain": "gaming_platform",
            "entity_id": f"USR-TEST-{int(time.time())}-006",
            "content": "Player headshot rate 97% across 50 consecutive matches. Average human pro rate: 35-45%. Input timing analysis shows 12ms average reaction time (human minimum: 150ms). Known cheat signature detected in memory scan. HWID matches 3 previously banned accounts.",
            "payload": {
                "player_id": f"USR-TEST-{int(time.time())}-006",
                "game": "Fortnite",
                "headshot_rate": 0.97,
                "matches": 50,
            },
            "skip_cache": True,
        }
    },
    {
        "name": "Dating - Legitimate Message (should ALLOW)",
        "expect_decision": "ALLOW",
        "expect_classification": None,
        "payload": {
            "event_type": "message_sent",
            "domain": "dating_platform",
            "entity_id": f"USR-TEST-{int(time.time())}-007",
            "content": "Hey! I saw you like hiking too. Have you tried the trail at Bear Mountain? I went last weekend and the views were incredible. Would you want to grab coffee this Saturday?",
            "payload": {
                "user_id": f"USR-TEST-{int(time.time())}-007",
                "recipient_id": "USR-NICE-PERSON",
            },
            "skip_cache": True,
        }
    },
]

# ─── Test Execution ────────────────────────────────────────────────────────────

def check_stage(stages: list, stage_name: str) -> dict:
    """Find a stage by name in the stages list."""
    for s in (stages or []):
        if s.get("stage") == stage_name:
            return s
    return {}


def main():
    print("=" * 75)
    print("  REAL-TIME THREAT INTELLIGENCE PLATFORM")
    print("  End-to-End Pipeline Test (Full Pipeline — Cache Miss)")
    print("=" * 75)
    print(f"\n  Target: Lambda {FUNCTION_NAME}")
    print(f"  Region: {AWS_REGION}")
    print(f"  Events: {len(TEST_EVENTS)} (unique entity IDs, skip_cache=True)")
    print()

    results = []
    total_start = time.time()

    for i, test in enumerate(TEST_EVENTS):
        print(f"─── Test {i+1}/{len(TEST_EVENTS)}: {test['name']} ───")
        start = time.time()

        try:
            response = invoke_pipeline(test["payload"])
            elapsed = (time.time() - start) * 1000

            if response.get("error") or response.get("status") == "failed":
                print(f"  ❌ FAILED: {response.get('error', 'Unknown error')[:200]}")
                results.append({"name": test["name"], "status": "FAILED", "error": response.get("error")})
                print()
                continue

            # Extract results
            decision = response.get("final_score", {}).get("decision", "UNKNOWN")
            score = response.get("final_score", {}).get("composite_score", 0)
            stages = response.get("stages", [])
            classification = response.get("classification")
            total_latency = response.get("total_latency_ms", elapsed)

            # Check Layer 1 stages
            cache_stage = check_stage(stages, "cache_check")
            ingest_stage = check_stage(stages, "ingest")
            ml_stage = check_stage(stages, "ml_model")
            embedding_stage = check_stage(stages, "embedding")
            similarity_stage = check_stage(stages, "similarity_search")
            graph_stage = check_stage(stages, "graph_analysis")
            scoring_stage = check_stage(stages, "scoring")
            ontology_stage = check_stage(stages, "ontology_classification")

            # Decision check
            expect = test["expect_decision"]
            if expect == "ALLOW":
                decision_ok = decision == "ALLOW"
            elif expect == "FLAG_OR_BLOCK":
                decision_ok = decision in ("FLAG", "CHALLENGE", "BLOCK")
            else:
                decision_ok = True

            # Classification check
            classification_ok = True
            classification_summary = "N/A"
            if test["expect_classification"] and classification:
                path = classification.get("path", [])
                classification_summary = " → ".join(path) if path else "None"
                classification_ok = any(test["expect_classification"].lower() in p.lower() for p in path)
            elif test["expect_classification"] and not classification:
                # No classification but expected one — might be ALLOW (which skips classification)
                if decision in ("FLAG", "CHALLENGE", "BLOCK"):
                    classification_ok = False
                    classification_summary = "MISSING (expected for FLAG/BLOCK)"
                else:
                    classification_summary = "N/A (ALLOW)"

            # Print results
            status_icon = "✅" if decision_ok else "⚠️"
            print(f"  {status_icon} Decision: {decision} (score: {score:.2f}) — {'CORRECT' if decision_ok else 'UNEXPECTED'}")
            print(f"  ⏱️  Latency: {total_latency:.0f}ms (invoke: {elapsed:.0f}ms)")
            print(f"  📊 Stages: {len(stages)} completed")

            # Layer 1 detail
            if cache_stage:
                print(f"     💾 Cache: {cache_stage.get('status', '?')} ({cache_stage.get('latency_ms', 0):.1f}ms) — {cache_stage.get('result_summary', '')[:60]}")
            if ingest_stage:
                print(f"     📥 Ingest: {ingest_stage.get('status', '?')} ({ingest_stage.get('latency_ms', 0):.1f}ms)")
            if ml_stage:
                print(f"     🤖 ML: {ml_stage.get('status', '?')} — {ml_stage.get('result_summary', '')[:60]}")
            if embedding_stage:
                print(f"     🧬 Embedding: {embedding_stage.get('status', '?')} ({embedding_stage.get('latency_ms', 0):.0f}ms)")
            if similarity_stage:
                print(f"     🧠 pgvector: {similarity_stage.get('status', '?')} — {similarity_stage.get('result_summary', '')[:60]}")
            if graph_stage:
                print(f"     🕸️  Neptune: {graph_stage.get('status', '?')} — {graph_stage.get('result_summary', '')[:60]}")
            if scoring_stage:
                print(f"     📊 Score: {scoring_stage.get('result_summary', '')[:60]}")

            # Layer 2 detail
            if ontology_stage:
                print(f"     🧬 Ontology: {ontology_stage.get('status', '?')} ({ontology_stage.get('latency_ms', 0):.0f}ms) — {ontology_stage.get('result_summary', '')[:70]}")
            if classification:
                cls_icon = "✅" if classification_ok else "⚠️"
                print(f"     {cls_icon} Classification: {classification_summary}")
                if classification.get("severity"):
                    conf = classification.get("confidence", 0)
                    conf_str = f"{conf:.0%}" if isinstance(conf, float) and conf <= 1 else f"{conf}%"
                    print(f"        Severity: {classification['severity']} | Confidence: {conf_str}")
                if classification.get("description"):
                    print(f"        Why: {classification['description'][:80]}")
                if classification.get("indicators"):
                    for ind in classification["indicators"][:2]:
                        print(f"        → {ind[:70]}")
                if classification.get("recommendedAction"):
                    print(f"        Action: {classification['recommendedAction'][:70]}")

            results.append({
                "name": test["name"],
                "status": "PASS" if decision_ok and classification_ok else "WARN",
                "decision": decision,
                "score": score,
                "latency_ms": total_latency,
                "classification": classification_summary,
                "stages_count": len(stages),
                "cache_status": cache_stage.get("status"),
                "has_classification": classification is not None and classification.get("status") == "classified",
            })

        except Exception as e:
            elapsed = (time.time() - start) * 1000
            print(f"  ❌ ERROR: {str(e)[:200]}")
            import traceback
            traceback.print_exc()
            results.append({"name": test["name"], "status": "ERROR", "error": str(e)[:100]})

        print()
        time.sleep(1)  # Brief pause between tests

    # ─── Summary ───────────────────────────────────────────────────────────────
    total_elapsed = time.time() - total_start
    passed = sum(1 for r in results if r.get("status") == "PASS")
    warned = sum(1 for r in results if r.get("status") == "WARN")
    failed = sum(1 for r in results if r.get("status") in ("FAILED", "ERROR"))

    print("=" * 75)
    print("  TEST SUMMARY")
    print("=" * 75)
    print(f"\n  Total:  {len(results)} tests in {total_elapsed:.1f}s")
    print(f"  ✅ Pass:  {passed}")
    print(f"  ⚠️  Warn:  {warned}")
    print(f"  ❌ Fail:  {failed}")

    # Service health
    print(f"\n  {'─' * 55}")
    print("  SERVICE HEALTH:")

    has_cache_miss = any(r.get("cache_status") == "miss" for r in results)
    has_cache_hit = any(r.get("cache_status") == "hit" for r in results)
    has_classification = any(r.get("has_classification") for r in results)
    latencies = [r.get("latency_ms", 0) for r in results if r.get("latency_ms")]
    avg_latency = sum(latencies) / len(latencies) if latencies else 0

    services = [
        ("ElastiCache Valkey", f"✅ {'HIT' if has_cache_hit else 'MISS'} responses seen" if (has_cache_hit or has_cache_miss) else "❌ No cache stage"),
        ("DynamoDB Ingest", "✅ Events ingested" if any(r.get("stages_count", 0) >= 2 for r in results) else "⚠️  Check connection"),
        ("Bedrock Embeddings", "✅ Embeddings generated" if any(r.get("stages_count", 0) >= 5 for r in results) else "⚠️  Check Bedrock access"),
        ("Aurora pgvector", "✅ Similarity search ran" if any(r.get("stages_count", 0) >= 6 for r in results) else "⚠️  Check Aurora connection"),
        ("Neptune Analytics", "✅ Graph traversal ran" if any(r.get("stages_count", 0) >= 7 for r in results) else "⚠️  Check Neptune config"),
        ("Bedrock Claude (L2)", f"✅ {sum(1 for r in results if r.get('has_classification'))} classifications" if has_classification else "❌ No classifications returned"),
        ("Avg Latency", f"{'✅' if avg_latency < 2000 else '⚠️'} {avg_latency:.0f}ms"),
    ]
    for name, status in services:
        print(f"     {name:.<28} {status}")

    # Decision table
    print(f"\n  {'─' * 55}")
    print("  RESULTS:")
    print(f"  {'Test':<45} {'Decision':<10} {'Classification'}")
    print(f"  {'─'*45} {'─'*10} {'─'*30}")
    for r in results:
        icon = {"PASS": "✅", "WARN": "⚠️", "FAILED": "❌", "ERROR": "❌"}.get(r.get("status", ""), "?")
        decision = r.get("decision", "N/A")
        cls = r.get("classification", "N/A")
        name = r["name"][:43]
        print(f"  {icon} {name:<43} {decision:<10} {cls[:30]}")

    print(f"\n{'=' * 75}")

    if failed > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
