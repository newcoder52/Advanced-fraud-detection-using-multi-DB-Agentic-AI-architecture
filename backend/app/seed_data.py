"""Seed data generator for all 5 customer domains.
Run after infrastructure is deployed to populate DynamoDB, Aurora pgvector, and Neptune.
"""

import json
import uuid
import random
import time
from datetime import datetime, timezone, timedelta

# ============================================================
# PRESS DISTRIBUTION - Embargo Breach Detection
# ============================================================

PRESS_DISTRIBUTION_RELEASES = [
    {"release_id": "PR-2024-0001", "company": "MegaCorp", "title": "Q4 Earnings Beat Expectations", "embargo_until": "2024-03-15T09:00:00Z", "type": "earnings"},
    {"release_id": "PR-2024-0002", "company": "TechStartup", "title": "Series D Funding $500M", "embargo_until": "2024-03-18T14:00:00Z", "type": "funding"},
    {"release_id": "PR-2024-0003", "company": "PharmaCo", "title": "FDA Approval for New Drug", "embargo_until": "2024-03-20T06:00:00Z", "type": "regulatory"},
    {"release_id": "PR-2024-0004", "company": "MegaCorp", "title": "Acquisition of TechStartup for $2.3B", "embargo_until": "2024-04-01T09:00:00Z", "type": "m_and_a"},
    {"release_id": "PR-2024-0005", "company": "EnergyGlobal", "title": "Quarterly Revenue Miss", "embargo_until": "2024-04-05T09:00:00Z", "type": "earnings"},
    {"release_id": "PR-2024-0006", "company": "RetailKing", "title": "Store Closure Announcement", "embargo_until": "2024-04-10T12:00:00Z", "type": "operations"},
    {"release_id": "PR-2024-0007", "company": "AutoDrive", "title": "Partnership with ChipMaker", "embargo_until": "2024-04-12T08:00:00Z", "type": "partnership"},
    {"release_id": "PR-2024-0008", "company": "CloudNine", "title": "IPO Filing S-1", "embargo_until": "2024-04-15T16:00:00Z", "type": "ipo"},
]

PRESS_DISTRIBUTION_JOURNALISTS = [
    {"journalist_id": "J-001", "name": "Sarah Chen", "organization": "Wall Street Journal", "clearance": "tier_1"},
    {"journalist_id": "J-002", "name": "Mike Rodriguez", "organization": "Bloomberg", "clearance": "tier_1"},
    {"journalist_id": "J-003", "name": "Emily Watson", "organization": "Reuters", "clearance": "tier_1"},
    {"journalist_id": "J-004", "name": "David Kim", "organization": "CNBC", "clearance": "tier_2"},
    {"journalist_id": "J-005", "name": "Lisa Park", "organization": "Financial Times", "clearance": "tier_1"},
    {"journalist_id": "J-006", "name": "Alex Volkov", "organization": "Unknown Blog", "clearance": "none"},
    {"journalist_id": "J-007", "name": "Jordan Blake", "organization": "Seeking Alpha", "clearance": "tier_2"},
    {"journalist_id": "J-UNKNOWN-443", "name": "Unknown Actor", "organization": "Unverified", "clearance": "none"},
]

PRESS_DISTRIBUTION_EVENTS = []
for i in range(50):
    release = random.choice(PRESS_DISTRIBUTION_RELEASES)
    journalist = random.choice(PRESS_DISTRIBUTION_JOURNALISTS)
    is_suspicious = journalist["clearance"] == "none" or random.random() < 0.15
    PRESS_DISTRIBUTION_EVENTS.append({
        "event_type": "embargo_access",
        "payload": {
            "release_id": release["release_id"],
            "journalist_id": journalist["journalist_id"],
            "access_type": "unauthorized_early_access" if is_suspicious else "authorized_access",
            "company": release["company"],
            "release_title": release["title"],
        },
        "content": f"Journalist {journalist['name']} from {journalist['organization']} accessed embargoed release: {release['title']}. Access {'OUTSIDE normal window' if is_suspicious else 'within authorized window'}.",
    })

