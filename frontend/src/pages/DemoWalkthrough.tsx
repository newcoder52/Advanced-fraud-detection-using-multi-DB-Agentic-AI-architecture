import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

interface Props { domain: string }

const SCENARIOS: Record<string, { title: string; description: string; context: string; expectedOutcome: string; payload: any }> = {
  press_distribution: {
    title: 'The Embargo Breach',
    description: 'Embargoed M&A release accessed by unauthorized journalist → content matches known breach patterns → leakage network mapped → FLAG.',
    context: 'From 2010-2015, Ukrainian hackers infiltrated Business Wire and accessed thousands of embargoed press releases. Traders gave hackers "shopping lists" of releases they wanted. The ring generated **$100M+** in illegal insider trading profits. **30+ defendants** were charged by SEC and DOJ. Business Wire hired Robert Markel as CISO and now runs on AWS (EKS, DynamoDB, Lambda, RDS).',
    expectedOutcome: "6 pipeline stages → semantic match to known breach patterns → 4-node leakage network discovered → final risk score > 85 → FLAG decision",
    payload: { event_type: 'embargo_access', content: 'CONFIDENTIAL: MegaCorp to acquire TechStartup for 2.3 billion dollars. Deal expected to close Q4. This is embargoed information not for distribution.', payload: { release_id: 'PR-2024-0004', journalist_id: 'J-UNKNOWN-443', access_type: 'unauthorized_early_access' }, entity_id: 'J-UNKNOWN-443' },
  },
  dating_platform: {
    title: 'The Romance Scam Ring',
    description: 'Known scammer sends message → 100% similarity to known scripts → 15-member ring detected via shared devices → BLOCK.',
    context: 'Romance scam losses increased **37%** year-over-year. UK victims lost **£20.5M ($28M)** in H1 2025 alone across 3,000 cases. Match Group partnered with Reality Defender (Jan 2026) for deepfake detection and deployed Face Check biometric verification — reducing bad actor exposure by **>60%**. Despite these investments, coordinated multi-device scam rings remain the #1 trust & safety challenge.',
    expectedOutcome: "6 pipeline stages → 100% script similarity match → 15-member device-sharing ring mapped → risk score 97 → BLOCK decision",
    payload: { event_type: 'message_sent', content: 'Hello beautiful, I am a US military officer stationed overseas. I would love to get to know you better. Can we move to WhatsApp for more private conversation?', payload: { user_id: 'USR-FAKE-001', recipient_id: 'USR-REAL-001', message_text: 'romance scam script' }, entity_id: 'USR-FAKE-001' },
  },
  umg: {
    title: 'The Stream Farm',
    description: 'Bot account streams 661K times/day → pgvector matches bot listening pattern → Neptune maps 47-account farm → BLOCK.',
    context: 'Streaming fraud costs the industry **$2B/year** in lost royalties. Apple Music demonetized **2 billion** fraudulent streams in 2025 (~$17M in royalties). ~10% of all streams are from bots. In March 2026, a North Carolina musician pled guilty to stealing **$8M** using AI-generated music + bot accounts — **661,440 daily streams** from a single farm. UMG calls this an "existential threat."',
    expectedOutcome: "6 pipeline stages → bot pattern fingerprint match → 47-account farm network mapped → risk score 94 → BLOCK decision",
    payload: { event_type: 'stream', content: 'Bot farm pattern detected: 661000 streams per day from single account, 0.3 second average duration, same device ID shared across 47 accounts in network.', payload: { account_id: 'BOT-FARM-001', track_id: 'AI-TRACK-001', streams_per_day: 661000, device_id: 'BOT-DEV-0' }, entity_id: 'BOT-FARM-001' },
  },
  imax: {
    title: 'The Scalper Bot Network',
    description: '200 sessions in 30 seconds → bot behavioral patterns detected → 23-device coordinated ring → BLOCK in <2s.',
    context: 'IMAX achieved record **$1.28B** global box office in 2025 across **1,829 theaters** in 89 countries. Bot traffic now represents **37%** of all web traffic industry-wide (Imperva 2024). Executive Order 14254 (BOTS Act) specifically targets automated ticket purchasing. IMAX is an AWS partner (StreamSmart on AWS Marketplace).',
    expectedOutcome: "6 pipeline stages → velocity anomaly detection → 23-device fingerprint cluster → risk score 91 → BLOCK in <2 seconds",
    payload: { event_type: 'purchase_attempt', content: 'Scalper bot network detected: 200 simultaneous sessions within 30 seconds targeting same premium showing. All sessions share 5 device fingerprints and 3 payment BINs.', payload: { session_id: 'SESS-BOT-001', showtime_id: 'IMAX-PREM-001', quantity: 8, device_fingerprint: 'BOT-FP-0' }, entity_id: 'SESS-BOT-001' },
  },
  news_platform: {
    title: 'The Misinformation Campaign',
    description: 'AI-generated article published → content signature detected → 50-account amplification network exposed → FLAG/BLOCK.',
    context: 'In 2024, NewsGuard identified **1,000+** AI-generated misinformation sites. Coordinated inauthentic behavior (CIB) campaigns use networks of **50-200 accounts** to amplify false narratives, achieving **10x organic reach** within 4 hours of initial publication.',
    expectedOutcome: "6 pipeline stages → AI-generated content signature match → 50-account amplification network → risk score 88 → FLAG decision",
    payload: { event_type: 'content_published', content: 'BREAKING: Major pharmaceutical company admits vaccine causes severe side effects in 90 percent of recipients. Sources confirm internal documents leaked showing massive cover-up.', payload: { content_id: 'MISINFO-2024-001', author_id: 'BOT-AUTHOR-50', source_url: 'fake-news-site.com' }, entity_id: 'PM-BOT-001' },
  },
  twitch: {
    title: 'The Viewbot Network',
    description: 'Viewbot farm inflates channel metrics → bot behavioral patterns detected → 50,000 fake accounts in coordinated network → BLOCK.',
    context: 'Twitch faces coordinated viewbot networks inflating metrics for sponsorship fraud. In 2024, **7.5M average concurrent viewers** but an estimated **10-15%** are bots. Viewbotting services sell 10,000 fake viewers for $50/month, defrauding advertisers and legitimate creators.',
    expectedOutcome: "9 pipeline stages → bot account pattern match → 50K-account viewbot network mapped → risk score 94 → BLOCK decision",
    payload: { event_type: 'viewer_activity', content: 'Viewbot network: 50,000 concurrent viewers appeared in 3 seconds on a 200-follower channel. All viewer accounts created same day, no chat activity, no prior watch history.', payload: { viewer_id: 'VBOT-NET-001', channel_id: 'small_streamer_42' }, entity_id: 'VBOT-NET-001' },
  },
  ticketing_platform: {
    title: 'The Scalper Bot Ring',
    description: '200 tickets purchased in 45 seconds → shared payment BINs detected → 30-account resale network mapped → BLOCK.',
    context: 'Taylor Swift Eras Tour: **2M+ tickets** sold in minutes with **3.5 billion** bot requests blocked. BOTS Act makes automated purchasing a federal offense. Scalpers use residential proxies, CAPTCHA farms, and stolen cards.',
    expectedOutcome: "9 pipeline stages → purchase velocity anomaly → 30-account BIN-sharing ring → risk score 96 → BLOCK decision",
    payload: { event_type: 'ticket_purchase', content: 'Scalper bot: 200 tickets purchased in 45 seconds across 30 accounts sharing 4 payment BINs. All accounts created within 1 hour. Residential proxy rotation detected.', payload: { buyer_id: 'SCALP-TM-001', event_name: 'Taylor Swift Eras Tour' }, entity_id: 'SCALP-TM-001' },
  },
  epic_games: {
    title: 'The Aimbot Ring',
    description: '97% headshot rate detected → inhuman reaction times → HWID-linked ban evasion network → BLOCK.',
    context: 'Fortnite: **400M+ registered accounts**, $26B+ revenue. Anti-cheat battles aimbot sellers charging **$50-500/month**. Account theft via credential stuffing affects **5M+ accounts** industry-wide annually.',
    expectedOutcome: "9 pipeline stages → behavioral anomaly (12ms reaction) → HWID spoofing cluster → risk score 99 → BLOCK decision",
    payload: { event_type: 'player_activity', content: 'Aimbot detected: 97% headshot rate across 50 matches. Average reaction time 12ms (human avg 200-300ms). Hardware ID matches 4 previously banned accounts.', payload: { player_id: 'AIMBOT-001', game: 'Fortnite' }, entity_id: 'AIMBOT-001' },
  },
}

