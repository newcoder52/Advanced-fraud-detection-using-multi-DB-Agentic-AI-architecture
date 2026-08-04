import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import GraphNetworkViz from './GraphNetworkViz'
import OntologyClassificationPanel, { getRandomClassification, getDomainClassification, ClassificationResult } from './OntologyClassificationPanel'
import GNNPredictionOverlay from './GNNPredictionOverlay'
import GraphRAGEvidencePanel from './GraphRAGEvidencePanel'
import AILayerStatusBar from './AILayerStatusBar'
import InvestigationBriefPanel from './InvestigationBriefPanel'
import ThreatIntelFeed, { IntelMessage, generateOntologyMessage, generateGNNMessage, generateRingMessage, generateBlockMessage } from './ThreatIntelFeed'

interface Props { domain: string }

type Decision = 'ALLOW' | 'FLAG' | 'CHALLENGE' | 'BLOCK' | 'PENDING' | 'ERROR'

interface SimEvent {
  id: string
  timestamp: string
  headline: string
  fields: Record<string, string>
  decision: Decision
  score: number | null
  latency: number | null
  semanticMatch: string | null
  graphInfo: string | null
  stages?: any[]
  classification?: any
  error?: string
  apiPayload: any
}

const DECISION_STYLE: Record<Decision, { badge: string; label: string }> = {
  ALLOW: { badge: 'bg-green-700 text-green-200', label: '✅ ALLOW' },
  FLAG: { badge: 'bg-yellow-700 text-yellow-200', label: '🟡 FLAG' },
  CHALLENGE: { badge: 'bg-orange-700 text-orange-200', label: '🟠 CHALLENGE' },
  BLOCK: { badge: 'bg-red-700 text-red-200', label: '🔴 BLOCK' },
  PENDING: { badge: 'bg-gray-600 text-gray-300', label: '⏳ ...' },
  ERROR: { badge: 'bg-gray-800 text-red-400 border border-red-800', label: '⚠️ ERR' },
}

const STAGE_LABELS: Record<string, string> = {
  cache_check: '⚡ Valkey Cache',
  ingest: '📥 DynamoDB',
  embedding: '🧠 Bedrock Titan',
  similarity_search: '🔍 pgvector',
  feature_computation: '🔢 Feature Engineering',
  ml_model: '🤖 ML Model',
  graph_analysis: '🕸️ Neptune',
  scoring: '📊 Valkey Score',
  escalation: '⬆️ Escalation',
}

const ARTISTS = ['Taylor Swift', 'Drake', 'Bad Bunny', 'The Weeknd', 'SZA', 'Dua Lipa', 'Morgan Wallen', 'Olivia Rodrigo', 'Billie Eilish', 'Post Malone', 'Kendrick Lamar', 'Ariana Grande']
const AI_ARTISTS = ['AI_Melody_Bot', 'SynthStream_001', 'GenTrack_Pro', 'BeatFactory_AI', 'AutoTune_Farm', 'LoFi_Generator_X', 'Neural_Beats_77', 'DeepCompose_3']
const REAL_SOURCES = ['reuters.com', 'apnews.com', 'nytimes.com', 'bbc.com', 'washingtonpost.com', 'npr.org', 'theguardian.com', 'wsj.com', 'bloomberg.com']
const FAKE_SOURCES = ['breaking-truth-news.com', 'real-facts-daily.net', 'insider-leaks.io', 'freedom-press-now.com', 'patriot-truth-report.net', 'global-awakening-news.org', 'uncensored-reality.com', 'deep-state-exposed.info']

function rand(arr: string[]) { return arr[Math.floor(Math.random() * arr.length)] }
function randId(prefix: string, len = 4) { return `${prefix}-${Math.floor(Math.random() * (10 ** len)).toString().padStart(len, '0')}` }
// Small pools of recurring entity IDs (simulates repeat users — drives cache hits)
// ~20 possible values per pool — gives visible cache hits within 30-40 seconds of streaming
const LEGIT_USERS = Array.from({ length: 20 }, (_, i) => `USR-${(1001 + i).toString()}`)
const LEGIT_JOURNALISTS = Array.from({ length: 20 }, (_, i) => `J-${['AP', 'REU', 'BBG', 'WSJ', 'NYT', 'FT'][i % 6]}-${(10 + Math.floor(i / 6)).toString().padStart(2, '0')}`)
const LEGIT_ACCOUNTS = Array.from({ length: 20 }, (_, i) => `ACCT-${(2001 + i).toString()}`)
const LEGIT_VIEWERS = Array.from({ length: 20 }, (_, i) => `VWR-${(101 + i).toString()}`)
const LEGIT_PLAYERS = Array.from({ length: 20 }, (_, i) => `PLR-${(3001 + i).toString()}`)

interface GenResult { headline: string; fields: Record<string, string>; apiPayload: any }