# Suspicious leakage network
for j_id in ["J-UNKNOWN-443", "J-006", "J-007"]:
    for release in PRESS_DISTRIBUTION_RELEASES[:3]:
        PRESS_DISTRIBUTION_EVENTS.append({
            "event_type": "embargo_breach",
            "payload": {
                "release_id": release["release_id"],
                "journalist_id": j_id,
                "access_type": "unauthorized_early_access",
                "ip_address": "198.51.100.42",
                "breach_detected": True,
            },
            "content": f"BREACH DETECTED: Unauthorized access to embargoed release '{release['title']}' by {j_id} from suspicious IP 198.51.100.42",
        })

# ============================================================
# DATING PLATFORM - Romance Scam Ring Detection
# ============================================================

KNOWN_SCAM_SCRIPTS = [
    "Hello beautiful, I am a US military officer stationed overseas. I would love to get to know you better. Can we move to WhatsApp for more private conversation?",
    "I am a successful engineer working on an oil rig. My wife passed away last year and I am looking for true love again. You seem special.",
    "I work for the United Nations in Syria. I have been deployed here for 6 months. Your profile caught my eye and I feel a deep connection already.",
    "I am a widowed surgeon at Johns Hopkins. I have a teenage daughter. Looking for a mature woman who understands commitment and family values.",
    "Hello dear, I am currently deployed with NATO forces. I cannot use regular phone but I am allowed limited internet. You are the most beautiful woman I have seen.",
]

DATING_PLATFORM_USERS = [
    {"user_id": "USR-REAL-001", "name": "Jennifer", "type": "legitimate", "age": 34},
    {"user_id": "USR-REAL-002", "name": "Michael", "type": "legitimate", "age": 42},
    {"user_id": "USR-REAL-003", "name": "Amanda", "type": "legitimate", "age": 28},
    {"user_id": "USR-REAL-004", "name": "Robert", "type": "legitimate", "age": 55},
    {"user_id": "USR-REAL-005", "name": "Sarah", "type": "legitimate", "age": 31},
]

SCAM_RING_MEMBERS = [
    {"user_id": f"USR-FAKE-{i:03d}", "name": f"Scammer_{i}", "type": "scam", "device_id": f"DEV-SHARED-{i % 3}", "ip": f"103.45.{i % 5}.{i}"}
    for i in range(1, 16)
]

DATING_PLATFORM_EVENTS = []
for scammer in SCAM_RING_MEMBERS:
    victim = random.choice(DATING_PLATFORM_USERS)
    script = random.choice(KNOWN_SCAM_SCRIPTS)
    # Slight variation
    variation = script.replace("beautiful", random.choice(["gorgeous", "lovely", "stunning"]))
    DATING_PLATFORM_EVENTS.append({
        "event_type": "message_sent",
        "payload": {
            "user_id": scammer["user_id"],
            "recipient_id": victim["user_id"],
            "device_id": scammer["device_id"],
            "ip_address": scammer["ip"],
        },
        "content": variation,
    })

# ============================================================
# MUSIC STREAMING - Stream Farm Detection
# ============================================================

MUSIC_STREAMING_LEGITIMATE_ACCOUNTS = [
    {"account_id": f"UMG-LEGIT-{i:03d}", "type": "legitimate", "streams_per_day": random.randint(10, 200)}
    for i in range(1, 20)
]

MUSIC_STREAMING_BOT_FARM = [
    {"account_id": f"BOT-FARM-{i:03d}", "type": "bot", "streams_per_day": random.randint(50000, 700000), "device_id": f"BOT-DEV-{i % 5}"}
    for i in range(1, 48)
]

AI_GENERATED_TRACKS = [
    {"track_id": f"AI-TRACK-{i:03d}", "artist": f"AI_Artist_{i}", "title": f"Generated Song {i}", "is_ai": True, "duration_ms": random.randint(60000, 180000)}
    for i in range(1, 50)
]