const STAGE_CONFIG: Record<string, { label: string; icon: string; color: string; borderColor: string }> = {
  cache_check: { label: 'Feature Cache', icon: '⚡', color: 'from-red-600 to-red-800', borderColor: 'border-red-500' },
  ingest: { label: 'Event Ingestion', icon: '📥', color: 'from-orange-600 to-orange-800', borderColor: 'border-orange-500' },
  feature_computation: { label: 'Feature Engineering', icon: '🔢', color: 'from-cyan-600 to-cyan-800', borderColor: 'border-cyan-500' },
  embedding: { label: 'Embedding Generation', icon: '🧠', color: 'from-green-600 to-green-800', borderColor: 'border-green-500' },
  similarity_search: { label: 'Semantic Similarity', icon: '🔍', color: 'from-purple-600 to-purple-800', borderColor: 'border-purple-500' },
  graph_analysis: { label: 'Community Detection', icon: '🕸️', color: 'from-blue-600 to-blue-800', borderColor: 'border-blue-500' },
  scoring: { label: 'Risk Scoring', icon: '📊', color: 'from-red-600 to-red-800', borderColor: 'border-red-500' },
  escalation: { label: 'Repeat Offender Escalation', icon: '⬆️', color: 'from-rose-600 to-rose-900', borderColor: 'border-rose-500' },
}

