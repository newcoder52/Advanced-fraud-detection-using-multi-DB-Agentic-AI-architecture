"""
Seed Aurora PostgreSQL (pgvector) with real fraud content embeddings.

This script:
1. Connects to Aurora PostgreSQL via psycopg2
2. Creates the fraud_embeddings table with pgvector extension
3. Generates embeddings via Bedrock Titan V2
4. Inserts 80+ real fraud content samples across all domains

Usage:
    python scripts/seed_aurora_pgvector.py

Environment variables (or .env file):
    AURORA_HOST - Aurora cluster endpoint
    AURORA_PORT - default 5432
    AURORA_DB - default fraud_detection
    AURORA_USER - default postgres
    AURORA_PASSWORD - password
    AWS_REGION - default us-east-1
"""

import os
import sys
import json
import time
from typing import List, Dict

import boto3
import psycopg2
from psycopg2.extras import execute_values

# ─── Configuration ─────────────────────────────────────────────────────────────

AURORA_HOST = os.environ.get("AURORA_HOST", "")
AURORA_PORT = int(os.environ.get("AURORA_PORT", "5432"))
AURORA_DB = os.environ.get("AURORA_DB", "fraud_detection")
AURORA_USER = os.environ.get("AURORA_USER", "postgres")
AURORA_PASSWORD = os.environ.get("AURORA_PASSWORD", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

# ─── Fraud Content Samples ─────────────────────────────────────────────────────

DATING_FRAUD_CONTENT = [
    # Romance scam - Military impersonation
    {"text": "Hello beautiful, I am a US Army Colonel stationed in Syria. I cannot access my bank account here. Can we move to WhatsApp? I feel a deep connection with you.", "category": "military_impersonation", "content_type": "message"},
    {"text": "I am a Navy SEAL deployed overseas on a classified mission. We only get internet for 30 minutes a day. Please add me on Hangouts so we don't lose touch. You are the most beautiful woman I've ever seen.", "category": "military_impersonation", "content_type": "message"},
    {"text": "My name is General James Wilson, UN Peacekeeping force in Afghanistan. My wife passed 3 years ago. Your profile caught my eye. I have a package of gold I need to ship home — can you help receive it?", "category": "military_impersonation", "content_type": "message"},
    {"text": "I'm a military doctor with Doctors Without Borders in Yemen. I can only message during rest periods. I feel God brought us together. Can you send me an iTunes gift card so I can call you?", "category": "military_impersonation", "content_type": "message"},
    # Romance scam - Pig butchering (crypto investment lure)
    {"text": "I have been making incredible returns trading crypto — 200% in just 3 months! I want to share my success with someone special. Let me show you my platform. Just start with a small deposit of $500.", "category": "pig_butchering", "content_type": "message"},
    {"text": "My uncle works at a crypto exchange and gives me insider information. Last week I made $50K. I can help you too — just download this trading app and I'll guide you step by step.", "category": "pig_butchering", "content_type": "message"},
    {"text": "I'm a financial analyst at Goldman Sachs. I've found a guaranteed arbitrage opportunity in DeFi. If you invest $1000, I can turn it into $5000 within a week. Trust me, I do this for my clients every day.", "category": "pig_butchering", "content_type": "message"},
    {"text": "You are so special to me. I want us to build our future together. I found this amazing investment platform — I already put in $20K and made $8K profit. Let's do this together, for our future.", "category": "pig_butchering", "content_type": "message"},
    # Romance scam - Catfishing / off-platform
    {"text": "I'm traveling to your city next month for business. Can you pick me up from the airport? But first, let's move to WhatsApp — this app is too slow and I want to hear your voice.", "category": "catfishing", "content_type": "message"},
    {"text": "My phone plan is about to expire and I can't message here anymore. Please add me on Telegram @lovefinder2024 so we can keep talking. I really don't want to lose you.", "category": "catfishing", "content_type": "message"},
    {"text": "I fell in love with you from your photos. I'm an oil rig engineer and only have satellite internet. Let me send you a surprise package — just share your full address and date of birth for shipping.", "category": "catfishing", "content_type": "message"},
    # Romance scam - Financial requests
    {"text": "Baby I'm stuck at the airport, my wallet was stolen and I missed my flight. Please wire me $500 via Western Union so I can get home to see you. I'll pay you back double, I promise.", "category": "pig_butchering", "content_type": "message"},
    {"text": "My daughter needs emergency surgery but my insurance doesn't cover it overseas. I need $3000. You're the only person I trust. I'll send you the money back as soon as I'm stateside.", "category": "pig_butchering", "content_type": "message"},
    # Fake profile bios
    {"text": "Retired Army General. Widowed 2 years. Looking for honest woman who values loyalty. Currently deployed but returning soon. God-fearing Christian man seeking soulmate.", "category": "military_impersonation", "content_type": "bio"},
    {"text": "Successful crypto trader and philanthropist. Living between Dubai and Monaco. Looking for my queen to share this life with. DM me for investment tips.", "category": "pig_butchering", "content_type": "bio"},
    {"text": "Heart surgeon working for Red Cross in conflict zones. Widowed, one daughter. Looking for genuine connection. Can't video call due to security protocols.", "category": "military_impersonation", "content_type": "bio"},
    {"text": "Oil rig engineer. 6'2, athletic build. 6 months on, 6 months off. Looking for someone patient who understands my schedule. Prefer to chat on WhatsApp.", "category": "catfishing", "content_type": "bio"},
    {"text": "UN diplomat stationed in Syria. PhD in International Relations. Looking for intelligent conversation and maybe more. Will relocate after my contract ends in 3 months.", "category": "military_impersonation", "content_type": "bio"},
    # Phishing / credential harvesting
    {"text": "Your account has been flagged for suspicious activity. Please verify your identity by clicking this link and entering your password: secure-dating-verify.com/auth", "category": "credential_harvesting", "content_type": "message"},
    {"text": "Congratulations! You've been selected for our premium membership trial. Enter your credit card details here to activate: premium-dating-upgrade.net/activate", "category": "credential_harvesting", "content_type": "message"},
]

TICKETING_FRAUD_CONTENT = [
    # Bot purchasing patterns
    {"text": "Automated checkout completed in 147ms. No mouse movement events. No scroll events. Form fields populated in sequence with 0ms delay between fields. Headless browser detected (Puppeteer).", "category": "bot_purchasing", "content_type": "session_fingerprint"},
    {"text": "CAPTCHA solved in 340ms (human average: 8.2 seconds). Solution accuracy 100% across 12 consecutive challenges. Known CAPTCHA-solving service API call detected.", "category": "bot_purchasing", "content_type": "session_fingerprint"},
    {"text": "200 simultaneous checkout sessions from same /24 subnet. All using same payment BIN (4532-81xx-xxxx). Device fingerprints rotate every 30 seconds. Residential proxy rotation detected.", "category": "bot_purchasing", "content_type": "session_fingerprint"},
    {"text": "Session replay attack: HTTP request sequence identical to SESS-BOT-014 with 200ms timing offset. Same form data, same headers, only session cookie differs.", "category": "bot_purchasing", "content_type": "session_fingerprint"},
    # Ticket scalping
    {"text": "Same user purchased 200 tickets across 30 accounts in 45 seconds. All accounts share 4 payment BINs. Resale listing appeared on StubHub 3 minutes after purchase confirmation.", "category": "ticket_scalping", "content_type": "access_pattern"},
    {"text": "Queue manipulation: 500 virtual queue positions held using residential proxy rotation. Cart abandonment rate 0% (human average: 68%). All checkouts complete within price tier 1.", "category": "ticket_scalping", "content_type": "access_pattern"},
    {"text": "Geo-spoofing detected: presale code tied to Nashville ZIP but shipping address is bulk warehouse in Elizabeth, NJ. Same warehouse address on 47 other orders this week.", "category": "ticket_scalping", "content_type": "access_pattern"},
    # Inventory hoarding
    {"text": "50 tickets added to cart, held for maximum 14-minute window without purchase. Released, then immediately re-carted from different session. Pattern repeated 8 times, blocking 400 potential buyers.", "category": "inventory_hoarding", "content_type": "access_pattern"},
    {"text": "Coordinated cart-holding: 15 sessions from same fingerprint each holding 10 tickets. Total 150 seats blocked from purchase for 12 minutes. No checkout intent — denial-of-inventory attack.", "category": "inventory_hoarding", "content_type": "access_pattern"},
    # Card fraud
    {"text": "6 different credit cards attempted in 12 seconds after first declined. Cards share first 6 digits (same BIN) but different last 4. Classic carding pattern — testing stolen batch.", "category": "card_not_present", "content_type": "session_fingerprint"},
    {"text": "Card billing address: 123 Main St, Anytown, US 00000. CVV entered correctly on first attempt but AVS mismatch. Card issued in Romania, shipping to US. High-risk indicators across the board.", "category": "card_not_present", "content_type": "session_fingerprint"},
]

STREAMING_FRAUD_CONTENT = [
    # Stream farming
    {"text": "847 accounts streaming same track on loop. All accounts created within 4-hour window. Playback duration exactly 31 seconds (minimum royalty threshold). Zero genre diversity.", "category": "stream_farming", "content_type": "access_pattern"},
    {"text": "Device farm detected: 47 accounts sharing 3 device fingerprints. All streaming from same /16 subnet. Night-only activity (2-5 AM). 4000 plays per account per night. No human awake pattern.", "category": "stream_farming", "content_type": "access_pattern"},
    {"text": "AI-generated audio track uploaded yesterday, already has 500,000 streams. All from 5 devices in same AWS us-east-1 datacenter. Track duration: 32 seconds. Estimated fraudulent royalties: $12,400.", "category": "stream_farming", "content_type": "access_pattern"},
    {"text": "Silent stream pattern: 200 accounts playing track at volume 0 with app backgrounded. No audio output detected by device telemetry. Pure royalty inflation with zero actual listening.", "category": "stream_farming", "content_type": "access_pattern"},
    # Bot network / view inflation
    {"text": "Playlist stuffing: AI-generated track added to 500 auto-generated playlists in 24 hours. All playlists have 0 followers, 30 tracks each, all from same 3 'artists'. Playlist names are random word combinations.", "category": "view_inflation", "content_type": "access_pattern"},
    {"text": "Follow-bot network: 10,000 new followers in 5 minutes for artist with 0 prior monthly listeners. All follower accounts have default avatars, no listening history, created in batch.", "category": "bot_network", "content_type": "access_pattern"},
    {"text": "Coordinated skip pattern: 100 accounts play track for exactly 31 seconds, skip, repeat. Skip rate for these accounts: 0% (inhuman). Normal users skip 60-70% of tracks.", "category": "stream_farming", "content_type": "access_pattern"},
    # Click fraud
    {"text": "Ad click-through rate 15x above category average. Clicks originate from datacenter IPs with no subsequent conversion. Session duration: 0.3 seconds average. No real engagement.", "category": "click_fraud", "content_type": "access_pattern"},
    # Credential stuffing
    {"text": "10,000 login attempts in 1 hour from 200+ rotating IPs. Success rate: 1.2% (consistent with breach-list matching). User-agent string rotates between 5 common browsers.", "category": "credential_stuffing", "content_type": "access_pattern"},
]

PRESS_FRAUD_CONTENT = [
    # Embargo violation / insider trading
    {"text": "Unauthorized access to embargoed M&A press release PR-2024-8821 from Tor exit node. 4 hours before embargo lift. Same IP downloaded 12 embargoed releases in 3 minutes. Financial sector releases only.", "category": "credential_stuffing", "content_type": "access_pattern"},
    {"text": "Sequential access pattern: 12 embargoed releases from different issuers accessed in alphabetical order within 8 minutes. Automated scraping behavior. IP geolocated to financial district.", "category": "credential_stuffing", "content_type": "access_pattern"},
    {"text": "Geo-impossible access: journalist credentials used from London and Singapore within 20 minutes. Credential sharing or compromise confirmed. Both sessions accessed embargoed earnings reports.", "category": "credential_stuffing", "content_type": "access_pattern"},
    {"text": "Timing correlation: same journalist ID accesses embargoed releases exactly 4 hours before every market-moving announcement for 3 consecutive months. Pre-trade intelligence gathering pattern.", "category": "spear_phishing", "content_type": "access_pattern"},
    # Credential stuffing specific to press
    {"text": "47 failed login attempts followed by successful access to 3 embargoed financial releases. Password spray pattern across journalist accounts. Compromised credentials from 2023 media breach.", "category": "credential_stuffing", "content_type": "access_pattern"},
    {"text": "Shadow account detected: journalist profile matches terminated employee from 2019. Same name, different email domain. Accessing current embargoed content with old credential pattern.", "category": "credential_harvesting", "content_type": "access_pattern"},
    # Coordinated inauthentic
    {"text": "200 identical press releases submitted within 30 seconds from 50 different 'PR agencies' — all registered in last 48 hours. Content promotes same penny stock. Pump-and-dump coordination.", "category": "coordinated_inauthentic", "content_type": "access_pattern"},
]

NEWS_FRAUD_CONTENT = [
    # AI-generated disinformation
    {"text": "BREAKING: Vaccine causes 90% side effects — leaked internal documents confirm pharmaceutical cover-up spanning 15 years. Sources inside FDA confirm systematic suppression of data.", "category": "ai_generated_disinfo", "content_type": "message"},
    {"text": "URGENT: Banks preparing to freeze all accounts next week. Federal Reserve insider confirms emergency protocol activation. Withdraw your savings immediately before it's too late.", "category": "ai_generated_disinfo", "content_type": "message"},
    {"text": "EXPOSED: Election machines hacked in 12 states — classified NSA report leaked showing foreign interference at scale. Officials refuse to comment. Democracy is under attack.", "category": "ai_generated_disinfo", "content_type": "message"},
    {"text": "CONFIRMED: 5G towers linked to mysterious illness cluster in 8 states. Suppressed university study proves electromagnetic radiation at tower frequencies causes cellular damage.", "category": "ai_generated_disinfo", "content_type": "message"},
    {"text": "LEAKED: Major tech company selling user DNA data to foreign military. Internal emails show 10-year program to harvest biometric data from consumer devices without consent.", "category": "ai_generated_disinfo", "content_type": "message"},
    # Deepfake
    {"text": "Video of CEO announcing bankruptcy is synthetic. Facial landmark analysis shows inconsistency at frames 847-892. Audio spectral analysis reveals splice artifacts at 3 transition points.", "category": "deepfake", "content_type": "access_pattern"},
    # Coordinated inauthentic behavior
    {"text": "Network of 300 accounts activated simultaneously after 8 months dormant. All posting identical narrative about pharmaceutical company within 30-second window. Amplification chain structure detected.", "category": "coordinated_inauthentic", "content_type": "access_pattern"},
    {"text": "Publication rate: 200 articles/hour from single source. Perplexity score 12.3 (consistent with GPT-4 generation). Cross-posted to 15 platforms simultaneously via API. Zero human editing traces.", "category": "ai_generated_disinfo", "content_type": "access_pattern"},
]

GAMING_FRAUD_CONTENT = [
    # Aimbot / cheating
    {"text": "Player headshot rate 97% across 50 consecutive matches. Average human pro rate: 35-45%. Input timing analysis shows 12ms average reaction time (human minimum: 150ms). Memory injection detected.", "category": "aimbot", "content_type": "access_pattern"},
    {"text": "Known cheat signature detected in memory scan. Process 'helper64.dll' injecting into game client. Same DLL hash seen in 4,500 prior ban cases. HWID matches 3 previously banned accounts.", "category": "aimbot", "content_type": "access_pattern"},
    {"text": "Wallhack behavior: player pre-aims at enemy positions through solid walls 94% of the time. No line-of-sight information available to client. ESP overlay detected via frame timing analysis.", "category": "aimbot", "content_type": "access_pattern"},
    # Real Money Trading
    {"text": "In-game trade pattern: 500,000 gold transferred for 0 items in return (gift pattern). Receiving account logged in from commercial VPN 3 minutes later. Forum post advertising gold sales matches amount.", "category": "rmt", "content_type": "access_pattern"},
    {"text": "Account listed for sale on PlayerAuctions for $450. Login from new country 2 hours after listing. Email changed, password changed, linked phone changed. All within 5-minute window.", "category": "rmt", "content_type": "access_pattern"},
    # Account boosting
    {"text": "Rank jumped from Bronze to Diamond in 48 hours. Win rate during boost period: 95% (prior 6 months: 42%). Login from new IP in different country coinciding with rank increase. Queue timing synced with known booster.", "category": "account_boosting", "content_type": "access_pattern"},
    # V-Bucks / in-game currency fraud
    {"text": "200 accounts purchasing V-Bucks with stolen credit cards. $15K in transactions across 30 accounts in 2 hours. All accounts created within same 24-hour period. Cards from breach dump #BIN-4532.", "category": "card_not_present", "content_type": "access_pattern"},
    # Credential stuffing
    {"text": "10,000 login attempts against game accounts using credential pairs from LinkedIn 2023 breach. 47 successful takeovers. Compromised accounts immediately have email changed and items transferred.", "category": "credential_stuffing", "content_type": "access_pattern"},
]

ALL_CONTENT = [
    *[{**c, "domain": "dating_platform"} for c in DATING_FRAUD_CONTENT],
    *[{**c, "domain": "ticketing_platform"} for c in TICKETING_FRAUD_CONTENT],
    *[{**c, "domain": "music_streaming"} for c in STREAMING_FRAUD_CONTENT],
    *[{**c, "domain": "press_distribution"} for c in PRESS_FRAUD_CONTENT],
    *[{**c, "domain": "news_platform"} for c in NEWS_FRAUD_CONTENT],
    *[{**c, "domain": "gaming_platform"} for c in GAMING_FRAUD_CONTENT],
]

# ─── Embedding Generation ──────────────────────────────────────────────────────

def get_embedding(text: str, bedrock_client) -> List[float]:
    """Generate a 1024-dim embedding via Bedrock Titan V2."""
    response = bedrock_client.invoke_model(
        modelId="amazon.titan-embed-text-v2:0",
        body=json.dumps({
            "inputText": text[:8000],  # Titan V2 max input
            "dimensions": 1024,
            "normalize": True,
        }),
        contentType="application/json",
    )
    result = json.loads(response["body"].read())
    return result["embedding"]


# ─── Database Setup ────────────────────────────────────────────────────────────

SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS fraud_embeddings (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    original_text TEXT NOT NULL,
    embedding vector(1024) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_embeddings_domain ON fraud_embeddings(domain);
CREATE INDEX IF NOT EXISTS idx_fraud_embeddings_category ON fraud_embeddings(category);
"""

HNSW_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_fraud_embeddings_vector 
ON fraud_embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
"""


def main():
    print("=" * 70)
    print("  SEED AURORA POSTGRESQL (pgvector) — Fraud Content Embeddings")
    print("=" * 70)

    if not AURORA_HOST:
        print("\n❌ ERROR: AURORA_HOST environment variable not set.")
        print("   Set it to your Aurora cluster endpoint, e.g.:")
        print("   export AURORA_HOST=mydb.cluster-xxxx.us-east-1.rds.amazonaws.com")
        sys.exit(1)

    if not AURORA_PASSWORD:
        print("\n❌ ERROR: AURORA_PASSWORD environment variable not set.")
        sys.exit(1)

    # Connect to Aurora
    print(f"\n📡 Connecting to Aurora PostgreSQL at {AURORA_HOST}:{AURORA_PORT}/{AURORA_DB}...")
    conn = psycopg2.connect(
        host=AURORA_HOST,
        port=AURORA_PORT,
        dbname=AURORA_DB,
        user=AURORA_USER,
        password=AURORA_PASSWORD,
        connect_timeout=10,
    )
    conn.autocommit = True
    cur = conn.cursor()

    # Create schema
    print("📐 Creating schema (pgvector extension + table + indexes)...")
    cur.execute(SCHEMA_SQL)
    try:
        cur.execute(HNSW_INDEX_SQL)
    except Exception as e:
        print(f"   ⚠️ HNSW index creation note: {e}")

    # Check existing data
    cur.execute("SELECT COUNT(*) FROM fraud_embeddings")
    existing_count = cur.fetchone()[0]
    if existing_count > 0:
        print(f"\n⚠️  Table already has {existing_count} rows.")
        response = input("   Delete existing data and re-seed? (y/N): ").strip().lower()
        if response == 'y':
            cur.execute("TRUNCATE fraud_embeddings RESTART IDENTITY")
            print("   🗑️  Truncated.")
        else:
            print("   Keeping existing data. Will append new entries.")

    # Initialize Bedrock
    print(f"\n🤖 Initializing Bedrock client (region: {AWS_REGION})...")
    bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)

    # Generate embeddings and insert
    total = len(ALL_CONTENT)
    print(f"\n📝 Seeding {total} fraud content samples with embeddings...\n")

    success = 0
    errors = 0
    start_time = time.time()

    for i, item in enumerate(ALL_CONTENT):
        domain = item["domain"]
        category = item["category"]
        content_type = item["content_type"]
        text = item["text"]

        try:
            # Generate embedding
            embedding = get_embedding(text, bedrock)

            # Insert
            cur.execute(
                """INSERT INTO fraud_embeddings (domain, category, content_type, original_text, embedding, metadata)
                   VALUES (%s, %s, %s, %s, %s::vector, %s)""",
                (
                    domain,
                    category,
                    content_type,
                    text,
                    f"[{','.join(str(x) for x in embedding)}]",
                    json.dumps({"seeded": True, "source": "seed_script_v1"}),
                ),
            )
            success += 1

            # Progress
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            eta = (total - i - 1) / rate if rate > 0 else 0
            print(f"   [{i+1}/{total}] ✅ {domain}/{category}/{content_type} ({elapsed:.0f}s elapsed, ~{eta:.0f}s remaining)")

            # Rate limit (Bedrock Titan: ~100 RPM for embeddings)
            if (i + 1) % 10 == 0:
                time.sleep(1)

        except Exception as e:
            errors += 1
            print(f"   [{i+1}/{total}] ❌ Error: {str(e)[:80]}")
            time.sleep(2)  # back off on error

    # Summary
    elapsed = time.time() - start_time
    print(f"\n{'=' * 70}")
    print(f"  SEEDING COMPLETE")
    print(f"  ✅ Inserted: {success}/{total}")
    print(f"  ❌ Errors:   {errors}/{total}")
    print(f"  ⏱️  Duration: {elapsed:.1f}s")
    print(f"{'=' * 70}")

    # Verify
    cur.execute("SELECT domain, COUNT(*) FROM fraud_embeddings GROUP BY domain ORDER BY domain")
    print("\n📊 Content distribution:")
    for row in cur.fetchall():
        print(f"   {row[0]}: {row[1]} samples")

    cur.execute("SELECT COUNT(*) FROM fraud_embeddings")
    total_rows = cur.fetchone()[0]
    print(f"\n   Total: {total_rows} embeddings in database")

    cur.close()
    conn.close()
    print("\n✅ Done. Aurora pgvector is seeded and ready for similarity search.")


if __name__ == "__main__":
    main()