MUSIC_STREAMING_EVENTS = []
# Bot farm streams
for bot in MUSIC_STREAMING_BOT_FARM:
    track = random.choice(AI_GENERATED_TRACKS)
    MUSIC_STREAMING_EVENTS.append({
        "event_type": "stream",
        "payload": {
            "account_id": bot["account_id"],
            "track_id": track["track_id"],
            "artist": track["artist"],
            "duration_ms": random.randint(300, 5000),  # Very short listens
            "streams_per_day": bot["streams_per_day"],
            "device_id": bot["device_id"],
        },
        "content": f"Account {bot['account_id']} streamed '{track['title']}' by {track['artist']}. Daily streams: {bot['streams_per_day']}. Listen duration: {random.randint(300, 5000)}ms (suspicious - avg normal is 180000ms)",
    })

# Legit streams for contrast
for acct in MUSIC_STREAMING_LEGITIMATE_ACCOUNTS[:10]:
    MUSIC_STREAMING_EVENTS.append({
        "event_type": "stream",
        "payload": {
            "account_id": acct["account_id"],
            "track_id": f"REAL-TRACK-{random.randint(1,1000):04d}",
            "artist": f"Real Artist {random.randint(1,50)}",
            "duration_ms": random.randint(120000, 300000),
            "streams_per_day": acct["streams_per_day"],
        },
        "content": f"Legitimate listening pattern. Account {acct['account_id']} averaged {acct['streams_per_day']} streams/day with normal duration.",
    })

# ============================================================
# CINEMA BOOKING - Scalper Bot Network Detection
# ============================================================

CINEMA_BOOKING_SHOWTIMES = [
    {"showtime_id": "IMAX-PREM-001", "movie": "Avatar 4", "date": "2024-06-15", "venue": "IMAX NYC", "price": 35},
    {"showtime_id": "IMAX-PREM-002", "movie": "Star Wars X", "date": "2024-07-04", "venue": "IMAX LA", "price": 40},
    {"showtime_id": "IMAX-PREM-003", "movie": "Dune Part 3", "date": "2024-08-01", "venue": "IMAX London", "price": 38},
]

CINEMA_BOOKING_BOT_NETWORK = [
    {"session_id": f"SESS-BOT-{i:03d}", "device_fp": f"BOT-FP-{i % 5}", "ip": f"45.33.{i % 10}.{i}", "payment_bin": f"4532{i % 3:02d}"}
    for i in range(1, 24)
]

CINEMA_BOOKING_EVENTS = []
showtime = CINEMA_BOOKING_SHOWTIMES[0]
for bot in CINEMA_BOOKING_BOT_NETWORK:
    CINEMA_BOOKING_EVENTS.append({
        "event_type": "purchase_attempt",
        "payload": {
            "session_id": bot["session_id"],
            "showtime_id": showtime["showtime_id"],
            "movie": showtime["movie"],
            "quantity": random.randint(4, 10),
            "device_fingerprint": bot["device_fp"],
            "ip_address": bot["ip"],
            "payment_bin": bot["payment_bin"],
            "interaction_speed_ms": random.randint(50, 200),  # Superhuman speed
        },
        "content": f"Automated purchase: Session {bot['session_id']} attempting {random.randint(4,10)} tickets for {showtime['movie']} at {showtime['venue']}. Interaction speed: {random.randint(50,200)}ms (human avg: 3000ms). Device shared with {random.randint(3,8)} other sessions.",
    })

# Legitimate purchases
for i in range(10):
    CINEMA_BOOKING_EVENTS.append({
        "event_type": "purchase_attempt",
        "payload": {
            "session_id": f"SESS-HUMAN-{i:03d}",
            "showtime_id": random.choice(CINEMA_BOOKING_SHOWTIMES)["showtime_id"],
            "quantity": random.randint(1, 4),
            "device_fingerprint": f"REAL-DEV-{i}",
            "interaction_speed_ms": random.randint(2000, 15000),
        },
        "content": f"Legitimate purchase pattern. Normal interaction speed and single-device session.",
    })