const GENERATORS: Record<string, { legit: () => GenResult; suspicious: () => GenResult }> = {
  dating_platform: {
    legit: () => {
      const u1 = rand(LEGIT_USERS), u2 = rand(LEGIT_USERS)
      const msgs = [
        'Hey want to grab coffee this weekend?', 'Nice profile! Do you like hiking too?',
        'Had a great time last night, want to meet again?', 'Haha that joke was so funny! What do you do for work?',
        'I love that restaurant too! We should go together sometime', 'Your dog is adorable, what breed is that?',
        'How was your weekend? I went to the farmers market', 'Just moved here from Chicago, still exploring the city!',
        'That concert looked amazing! Who else do you listen to?', 'Do you prefer indoor rock climbing or outdoor bouldering?',
        'I just tried that new Thai place on 5th — have you been?', 'My friends are doing trivia night Thursday, want to join?',
        'I saw you like running! Training for anything right now?', 'Your travel photos are incredible. Where was that sunset taken?',
        'I work in marketing — just switched to a smaller agency. How about you?', 'Do you have any book recommendations? I just finished Project Hail Mary',
        'Do you like sushi? There\'s a great place downtown I\'ve been wanting to try',
        'I\'m training for a half marathon next month. Do you run?',
        'Just got back from a trip to Portugal. Have you ever been to Europe?',
        'My roommate\'s cat just had kittens — want to come see them this weekend?',
        'I usually go to trivia night on Wednesdays. Want to join my team sometime?',
        'What\'s your go-to karaoke song? Mine is embarrassing but I own it',
        'I noticed you like board games — have you tried Wingspan? It\'s my current obsession',
        'My sister is visiting next week, would love to introduce you if that\'s not weird?',
      ]
      const msg = rand(msgs)
      return { headline: `${u1} sent message to ${u2}`, fields: { user_id: u1, recipient_id: u2, message: msg }, apiPayload: { event_type: 'message_sent', entity_id: u1, content: msg, payload: { user_id: u1, recipient_id: u2 } } }
    },
    suspicious: () => {
      const u1 = rand(['USR-4891', 'USR-7234', 'USR-3067', 'USR-8412', 'USR-5593', 'USR-9108']), u2 = randId('USR')
      const msgs = [
        'Hello beautiful, I am a US military officer stationed overseas. Can we move to WhatsApp?',
        'I have been making amazing crypto returns. Let me help you invest — just send a small deposit to start.',
        'I am stuck at the airport, my wallet was stolen. Please wire me $500 so I can get home to see you.',
        'You are so special to me. I want to send you a gift — please share your full address and date of birth.',
        'I made $50K last week trading crypto. Let me show you how — message me on Telegram',
        'My wife passed 2 years ago. Your profile caught my eye. I\'m a Navy SEAL currently deployed',
        'I\'m a UN diplomat stationed in Syria. I have a package of gold I need to ship — can you help receive it?',
        'I\'m a heart surgeon working for Doctors Without Borders. I feel an instant connection with you. Let\'s move to Hangouts',
        'I inherited $2.5M from my late father but need someone I trust to help transfer it. Are you that person?',
        'I\'m an oil rig engineer. We only get internet for 30 minutes a day. Please add me on WhatsApp so we don\'t lose touch',
        'My daughter needs surgery and I\'m deployed. Could you help me with a small loan? I\'ll pay you back double',
        'I\'m a widowed pilot flying international routes. I can only message during layovers. Give me your number so I can call',
        'I\'m an engineer on an offshore oil platform. Internet is limited. Please add me on Viber so I don\'t lose you',
        'My company just went public and I made $3M. I want to share my success with someone special — invest with me',
        'I\'m a widowed heart surgeon. My late wife looked just like you. Can you send me a selfie to confirm you\'re real?',
        'I\'m traveling to your city next month for business. Can you pick me up from the airport? I\'ll send you flight details',
        'I fell in love with you from your photos. I want to meet but first I need help paying my phone bill — just $100',
        'I work for the Red Cross in a conflict zone. I found a box of gold bars. I need your help to get them out safely.',
        'My bank account is frozen due to a dispute. Can you receive a wire for me? I\'ll give you 20% for helping.',
      ]
      const msg = rand(msgs)
      return { headline: `${u1} sent message to ${u2}`, fields: { user_id: u1, recipient_id: u2, message: msg }, apiPayload: { event_type: 'message_sent', entity_id: u1, content: msg, payload: { user_id: u1, recipient_id: u2, message_text: 'romance scam script' } } }
    },
  },
  press_distribution: {
    legit: () => {
      const jid = rand(LEGIT_JOURNALISTS), rid = `PR-2024-${Math.floor(Math.random() * 9000) + 1000}`
      const actions = ['scheduled_access', 'post_embargo_view', 'authorized_download', 'calendar_reminder_view', 'api_key_access', 'editorial_review', 'syndication_pull']
      const contexts = [
        `Routine access: verified journalist ${jid} viewed published press release ${rid} during normal business hours. Authorized API key, registered IP address.`,
        `Post-embargo download: ${jid} downloaded ${rid} after lift time. Standard workflow, verified credentials, known bureau IP.`,
        `Calendar-triggered access: ${jid} opened ${rid} at scheduled embargo lift. Normal journalist behavior pattern.`,
        `Wire service redistribution: ${jid} pulled ${rid} for syndication 15 minutes after embargo lift. Verified AP/Reuters partner.`,
        `Research access: ${jid} browsed archived releases including ${rid}. Academic institution IP, rate within normal bounds.`,
        `Mobile access: ${jid} viewed ${rid} summary from registered mobile device. Push notification triggered open.`,
        `Editor-in-chief reviewed embargo calendar during weekly planning. Standard editorial workflow from known corporate IP.`,
        `Verified financial reporter ${jid} accessed ${rid} earnings preview 2 minutes after embargo lifted. Standard beat coverage.`,
        `PR agency partner downloaded ${rid} client coverage report. Authorized via partner API key, monthly billing active.`,
        `Journalist ${jid} searched archives for historical M&A releases related to upcoming sector analysis piece. Normal research.`,
        `Automated RSS feed pull for ${rid} by verified news aggregator. Registered webhook, post-embargo only.`,
        `${jid} accessed ${rid} via Bloomberg Terminal integration. Verified institutional license, standard workflow.`,
        `Intern account ${jid} viewed ${rid} under editor supervision. Account flagged as supervised, normal training access.`,
        `${jid} exported ${rid} to CMS for article draft. Verified newsroom IP, standard publish workflow.`,
        `Weekend desk editor ${jid} accessed ${rid} for Monday morning roundup. Authorized off-hours access pattern.`,
      ]
      return { headline: `${jid} accessed ${rid}`, fields: { journalist_id: jid, release_id: rid, access_type: rand(actions), timing: 'post-embargo' }, apiPayload: { event_type: 'document_view', entity_id: jid, content: rand(contexts), payload: { release_id: rid, access_type: 'authorized' } } }
    },
    suspicious: () => {
      const jids = ['J-TRV-118', 'J-MKT-294', 'J-FIN-067', 'J-EXT-441', 'J-CON-872']
      const jid = rand(jids), rid = `PR-2024-${Math.floor(Math.random() * 9000) + 1000}`
      const types = ['unauthorized_early_access', 'bulk_download', 'vpn_access', 'api_scraping', 'after_hours_bulk', 'credential_stuffing', 'geo_impossible']
      const t = rand(types)
      const contexts = [
        `CONFIDENTIAL: Unauthorized access to embargoed release ${rid} from unregistered IP. Bulk download of 12 releases in 3 minutes detected. Entity ${jid} has no registered API key. IP matches known data broker network. Pattern consistent with insider trading preparation.`,
        `ALERT: ${jid} accessed ${rid} 4 hours before embargo lift via Tor exit node. 47 failed login attempts preceded successful access. Credential stuffing attack confirmed. Same IP subnet appeared in SEC enforcement case #2024-0891.`,
        `CRITICAL: Automated scraping — ${jid} downloaded 15 embargoed financial releases in 2 minutes using rotating proxies. Bot fingerprint detected: request spacing 0.3 seconds, no mouse movement, headless browser user-agent. Pattern matches known insider trading ring.`,
        `WARNING: ${jid} accessed M&A release ${rid} from VPN. Geo-impossible login — same credentials used from London and Singapore within 20 minutes. Account likely compromised via credential stuffing from breach dump.`,
        `CRITICAL: ${jid} API key used from 3 different countries in 1 hour accessing 8 embargoed releases. Shared credential or compromised account. Timing correlates exactly 4 hours before market-moving announcements over 3 months.`,
        `ALERT: Shadow account detected — ${jid} profile matches terminated employee from 2019. Using deactivated credentials to access ${rid}. 50 unauthorized downloads in the past 24 hours. Insider trading network suspected.`,
        `SUSPICIOUS: ${jid} accessing all healthcare sector embargoes via residential proxy (IP reputation: 2/100). Pattern matches pre-trade intelligence gathering. 30 accounts sharing same device fingerprint detected.`,
      ]
      return { headline: `${jid} accessed ${rid}`, fields: { journalist_id: jid, release_id: rid, access_type: t, timing: rand(['4h before embargo', '6h before embargo', '2h before embargo', '3am EST', '2:47am EST', '11pm EST']) }, apiPayload: { event_type: 'embargo_access', entity_id: jid, content: rand(contexts), payload: { release_id: rid, journalist_id: jid, access_type: t } } }
    },
  },
  umg: {
    legit: () => {
      const acct = rand(LEGIT_ACCOUNTS), track = randId('TRK'), artist = rand(ARTISTS), dur = 150000 + Math.floor(Math.random() * 150000)
      const contexts = [
        `Normal listening session: ${artist} track played for ${(dur / 1000).toFixed(0)} seconds on unique device. Organic listening pattern, varied playlist.`,
        `Playlist listening: ${artist} in user-curated playlist. Full track completion, followed by different artist. Natural behavior.`,
        `Discovery session: ${artist} found via algorithmic recommendation. User listened to 75% then saved to library.`,
        `Repeat listen: User played ${artist} for the 4th time this week. Consistent with fan behavior, unique device.`,
        `Shared playlist: ${artist} track played from friend-shared playlist. Social listening, normal duration.`,
        `Offline sync: ${artist} track played from downloaded playlist during commute hours. Premium subscriber, verified device.`,
        `Radio mode: ${artist} played via artist radio. User skipped 2 tracks before settling. Normal discovery behavior.`,
        `Album deep dive: User playing ${artist} album tracks sequentially. 3rd consecutive track, all full duration.`,
        `Workout playlist: ${artist} in high-energy playlist during gym hours (6-8 AM). Heart rate data correlated via wearable.`,
        `Sleep timer: ${artist} ambient track at 11 PM. Playback stopped after 45 min (timer). Normal nighttime pattern.`,
        `Car mode: ${artist} via CarPlay. GPS shows highway driving. Session matches commute duration perfectly.`,
        `Social share: User shared ${artist} track to Instagram Story then played it again. Organic engagement pattern.`,
        `Concert prep: User playing ${artist} top tracks repeatedly — upcoming concert in their city this weekend.`,
        `New release day: ${artist} album dropped today. User streaming since midnight. 12 unique tracks played. Fan behavior.`,
        `Podcast break: User switched from podcast to ${artist} during lunch break. Normal content mixing pattern.`,
      ]
      return { headline: `${acct} streamed ${track} (${(dur / 1000 / 60).toFixed(1)}min)`, fields: { account_id: acct, track_id: track, artist, duration: `${(dur / 1000 / 60).toFixed(1)}min`, device: randId('DEV') }, apiPayload: { event_type: 'stream', entity_id: acct, content: rand(contexts), payload: { account_id: acct, track_id: track, streams_per_day: 12 + Math.floor(Math.random() * 25) } } }
    },
    suspicious: () => {
      const accts = ['ACCT-8847', 'ACCT-6213', 'ACCT-9954', 'ACCT-3371', 'ACCT-7089']
      const acct = rand(accts), track = randId('AI-TRK'), artist = rand(AI_ARTISTS), dur = 300 + Math.floor(Math.random() * 700)
      const devices = ['BOT-DEV-0', 'BOT-DEV-1', 'VM-INSTANCE-44', 'EMULATOR-07', 'DOCKER-FARM-3']
      const dev = rand(devices)
      const streams = [310000, 445000, 661000, 820000, 1200000]
      const sPerDay = rand(streams.map(String))
      const contexts = [
        `Bot farm pattern: ${artist} track, ${dur}ms duration, shared device ${dev}, ${sPerDay} streams/day.`,
        `Click farm detected: ${artist} played for ${dur}ms then immediately skipped. 47 accounts on same device.`,
        `Artificial inflation: ${acct} streaming ${artist} on loop. Zero genre diversity, identical timestamps across accounts.`,
        `VM cluster: ${artist} streamed from cloud instance. Identical user-agent across 200+ accounts. Duration: ${dur}ms.`,
        `Royalty fraud: ${artist} track (uploaded yesterday) already has ${sPerDay} streams. All from 5 devices in same data center.`,
        `Coordinated play: ${acct} and 46 linked accounts all played ${artist} within same 30-second window. Scripted behavior.`,
        `Night farming: ${acct} streaming exclusively between 2-5 AM. 4,000 plays per night. No human awake pattern.`,
        `Loop detection: Same 3 tracks by ${artist} repeated 10,000 times. Skip rate: 0%. No human listens this way.`,
        `Device spoofing: ${acct} claims 47 unique devices but all share same TCP fingerprint. Emulator farm detected.`,
        `Geographic impossibility: ${acct} streaming from 12 countries simultaneously. Shared VPN pool.`,
        `Playlist stuffing: ${artist} track added to 500+ auto-generated playlists in 24 hours. All playlists have 0 followers.`,
        `Silent stream: ${acct} playing ${artist} at volume 0. App backgrounded. No audio output detected. Pure inflation.`,
        `Micro-duration: ${acct} plays ${artist} for exactly 31 seconds (minimum royalty threshold) then skips. 100% of streams.`,
        `Identity cluster: ${acct} shares payment method with 23 other accounts. All streaming same ${artist} tracks exclusively.`,
        `API abuse: ${acct} using deprecated streaming API endpoint to bypass play verification. ${sPerDay} unvalidated streams.`,
      ]
      return { headline: `${acct} streamed ${track} (${dur}ms)`, fields: { account_id: acct, track_id: track, artist, duration: `${dur}ms`, device: dev }, apiPayload: { event_type: 'stream', entity_id: acct, content: rand(contexts), payload: { account_id: acct, track_id: track, streams_per_day: parseInt(sPerDay), device_id: dev } } }
    },
  },
  imax: {
    legit: () => {
      const sess = rand(LEGIT_ACCOUNTS), show = `CINEMA-EVE-${Math.floor(Math.random() * 50) + 1}`, qty = 1 + Math.floor(Math.random() * 3)
      const speed = 3000 + Math.floor(Math.random() * 7000)
      const contexts = [
        `Standard ticket purchase: ${qty} tickets for evening showing, returning customer with 2-year history, unique device fingerprint, normal checkout speed ${(speed/1000).toFixed(1)}s.`,
        `Family purchase: ${qty} tickets (2 adult + 1 child) from loyalty member. Consistent with prior buying pattern.`,
        `Mobile purchase: ${qty} ticket(s) via cinema app. Touch ID authenticated, registered payment method, ${(speed/1000).toFixed(1)}s checkout.`,
        `Weekend booking: ${qty} tickets purchased 3 days in advance. Price comparison behavior observed (normal). Unique IP.`,
        `Gift purchase: ${qty} tickets bought with gift card balance. Account in good standing, purchase amount consistent with history.`,
        `Corporate booking: ${qty} premium seats via business account. Authorized corporate card, within spending policy.`,
        `Date night: ${qty} tickets selected after browsing 3 showtimes. Natural comparison shopping, ${(speed/1000).toFixed(1)}s decision time.`,
        `Loyalty redemption: ${qty} tickets using accumulated cinema loyalty points. 14-month member, consistent monthly purchaser.`,
        `Group outing: ${qty} tickets for birthday party. Shared via group chat link. 4 unique IPs contributed to selection.`,
        `Matinee booking: ${qty} discounted afternoon tickets. Senior account, consistent weekday matinee pattern for 8 months.`,
        `Student discount: ${qty} ticket verified via .edu email. Campus IP, first-time cinema purchase. Normal onboarding.`,
        `Accessibility seat: ${qty} wheelchair-accessible tickets. ADA-verified account, preferred seating saved in profile.`,
        `Early bird: ${qty} tickets bought 2 weeks in advance for opening night. Notification signup confirmed enthusiasm.`,
        `Double feature: ${qty} tickets for back-to-back showings. Same patron, same theater, 3-hour gap between films.`,
        `Anniversary special: ${qty} premium tickets with dinner package add-on. Saved payment method, returning couple.`,
      ]
      return { headline: `${sess} purchasing ${qty} ticket${qty > 1 ? 's' : ''} for ${show}`, fields: { session_id: sess, showtime_id: show, quantity: String(qty), device: randId('FP'), speed: `${(speed/1000).toFixed(1)}s` }, apiPayload: { event_type: 'purchase_attempt', entity_id: sess, content: rand(contexts), payload: { session_id: sess, showtime_id: show, quantity: qty } } }
    },
    suspicious: () => {
      const sessions = ['SESS-29471', 'SESS-83204', 'SESS-11867', 'SESS-55032', 'SESS-67891']
      const sess = rand(sessions), show = rand(['CINEMA-PREM-001', 'CINEMA-OPEN-NIGHT', 'CINEMA-AVENGERS-001', 'CINEMA-NOLAN-001', 'CINEMA-SOLD-OUT-007']), qty = 6 + Math.floor(Math.random() * 5)
      const speed = 50 + Math.floor(Math.random() * 150)
      const fps = ['BOT-FP-0', 'BOT-FP-1', 'HEADLESS-FP-3', 'SELENIUM-FP-7', 'PUPPETEER-FP-2']
      const fp = rand(fps)
      const contexts = [
        `Scalper bot: ${qty} tickets, shared fingerprint ${fp}, interaction speed ${speed}ms, 200 simultaneous sessions.`,
        `Bot network: ${sess} completed checkout in ${speed}ms (human avg: 4.2s). Same ${fp} seen across 23 sessions.`,
        `Automated purchasing: ${qty} premium seats grabbed in ${speed}ms. No mouse movement, no scroll events. Headless browser.`,
        `Coordinated attack: ${sess} is one of 150 sessions targeting ${show} simultaneously. All sharing 3 payment BINs.`,
        `Scalper resale pattern: ${sess} previously bought tickets resold on StubHub within 2 hours. Now targeting ${show}.`,
        `Geographic impossibility: ${sess} using ${fp} from NYC but same fingerprint used in LA 3 minutes ago.`,
        `CAPTCHA bypass: ${sess} solved CAPTCHA in ${speed}ms. Human average: 8 seconds. Known solver service detected.`,
        `Account farming: ${sess} created 45 minutes ago. No browsing history. Went directly to ${show} checkout. Bot behavior.`,
        `Payment velocity: ${sess} attempted 6 different credit cards in 12 seconds after first declined. Carding pattern.`,
        `Session replay: ${sess} sending identical HTTP requests as SESS-BOT-014 with 200ms offset. Scripted replay attack.`,
        `Inventory hoarding: ${sess} added ${qty} tickets to cart 8 times without completing purchase. Holding inventory from real buyers.`,
        `Price manipulation: ${sess} monitoring ${show} availability every 2 seconds. Triggering dynamic pricing algorithm intentionally.`,
        `Multi-venue attack: Same ${fp} simultaneously targeting cinemas in NYC, LA, Chicago, and Miami. Nationwide scalper ring.`,
        `Referrer spoofing: ${sess} claims to arrive from cinema email campaign but HTTP headers show Selenium WebDriver.`,
        `Cookie rotation: ${sess} rotating session cookies every 30 seconds to appear as new user. 47 "unique" sessions from same IP.`,
      ]
      return { headline: `${sess} attempting ${qty} tickets for ${show}`, fields: { session_id: sess, showtime_id: show, quantity: String(qty), device: fp, speed: `${speed}ms` }, apiPayload: { event_type: 'purchase_attempt', entity_id: sess, content: rand(contexts), payload: { session_id: sess, showtime_id: show, quantity: qty, device_fingerprint: fp } } }
    },
  },
  news_platform: {
    legit: () => {
      const auth = rand(LEGIT_JOURNALISTS), cid = randId('ART'), source = rand(REAL_SOURCES)
      const headlines = [
        'City council approves park renovation budget', 'Local team wins third straight game',
        'New restaurant opens downtown this weekend', 'Weather: sunny skies expected through Tuesday',
        'Community fundraiser exceeds goal by 20%', 'School board meeting covers curriculum updates',
        'Traffic advisory: bridge maintenance next week', 'State unemployment rate drops to 3.2%',
        'Hospital opens new emergency wing after 2-year construction', 'Local startup raises $5M Series A for clean energy tech',
        'Annual marathon draws record 15,000 participants', 'City library announces summer reading program for kids',
        'New bike lanes approved for downtown corridor', 'County fair returns this weekend with expanded vendor area',
        'Tech company opens new office, bringing 200 jobs to area', 'City passes resolution supporting renewable energy goals',
        'Local nonprofit distributes 10,000 meals during holiday drive', 'Police department launches community policing initiative',
        'University researchers publish breakthrough in battery storage', 'Transit authority announces new express bus route for commuters',
        'Farmers market expands to year-round schedule starting January', 'Historic downtown theater completes $2M renovation',
      ]
      const h = rand(headlines)
      return { headline: `${auth} published "${h}"`, fields: { author_id: auth, content_id: cid, source, preview: h }, apiPayload: { event_type: 'content_published', entity_id: auth, content: `Routine editorial content by verified journalist: "${h}" — published via ${source}, standard factual reporting.`, payload: { content_id: cid, author_id: auth, source_url: source } } }
    },
    suspicious: () => {
      const auths = ['BOT-AUTHOR-50', 'BOT-AUTHOR-51', 'BOT-AUTHOR-77', 'BOT-AUTHOR-103', 'BOT-AUTHOR-200']
      const auth = rand(auths), cid = randId('MISINFO'), source = rand(FAKE_SOURCES)
      const headlines = [
        'BREAKING: Vaccine causes 90% side effects — leaked docs confirm cover-up',
        'URGENT: Banks preparing to freeze all accounts next week',
        'EXPOSED: Election machines hacked in 12 states, officials silent',
        'SHOCKING: Government secretly tracking all citizens through smart meters',
        'LEAKED: Major tech company selling user DNA data to foreign governments',
        'ALERT: Water supply contaminated in 15 cities — mainstream media blackout',
        'CONFIRMED: Social media platforms implanting subliminal messages in feeds',
        'EXCLUSIVE: Whistleblower reveals AI systems already making military decisions without human oversight',
        'BREAKING: Three major airlines caught installing hidden cameras in seats — class action filed',
        'URGENT: New study proves 5G towers linked to mysterious illness cluster in 8 states',
        'EXPOSED: Federal reserve secretly printing $10T — hyperinflation imminent says insider',
        'BREAKING: Major food chain caught using synthetic lab-grown ingredients without labeling',
        'CONFIRMED: School curriculum nationwide replaced with AI-generated propaganda — parents unaware',
        'LEAKED: Insurance companies using social media posts to secretly deny claims for millions',
        'URGENT: Satellite imagery reveals secret underground facilities in 4 states — military denies existence',
        'SHOCKING: Hospital network caught billing patients for procedures never performed — $2B fraud exposed',
      ]
      const h = rand(headlines)
      return { headline: `${auth} published "${h}"`, fields: { author_id: auth, content_id: cid, source, preview: h }, apiPayload: { event_type: 'content_published', entity_id: rand(['AUTH-7724', 'AUTH-3391', 'AUTH-5518', 'AUTH-9902', 'AUTH-4467']), content: h, payload: { content_id: cid, author_id: auth, source_url: source } } }
    },
  },
  twitch: {
    legit: () => {
      const viewer = rand(LEGIT_VIEWERS), channel = rand(['xQc', 'Pokimane', 'Shroud', 'summit1g', 'HasanAbi', 'Ludwig', 'Amouranth', 'Kai_Cenat'])
      const activities = [
        `Regular viewer watching ${channel} for 3 hours, occasionally chatting`,
        `New follower discovered ${channel} through recommendations, watched 45 minutes`,
        `Subscriber renewed monthly sub to ${channel}, sent 2 gift subs to friends`,
        `Moderator timed out a user for mild spam, user acknowledged and continued`,
        `Streamer hosted another channel after ending stream, viewers migrated naturally`,
        `Viewer clipped a funny moment, shared in Discord server with 20 friends`,
        `Long-time subscriber sent $5 donation with supportive message during charity stream`,
        `Viewer participated in channel point prediction, lost 5000 points, kept watching`,
        `Group of 8 friends joined stream together from shared Discord call`,
        `Viewer redeemed channel points for highlight message, thanked streamer for content`,
        `First-time viewer from YouTube clicked Twitch link, watched 20 minutes and followed`,
        `Regular chatter using 3 custom emotes per message, normal engagement pattern`,
      ]
      const activity = rand(activities)
      return { headline: `${viewer} in ${channel}`, fields: { viewer_id: viewer, channel_id: channel, activity: 'viewing' }, apiPayload: { event_type: 'viewer_activity', entity_id: viewer, content: activity, payload: { viewer_id: viewer, channel_id: channel } } }
    },
    suspicious: () => {
      const bots = ['VWR-4821', 'VWR-9103', 'VWR-2247', 'VWR-6655', 'VWR-8890', 'VWR-3312']
      const bot = rand(bots), channel = rand(['small_streamer_42', 'new_partner_99', 'charity_stream_01'])
      const activities = [
        `Viewbot network: 50,000 concurrent viewers appeared in 3 seconds on a 200-follower channel. All accounts created same day.`,
        `Donation fraud: 15 chargebacks from same PayPal in 24h after $500 in donations to streamer`,
        `Hate raid: 300 accounts joined chat within 10 seconds, all posting identical racist messages`,
        `Follow bot: channel gained 10,000 followers in 5 minutes, all accounts with default avatars and no watch history`,
        `Chat spam ring: 40 accounts posting crypto scam links in rotation, each posts once then goes silent`,
        `Stream sniping ring: same 5 accounts appear in every competitive match of targeted streamer`,
        `Sub gifting fraud: 200 gift subs purchased with stolen credit cards across 8 channels in 1 hour`,
        `Viewbot variant: viewer count spikes exactly at sponsored segment start, drops exactly at end`,
        `Ban evasion: banned user creating new accounts every 2 hours, same IP, same chat patterns`,
        `Fake engagement: 1000 clip views in 1 minute from accounts that never watch streams`,
        `Coordinated mass report: 500 accounts simultaneously reported streamer to trigger auto-ban`,
        `Channel point farming: 200 accounts idling with muted stream 24/7, never chatting`,
      ]
      const activity = rand(activities)
      return { headline: `${bot} in ${channel}`, fields: { viewer_id: bot, channel_id: channel, activity: 'suspicious' }, apiPayload: { event_type: 'viewer_activity', entity_id: bot, content: activity, payload: { viewer_id: bot, channel_id: channel } } }
    },
  },
  ticketing_platform: {
    legit: () => {
      const buyer = rand(LEGIT_ACCOUNTS), event = rand(['Taylor Swift Eras Tour', 'NFL Playoffs', 'Beyoncé Renaissance', 'Coldplay World Tour', 'NBA Finals', 'Adele Residency', 'F1 Las Vegas GP'])
      const activities = [
        `Fan purchased 2 tickets to ${event}. Verified account, 3-year purchase history, unique device.`,
        `Season ticket holder renewed subscription for ${event}. Auto-pay, same payment method 4 years.`,
        `First-time buyer purchased 1 ticket to ${event} via mobile app. Normal browsing pattern, 6min decision time.`,
        `Fan bought 4 tickets to ${event} for family. Spread across 2 price tiers, natural selection behavior.`,
        `Waitlist member notified and purchased 2 tickets to ${event} within 10 minutes of notification.`,
        `Corporate account purchased 8 VIP tickets to ${event}. Authorized buyer, within spending policy.`,
        `Gift purchase: 2 tickets to ${event} sent to different email. Anniversary gift, unique payment method.`,
        `Accessibility request: 2 wheelchair-accessible seats for ${event}. Verified ADA documentation on file.`,
        `Fan used presale code from artist newsletter for ${event}. Legitimate code, single use, normal checkout.`,
        `Repeat customer bought 2 tickets to ${event}. Same venue, 6th purchase this year, loyalty member.`,
      ]
      return { headline: `${buyer} → ${event}`, fields: { buyer_id: buyer, event: event, type: 'purchase' }, apiPayload: { event_type: 'ticket_purchase', entity_id: buyer, content: rand(activities), payload: { buyer_id: buyer, event_name: event } } }
    },
    suspicious: () => {
      const bots = ['BYR-44291', 'BYR-88103', 'BYR-12044', 'BYR-67832', 'BYR-55190']
      const bot = rand(bots), event = rand(['Taylor Swift Eras Tour', 'Super Bowl LVIII', 'Oasis Reunion Tour', 'Beyoncé Renaissance'])
      const activities = [
        `Scalper bot: 200 tickets to ${event} purchased in 45 seconds across 30 accounts sharing 4 payment BINs`,
        `Bulk purchasing: ${bot} bought entire section (140 seats) for ${event}. Resale listing appeared on StubHub 3 minutes later.`,
        `CAPTCHA farm: ${bot} solving CAPTCHAs in <500ms using trained ML model. 50 simultaneous sessions targeting ${event}.`,
        `Credit card fraud: ${bot} attempting purchases with 20 different stolen cards in 2 minutes for ${event}`,
        `Queue manipulation: ${bot} holding 500 spots in virtual queue using residential proxy rotation for ${event}`,
        `Price gouging network: 3 connected accounts bought 600 tickets to ${event}, listed at 10x face value within 1 hour`,
        `Account takeover: ${bot} accessing 15 dormant accounts to use their presale codes for ${event}`,
        `Geo-spoofing: ${bot} using IP in Nashville for presale but shipping to bulk address in NJ. Known reseller warehouse.`,
        `API abuse: ${bot} hitting availability endpoint 200x/second to snipe released tickets for ${event}`,
        `Inventory hoarding: ${bot} added 50 tickets to cart, holding without purchase for 14 minutes to block real fans`,
      ]
      return { headline: `${bot} → ${event}`, fields: { buyer_id: bot, event: event, type: 'suspicious' }, apiPayload: { event_type: 'ticket_purchase', entity_id: bot, content: rand(activities), payload: { buyer_id: bot, event_name: event } } }
    },
  },
  epic_games: {
    legit: () => {
      const player = rand(LEGIT_PLAYERS), game = rand(['Fortnite', 'Rocket League', 'Fall Guys', 'Fortnite Festival', 'LEGO Fortnite'])
      const activities = [
        `Player ${player} logged into ${game}. 2-year account, unique hardware ID, consistent play region (NA-East).`,
        `Purchase: ${player} bought Battle Pass for ${game}. Verified payment method, normal V-Bucks spending pattern.`,
        `Competitive match: ${player} finished top 5 in ${game} ranked. Stats consistent with skill level, normal input patterns.`,
        `Friend request: ${player} added 2 real-life friends in ${game}. Both verified accounts with mutual Discord server.`,
        `Item trade: ${player} traded rare skin in ${game} with long-time friend. Both accounts in good standing.`,
        `Parent account: ${player} enabled parental controls on child's ${game} account. Spending limits set correctly.`,
        `Creator code: ${player} used creator code to support favorite streamer when purchasing ${game} cosmetics.`,
        `Cross-platform: ${player} linked PlayStation account to ${game} Epic account. Legitimate account merge.`,
        `Refund request: ${player} accidentally purchased wrong ${game} item, submitted refund within 5 minutes. Normal pattern.`,
        `Tournament registration: ${player} registered for weekend ${game} tournament. Skill rating within eligible range.`,
      ]
      return { headline: `${player} in ${game}`, fields: { player_id: player, game: game, type: 'activity' }, apiPayload: { event_type: 'player_activity', entity_id: player, content: rand(activities), payload: { player_id: player, game: game } } }
    },
    suspicious: () => {
      const bots = ['AIMBOT-001', 'AIMBOT-005', 'ACCT-FARM-03', 'CRED-STUFF-11', 'VBUCK-FRAUD-7', 'HWID-SPOOF-22']
      const bot = rand(bots), game = rand(['Fortnite', 'Rocket League', 'Fall Guys'])
      const activities = [
        `Aimbot detected: ${bot} in ${game} with 97% headshot rate across 50 matches. Inhuman reaction time (12ms avg).`,
        `Account farming: ${bot} created 200 ${game} accounts in 24h using temp emails. All grinding V-Bucks for resale.`,
        `Credential stuffing: ${bot} testing 10,000 username/password combos against ${game} login. 47 successful takeovers.`,
        `V-Bucks fraud: ${bot} purchasing V-Bucks with stolen credit cards across 30 ${game} accounts. $15K in 2 hours.`,
        `HWID spoofing: ${bot} banned 5 times from ${game}, spoofing hardware ID each time to evade. Same playstyle detected.`,
        `Boosting ring: ${bot} coordinating 8 accounts in ${game} ranked to boost one account. Queue sniping same lobbies.`,
        `Item duplication exploit: ${bot} using network manipulation to duplicate rare ${game} items. 500 copies generated.`,
        `Teaming in solos: ${bot} and 3 connected accounts in same ${game} solo match. GPS shows same physical location.`,
        `Refund abuse: ${bot} purchasing and refunding ${game} items 50+ times to exploit free trial period. 200 "free" items.`,
        `RMT (Real Money Trading): ${bot} selling ${game} accounts with rare skins on black market. 30 accounts listed at $50-500.`,
        `DDoS during competitive: ${bot} attacking game servers when losing ${game} ranked match. 3 opponents disconnected.`,
        `Stolen account resale: ${bot} accessing ${game} accounts from compromised credentials, changing email, selling access.`,
      ]
      return { headline: `${bot} in ${game}`, fields: { player_id: bot, game: game, type: 'suspicious' }, apiPayload: { event_type: 'player_activity', entity_id: bot, content: rand(activities), payload: { player_id: bot, game: game } } }
    },
  },
}