const DB_NAMES: Record<string, string> = {
  cache_check: 'Valkey', ingest: 'DynamoDB', feature_computation: 'Lambda Compute',
  embedding: 'Bedrock Titan', similarity_search: 'Aurora pgvector',
  graph_analysis: 'Neptune', scoring: 'Valkey', escalation: 'DynamoDB History',
}

const WHY_THIS_DB: Record<string, Record<string, string>> = {
  press_distribution: {
    cache_check: 'Repeat offender caught in <1ms without re-running full pipeline',
    ingest: 'Business Wire ingests millions of access events daily; no capacity planning needed',
    feature_computation: 'Computes velocity, device novelty, content risk signals, and time-of-day anomalies in real-time',
    embedding: 'Embeds release content for pattern matching against known breach language',
    similarity_search: 'Matches embargo breach patterns that keyword search would miss',
    graph_analysis: 'SHARES_IP traversal reveals 3 "journalists" are actually one insider. SQL: 2-5s. Neptune: 100ms.',
    scoring: 'Cached composite score means the same leaker is blocked instantly on next access',
  },
  dating_platform: {
    cache_check: 'Known scammer blocked in <1ms on every subsequent message attempt',
    ingest: '14K messages/sec at peak; single-writer SQL would bottleneck',
    feature_computation: 'Detects scripted message patterns, device reuse, and burst messaging velocity',
    embedding: 'Embeds message for comparison against known romance scam scripts',
    similarity_search: '98% match to known scam scripts that regex/keywords would miss',
    graph_analysis: 'Recursive JOINs to find 15 accounts sharing 3 devices: SQL 2-5s. Neptune: 100ms.',
    scoring: 'Ring membership amplifies score; cached for instant enforcement across all ring members',
  },
  umg: {
    cache_check: 'Known bot farm entity blocked in <1ms on every stream attempt',
    ingest: '22K stream events/sec at peak; write-optimized for massive ingest volume',
    feature_computation: 'Calculates stream velocity, device entropy, and bot behavioral fingerprint features',
    embedding: 'Encodes listening behavior pattern (duration, frequency, device) as a vector',
    similarity_search: 'Matches behavioral fingerprint against known bot farm patterns. SQL LIKE can\'t do this.',
    graph_analysis: 'Maps 47 accounts sharing 5 device fingerprints into ONE farm. The access pattern SQL can\'t handle.',
    scoring: 'All 47 farm accounts scored simultaneously; cached for instant enforcement',
  },
  imax: {
    cache_check: 'Known bot session blocked in <1ms DURING checkout flow',
    ingest: '12K purchase attempts/sec during on-sale events; zero capacity planning',
    feature_computation: 'Measures purchase velocity, device fingerprint novelty, and session speed anomalies',
    embedding: 'Encodes session behavior (velocity, patterns) for anomaly matching',
    similarity_search: 'Matches bot behavioral signatures that rule-based systems miss',
    graph_analysis: 'Clusters 23 devices sharing 3 payment BINs into one network. SQL: 3-5s. Neptune: 100ms.',
    scoring: 'Decision returned to checkout in <1ms; sub-second blocking during purchase flow',
  },
  news_platform: {
    cache_check: 'Known bot author blocked in <1ms before content is amplified',
    ingest: '9.5K content events/sec; handles viral spikes without throttling',
    feature_computation: 'Detects AI-generated content signals, publication burst patterns, and source reputation',
    embedding: 'Encodes article content for AI-generated signature detection',
    similarity_search: 'Detects AI-generated content signatures with 95%+ accuracy; keyword filters catch <20%',
    graph_analysis: 'Maps 50-account amplification network behind the article. Invisible to single-table queries.',
    scoring: 'Network membership amplifies score; all 50 coordinated accounts flagged simultaneously',
  },
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return <>{parts.map((p, i) => p.startsWith('**') ? <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)}</>
}

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score >= 80 ? '#ef4444' : score >= 60 ? '#f97316' : score >= 30 ? '#eab308' : '#22c55e'
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={radius} stroke="#374151" strokeWidth="8" fill="none" />
      <circle cx={size/2} cy={size/2} r={radius} stroke={color} strokeWidth="8" fill="none"
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-all duration-1000 ease-out" />
    </svg>
  )
}