# ============================================================
# NEWS PLATFORM - Misinformation Detection
# ============================================================

MISINFO_ARTICLES = [
    {"content_id": "MISINFO-001", "title": "Vaccine causes 90% side effects - leaked documents", "author_id": "BOT-AUTHOR-01"},
    {"content_id": "MISINFO-002", "title": "Government secretly tracking citizens via 5G towers", "author_id": "BOT-AUTHOR-02"},
    {"content_id": "MISINFO-003", "title": "Major bank about to collapse - withdraw your money now", "author_id": "BOT-AUTHOR-03"},
    {"content_id": "MISINFO-004", "title": "Celebrity death hoax - confirmed by unnamed sources", "author_id": "BOT-AUTHOR-04"},
    {"content_id": "MISINFO-005", "title": "Election machines hacked - proof in leaked emails", "author_id": "BOT-AUTHOR-05"},
]

NEWS_PLATFORM_BOT_NETWORK = [
    {"account_id": f"PM-BOT-{i:03d}", "author_id": f"BOT-AUTHOR-{i:02d}", "creation_date": "2024-01-15", "posts_per_day": random.randint(50, 200)}
    for i in range(1, 51)
]

NEWS_PLATFORM_EVENTS = []
for article in MISINFO_ARTICLES:
    NEWS_PLATFORM_EVENTS.append({
        "event_type": "content_published",
        "payload": {
            "content_id": article["content_id"],
            "author_id": article["author_id"],
            "title": article["title"],
            "source_url": "fake-news-network.com",
            "is_ai_generated": True,
        },
        "content": f"AI-GENERATED ARTICLE: '{article['title']}'. Published by {article['author_id']} on fake-news-network.com. Content signature matches known AI generation patterns.",
    })

# Amplification events
for bot in NEWS_PLATFORM_BOT_NETWORK[:30]:
    article = random.choice(MISINFO_ARTICLES)
    NEWS_PLATFORM_EVENTS.append({
        "event_type": "content_shared",
        "payload": {
            "content_id": article["content_id"],
            "sharer_id": bot["account_id"],
            "amplification_network": True,
            "posts_per_day": bot["posts_per_day"],
        },
        "content": f"Amplification detected: Bot account {bot['account_id']} sharing misinformation article '{article['title']}'. Account posts {bot['posts_per_day']}x/day (created {bot['creation_date']}).",
    })

# GoFundMe fraud link
NEWS_PLATFORM_EVENTS.append({
    "event_type": "content_published",
    "payload": {
        "content_id": "MISINFO-GOFUNDME-001",
        "author_id": "BOT-AUTHOR-50",
        "title": "Help victims of [fake disaster] - donate now",
        "source_url": "gofundme.com/fake-disaster-relief",
        "external_links": ["gofundme.com/fake-disaster-relief"],
        "is_ai_generated": True,
        "fraud_type": "gofundme_scam",
    },
    "content": "AI-generated disaster relief scam linking to fraudulent GoFundMe. 50-account network amplifying the content. Credibility score: 0.12",
})

# ============================================================
# NEPTUNE GRAPH DATA (Nodes & Edges)
# ============================================================

# ============================================================
# TICKETING PLATFORM - Scalper Bot Network Detection
# ============================================================

TICKETING_PLATFORM_EVENTS_DATA = [
    {"event_id": "TM-EVT-001", "name": "Taylor Swift Eras Tour - NYC", "date": "2024-09-15", "venue": "MetLife Stadium", "price_range": "89-450"},
    {"event_id": "TM-EVT-002", "name": "Beyonce Renaissance Tour - LA", "date": "2024-10-01", "venue": "SoFi Stadium", "price_range": "99-500"},
    {"event_id": "TM-EVT-003", "name": "FIFA World Cup Final", "date": "2024-12-18", "venue": "Lusail Stadium", "price_range": "200-2000"},
]

