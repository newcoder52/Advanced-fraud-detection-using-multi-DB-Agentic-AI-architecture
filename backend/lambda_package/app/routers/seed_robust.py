"""Robust seed endpoint that inserts embeddings directly with proper SQL."""

import time
import json
from fastapi import APIRouter

from app.services.bedrock import bedrock_service
from app.services.aurora_service import aurora_service

router = APIRouter()

# All known patterns to seed per domain with correct table/column mapping
SEED_DATA = {
    "dating_platform": {
        "table": "message_embeddings",
        "insert_sql": "INSERT INTO message_embeddings (message_id, sender_id, message_text, embedding, metadata) VALUES ('{id}', 'SCAM-RING', '{content_escaped}', '{emb}'::vector, '{{}}') ON CONFLICT DO NOTHING",
        "patterns": [
            {"id": "SCAM-001", "content": "Hello beautiful, I am a US military officer stationed overseas. I would love to get to know you better. Can we move to WhatsApp for more private conversation?"},
            {"id": "SCAM-002", "content": "I am a successful engineer working on an oil rig. My wife passed away last year and I am looking for true love again. You seem special."},
            {"id": "SCAM-003", "content": "I work for the United Nations in Syria. I have been deployed here for 6 months. Your profile caught my eye and I feel a deep connection already."},
            {"id": "SCAM-004", "content": "I am a widowed surgeon at Johns Hopkins. I have a teenage daughter. Looking for a mature woman who understands commitment and family values."},
            {"id": "SCAM-005", "content": "Hello dear, I am currently deployed with NATO forces. I cannot use regular phone but I am allowed limited internet. You are the most beautiful woman I have seen."},
            {"id": "SCAM-006", "content": "Good morning gorgeous, I am a petroleum engineer currently working on an offshore platform. Ive been single for 3 years after losing my wife to cancer."},
            {"id": "SCAM-007", "content": "Hi sweetheart, Im a US Army captain deployed overseas. Looking for someone real to share my life with when I return home. You caught my eye."},
            {"id": "SCAM-008", "content": "Hello angel, Im a military doctor serving abroad. Life is lonely here. Your smile in your photos brightened my day. Can we talk on WhatsApp or Hangouts?"},
        ],
    },
    "press_distribution": {
        "table": "content_embeddings",
        "insert_sql": "INSERT INTO content_embeddings (release_id, content_type, content_text, embedding, metadata) VALUES ('{id}', 'embargo_breach', '{content_escaped}', '{emb}'::vector, '{{}}') ON CONFLICT DO NOTHING",
        "patterns": [
            {"id": "BREACH-001", "content": "Unauthorized early access to embargoed M&A press release from unverified journalist IP. Multiple access attempts to MegaCorp acquisition announcement before embargo lift time."},
            {"id": "BREACH-002", "content": "Suspicious pattern: same IP address accessed 5 different embargoed financial releases within 2 hours. Known association with insider trading network."},
            {"id": "BREACH-003", "content": "Coordinated embargo breach detected. Three unverified accounts accessed Q4 earnings release 4 hours before scheduled publication from Eastern European IP range."},
            {"id": "BREACH-004", "content": "CONFIDENTIAL: MegaCorp to acquire TechStartup for 2.3 billion dollars. Deal expected to close Q4. This is embargoed information not for distribution."},
            {"id": "BREACH-005", "content": "Embargoed press release about FDA drug approval accessed by unauthorized journalist account. Access pattern matches known leaker network."},
        ],
    },
    "music_streaming": {
        "table": "listening_patterns",
        "insert_sql": "INSERT INTO listening_patterns (account_id, pattern_embedding, pattern_type, streams_per_day, metadata) VALUES ('{id}', '{emb}'::vector, 'bot_farm', 661000, '{{}}') ON CONFLICT DO NOTHING",
        "patterns": [
            {"id": "BOT-PAT-001", "content": "Account streaming over 50000 times per day with average listen duration under 5 seconds from shared device fingerprint. Identical listening pattern across 47 accounts."},
            {"id": "BOT-PAT-002", "content": "Multiple accounts streaming identical AI-generated tracks exclusively with zero playlist diversity. All accounts created within same 24-hour window using similar email patterns."},
            {"id": "BOT-PAT-003", "content": "Bot farm pattern detected: 661000 streams per day from single account, 0.3 second average duration, same device ID shared across 47 accounts in network."},
            {"id": "BOT-PAT-004", "content": "Artificial streaming manipulation: coordinated bot accounts exclusively streaming AI-generated music to inflate royalty payments. Revenue impact estimated at 10 million dollars."},
        ],
    },
    "cinema_booking": {
        "table": "session_behaviors",
        "insert_sql": "INSERT INTO session_behaviors (session_id, behavior_embedding, interaction_speed_ms, metadata) VALUES ('{id}', '{emb}'::vector, 85, '{{}}') ON CONFLICT DO NOTHING",
        "patterns": [
            {"id": "SCALP-001", "content": "Automated ticket purchase bot: interaction speed 85ms, impossible for human. Navigation directly to premium cinema showing checkout. Device fingerprint shared with 23 other sessions."},
            {"id": "SCALP-002", "content": "Scalper bot network detected: 200 simultaneous sessions within 30 seconds targeting same premium showing. All sessions share 5 device fingerprints and 3 payment BINs."},
            {"id": "SCALP-003", "content": "Coordinated bot purchase: superhuman checkout speed under 200ms, bulk quantity 8 tickets per session, automated CAPTCHA solving detected, device fingerprint reuse across network."},
        ],
    },
    "news_platform": {
        "table": "pm_content_embeddings",
        "insert_sql": "INSERT INTO pm_content_embeddings (content_id, author_id, content_text, embedding, is_ai_generated_score, metadata) VALUES ('{id}', 'BOT-NET', '{content_escaped}', '{emb}'::vector, 0.95, '{{}}') ON CONFLICT DO NOTHING",
        "patterns": [
            {"id": "MISINFO-001", "content": "AI-generated article with sensationalist health misinformation claiming vaccine causes severe side effects. Content signature matches GPT-generated text patterns. Linking to fraudulent GoFundMe."},
            {"id": "MISINFO-002", "content": "Coordinated amplification network of 50 bot accounts created within same week all sharing identical AI-generated misinformation content about pharmaceutical companies."},
            {"id": "MISINFO-003", "content": "BREAKING: Major pharmaceutical company admits vaccine causes severe side effects in 90 percent of recipients. Sources confirm internal documents leaked showing massive cover-up."},
            {"id": "MISINFO-004", "content": "AI-generated fake disaster relief article linking to fraudulent GoFundMe page. 50-account bot network amplifying across social platforms. Credibility score 0.12."},
        ],
    },
    "ticketing_platform": {
        "table": "content_embeddings",
        "insert_sql": "INSERT INTO content_embeddings (release_id, content_type, content_text, embedding, metadata) VALUES ('{id}', 'scalper_bot', '{content_escaped}', '{emb}'::vector, '{{}}') ON CONFLICT DO NOTHING",
        "patterns": [
            {"id": "TM-SCALP-001", "content": "Automated ticket purchase bot detected: interaction speed 45ms, impossible for human navigation. Direct API call pattern bypassing UI. Device fingerprint shared with 47 other sessions targeting same event."},
            {"id": "TM-SCALP-002", "content": "Scalper bot network: 500 simultaneous sessions within 15 seconds of ticket drop for Taylor Swift Eras Tour. All sessions share 8 device fingerprints and 4 payment BINs. Bulk purchase 6-10 tickets each."},
            {"id": "TM-SCALP-003", "content": "Coordinated bot attack on premium concert tickets: superhuman checkout speed under 100ms, automated CAPTCHA bypass detected, rotating proxy IPs from datacenter ranges, bulk quantity purchases exceeding per-customer limits."},
            {"id": "TM-SCALP-004", "content": "Ticket fraud ring: same payment card used across 30 sessions with different identities. All sessions exhibit bot-like behavior with sub-200ms interaction speeds and automated form filling patterns."},
            {"id": "TM-SCALP-005", "content": "High-velocity ticket hoarding: account created 2 minutes before ticket drop, immediately purchased maximum allowed tickets across 3 premium events. Device fingerprint linked to known scalper network."},
            {"id": "TM-SCALP-006", "content": "Bot network resale pattern: tickets purchased via automated sessions appearing on StubHub and Vivid Seats within 5 minutes at 400 percent markup. Same device cluster identified in 12 previous events."},
        ],
    },
}


