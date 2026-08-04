import { useState, useEffect, useRef } from 'react'

/*
 * ═══════════════════════════════════════════════════════════════════════════════
 * PRODUCTION NOTE: Self-Learning Ontology System
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * In production, this fraud ontology is NOT static — it is a self-learning,
 * continuously evolving taxonomy powered by multiple feedback mechanisms:
 *
 * 1. NEPTUNE SEMANTIC ONTOLOGY (Bottom-Up Pattern Discovery)
 *    - Neptune Analytics runs periodic graph algorithms (community detection,
 *      label propagation) over the full entity-relationship graph.
 *    - When new clusters of connected fraud entities emerge that don't map to
 *      any existing taxonomy leaf, Neptune flags them as "uncategorized patterns."
 *    - These patterns are proposed as candidate new leaf nodes (e.g., a novel
 *      crypto-romance hybrid scam that doesn't fit existing categories).
 *
 * 2. GNN EMBEDDING CLUSTER DISCOVERY
 *    - The Graph Neural Network generates embeddings for all flagged entities.
 *    - HDBSCAN clustering on the embedding space reveals natural groupings.
 *    - When a dense cluster forms that has low cosine similarity to all existing
 *      taxonomy leaf embeddings, it signals an emerging fraud type.
 *    - The system proposes: "New cluster detected: 47 entities, avg distance 0.82
 *      from nearest known category 'Credential Stuffing' — suggest new leaf?"
 *
 * 3. ANALYST FEEDBACK LOOPS
 *    - When a human analyst overrides a classification (e.g., reclassifies
 *      "Bot Network" → new category "AI Agent Swarm"), the override is recorded.
 *    - After N analyst overrides converge on a new pattern, the system proposes
 *      a taxonomy update with supporting evidence.
 *    - Analyst approval is required before new categories enter the live taxonomy
 *      (human-in-the-loop governance).
 *
 * 4. PERIODIC TAXONOMY EVOLUTION BATCH JOBS
 *    - Nightly/weekly batch jobs compare:
 *      a) Current graph structure (communities, motifs, ring patterns)
 *      b) Existing taxonomy coverage (which patterns are well-classified vs gaps)
 *      c) Temporal drift (are certain categories seeing 10x more entities?)
 *    - Output: "Taxonomy Health Report" with suggestions:
 *      - Merge underused categories
 *      - Split overpopulated categories into sub-types
 *      - Propose entirely new branches based on data evidence
 *
 * PRODUCTION ARCHITECTURE:
 *    - GET /api/v1/ontology/current → Returns the LIVE taxonomy (evolves over time)
 *    - GET /api/v1/ontology/suggestions → Queue of proposed new categories from GNN/Neptune
 *    - POST /api/v1/ontology/approve → Analyst approves a suggested category into live taxonomy
 *    - GET /api/v1/ontology/history → Audit trail of all taxonomy changes over time
 *
 * CURRENT DEMO:
 *    - Uses a static, pre-seeded taxonomy (FRAUD_ONTOLOGY below) for illustration.
 *    - In production, this array would be fetched from the API and could change
 *      between sessions as the system learns new fraud patterns.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Ontology Tree Data ───────────────────────────────────────────────────────

export interface OntologyNode {
  id: string
  label: string
  children?: OntologyNode[]
}

export const FRAUD_ONTOLOGY: OntologyNode[] = [
  {
    id: 'financial', label: 'Financial',
    children: [
      {
        id: 'payment_fraud', label: 'Payment Fraud',
        children: [
          { id: 'card_not_present', label: 'Card-Not-Present' },
          { id: 'card_present', label: 'Card-Present' },
          { id: 'account_takeover', label: 'Account Takeover' },
          { id: 'refund_abuse', label: 'Refund Abuse' },
        ],
      },
      {
        id: 'identity_fraud', label: 'Identity Fraud',
        children: [
          { id: 'synthetic_identity', label: 'Synthetic Identity' },
          { id: 'credential_stuffing', label: 'Credential Stuffing' },
          { id: 'identity_theft', label: 'Identity Theft' },
        ],
      },
      {
        id: 'money_laundering', label: 'Money Laundering',
        children: [
          { id: 'layering', label: 'Layering' },
          { id: 'smurfing', label: 'Smurfing' },
          { id: 'shell_company', label: 'Shell Company' },
        ],
      },
    ],
  },
  {
    id: 'content', label: 'Content Manipulation',
    children: [
      {
        id: 'artificial_engagement', label: 'Artificial Engagement',
        children: [
          { id: 'stream_farming', label: 'Stream Farming' },
          { id: 'click_fraud', label: 'Click Fraud' },
          { id: 'bot_network', label: 'Bot Network' },
          { id: 'view_inflation', label: 'View Inflation' },
        ],
      },
      {
        id: 'misinformation', label: 'Misinformation',
        children: [
          { id: 'deepfake', label: 'Deepfake' },
          { id: 'ai_generated', label: 'AI-Generated Disinfo' },
          { id: 'coordinated_inauthentic', label: 'Coordinated Inauthentic' },
        ],
      },
    ],
  },
  {
    id: 'social_engineering', label: 'Social Engineering',
    children: [
      {
        id: 'romance_scam', label: 'Romance Scam',
        children: [
          { id: 'pig_butchering', label: 'Pig Butchering' },
          { id: 'catfishing', label: 'Catfishing' },
          { id: 'military_impersonation', label: 'Military Impersonation' },
        ],
      },
      {
        id: 'phishing', label: 'Phishing',
        children: [
          { id: 'spear_phishing', label: 'Spear Phishing' },
          { id: 'credential_harvest', label: 'Credential Harvesting' },
        ],
      },
    ],
  },
  {
    id: 'platform_abuse', label: 'Platform Abuse',
    children: [
      {
        id: 'scalping', label: 'Scalping / Hoarding',
        children: [
          { id: 'ticket_scalping', label: 'Ticket Scalping' },
          { id: 'inventory_hoarding', label: 'Inventory Hoarding' },
          { id: 'bot_purchasing', label: 'Bot Purchasing' },
        ],
      },
      {
        id: 'gaming_abuse', label: 'Gaming Abuse',
        children: [
          { id: 'aimbot', label: 'Aimbot / Cheating' },
          { id: 'rmt', label: 'Real Money Trading' },
          { id: 'account_boosting', label: 'Account Boosting' },
        ],
      },
    ],
  },
]

// ─── Classification Selection Logic ──────────────────────────────────────────

export interface FraudDescription {
  description: string
  indicators: string[]
  recommendedAction: string
  severity: 'critical' | 'high' | 'medium'
  historicalRate: string
}

export const FRAUD_DESCRIPTIONS: Record<string, FraudDescription> = {
  'Card-Not-Present': {
    description: 'Fraudulent transaction where the physical card is not present — typically online or phone orders using stolen card details.',
    indicators: ['Mismatched billing/shipping address', 'High-value order from new account', 'Multiple failed CVV attempts before success'],
    recommendedAction: 'Decline transaction, flag payment method, require step-up authentication on retry.',
    severity: 'high',
    historicalRate: 'Matches 1,247 confirmed cases in the last 30 days',
  },
  'Card-Present': {
    description: 'Fraud involving a physical card at point-of-sale — typically cloned/skimmed cards or stolen physical cards.',
    indicators: ['Card used far from cardholder home ZIP', 'Rapid successive swipes at different terminals', 'Magnetic stripe fallback on chip-enabled card'],
    recommendedAction: 'Block card immediately, notify issuer, alert merchant of potential skimming device.',
    severity: 'high',
    historicalRate: 'Matches 389 confirmed cases in the last 30 days',
  },
  'Account Takeover': {
    description: 'Unauthorized access to a legitimate user account through compromised credentials, session hijacking, or SIM swap.',
    indicators: ['Login from new device + new IP simultaneously', 'Immediate password/email change after login', 'Credential found in recent breach dump'],
    recommendedAction: 'Force logout all sessions, require identity verification, notify account owner via backup channel.',
    severity: 'critical',
    historicalRate: 'Matches 2,103 confirmed cases in the last 30 days',
  },
  'Refund Abuse': {
    description: 'Systematic exploitation of refund policies — claiming items not received, returning counterfeits, or friendly fraud chargebacks.',
    indicators: ['Refund rate 8x above average', 'Claims "not received" on tracked/delivered items', 'Pattern of high-value purchases followed by immediate refund requests'],
    recommendedAction: 'Flag account for manual review, restrict refund eligibility, escalate to loss prevention.',
    severity: 'medium',
    historicalRate: 'Matches 567 confirmed cases in the last 30 days',
  },
  'Synthetic Identity': {
    description: 'Fabricated identity combining real and fictitious information (e.g., real SSN + fake name) to create a new, untraceable persona.',
    indicators: ['SSN issued after 2011 (randomized range)', 'No credit history but multiple recent applications', 'Address shared with other thin-file identities'],
    recommendedAction: 'Reject application, report to identity verification provider, flag SSN for cross-platform monitoring.',
    severity: 'critical',
    historicalRate: 'Matches 431 confirmed cases in the last 30 days',
  },
  'Credential Stuffing': {
    description: 'Automated injection of stolen username/password pairs from breach dumps to gain unauthorized access at scale.',
    indicators: ['Login attempts from 200+ IPs in <1 hour', 'Success rate consistent with breach-list matching (~0.5-2%)', 'User-agent rotation with datacenter IP origins'],
    recommendedAction: 'Rate-limit login endpoint, force CAPTCHA, notify affected users to reset passwords.',
    severity: 'high',
    historicalRate: 'Matches 3,891 confirmed cases in the last 30 days',
  },
  'Identity Theft': {
    description: 'Use of a real person\'s complete identity documents to impersonate them for financial gain or access.',
    indicators: ['Document metadata inconsistencies', 'Selfie verification liveness failure', 'Victim-reported identity compromise on file'],
    recommendedAction: 'Freeze account, initiate identity verification challenge, notify potential victim via registered contact.',
    severity: 'critical',
    historicalRate: 'Matches 712 confirmed cases in the last 30 days',
  },
  'Layering': {
    description: 'Money laundering technique involving complex layers of transactions to obscure the origin of illicit funds.',
    indicators: ['Rapid transfers between 5+ accounts in <24h', 'Amounts just below reporting thresholds ($9,900-$9,999)', 'Shell company recipients in high-risk jurisdictions'],
    recommendedAction: 'File SAR, freeze involved accounts, escalate to financial crimes unit and FinCEN.',
    severity: 'critical',
    historicalRate: 'Matches 89 confirmed cases in the last 30 days',
  },
  'Smurfing': {
    description: 'Structuring deposits/transactions below reporting thresholds across multiple accounts or institutions to avoid detection.',
    indicators: ['Multiple deposits of $9,500-$9,900 same day', 'Deposits across 3+ branches or ATMs', 'Linked accounts making simultaneous sub-threshold transactions'],
    recommendedAction: 'File CTR override, aggregate transactions for SAR filing, notify BSA compliance team.',
    severity: 'high',
    historicalRate: 'Matches 156 confirmed cases in the last 30 days',
  },
  'Shell Company': {
    description: 'Transactions routed through corporate entities with no legitimate business operations, used to obscure beneficial ownership.',
    indicators: ['Company registered <90 days with no web presence', 'Single signatory on all accounts', 'Revenue inconsistent with stated business type'],
    recommendedAction: 'Enhanced due diligence on beneficial owners, request source-of-funds documentation, escalate to AML team.',
    severity: 'critical',
    historicalRate: 'Matches 67 confirmed cases in the last 30 days',
  },
  'Stream Farming': {
    description: 'Artificial inflation of streaming counts using bot networks, device farms, or coordinated fake accounts to generate illegitimate royalties.',
    indicators: ['Streams from 100+ accounts on shared device fingerprint', 'Playback duration exactly at minimum royalty threshold (31s)', 'Zero genre diversity — single artist/track on loop'],
    recommendedAction: 'Quarantine royalty payments, remove artificial streams from count, flag uploading account for review.',
    severity: 'high',
    historicalRate: 'Matches 1,847 confirmed cases in the last 30 days',
  },
  'Click Fraud': {
    description: 'Automated or coordinated clicking on ads to drain advertiser budgets or inflate publisher revenue fraudulently.',
    indicators: ['Click-through rate 15x above category average', 'Clicks from datacenter IPs with no conversion', 'Identical session fingerprints across "unique" clicks'],
    recommendedAction: 'Pause ad campaign, refund affected advertisers, blacklist publisher ID.',
    severity: 'medium',
    historicalRate: 'Matches 2,340 confirmed cases in the last 30 days',
  },
  'Bot Network': {
    description: 'Coordinated network of automated accounts acting in unison to manipulate platform metrics, spread content, or execute attacks.',
    indicators: ['Accounts created in batch (same timestamp pattern)', 'Identical behavioral sequences across 50+ accounts', 'Shared infrastructure fingerprint (TCP stack, TLS)'],
    recommendedAction: 'Suspend entire cluster, preserve evidence for threat intel, update bot detection signatures.',
    severity: 'high',
    historicalRate: 'Matches 934 confirmed cases in the last 30 days',
  },
  'View Inflation': {
    description: 'Artificially boosting view/impression counts on content to manipulate rankings, attract sponsors, or trigger monetization thresholds.',
    indicators: ['Views spike 500x with no corresponding engagement', 'Traffic source 90% direct with no referrers', 'View duration clustering at exact minimum threshold'],
    recommendedAction: 'Remove inflated counts, demonetize content, flag account for platform integrity review.',
    severity: 'medium',
    historicalRate: 'Matches 1,122 confirmed cases in the last 30 days',
  },
  'Deepfake': {
    description: 'AI-generated synthetic media (video/audio) designed to impersonate real individuals for fraud, manipulation, or defamation.',
    indicators: ['Facial landmark inconsistency in video frames', 'Audio spectral artifacts at splice points', 'Content contradicts verified source material from same date'],
    recommendedAction: 'Remove content immediately, label as synthetic, notify impersonated individual, preserve for forensic analysis.',
    severity: 'critical',
    historicalRate: 'Matches 234 confirmed cases in the last 30 days',
  },
  'AI-Generated Disinfo': {
    description: 'Large-scale production of misleading articles, posts, or comments using LLMs to flood platforms with false narratives.',
    indicators: ['Publication rate: 200+ articles/hour from single source', 'Perplexity score consistent with LLM generation', 'Cross-posted identical content across 15+ platforms simultaneously'],
    recommendedAction: 'Bulk-remove content cluster, suspend publishing accounts, report to platform trust council.',
    severity: 'high',
    historicalRate: 'Matches 445 confirmed cases in the last 30 days',
  },
  'Coordinated Inauthentic': {
    description: 'Networks of fake accounts working together to amplify specific narratives, manipulate discourse, or simulate grassroots support.',
    indicators: ['Accounts activate simultaneously after months dormant', 'Engagement patterns form clear amplification chains', 'Content shared within 30 seconds across 100+ accounts'],
    recommendedAction: 'Map full network via graph analysis, suspend cluster, publish transparency report.',
    severity: 'high',
    historicalRate: 'Matches 178 confirmed cases in the last 30 days',
  },
  'Pig Butchering': {
    description: 'Long-con romance scam where victims are groomed with fake affection before being pressured into fraudulent crypto investments.',
    indicators: ['Rapid escalation to off-platform messaging', 'Financial/crypto language within first 5 messages', 'Claims of extraordinary investment returns (200%+)'],
    recommendedAction: 'Quarantine account, notify trust & safety, preserve message thread for law enforcement referral.',
    severity: 'critical',
    historicalRate: 'Matches 847 confirmed cases in the last 30 days',
  },
  'Catfishing': {
    description: 'Creating a fake online persona using stolen photos/identity to deceive victims into emotional or financial relationships.',
    indicators: ['Profile photos match reverse-image search to different identity', 'Refuses video calls despite extended conversation', 'Inconsistent biographical details across messages'],
    recommendedAction: 'Flag profile for identity verification, warn matched users, suspend if verification not completed in 48h.',
    severity: 'high',
    historicalRate: 'Matches 1,456 confirmed cases in the last 30 days',
  },
  'Military Impersonation': {
    description: 'Scammer poses as deployed military personnel to exploit victims\' patriotism and sympathy, requesting money for "leave" or "shipping."',
    indicators: ['Claims deployment prevents video calls', 'Requests money for military leave/transport', 'Uses stolen photos from real service members\' social media'],
    recommendedAction: 'Immediate account suspension, report to DoD CID, preserve all communications as evidence.',
    severity: 'critical',
    historicalRate: 'Matches 623 confirmed cases in the last 30 days',
  },
  'Spear Phishing': {
    description: 'Highly targeted phishing attack using personal information to craft convincing messages aimed at specific individuals.',
    indicators: ['References target\'s real colleagues or projects', 'Spoofed sender domain with 1-character substitution', 'Urgency language combined with authority impersonation'],
    recommendedAction: 'Block sender domain, alert targeted user, scan for lateral compromise, update email filtering rules.',
    severity: 'critical',
    historicalRate: 'Matches 312 confirmed cases in the last 30 days',
  },
  'Credential Harvesting': {
    description: 'Phishing pages designed to capture login credentials by mimicking legitimate services — often combined with real-time session hijacking.',
    indicators: ['Domain registered <24h ago mimicking known brand', 'SSL certificate from free provider with brand name in CN', 'Form submission posts to different domain than displayed'],
    recommendedAction: 'Takedown request to registrar, block domain platform-wide, notify affected brand, alert users who clicked.',
    severity: 'high',
    historicalRate: 'Matches 2,567 confirmed cases in the last 30 days',
  },
  'Ticket Scalping': {
    description: 'Automated bulk purchasing of event tickets at face value for immediate resale at inflated prices, denying access to genuine fans.',
    indicators: ['Checkout completed in <500ms (human avg: 4.2s)', 'Same payment BIN across 30+ separate purchases', 'Resale listing appeared within 3 minutes of purchase'],
    recommendedAction: 'Cancel orders, ban associated payment methods, implement purchase velocity limits.',
    severity: 'medium',
    historicalRate: 'Matches 1,890 confirmed cases in the last 30 days',
  },
  'Inventory Hoarding': {
    description: 'Holding items in shopping carts without completing purchase to prevent real buyers from accessing limited inventory.',
    indicators: ['Cart held for maximum allowed time repeatedly', 'Multiple carts from same fingerprint with slight variations', 'Items released and re-carted in rotation pattern'],
    recommendedAction: 'Reduce cart hold time for flagged sessions, implement CAPTCHA on cart actions, block fingerprint.',
    severity: 'medium',
    historicalRate: 'Matches 445 confirmed cases in the last 30 days',
  },
  'Bot Purchasing': {
    description: 'Automated scripts that complete purchases faster than humanly possible to acquire limited-edition or high-demand items.',
    indicators: ['Form completion in <200ms with no mouse events', 'Headless browser user-agent or missing browser APIs', 'Session replays identical request patterns with timing offset'],
    recommendedAction: 'Cancel bot-purchased orders, require proof-of-humanity challenge, implement progressive delays.',
    severity: 'medium',
    historicalRate: 'Matches 2,134 confirmed cases in the last 30 days',
  },
  'Aimbot / Cheating': {
    description: 'Use of software exploits to gain unfair advantages in competitive games — aimbots, wallhacks, speed hacks, or packet manipulation.',
    indicators: ['Headshot rate 97% across 50+ matches (statistical impossibility)', 'Input timing consistent with software injection (12ms avg reaction)', 'Known cheat signature detected in memory scan'],
    recommendedAction: 'Permanent ban with HWID block, remove from leaderboards, reverse rewards earned during cheating period.',
    severity: 'medium',
    historicalRate: 'Matches 4,567 confirmed cases in the last 30 days',
  },
  'Real Money Trading': {
    description: 'Selling in-game currency, items, or accounts for real-world money outside official channels — violates ToS and enables fraud.',
    indicators: ['In-game trades with zero-value return (gift pattern)', 'Account login from commercial VPN after transfer', 'Forum posts advertising account/item sales matching this account'],
    recommendedAction: 'Suspend trading privileges, flag linked accounts, issue ToS violation warning or ban.',
    severity: 'medium',
    historicalRate: 'Matches 789 confirmed cases in the last 30 days',
  },
  'Account Boosting': {
    description: 'Coordinated manipulation of competitive rankings by having skilled players use others\' accounts or queue-sniping matches.',
    indicators: ['Sudden skill jump from Bronze to Diamond in 48h', 'Login from new region coinciding with rank increase', 'Queue timing synchronized with known booster accounts'],
    recommendedAction: 'Reset rank to pre-boost level, temporary competitive ban, flag for repeat offense monitoring.',
    severity: 'medium',
    historicalRate: 'Matches 1,234 confirmed cases in the last 30 days',
  },
}

// Fallback for any leaf not in the map
const DEFAULT_FRAUD_DESCRIPTION: FraudDescription = {
  description: 'Suspicious activity matching known fraud patterns in the ontology knowledge base.',
  indicators: ['Behavioral anomaly detected', 'Pattern matches known fraud signature', 'Risk score exceeds threshold'],
  recommendedAction: 'Escalate to manual review, preserve evidence, monitor for additional signals.',
  severity: 'high',
  historicalRate: 'Matches 150+ confirmed cases in the last 30 days',
}

export interface ClassificationResult {
  path: string[]
  confidence: number
  siblings: string[]
  leafId: string
  description: string
  indicators: string[]
  recommendedAction: string
  severity: 'critical' | 'high' | 'medium'
  historicalRate: string
}

export function getRandomClassification(): ClassificationResult {
  // Pick a random branch down to a leaf
  const path: string[] = []
  let current: OntologyNode[] = FRAUD_ONTOLOGY
  let siblings: string[] = []

  while (current.length > 0) {
    const chosen = current[Math.floor(Math.random() * current.length)]
    path.push(chosen.label)
    siblings = current.filter(c => c.id !== chosen.id).map(c => c.label)
    current = chosen.children || []
  }

  const confidence = 78 + Math.floor(Math.random() * 20) // 78-97%
  const leafId = path[path.length - 1]
  const desc = FRAUD_DESCRIPTIONS[leafId] || DEFAULT_FRAUD_DESCRIPTION

  return {
    path,
    confidence,
    siblings,
    leafId,
    description: desc.description,
    indicators: desc.indicators,
    recommendedAction: desc.recommendedAction,
    severity: desc.severity,
    historicalRate: desc.historicalRate,
  }
}

// ─── Domain-Aware Classification ─────────────────────────────────────────────

const DOMAIN_ONTOLOGY_MAP: Record<string, string[][]> = {
  dating_platform: [
    ['Social Engineering', 'Romance Scam', 'Pig Butchering'],
    ['Social Engineering', 'Romance Scam', 'Catfishing'],
    ['Social Engineering', 'Romance Scam', 'Military Impersonation'],
    ['Social Engineering', 'Phishing', 'Credential Harvesting'],
    ['Financial', 'Identity Fraud', 'Synthetic Identity'],
    ['Content Manipulation', 'Artificial Engagement', 'Bot Network'],
  ],
  ticketing_platform: [
    ['Platform Abuse', 'Scalping / Hoarding', 'Ticket Scalping'],
    ['Platform Abuse', 'Scalping / Hoarding', 'Bot Purchasing'],
    ['Platform Abuse', 'Scalping / Hoarding', 'Inventory Hoarding'],
    ['Financial', 'Payment Fraud', 'Card-Not-Present'],
    ['Financial', 'Identity Fraud', 'Credential Stuffing'],
    ['Content Manipulation', 'Artificial Engagement', 'Bot Network'],
  ],
  press_distribution: [
    ['Social Engineering', 'Phishing', 'Spear Phishing'],
    ['Social Engineering', 'Phishing', 'Credential Harvesting'],
    ['Financial', 'Identity Fraud', 'Credential Stuffing'],
    ['Content Manipulation', 'Misinformation', 'Coordinated Inauthentic'],
    ['Financial', 'Money Laundering', 'Layering'],
  ],
  music_streaming: [
    ['Content Manipulation', 'Artificial Engagement', 'Stream Farming'],
    ['Content Manipulation', 'Artificial Engagement', 'Click Fraud'],
    ['Content Manipulation', 'Artificial Engagement', 'Bot Network'],
    ['Content Manipulation', 'Artificial Engagement', 'View Inflation'],
    ['Financial', 'Payment Fraud', 'Card-Not-Present'],
    ['Financial', 'Identity Fraud', 'Credential Stuffing'],
  ],
  umg: [
    ['Content Manipulation', 'Artificial Engagement', 'Stream Farming'],
    ['Content Manipulation', 'Artificial Engagement', 'Bot Network'],
    ['Content Manipulation', 'Artificial Engagement', 'View Inflation'],
    ['Content Manipulation', 'Artificial Engagement', 'Click Fraud'],
    ['Financial', 'Identity Fraud', 'Credential Stuffing'],
  ],
  cinema_booking: [
    ['Platform Abuse', 'Scalping / Hoarding', 'Ticket Scalping'],
    ['Platform Abuse', 'Scalping / Hoarding', 'Bot Purchasing'],
    ['Platform Abuse', 'Scalping / Hoarding', 'Inventory Hoarding'],
    ['Financial', 'Payment Fraud', 'Card-Not-Present'],
    ['Financial', 'Payment Fraud', 'Refund Abuse'],
  ],
  imax: [
    ['Platform Abuse', 'Scalping / Hoarding', 'Ticket Scalping'],
    ['Platform Abuse', 'Scalping / Hoarding', 'Bot Purchasing'],
    ['Platform Abuse', 'Scalping / Hoarding', 'Inventory Hoarding'],
    ['Financial', 'Payment Fraud', 'Card-Not-Present'],
    ['Financial', 'Payment Fraud', 'Refund Abuse'],
  ],
  news_platform: [
    ['Content Manipulation', 'Misinformation', 'Deepfake'],
    ['Content Manipulation', 'Misinformation', 'AI-Generated Disinfo'],
    ['Content Manipulation', 'Misinformation', 'Coordinated Inauthentic'],
    ['Content Manipulation', 'Artificial Engagement', 'Bot Network'],
    ['Social Engineering', 'Phishing', 'Credential Harvesting'],
  ],
  live_streaming: [
    ['Content Manipulation', 'Artificial Engagement', 'View Inflation'],
    ['Content Manipulation', 'Artificial Engagement', 'Bot Network'],
    ['Content Manipulation', 'Artificial Engagement', 'Click Fraud'],
    ['Financial', 'Payment Fraud', 'Card-Not-Present'],
    ['Social Engineering', 'Phishing', 'Credential Harvesting'],
  ],
  twitch: [
    ['Content Manipulation', 'Artificial Engagement', 'View Inflation'],
    ['Content Manipulation', 'Artificial Engagement', 'Bot Network'],
    ['Content Manipulation', 'Artificial Engagement', 'Click Fraud'],
    ['Financial', 'Payment Fraud', 'Card-Not-Present'],
    ['Financial', 'Identity Fraud', 'Credential Stuffing'],
  ],
  gaming_platform: [
    ['Platform Abuse', 'Gaming Abuse', 'Aimbot / Cheating'],
    ['Platform Abuse', 'Gaming Abuse', 'Real Money Trading'],
    ['Platform Abuse', 'Gaming Abuse', 'Account Boosting'],
    ['Financial', 'Payment Fraud', 'Card-Not-Present'],
    ['Financial', 'Identity Fraud', 'Credential Stuffing'],
    ['Financial', 'Identity Fraud', 'Account Takeover'],
  ],
  epic_games: [
    ['Platform Abuse', 'Gaming Abuse', 'Aimbot / Cheating'],
    ['Platform Abuse', 'Gaming Abuse', 'Real Money Trading'],
    ['Platform Abuse', 'Gaming Abuse', 'Account Boosting'],
    ['Financial', 'Payment Fraud', 'Card-Not-Present'],
    ['Financial', 'Identity Fraud', 'Credential Stuffing'],
    ['Financial', 'Identity Fraud', 'Account Takeover'],
  ],
}

export function getDomainClassification(domain: string): ClassificationResult {
  const paths = DOMAIN_ONTOLOGY_MAP[domain]
  if (!paths || paths.length === 0) {
    return getRandomClassification() // fallback for unknown domains
  }

  const path = paths[Math.floor(Math.random() * paths.length)]
  const leafId = path[path.length - 1]
  const desc = FRAUD_DESCRIPTIONS[leafId] || DEFAULT_FRAUD_DESCRIPTION
  const confidence = 78 + Math.floor(Math.random() * 20) // 78-97%

  // Generate siblings from the same domain's other classifications
  const siblings = paths
    .filter(p => p[p.length - 1] !== leafId)
    .map(p => p[p.length - 1])
    .slice(0, 3)

  return {
    path,
    confidence,
    siblings,
    leafId,
    description: desc.description,
    indicators: desc.indicators,
    recommendedAction: desc.recommendedAction,
    severity: desc.severity,
    historicalRate: desc.historicalRate,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean
  triggerKey: string | null // changes when a new FLAG/BLOCK event occurs
}

export default function OntologyClassificationPanel({ visible, triggerKey }: Props) {
  const [classification, setClassification] = useState<ClassificationResult | null>(null)
  const [animState, setAnimState] = useState<'hidden' | 'entering' | 'visible' | 'exiting'>('hidden')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!visible || !triggerKey) {
      setAnimState('hidden')
      return
    }

    // Generate new classification
    setClassification(getRandomClassification())
    setAnimState('entering')

    // After enter animation, go visible
    const enterTimeout = setTimeout(() => setAnimState('visible'), 400)

    // Auto-dismiss after 8 seconds
    timeoutRef.current = setTimeout(() => {
      setAnimState('exiting')
      setTimeout(() => setAnimState('hidden'), 400)
    }, 8000)

    return () => {
      clearTimeout(enterTimeout)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [triggerKey, visible])

  if (animState === 'hidden' || !classification) return null

  const opacity = animState === 'entering' ? 0 : animState === 'exiting' ? 0 : 1
  const translateX = animState === 'entering' ? 20 : animState === 'exiting' ? 20 : 0

  return (
    <div
      className="rounded-xl p-3 transition-all ease-out"
      style={{
        background: 'linear-gradient(135deg, rgba(184,119,217,0.08) 0%, rgba(87,148,242,0.06) 100%)',
        border: '1px solid rgba(184,119,217,0.25)',
        opacity,
        transform: `translateX(${translateX}px)`,
        transitionDuration: '400ms',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-xs">🧬</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300">
          Fraud Type Classification
        </span>
        <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-purple-900/50 text-purple-300 font-mono">
          Ontology v2.1
        </span>
      </div>

      {/* Ontology Path */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {classification.path.map((segment, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-600 text-[10px]">›</span>}
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                i === classification.path.length - 1
                  ? 'bg-purple-500/20 text-purple-200 ring-1 ring-purple-500/40'
                  : 'bg-gray-800/50 text-gray-400'
              }`}
            >
              {segment}
            </span>
          </span>
        ))}
      </div>

      {/* Severity + Confidence row */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
          style={{
            background: classification.severity === 'critical' ? 'rgba(242,73,92,0.2)' : classification.severity === 'high' ? 'rgba(255,152,48,0.2)' : 'rgba(250,222,42,0.15)',
            color: classification.severity === 'critical' ? '#F2495C' : classification.severity === 'high' ? '#FF9830' : '#FADE2A',
            border: `1px solid ${classification.severity === 'critical' ? 'rgba(242,73,92,0.4)' : classification.severity === 'high' ? 'rgba(255,152,48,0.4)' : 'rgba(250,222,42,0.3)'}`,
          }}
        >
          {classification.severity}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${classification.confidence}%`,
              background: classification.confidence >= 90
                ? 'linear-gradient(90deg, #73BF69, #4CAF50)'
                : classification.confidence >= 80
                ? 'linear-gradient(90deg, #FADE2A, #FFA726)'
                : 'linear-gradient(90deg, #FF9830, #F2495C)',
            }}
          />
        </div>
        <span className="text-[11px] font-mono font-bold text-white">
          {classification.confidence}%
        </span>
      </div>

      {/* Description */}
      <p className="text-[10px] text-gray-300 mb-2 leading-relaxed">
        {classification.description}
      </p>

      {/* Indicators */}
      <div className="mb-2">
        <span className="text-[9px] text-gray-500 uppercase tracking-wide font-bold">Indicators detected:</span>
        <div className="mt-1 space-y-0.5">
          {classification.indicators.map((indicator, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[9px] mt-0.5" style={{ color: classification.severity === 'critical' ? '#F2495C' : '#FF9830' }}>⚠</span>
              <span className="text-[10px] text-gray-300">{indicator}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Action */}
      <div className="rounded-lg px-2.5 py-2 mb-2" style={{ background: 'rgba(87,148,242,0.06)', border: '1px solid rgba(87,148,242,0.15)' }}>
        <span className="text-[9px] text-blue-400 uppercase tracking-wide font-bold">Recommended action:</span>
        <p className="text-[10px] text-blue-200 mt-0.5 leading-relaxed">{classification.recommendedAction}</p>
      </div>

      {/* Historical Rate */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[9px]">📊</span>
        <span className="text-[10px] text-gray-400 italic">{classification.historicalRate}</span>
      </div>

      {/* Related fraud types (siblings) */}
      {classification.siblings.length > 0 && (
        <div>
          <span className="text-[9px] text-gray-600 uppercase tracking-wide">Related types:</span>
          <div className="flex gap-1 mt-1 flex-wrap">
            {classification.siblings.slice(0, 3).map((sib, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 rounded text-[9px] text-gray-500 bg-gray-800/40 border border-gray-700/30"
              >
                {sib}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