TICKETING_PLATFORM_BOT_NETWORK = [
    {"session_id": f"TM-SESS-BOT-{i:03d}", "buyer_id": f"TM-BUYER-FAKE-{i:03d}", "device_fp": f"TM-BOT-FP-{i % 6}", "ip": f"185.220.{i % 10}.{i}", "payment_bin": f"4111{i % 4:02d}"}
    for i in range(1, 31)
]

TICKETING_PLATFORM_EVENTS = []
event = TICKETING_PLATFORM_EVENTS_DATA[0]
for bot in TICKETING_PLATFORM_BOT_NETWORK:
    TICKETING_PLATFORM_EVENTS.append({
        "event_type": "ticket_purchase_attempt",
        "payload": {
            "session_id": bot["session_id"],
            "buyer_id": bot["buyer_id"],
            "event_id": event["event_id"],
            "event_name": event["name"],
            "quantity": random.randint(4, 10),
            "device_fingerprint": bot["device_fp"],
            "ip_address": bot["ip"],
            "payment_bin": bot["payment_bin"],
            "interaction_speed_ms": random.randint(30, 150),
        },
        "content": f"Automated ticket purchase: Session {bot['session_id']} attempting {random.randint(4,10)} tickets for {event['name']}. Interaction speed: {random.randint(30,150)}ms (human avg: 4500ms). Device shared with {random.randint(5,12)} other sessions. Known scalper IP range.",
    })

# Legitimate purchases for contrast
for i in range(10):
    evt = random.choice(TICKETING_PLATFORM_EVENTS_DATA)
    TICKETING_PLATFORM_EVENTS.append({
        "event_type": "ticket_purchase_attempt",
        "payload": {
            "session_id": f"TM-SESS-HUMAN-{i:03d}",
            "buyer_id": f"TM-BUYER-REAL-{i:03d}",
            "event_id": evt["event_id"],
            "event_name": evt["name"],
            "quantity": random.randint(1, 4),
            "device_fingerprint": f"TM-REAL-DEV-{i}",
            "interaction_speed_ms": random.randint(3000, 20000),
        },
        "content": f"Legitimate ticket purchase pattern. Normal interaction speed and single-device session for {evt['name']}.",
    })

TICKETING_PLATFORM_KNOWN_PATTERNS = [
    {"id": "PAT-TM-001", "content": "Automated ticket purchase bot with interaction speed under 100ms, shared device fingerprint across 30+ sessions, targeting high-demand events within seconds of ticket drop", "type": "scalper_bot"},
    {"id": "PAT-TM-002", "content": "Coordinated bot network: 500 sessions within 15 seconds of ticket release, rotating proxy IPs from datacenter ranges, bulk 6-10 ticket purchases per session with automated CAPTCHA bypass", "type": "coordinated_attack"},
    {"id": "PAT-TM-003", "content": "Ticket fraud ring using stolen payment cards across 30 sessions with different identities, same device fingerprint cluster, sub-200ms form completion indicating automation", "type": "payment_fraud"},
]