@router.post("/seed-embeddings")
async def seed_all_embeddings():
    """Seed all domains with properly formatted embeddings."""
    results = {}
    total_start = time.time()

    for domain, config in SEED_DATA.items():
        count = 0
        errors = []
        for pattern in config["patterns"]:
            try:
                # Generate embedding via Bedrock
                embedding = bedrock_service.get_embedding(pattern["content"])
                emb_str = f"[{','.join(str(x) for x in embedding)}]"

                # Escape single quotes in content
                content_escaped = pattern["content"].replace("'", "''")

                # Build SQL
                sql = config["insert_sql"].format(
                    id=pattern["id"],
                    content_escaped=content_escaped,
                    emb=emb_str,
                )

                aurora_service.execute_sql(sql)
                count += 1
                time.sleep(0.15)  # Rate limit Bedrock
            except Exception as e:
                errors.append(f"{pattern['id']}: {str(e)[:100]}")
                if len(errors) > 3:
                    break

        results[domain] = {"seeded": count, "total": len(config["patterns"]), "errors": errors[:2]}

    return {
        "status": "done",
        "time_seconds": time.time() - total_start,
        "results": results,
    }


@router.get("/verify")
async def verify_embeddings():
    """Check row counts in all embedding tables."""
    tables = [
        ("content_embeddings", "press_distribution"),
        ("message_embeddings", "dating_platform"),
        ("listening_patterns", "music_streaming"),
        ("session_behaviors", "cinema_booking"),
        ("pm_content_embeddings", "news_platform"),
        ("content_embeddings", "ticketing_platform"),
    ]
    results = {}
    for table, domain in tables:
        try:
            if domain == "ticketing_platform":
                res = aurora_service.execute_sql(f"SELECT count(*) FROM {table} WHERE content_type = 'scalper_bot'")
            else:
                res = aurora_service.execute_sql(f"SELECT count(*) FROM {table}")
            count = res.get("records", [[{"longValue": 0}]])[0][0].get("longValue", 0)
            results[domain] = {"table": table, "rows": count}
        except Exception as e:
            results[domain] = {"table": table, "error": str(e)[:100]}
    return results