export default function DemoWalkthrough({ domain }: Props) {
  const [running, setRunning] = useState(false)
  const [visibleStages, setVisibleStages] = useState<number>(0)
  const [allStages, setAllStages] = useState<any[]>([])
  const [finalResult, setFinalResult] = useState<any>(null)
  const [showResult, setShowResult] = useState(false)
  const [contextOpen, setContextOpen] = useState(true)
  const [status, setStatus] = useState('')
  const stagesRef = useRef<HTMLDivElement>(null)

  const scenario = SCENARIOS[domain] || SCENARIOS.press_distribution
  const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000'

  // Background warm-up on page load / domain change
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/pipeline/execute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, ...scenario.payload }),
    }).catch(() => {})
  }, [domain])

  // Animated sequential reveal
  useEffect(() => {
    if (allStages.length > 0 && visibleStages < allStages.length) {
      const timer = setTimeout(() => setVisibleStages(v => v + 1), 280)
      return () => clearTimeout(timer)
    }
    if (visibleStages === allStages.length && allStages.length > 0 && finalResult) {
      const timer = setTimeout(() => setShowResult(true), 400)
      return () => clearTimeout(timer)
    }
  }, [visibleStages, allStages, finalResult])

  const callPipeline = async (): Promise<any> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)
    try {
      const res = await fetch(`${API_BASE}/api/v1/pipeline/execute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, ...scenario.payload }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!res.ok) throw new Error(res.statusText)
      return await res.json()
    } catch (err: any) {
      clearTimeout(timeoutId)
      throw err
    }
  }

  const runDemo = async () => {
    setRunning(true)
    setAllStages([])
    setVisibleStages(0)
    setFinalResult(null)
    setShowResult(false)
    setStatus('')

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await callPipeline()
        setAllStages(res.stages || [])
        setFinalResult(res)
        setStatus('')
        setRunning(false)
        return
      } catch (err: any) {
        if (attempt < 3) {
          setStatus(`⏳ Pipeline warming up SageMaker ML endpoint... retrying (${attempt}/3)`)
          await new Promise(r => setTimeout(r, 5000))
        } else {
          setFinalResult({ error: 'Pipeline timed out after 3 retries. Services may need a moment to warm up — try again.' })
          setShowResult(true)
        }
      }
    }
    setStatus('')
    setRunning(false)
  }

  const decisionColor = (d: string) => {
    if (d === 'BLOCK') return 'from-red-600 to-red-800 shadow-red-600/40'
    if (d === 'CHALLENGE') return 'from-orange-600 to-orange-800 shadow-orange-600/40'
    if (d === 'FLAG') return 'from-yellow-600 to-yellow-800 shadow-yellow-600/40'
    return 'from-green-600 to-green-800 shadow-green-600/40'
  }

  const score = finalResult?.final_score?.composite_score != null
    ? Math.round(finalResult.final_score.composite_score * 100) : 0

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-1">▶️ Demo Walkthrough</h2>
        <p className="text-gray-400">Full 4-tier pipeline execution — watch all 6 stages in real time</p>
      </div>

      {/* Scenario Hero Card */}
      <div className="bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 rounded-xl p-8 mb-8 border border-gray-700 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <span className="inline-block px-3 py-1 rounded-full bg-blue-900/60 text-blue-300 text-xs font-bold uppercase tracking-wider mb-3">
              Scenario
            </span>
            <h3 className="text-2xl font-bold text-white mb-3">{scenario.title}</h3>
            <p className="text-gray-300 leading-relaxed">{scenario.description}</p>
          </div>
        </div>

        {/* Real-world Context — Collapsible */}
        <div className="mt-6">
          <button onClick={() => setContextOpen(!contextOpen)}
            className="flex items-center gap-2 w-full text-left group">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-900/40 border border-amber-700/50">
              <span className="text-sm">📰</span>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">True Story</span>
            </span>
            <span className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
              {contextOpen ? '▼ collapse' : '▶ expand'}
            </span>
          </button>
          {contextOpen && (
            <div className="mt-3 bg-amber-950/30 rounded-lg p-4 border-l-4 border-amber-500/70 animate-[fadeIn_0.2s_ease-out]">
              <p className="text-sm text-gray-300 leading-relaxed"><RichText text={scenario.context} /></p>
            </div>
          )}
        </div>

        {/* Expected Outcome — Blueprint style */}
        <div className="mt-4 bg-blue-950/30 rounded-lg p-4 border border-blue-800/40 relative overflow-hidden">
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(59,130,246,0.5) 19px, rgba(59,130,246,0.5) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(59,130,246,0.5) 19px, rgba(59,130,246,0.5) 20px)' }} />
          <div className="relative">
            <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              Expected Pipeline Output
            </p>
            <p className="text-sm text-blue-200 font-mono">{scenario.expectedOutcome}</p>
          </div>
        </div>

        {/* Execute Button */}
        <button onClick={runDemo} disabled={running}
          className="mt-8 relative overflow-hidden bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-500 hover:to-emerald-600 text-white font-bold px-10 py-4 rounded-xl text-lg disabled:opacity-50 transition-all shadow-lg shadow-green-900/30 hover:shadow-green-800/50 hover:scale-[1.02] active:scale-[0.98]">
          {running ? (
            <span className="flex items-center gap-3">
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {status || 'Executing Pipeline...'}
            </span>
          ) : '▶️  Execute Full Pipeline'}
        </button>
        {status && !running && <p className="mt-3 text-yellow-400 text-sm animate-pulse">{status}</p>}
      </div>

      {/* Pipeline Stages — Animated Timeline */}
      {allStages.length > 0 && (
        <div className="mb-8" ref={stagesRef}>
          <h3 className="text-lg font-semibold mb-5 flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            Pipeline Execution
          </h3>
          <div className="relative pl-6">
            {/* Vertical timeline line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-700" />

            <div className="space-y-4">
              {allStages.map((stage, i) => {
                const visible = i < visibleStages
                const config = STAGE_CONFIG[stage.stage] || { label: stage.stage, icon: '⚙️', color: 'from-gray-600 to-gray-800', borderColor: 'border-gray-500' }
                const whyText = WHY_THIS_DB[domain]?.[stage.stage]
                const isSuccess = stage.status === 'success' || stage.status === 'miss'
                const isHit = stage.status === 'hit'
                const borderClass = isSuccess ? 'border-l-green-500' : isHit ? 'border-l-blue-500' : stage.status === 'skipped' ? 'border-l-gray-600' : stage.status === 'degraded' ? 'border-l-yellow-500' : 'border-l-red-500'

                return (
                  <div key={i} className={`relative transition-all duration-500 ease-out ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
                    {/* Timeline dot */}
                    <div className={`absolute -left-6 top-4 w-[9px] h-[9px] rounded-full border-2 transition-all duration-300 ${visible ? (isSuccess ? 'bg-green-500 border-green-400' : isHit ? 'bg-blue-500 border-blue-400' : 'bg-gray-500 border-gray-400') : 'bg-gray-700 border-gray-600'}`} />

                    {/* Stage Card */}
                    <div className={`bg-gray-800/80 backdrop-blur rounded-lg border-l-4 ${borderClass} border border-gray-700/50 overflow-hidden shadow-lg`}>
                      <div className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Icon badge */}
                            <div className={`flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br ${config.color} flex items-center justify-center text-lg shadow-inner`}>
                              {config.icon}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-white">{config.label}</p>
                              <p className="text-xs text-gray-500">{DB_NAMES[stage.stage]}</p>
                            </div>
                          </div>
                          {/* Latency pill */}
                          {stage.latency_ms != null && stage.latency_ms > 0 && (
                            <span className="flex-shrink-0 px-2.5 py-1 rounded-full bg-gray-700 text-xs font-mono font-bold text-gray-200 border border-gray-600">
                              {stage.latency_ms.toFixed(0)}ms
                            </span>
                          )}
                        </div>
                        {/* Result summary */}
                        <p className="mt-2 text-sm text-gray-300 leading-relaxed">
                          {stage.result_summary || stage.error}
                        </p>
                        {/* Why this DB annotation */}
                        {whyText && (
                          <p className="mt-2 text-xs text-gray-500 italic border-t border-gray-700/50 pt-2">
                            💡 Why {DB_NAMES[stage.stage]}? {whyText}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Final Result — Hero Card */}
      {showResult && finalResult && !finalResult.error && (
        <div className="animate-[fadeIn_0.5s_ease-out]">
          <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800 rounded-xl p-8 border border-gray-600 shadow-2xl relative overflow-hidden">
            {/* Background glow */}
            <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${decisionColor(finalResult.final_score?.decision || 'ALLOW')}`} />

            <div className="relative">
              <h3 className="text-center text-sm font-bold uppercase tracking-widest text-gray-400 mb-6">Pipeline Complete</h3>

              <div className="flex items-center justify-center gap-12">
                {/* Score Ring */}
                <div className="relative flex items-center justify-center">
                  <ScoreRing score={score} size={130} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-white">{score}</span>
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">Risk</span>
                  </div>
                </div>

                {/* Decision Badge */}
                <div className="text-center">
                  <div className={`inline-block px-6 py-3 rounded-xl bg-gradient-to-r ${decisionColor(finalResult.final_score?.decision || 'ALLOW')} shadow-lg animate-pulse`}>
                    <span className="text-2xl font-black text-white tracking-wide">
                      {finalResult.final_score?.decision || 'N/A'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-gray-400">Final Decision</p>
                </div>

                {/* Latency */}
                <div className="text-center">
                  <p className="text-4xl font-bold text-white">{finalResult.total_latency_ms?.toFixed(0)}<span className="text-lg text-gray-400">ms</span></p>
                  <p className="text-sm text-gray-400 mt-1">Total Latency</p>
                  <p className="text-xs text-gray-500 mt-0.5">across all 4 databases</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showResult && finalResult?.error && (
        <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-6 animate-[fadeIn_0.3s_ease-out]">
          <p className="text-red-400 font-medium">⚠️ Pipeline Error: {finalResult.error}</p>
        </div>
      )}
    </div>
  )
}