def get_neptune_graph_data(domain: str):
    """Generate nodes and edges for Neptune graph seeding."""
    if domain == "press_distribution":
        nodes = [
            {"id": j["journalist_id"], "label": "Journalist", "properties": {"name": j["name"], "org": j["organization"]}}
            for j in PRESS_DISTRIBUTION_JOURNALISTS
        ] + [
            {"id": r["release_id"], "label": "Release", "properties": {"company": r["company"], "title": r["title"]}}
            for r in PRESS_DISTRIBUTION_RELEASES
        ]
        edges = []
        # Leakage network
        for j_id in ["J-UNKNOWN-443", "J-006", "J-007"]:
            for r in PRESS_DISTRIBUTION_RELEASES[:3]:
                edges.append({"source": j_id, "target": r["release_id"], "relationship": "ACCESSED_EMBARGO", "weight": 0.9})
            # Shared IP connections
            edges.append({"source": j_id, "target": "J-UNKNOWN-443" if j_id != "J-UNKNOWN-443" else "J-006", "relationship": "SHARES_IP", "weight": 0.95})
        return nodes, edges

    elif domain == "dating_platform":
        nodes = [
            {"id": s["user_id"], "label": "User", "properties": {"type": "scam", "device": s["device_id"]}}
            for s in SCAM_RING_MEMBERS
        ] + [
            {"id": u["user_id"], "label": "User", "properties": {"type": "legitimate", "name": u["name"]}}
            for u in DATING_PLATFORM_USERS
        ] + [
            {"id": f"DEV-SHARED-{i}", "label": "Device", "properties": {"type": "shared_device"}}
            for i in range(3)
        ]
        edges = []
        for s in SCAM_RING_MEMBERS:
            edges.append({"source": s["user_id"], "target": s["device_id"], "relationship": "SHARES_DEVICE", "weight": 1.0})
            victim = random.choice(DATING_PLATFORM_USERS)
            edges.append({"source": s["user_id"], "target": victim["user_id"], "relationship": "MESSAGED", "weight": 0.5})
        return nodes, edges

    elif domain == "music_streaming":
        nodes = [
            {"id": b["account_id"], "label": "Account", "properties": {"type": "bot", "streams": str(b["streams_per_day"])}}
            for b in MUSIC_STREAMING_BOT_FARM
        ] + [
            {"id": t["track_id"], "label": "Track", "properties": {"artist": t["artist"], "ai_generated": "true"}}
            for t in AI_GENERATED_TRACKS[:10]
        ] + [
            {"id": f"BOT-DEV-{i}", "label": "Device", "properties": {"type": "bot_device"}}
            for i in range(5)
        ]
        edges = []
        for b in MUSIC_STREAMING_BOT_FARM:
            track = random.choice(AI_GENERATED_TRACKS[:10])
            edges.append({"source": b["account_id"], "target": track["track_id"], "relationship": "STREAMED", "weight": 0.8})
            edges.append({"source": b["account_id"], "target": b["device_id"], "relationship": "SHARES_DEVICE", "weight": 1.0})
        return nodes, edges

    elif domain == "cinema_booking":
        nodes = [
            {"id": b["session_id"], "label": "Session", "properties": {"device": b["device_fp"], "ip": b["ip"]}}
            for b in CINEMA_BOOKING_BOT_NETWORK
        ] + [
            {"id": f"BOT-FP-{i}", "label": "Device", "properties": {"type": "bot_fingerprint"}}
            for i in range(5)
        ] + [
            {"id": s["showtime_id"], "label": "Showtime", "properties": {"movie": s["movie"]}}
            for s in CINEMA_BOOKING_SHOWTIMES
        ]
        edges = []
        for b in CINEMA_BOOKING_BOT_NETWORK:
            edges.append({"source": b["session_id"], "target": b["device_fp"], "relationship": "SHARES_DEVICE", "weight": 1.0})
            edges.append({"source": b["session_id"], "target": CINEMA_BOOKING_SHOWTIMES[0]["showtime_id"], "relationship": "TARGETED_SHOWTIME", "weight": 0.9})
        return nodes, edges

    elif domain == "news_platform":
        nodes = [
            {"id": a["content_id"], "label": "Content", "properties": {"title": a["title"], "ai_generated": "true"}}
            for a in MISINFO_ARTICLES
        ] + [
            {"id": b["account_id"], "label": "Account", "properties": {"author": b["author_id"], "posts_per_day": str(b["posts_per_day"])}}
            for b in NEWS_PLATFORM_BOT_NETWORK[:20]
        ] + [
            {"id": "AMPLIFICATION-NET-01", "label": "SharingNetwork", "properties": {"size": "50", "type": "coordinated"}}
        ]
        edges = []
        for b in NEWS_PLATFORM_BOT_NETWORK[:20]:
            article = random.choice(MISINFO_ARTICLES)
            edges.append({"source": b["account_id"], "target": article["content_id"], "relationship": "AMPLIFIED", "weight": 0.85})
            edges.append({"source": b["account_id"], "target": "AMPLIFICATION-NET-01", "relationship": "MEMBER_OF", "weight": 1.0})
        return nodes, edges

    elif domain == "ticketing_platform":
        nodes = [
            {"id": b["session_id"], "label": "Session", "properties": {"device": b["device_fp"], "ip": b["ip"], "buyer": b["buyer_id"]}}
            for b in TICKETING_PLATFORM_BOT_NETWORK
        ] + [
            {"id": f"TM-BOT-FP-{i}", "label": "Device", "properties": {"type": "bot_fingerprint"}}
            for i in range(6)
        ] + [
            {"id": e["event_id"], "label": "Event", "properties": {"name": e["name"], "venue": e["venue"]}}
            for e in TICKETING_PLATFORM_EVENTS_DATA
        ] + [
            {"id": "TM-SCALPER-RING-01", "label": "ScalperNetwork", "properties": {"size": "30", "type": "coordinated_bots"}}
        ]
        edges = []
        for b in TICKETING_PLATFORM_BOT_NETWORK:
            edges.append({"source": b["session_id"], "target": b["device_fp"], "relationship": "SHARES_DEVICE", "weight": 1.0})
            edges.append({"source": b["session_id"], "target": TICKETING_PLATFORM_EVENTS_DATA[0]["event_id"], "relationship": "TARGETED_EVENT", "weight": 0.9})
            edges.append({"source": b["session_id"], "target": "TM-SCALPER-RING-01", "relationship": "MEMBER_OF", "weight": 1.0})
        # Link devices to scalper ring
        for i in range(6):
            edges.append({"source": f"TM-BOT-FP-{i}", "target": "TM-SCALPER-RING-01", "relationship": "USED_BY_RING", "weight": 0.95})
        return nodes, edges

    return [], []