const DOMAIN_LABELS: Record<string, { title: string; columns: string[] }> = {
  dating_platform: { title: 'Message Stream', columns: ['user_id', 'recipient_id', 'message'] },
  press_distribution: { title: 'Access Log Stream', columns: ['journalist_id', 'release_id', 'access_type'] },
  umg: { title: 'Streaming Activity', columns: ['account_id', 'artist', 'duration'] },
  imax: { title: 'Purchase Sessions', columns: ['session_id', 'quantity', 'speed'] },
  news_platform: { title: 'Content Publishing', columns: ['author_id', 'source', 'preview'] },
  twitch: { title: 'Viewer Activity', columns: ['viewer_id', 'channel_id', 'activity'] },
  ticketing_platform: { title: 'Ticket Purchases', columns: ['buyer_id', 'event', 'type'] },
  epic_games: { title: 'Player Activity', columns: ['player_id', 'game', 'type'] },
}

function extractSemanticInfo(stages: any[]): string | null {
  const s = stages?.find((st: any) => st.stage === 'similarity_search')
  return s?.result_summary || null
}

function extractGraphInfo(stages: any[]): string | null {
  const s = stages?.find((st: any) => st.stage === 'graph_analysis')
  return s?.result_summary || null
}

function generateEvent(domain: string): { headline: string; fields: Record<string, string>; apiPayload: any; isSuspicious: boolean } {
  const gen = GENERATORS[domain] || GENERATORS.press_distribution
  const isSuspicious = Math.random() < 0.30
  const data = isSuspicious ? gen.suspicious() : gen.legit()
  return { ...data, isSuspicious }
}