# ============================================================
# ALL SEED DATA COMBINED
# ============================================================

ALL_EVENTS = {
    "press_distribution": PRESS_DISTRIBUTION_EVENTS,
    "dating_platform": DATING_PLATFORM_EVENTS,
    "music_streaming": MUSIC_STREAMING_EVENTS,
    "cinema_booking": CINEMA_BOOKING_EVENTS,
    "news_platform": NEWS_PLATFORM_EVENTS,
    "ticketing_platform": TICKETING_PLATFORM_EVENTS,
}

ALL_KNOWN_PATTERNS = {
    "press_distribution": [
        {"id": "PAT-BW-001", "content": "Unauthorized early access from unverified journalist account to M&A embargo release", "type": "embargo_breach"},
        {"id": "PAT-BW-002", "content": "Multiple accesses from same IP to different embargoed releases within short time window", "type": "coordinated_leak"},
    ],
    "dating_platform": [
        {"id": f"SCAM-SCRIPT-{i:03d}", "content": script, "type": "romance_scam"}
        for i, script in enumerate(KNOWN_SCAM_SCRIPTS, 1)
    ],
    "music_streaming": [
        {"id": "PAT-UMG-001", "content": "Account streaming over 50000 times per day with average listen duration under 5 seconds from shared device", "type": "bot_farm"},
        {"id": "PAT-UMG-002", "content": "Multiple accounts streaming identical AI-generated tracks exclusively with no playlist diversity", "type": "stream_manipulation"},
    ],
    "cinema_booking": [
        {"id": "PAT-IMAX-001", "content": "Session with interaction speed under 200ms, multiple ticket quantities, shared device fingerprint with 5+ other sessions", "type": "scalper_bot"},
        {"id": "PAT-IMAX-002", "content": "200+ simultaneous sessions targeting same premium showtime within 30 second window", "type": "coordinated_bot_attack"},
    ],
    "news_platform": [
        {"id": "PAT-PM-001", "content": "AI-generated article with sensationalist health misinformation claims linking to external fundraising sites", "type": "ai_misinfo"},
        {"id": "PAT-PM-002", "content": "Coordinated amplification network of 50+ accounts created within same week all sharing identical content", "type": "amplification_network"},
    ],
    "ticketing_platform": TICKETING_PLATFORM_KNOWN_PATTERNS,
}