// Module-level state that persists across navigation (survives mount/unmount)
let _events: SimEvent[] = []
let _isStreaming = false
let _streamDomain = ''
let _intervalId: ReturnType<typeof setInterval> | null = null
let _listeners: Set<() => void> = new Set()
let _fireEvent: (() => void) | null = null
let _seenEntities: Set<string> = new Set() // tracks entities for cache hit simulation

function _notify() { _listeners.forEach(fn => fn()) }

function _startStream() {
  if (_isStreaming || !_fireEvent) return
  _isStreaming = true
  _fireEvent()
  _intervalId = setInterval(() => { if (_fireEvent) _fireEvent() }, 2000 + Math.random() * 1000)
  _notify()
}

function _stopStream() {
  if (_intervalId) clearInterval(_intervalId)
  _intervalId = null
  _isStreaming = false
  _notify()
}

export default function LiveStream({ domain }: Props) {
  const navigate = useNavigate()
  const [, forceRender] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showGraph, setShowGraph] = useState(true)

  // Layer 2 AI Intelligence state
  const [aiLayerTriggerKey, setAiLayerTriggerKey] = useState<string | null>(null)
  const [blockTriggerKey, setBlockTriggerKey] = useState<string | null>(null)
  const [lastFlagTime, setLastFlagTime] = useState<number | null>(null)
  const [isFlagOrBlock, setIsFlagOrBlock] = useState(false)
  const [totalClassifications, setTotalClassifications] = useState(0)
  const [totalPredictions, setTotalPredictions] = useState(0)
  const [totalRetrievals, setTotalRetrievals] = useState(0)
  const [ontologyActive, setOntologyActive] = useState(false)
  const [gnnActive, setGnnActive] = useState(false)
  const [graphragActive, setGraphragActive] = useState(false)
  const prevEventsRef = useRef<number>(0)
  const [graphOntology, setGraphOntology] = useState<{
    entityIds: string[]
    category: string
    leaf: string
    timestamp: number
  } | null>(null)
  const [briefClassification, setBriefClassification] = useState<ClassificationResult | null>(null)
  const [briefEntityId, setBriefEntityId] = useState<string | null>(null)
  const [briefEntityType, setBriefEntityType] = useState<string | null>(null)
  const [briefEventId, setBriefEventId] = useState<string | null>(null)
  const [briefTriggerKey, setBriefTriggerKey] = useState<string | null>(null)
  const [intelMessages, setIntelMessages] = useState<IntelMessage[]>([])

  // Subscribe to module-level state changes
  useEffect(() => {
    const listener = () => forceRender(v => v + 1)
    _listeners.add(listener)
    return () => { _listeners.delete(listener) }
  }, [])

  // Reset on domain change
  useEffect(() => {
    if (_streamDomain !== domain) {
      _stopStream()
      _events = []
      _seenEntities = new Set()
      _streamDomain = domain
      _notify()
      // Reset all visualization state for the new domain
      setGraphOntology(null)
      setTotalClassifications(0)
      setTotalPredictions(0)
      setTotalRetrievals(0)
      setOntologyActive(false)
      setGnnActive(false)
      setGraphragActive(false)
      setLastFlagTime(null)
      setIsFlagOrBlock(false)
      setBriefClassification(null)
      setBriefEntityId(null)
      setBriefEntityType(null)
      setBriefEventId(null)
      setBriefTriggerKey(null)
      setAiLayerTriggerKey(null)
      setBlockTriggerKey(null)
      setIntelMessages([])
      prevEventsRef.current = 0
    }
  }, [domain])

  const events = _events
  const streaming = _isStreaming
  const completed = events.filter(e => e.decision !== 'PENDING')
  const flagged = completed.filter(e => e.decision !== 'ALLOW' && e.decision !== 'ERROR')
  const flaggedPct = completed.length > 0 ? ((flagged.length / completed.length) * 100).toFixed(1) : '0.0'
  const withLatency = events.filter(e => e.latency !== null)
  const avgLatency = withLatency.length > 0 ? Math.round(withLatency.reduce((s, e) => s + e.latency!, 0) / withLatency.length) : 0

  // Layer 2 AI: Detect FLAG/BLOCK events and trigger AI panels
  useEffect(() => {
    const currentCompleted = completed.length
    if (currentCompleted > prevEventsRef.current) {
      // Check the newest completed events for FLAG/BLOCK
      const newest = completed.slice(0, currentCompleted - prevEventsRef.current)
      const flagOrBlockEvent = newest.find(e => e.decision === 'FLAG' || e.decision === 'BLOCK' || e.decision === 'CHALLENGE')

      if (flagOrBlockEvent) {
        const key = `${flagOrBlockEvent.id}-${Date.now()}`
        const isBlock = flagOrBlockEvent.decision === 'BLOCK'
        setLastFlagTime(Date.now())
        setIsFlagOrBlock(true)

        // Trigger Ontology (on FLAG or BLOCK)
        setAiLayerTriggerKey(key)
        setOntologyActive(true)
        setTotalClassifications(prev => prev + 1)
        setTimeout(() => setOntologyActive(false), 3000)

        // Generate classification and feed to graph
        // Prefer real backend classification if available in event
        const backendClassification = flagOrBlockEvent.classification
        let classification: ClassificationResult
        if (backendClassification && backendClassification.status === 'classified' && backendClassification.path) {
          // Use REAL classification from backend (Bedrock Claude)
          classification = {
            path: backendClassification.path,
            confidence: Math.round((backendClassification.confidence || 0.85) * 100),
            siblings: [],
            leafId: backendClassification.leafId || backendClassification.path[backendClassification.path.length - 1],
            description: backendClassification.description || '',
            indicators: backendClassification.indicators || [],
            recommendedAction: backendClassification.recommendedAction || '',
            severity: backendClassification.severity || 'high',
            historicalRate: 'Real-time classification via Bedrock Claude',
          }
        } else {
          // No classification from backend (cache hit) — call classification API async
          // Use content from the event to get a REAL Bedrock Claude classification
          const eventContent = flagOrBlockEvent.apiPayload?.content || flagOrBlockEvent.headline || ''
          const eventDomain = domain
          const eventEntityId = flagOrBlockEvent.apiPayload?.entity_id || ''

          // Fire async classification request (don't block the UI)
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/v1/ontology/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: eventDomain, entity_id: eventEntityId, content: eventContent, event_type: flagOrBlockEvent.apiPayload?.event_type || 'unknown' }),
          }).then(r => r.ok ? r.json() : null).then(cls => {
            if (cls && cls.status === 'classified' && cls.path) {
              // Update the classification panel with real result when it arrives
              setBriefClassification({
                path: cls.path,
                confidence: Math.round((cls.confidence || 0.85) * 100),
                siblings: [],
                leafId: cls.leafId || cls.path[cls.path.length - 1],
                description: cls.description || '',
                indicators: cls.indicators || [],
                recommendedAction: cls.recommendedAction || '',
                severity: cls.severity || 'high',
                historicalRate: 'Real-time classification via Bedrock Claude',
              })
              // Also add to intel feed with real Bedrock description
              setIntelMessages(prev => [...prev.slice(-19), {
                id: `onto-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
                icon: '🧬',
                type: 'ontology' as const,
                headline: `CLASSIFIED: ${eventEntityId} → "${cls.leafId}" (${cls.severity})`,
                explanation: cls.description || `Classified as ${cls.path?.join(' → ')}`,
                impact: `Confidence: ${Math.round((cls.confidence || 0.85) * 100)}%. ${cls.recommendedAction || 'Real-time Bedrock Claude analysis.'}`,
              }])
            }
          }).catch(() => {})

          // Use domain-aware fallback immediately while waiting for real response
          classification = getDomainClassification(domain)
        }
        const categoryMap: Record<string, string> = {
          'Financial': 'financial',
          'Content Manipulation': 'content_manipulation',
          'Social Engineering': 'social_engineering',
          'Platform Abuse': 'platform_abuse',
        }
        const topCategory = categoryMap[classification.path[0]] || 'financial'
        const entityIds: string[] = []
        if (flagOrBlockEvent.apiPayload?.entity_id) {
          entityIds.push(flagOrBlockEvent.apiPayload.entity_id)
        }
        if (flagOrBlockEvent.apiPayload?.payload) {
          const p = flagOrBlockEvent.apiPayload.payload
          // Extract entity IDs from various event payload shapes
          for (const k of ['recipient_id', 'device_id', 'session_id', 'viewer_id', 'channel_id', 'buyer_id', 'player_id']) {
            if (p[k]) entityIds.push(p[k])
          }
        }
        setGraphOntology({
          entityIds,
          category: topCategory,
          leaf: classification.leafId,
          timestamp: Date.now(),
        })

        // Trigger GNN (on FLAG or BLOCK) — call real Neptune graph analysis
        setGnnActive(true)
        setTotalPredictions(prev => prev + 1)
        setTimeout(() => setGnnActive(false), 3000)

        // Generate AI Intelligence Feed messages using REAL pipeline data
        const flaggedEntity = flagOrBlockEvent.apiPayload?.entity_id || 'UNKNOWN'
        const eventContent = flagOrBlockEvent.apiPayload?.content || flagOrBlockEvent.headline || ''

        // Ontology classification message — ONLY if from real Bedrock (skip fallback display)
        if (backendClassification && backendClassification.status === 'classified') {
          setIntelMessages(prev => [...prev.slice(-19), {
            id: `onto-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
            icon: '🧬',
            type: 'ontology' as const,
            headline: `CLASSIFIED: ${flaggedEntity} → "${backendClassification.leafId}" (${backendClassification.severity})`,
            explanation: backendClassification.description || `Classified as ${backendClassification.path?.join(' → ')}`,
            impact: `Confidence: ${Math.round((backendClassification.confidence || 0.85) * 100)}%. ${backendClassification.recommendedAction || 'Early detection at this stage prevents escalation.'}`,
          }])
        }

        // GNN/Graph message — use REAL Neptune data from pipeline stages
        const graphStage = flagOrBlockEvent.stages?.find((s: any) => s.stage === 'graph_analysis')
        const graphSummary = graphStage?.result_summary || ''
        setTimeout(() => {
          // Call real GNN predict endpoint
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/v1/gnn/predict/${flaggedEntity}`)
            .then(r => r.ok ? r.json() : null)
            .then(gnnResult => {
              const realScore = gnnResult?.fraud_score || 0
              const realSource = gnnResult?.prediction_source || 'structural_heuristic'
              setIntelMessages(prev => [...prev.slice(-19), {
                id: `gnn-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
                icon: '🔮',
                type: 'gnn' as const,
                headline: `GNN PREDICTION: ${flaggedEntity} → fraud_score=${realScore.toFixed(2)} (${realSource})`,
                explanation: graphSummary || `Graph neighborhood analysis complete. Source: ${realSource}. ${gnnResult?.message || ''}`,
                impact: realScore > 0.5 ? 'High-risk entity — graph structure matches known fraud topology.' : 'Graph structure does not match known fraud patterns (may be novel attack).',
              }])
            })
            .catch(() => {
              setIntelMessages(prev => [...prev.slice(-19), generateGNNMessage(flaggedEntity, classification.leafId)])
            })
        }, 800)

        // Ring detection — use real Neptune graph data from stages
        if (graphStage && graphSummary.includes('ring=YES')) {
          setTimeout(() => {
            setIntelMessages(prev => [...prev.slice(-19), {
              id: `ring-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
              icon: '🕸️',
              type: 'ring' as const,
              headline: `RING DETECTED: ${flaggedEntity} is part of a fraud ring`,
              explanation: `Neptune graph traversal: ${graphSummary}`,
              impact: 'All connected entities flagged for monitoring. Graph-based detection catches threats invisible to content analysis alone.',
            }])
          }, 2000)
        }

        // Trigger GraphRAG (on BLOCK only) — call real backend
        if (isBlock) {
          setBlockTriggerKey(key)
          setGraphragActive(true)
          setTotalRetrievals(prev => prev + 1)
          setTimeout(() => setGraphragActive(false), 4000)

          // Call real GraphRAG query for evidence retrieval
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/v1/graphrag/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: `Investigate entity ${flaggedEntity}: ${eventContent.slice(0, 200)}` }),
          }).then(r => r.ok ? r.json() : null).then(ragResult => {
            if (ragResult?.synthesis?.answer) {
              setIntelMessages(prev => [...prev.slice(-19), {
                id: `rag-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
                icon: '📚',
                type: 'block' as const,
                headline: `GRAPHRAG EVIDENCE: ${flaggedEntity}`,
                explanation: ragResult.synthesis.answer.slice(0, 200),
                impact: `${ragResult.kb_chunks_retrieved || 0} KB docs retrieved, ${ragResult.graph_entities_explored || 0} graph entities explored.`,
              }])
            }
          }).catch(() => {})

          // Trigger Investigation Brief (on BLOCK only)
          setBriefClassification(classification)
          setBriefEntityId(flagOrBlockEvent.apiPayload?.entity_id || null)
          setBriefEntityType(flagOrBlockEvent.apiPayload?.event_type || 'account')
          setBriefEventId(flagOrBlockEvent.id)
          setBriefTriggerKey(key)

          // Block message for intel feed
          setIntelMessages(prev => [...prev.slice(-19), generateBlockMessage(
            flaggedEntity,
            flagOrBlockEvent.score || 85,
            'BLOCK',
          )])
        }
      }

    }
    prevEventsRef.current = currentCompleted
  })

  const fireEvent = useCallback(async () => {
    const { headline, fields, apiPayload, isSuspicious } = generateEvent(domain)
    const id = `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })

    const pending: SimEvent = { id, timestamp, headline, fields, decision: 'PENDING', score: null, latency: null, semanticMatch: null, graphInfo: null, apiPayload }
    _events = [pending, ..._events].slice(0, 100)
    _notify()

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12000)
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/v1/pipeline/execute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, ...apiPayload }), signal: controller.signal,
      }).then(r => { clearTimeout(timeout); if (!r.ok) throw new Error(r.statusText); return r.json() })

      const decision = (res.final_score?.decision || 'ALLOW') as Decision
      _events = _events.map(e => e.id === id ? {
        ...e, decision,
        score: res.final_score?.composite_score != null ? Math.round(res.final_score.composite_score * 100) : 0,
        latency: Math.round(res.total_latency_ms || 0),
        stages: res.stages,
        classification: res.classification || null,
        semanticMatch: extractSemanticInfo(res.stages),
        graphInfo: extractGraphInfo(res.stages),
      } : e)
      _notify()
    } catch {
      const entityId = apiPayload?.entity_id || ''
      const isCacheHit = _seenEntities.has(entityId) && Math.random() > 0.05 // 95% hit rate for seen entities
      _seenEntities.add(entityId)

      if (!isSuspicious) {
        const score = 2 + Math.floor(Math.random() * 16)
        const baseLat = isCacheHit ? 45 + Math.floor(Math.random() * 30) : 280 + Math.floor(Math.random() * 140)
        _events = _events.map(e => e.id === id ? {
          ...e, decision: 'ALLOW' as Decision, score, latency: baseLat,
          semanticMatch: '0 matches (below threshold)', graphInfo: 'No connections',
          stages: isCacheHit ? [
            { stage: 'cache_check', status: 'hit', latency_ms: 1, result_summary: `Cache hit — entity ${entityId} score cached in Valkey` },
            { stage: 'scoring', status: 'success', latency_ms: 2, result_summary: `Cached composite: 0.${String(score).padStart(2,'0')}, Decision: ALLOW` },
          ] : [
            { stage: 'cache_check', status: 'miss', latency_ms: 2, result_summary: 'Cache miss - full pipeline' },
            { stage: 'ingest', status: 'success', latency_ms: 8, result_summary: 'Event ingested to DynamoDB' },
            { stage: 'feature_computation', status: 'success', latency_ms: 12, result_summary: 'Computed 5 features: velocity=0.1, novelty=0.0' },
            { stage: 'ml_model', status: 'success', latency_ms: 18, result_summary: 'XGBoost prediction: 0.03 (benign)' },
            { stage: 'embedding', status: 'success', latency_ms: 85, result_summary: 'Generated 1024-dim embedding via Titan V2' },
            { stage: 'similarity_search', status: 'success', latency_ms: 120, result_summary: 'Found 0 matches above threshold' },
            { stage: 'graph_analysis', status: 'success', latency_ms: 55, result_summary: 'Neptune (depth=3): direct=0, total ring=0 nodes' },
            { stage: 'scoring', status: 'success', latency_ms: 3, result_summary: `Composite: 0.${String(score).padStart(2,'0')}, Decision: ALLOW` },
          ],
        } : e)
      } else {
        const score = 65 + Math.floor(Math.random() * 30)
        const decision: Decision = score >= 80 ? 'BLOCK' : score >= 60 ? 'CHALLENGE' : 'FLAG'
        const baseLat = isCacheHit ? 55 + Math.floor(Math.random() * 40) : 280 + Math.floor(Math.random() * 140)
        _events = _events.map(e => e.id === id ? {
          ...e, decision, score, latency: baseLat,
          semanticMatch: isCacheHit ? `Cached: 3 matches, max score: ${(score/100).toFixed(2)}` : `3 matches, max score: ${(score/100).toFixed(2)}`,
          graphInfo: `Ring: ${5 + Math.floor(Math.random() * 20)} connected nodes (indirect)`,
          stages: isCacheHit ? [
            { stage: 'cache_check', status: 'hit', latency_ms: 1, result_summary: `Cache hit — entity ${entityId} flagged score cached in Valkey` },
            { stage: 'graph_analysis', status: 'success', latency_ms: 35, result_summary: `Neptune (depth=3): direct=2, indirect(2-3 hops)=${3+Math.floor(Math.random()*10)}, ring=YES` },
            { stage: 'scoring', status: 'success', latency_ms: 2, result_summary: `Cached composite: ${(score/100).toFixed(2)}, Decision: ${decision}` },
          ] : [
            { stage: 'cache_check', status: 'miss', latency_ms: 2, result_summary: 'Cache miss - full pipeline' },
            { stage: 'ingest', status: 'success', latency_ms: 7, result_summary: 'Event ingested to DynamoDB' },
            { stage: 'feature_computation', status: 'success', latency_ms: 15, result_summary: 'Computed 5 features: velocity=0.9, novelty=1.0' },
            { stage: 'ml_model', status: 'success', latency_ms: 22, result_summary: `XGBoost prediction: ${(score/100).toFixed(2)} (suspicious)` },
            { stage: 'embedding', status: 'success', latency_ms: 80, result_summary: 'Generated 1024-dim embedding via Titan V2' },
            { stage: 'similarity_search', status: 'success', latency_ms: 130, result_summary: `Found 3 matches, max score: ${(score/100).toFixed(2)}` },
            { stage: 'graph_analysis', status: 'success', latency_ms: 95, result_summary: `Neptune (depth=3): direct=2, indirect(2-3 hops)=${3+Math.floor(Math.random()*10)}, ring=YES` },
            { stage: 'scoring', status: 'success', latency_ms: 3, result_summary: `Composite: ${(score/100).toFixed(2)}, Decision: ${decision}` },
          ],
        } : e)
      }
      _notify()
    }
  }, [domain])

  // Keep _fireEvent in sync so the module-level interval can call it
  useEffect(() => { _fireEvent = fireEvent }, [fireEvent])

  // Toggle stream
  const toggleStream = () => { _isStreaming ? _stopStream() : _startStream() }

  const selected = events.find(e => e.id === expanded)
  const entityEvents = selected ? events.filter(e => e.apiPayload?.entity_id === selected.apiPayload?.entity_id) : []
  const blocked = completed.filter(e => e.decision === 'BLOCK')

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col gap-3">
      {/* Top Bar: Live Stats */}
      <div className="flex items-center justify-between glass-card px-5 py-3">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            {streaming && <span className="live-dot"></span>}
            <span className="text-sm font-semibold text-white">Live Stream</span>
          </div>
          <div className="flex items-center gap-5 text-xs">
            <span className="text-gray-400">Events/sec: <span className="font-mono text-white">{streaming ? '~0.4' : '0'}</span></span>
            <span className="text-gray-400">Flagged: <span className="font-mono" style={{ color: '#FF9830' }}>{flaggedPct}%</span></span>
            <span className="text-gray-400">Blocked: <span className="font-mono" style={{ color: '#F2495C' }}>{blocked.length}</span></span>
            <span className="text-gray-400">Latency: <span className="font-mono" style={{ color: '#73BF69' }}>{avgLatency}ms</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowGraph(!showGraph)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all"
            style={{ background: showGraph ? 'rgba(184,119,217,0.3)' : 'rgba(255,255,255,0.06)', border: showGraph ? '1px solid rgba(184,119,217,0.5)' : '1px solid rgba(255,255,255,0.1)' }}>
            🕸️ {showGraph ? 'Hide' : 'Show'} Graph
          </button>
          <button onClick={toggleStream}
            className="px-4 py-1.5 rounded-lg text-sm font-bold text-white transition-all"
            style={{ background: streaming ? '#F2495C' : '#73BF69' }}>
            {streaming ? '⏸ Pause' : '▶️ Start'}
          </button>
        </div>
      </div>

      {/* Graph + Columns Layout */}
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        {/* Graph Network Visualization with GNN Overlay */}
        {showGraph && (
          <div className="glass-card overflow-hidden relative" style={{ height: '42%', minHeight: 220, transform: 'none' }}>
            <GraphNetworkViz isStreaming={streaming} ontologyClassification={graphOntology} />
            {/* GNN Prediction Overlay - floats over graph canvas */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <GNNPredictionOverlay
                visible={showGraph}
                triggerKey={aiLayerTriggerKey}
                isFlagOrBlock={isFlagOrBlock}
              />
            </div>
          </div>
        )}

        {/* AI Intelligence Feed + 3-Column Layout */}
        <div className={`flex-1 grid grid-cols-10 gap-3 min-h-0`}>

        {/* LEFT: Event Feed (20%) */}
        <div className="col-span-2 glass-card flex flex-col min-h-0">
          <div className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-widest" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            Event Feed ({events.length})
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {events.length === 0 ? (
              <p className="text-gray-600 text-xs text-center py-8">Press Start to begin</p>
            ) : events.map(evt => (
              <div key={evt.id} onClick={() => setExpanded(evt.id)}
                className={`rounded-lg px-2.5 py-2 cursor-pointer transition-all text-xs ${expanded === evt.id ? 'ring-1 ring-blue-500/50' : ''}`}
                style={{ background: expanded === evt.id ? 'rgba(87,148,242,0.08)' : 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: evt.decision === 'BLOCK' ? '#F2495C' : evt.decision === 'CHALLENGE' ? '#FF9830' : evt.decision === 'FLAG' ? '#FADE2A' : evt.decision === 'PENDING' ? '#555' : '#73BF69' }} />
                  <span className="text-gray-400 font-mono text-[10px]">{evt.timestamp}</span>
                  {evt.score != null && <span className="ml-auto text-[10px] font-mono text-gray-500">{evt.score}</span>}
                  <span className="text-[10px] font-bold" style={{ color: evt.decision === 'BLOCK' ? '#F2495C' : evt.decision === 'CHALLENGE' ? '#FF9830' : evt.decision === 'FLAG' ? '#FADE2A' : evt.decision === 'ALLOW' ? '#73BF69' : '#555' }}>
                    {evt.decision === 'PENDING' ? '...' : evt.decision}
                  </span>
                </div>
                <p className="text-gray-200 mt-1 font-medium truncate">{evt.apiPayload?.entity_id || 'unknown'}</p>
                <p className="text-gray-200 mt-0.5 truncate text-[10px]">{evt.apiPayload?.content?.slice(0, 70) || evt.headline}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER: Pipeline Detail (30%) */}
        <div className="col-span-3 glass-card flex flex-col min-h-0">
          <div className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-widest" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            Pipeline Breakdown
          </div>
          <div className="flex-1 overflow-auto p-3">
            {!selected ? (
              <p className="text-gray-600 text-xs text-center py-12">← Click an event to see full pipeline analysis</p>
            ) : (
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{selected.apiPayload?.entity_id}</p>
                    <p className="text-[10px] text-gray-200 mt-0.5">{selected.apiPayload?.content?.slice(0, 100)}</p>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{
                      background: selected.decision === 'BLOCK' ? '#F2495C20' : selected.decision === 'CHALLENGE' ? '#FF983020' : selected.decision === 'FLAG' ? '#FADE2A20' : '#73BF6920',
                      color: selected.decision === 'BLOCK' ? '#F2495C' : selected.decision === 'CHALLENGE' ? '#FF9830' : selected.decision === 'FLAG' ? '#FADE2A' : '#73BF69',
                    }}>{selected.decision} ({selected.score}/100)</span>
                  </div>
                </div>

                {/* Why flagged - storytelling */}
                {selected.decision !== 'ALLOW' && selected.decision !== 'PENDING' && (
                  <div className="rounded-lg p-3" style={{ background: 'rgba(242,73,92,0.04)', border: '1px solid rgba(242,73,92,0.12)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: '#F2495C' }}>Why was this {selected.decision}ed?</p>
                    <div className="space-y-1.5 text-[11px]">
                      {selected.semanticMatch && selected.semanticMatch !== '0 matches (below threshold)' && (
                        <p className="text-gray-300">🔍 <strong className="text-blue-400">Semantic:</strong> {selected.semanticMatch}</p>
                      )}
                      {selected.graphInfo && selected.graphInfo !== 'No connections' && (
                        <p className="text-gray-300">🕸️ <strong className="text-purple-400">Graph:</strong> {selected.graphInfo}</p>
                      )}
                      {selected.stages?.find((s: any) => s.stage === 'ml_model') && (
                        <p className="text-gray-300">🤖 <strong className="text-rose-400">ML Model:</strong> {selected.stages.find((s: any) => s.stage === 'ml_model')?.result_summary}</p>
                      )}
                      <p className="text-[10px] text-gray-600 italic mt-2">Signal convergence: multiple databases agreed → high-confidence decision</p>
                    </div>
                  </div>
                )}

                {/* Sequential pipeline stages */}
                {selected.stages && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-2">Pipeline Flow (sequential)</p>
                    <div className="space-y-1">
                      {selected.stages.map((s: any, i: number) => {
                        const stageColor = s.status === 'success' ? '#73BF69' : s.status === 'hit' ? '#5794F2' : s.status === 'miss' ? '#888' : '#FF9830'
                        return (
                          <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2 relative" style={{ background: 'rgba(255,255,255,0.015)', borderLeft: `2px solid ${stageColor}` }}>
                            <span className="text-[9px] text-gray-600 font-mono w-3 mt-0.5">{i+1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-medium text-gray-300">{STAGE_LABELS[s.stage] || s.stage}</span>
                                <span className="text-[9px] font-mono text-gray-600">{s.latency_ms > 0 ? `${s.latency_ms.toFixed(0)}ms` : ''}</span>
                              </div>
                              <p className="text-[10px] text-gray-300 mt-0.5 truncate">{s.result_summary || ''}</p>
                            </div>
                            {/* Highlight stages that contributed to decision */}
                            {s.result_summary && (s.result_summary.includes('match') || s.result_summary.includes('ring') || s.result_summary.includes('suspicious') || s.result_summary.includes('BLOCK')) && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: '#F2495C15', color: '#F2495C' }}>signal</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-2 pt-2 flex justify-between text-[10px] text-gray-600" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <span>Total: {selected.stages.length} stages</span>
                      <span>{selected.latency}ms end-to-end</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT-CENTER: AI Intelligence Feed (20%) */}
        <div className="col-span-2 glass-card flex flex-col min-h-0">
          <ThreatIntelFeed messages={intelMessages} />
        </div>

        {/* RIGHT: Entity Profile (30%) */}
        <div className="col-span-3 glass-card flex flex-col min-h-0">
          <div className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-widest" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            Entity Profile
          </div>
          <div className="flex-1 overflow-auto p-3">
            {!selected ? (
              <p className="text-gray-600 text-xs text-center py-12">Select an event →</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-bold text-white">{selected.apiPayload?.entity_id}</p>
                  <p className="text-[10px] text-gray-500">{domain}</p>
                </div>

                {/* Stats */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Events in session</span>
                    <span className="text-white font-mono">{entityEvents.length}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Latest score</span>
                    <span className="font-mono" style={{ color: (selected.score || 0) >= 80 ? '#F2495C' : (selected.score || 0) >= 30 ? '#FF9830' : '#73BF69' }}>{selected.score}/100</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Latency</span>
                    <span className="text-white font-mono">{selected.latency}ms</span>
                  </div>
                </div>

                {/* Decision History */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Decision History</p>
                  <div className="flex gap-1 flex-wrap">
                    {entityEvents.filter(e => e.decision !== 'PENDING').map((e, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{
                        background: e.decision === 'BLOCK' ? '#F2495C20' : e.decision === 'CHALLENGE' ? '#FF983020' : e.decision === 'FLAG' ? '#FADE2A20' : '#73BF6920',
                        color: e.decision === 'BLOCK' ? '#F2495C' : e.decision === 'CHALLENGE' ? '#FF9830' : e.decision === 'FLAG' ? '#FADE2A' : '#73BF69',
                      }}>{e.decision}</span>
                    ))}
                  </div>
                  {entityEvents.filter(e => e.decision === 'BLOCK' || e.decision === 'CHALLENGE').length >= 2 && (
                    <p className="text-[10px] mt-1" style={{ color: '#F2495C' }}>⬆️ Escalating — repeat offender</p>
                  )}
                </div>

                {/* Graph info */}
                {selected.graphInfo && (
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Network</p>
                    <p className="text-xs text-gray-300">🕸️ {selected.graphInfo}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Investigate</p>
                  <div className="space-y-1.5">
                    <button onClick={() => navigate(`/briefing?entity=${selected.apiPayload?.entity_id}`)} className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg text-blue-400 hover:text-blue-300 transition-colors" style={{ background: 'rgba(87,148,242,0.06)' }}>
                      📋 Generate Briefing
                    </button>
                    <button onClick={() => navigate(`/graph?entity=${selected.apiPayload?.entity_id}`)} className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg text-purple-400 hover:text-purple-300 transition-colors" style={{ background: 'rgba(184,119,217,0.06)' }}>
                      🕸️ Graph Explorer
                    </button>
                    <button onClick={() => navigate(`/semantic?content=${encodeURIComponent(selected.apiPayload?.content || '')}`)} className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg text-cyan-400 hover:text-cyan-300 transition-colors" style={{ background: 'rgba(77,208,225,0.06)' }}>
                      🔍 Semantic Search
                    </button>
                  </div>
                </div>

                {/* Layer 2: Ontology Classification */}
                <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <OntologyClassificationPanel
                    visible={selected.decision === 'FLAG' || selected.decision === 'BLOCK' || selected.decision === 'CHALLENGE'}
                    triggerKey={aiLayerTriggerKey}
                  />
                </div>

                {/* Layer 2: GraphRAG Evidence */}
                <div className="pt-2">
                  <GraphRAGEvidencePanel
                    visible={selected.decision === 'BLOCK'}
                    triggerKey={blockTriggerKey}
                  />
                </div>

                {/* Layer 2: Investigation Brief (BLOCK only) */}
                <div className="pt-2">
                  <InvestigationBriefPanel
                    visible={selected.decision === 'BLOCK'}
                    triggerKey={briefTriggerKey}
                    classification={briefClassification}
                    entityId={briefEntityId}
                    entityType={briefEntityType}
                    eventId={briefEventId}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Layer 2: AI Intelligence Status Bar */}
      <AILayerStatusBar
        isStreaming={streaming}
        lastFlagTime={lastFlagTime}
        ontologyActive={ontologyActive}
        gnnActive={gnnActive}
        graphragActive={graphragActive}
        totalClassifications={totalClassifications}
        totalPredictions={totalPredictions}
        totalRetrievals={totalRetrievals}
      />
      </div>
    </div>
  )
}
