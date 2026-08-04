import { useState, useEffect, useRef } from 'react'

// ─── Evidence Data ────────────────────────────────────────────────────────────

interface EvidenceItem {
  id: string
  text: string
  source: string
  sourceType: 'investigation_db' | 'threat_intel' | 'case_history' | 'pattern_db' | 'watchlist'
  relevanceScore: number
  timestamp: number
}

const SOURCE_STYLES: Record<string, { color: string; bg: string; icon: string }> = {
  investigation_db: { color: '#5794F2', bg: 'rgba(87,148,242,0.08)', icon: '🔍' },
  threat_intel: { color: '#F2495C', bg: 'rgba(242,73,92,0.08)', icon: '🛡️' },
  case_history: { color: '#B877D9', bg: 'rgba(184,119,217,0.08)', icon: '📁' },
  pattern_db: { color: '#FF9830', bg: 'rgba(255,152,48,0.08)', icon: '📊' },
  watchlist: { color: '#FADE2A', bg: 'rgba(250,222,42,0.08)', icon: '⚠️' },
}

const EVIDENCE_TEMPLATES = [
  {
    text: 'Similar pattern detected in Case #{caseId} ({timeAgo}) — same device fingerprint across {count} accounts',
    source: 'Investigation DB',
    sourceType: 'investigation_db' as const,
  },
  {
    text: 'IP {ip} flagged in {count} prior incidents involving coordinated fraud activity',
    source: 'Threat Intel',
    sourceType: 'threat_intel' as const,
  },
  {
    text: 'Entity linked to known fraud ring (Ring #{ringId}) — {count} confirmed fraudulent accounts in cluster',
    source: 'Case History',
    sourceType: 'case_history' as const,
  },
  {
    text: 'Behavioral velocity matches pattern from {count} previously blocked entities (avg {score}% similarity)',
    source: 'Pattern DB',
    sourceType: 'pattern_db' as const,
  },
  {
    text: 'Device fingerprint {fp} appeared in {count} escalated cases within last {days} days',
    source: 'Investigation DB',
    sourceType: 'investigation_db' as const,
  },
  {
    text: 'Entity email domain matches {count} known disposable/temp email services on watchlist',
    source: 'Watchlist',
    sourceType: 'watchlist' as const,
  },
  {
    text: 'Payment method BIN {bin} associated with {count} chargebacks this month (3x normal rate)',
    source: 'Threat Intel',
    sourceType: 'threat_intel' as const,
  },
  {
    text: 'Graph traversal found {count}-degree connection to confirmed money mule account (Case #{caseId})',
    source: 'Case History',
    sourceType: 'case_history' as const,
  },
  {
    text: 'Session timing pattern (avg {ms}ms between actions) matches known automation toolkit signatures',
    source: 'Pattern DB',
    sourceType: 'pattern_db' as const,
  },
  {
    text: 'Geolocation impossible travel: {city1} → {city2} in {minutes} minutes (requires {hours}h minimum)',
    source: 'Threat Intel',
    sourceType: 'threat_intel' as const,
  },
  {
    text: 'Account creation burst: {count} accounts from same IP subnet in {minutes}-minute window',
    source: 'Investigation DB',
    sourceType: 'investigation_db' as const,
  },
  {
    text: 'Entity on shared watchlist (updated {days}d ago) — flagged by {count} partner institutions',
    source: 'Watchlist',
    sourceType: 'watchlist' as const,
  },
]

function fillTemplate(template: string): string {
  return template
    .replace('{caseId}', String(1000 + Math.floor(Math.random() * 9000)))
    .replace('{timeAgo}', ['2 weeks ago', '5 days ago', '3 days ago', '1 week ago', '10 days ago'][Math.floor(Math.random() * 5)])
    .replace('{count}', String(2 + Math.floor(Math.random() * 12)))
    .replace('{ip}', `192.168.${Math.floor(Math.random() * 255)}.x`)
    .replace('{ringId}', String(100 + Math.floor(Math.random() * 900)))
    .replace('{score}', String(82 + Math.floor(Math.random() * 15)))
    .replace('{fp}', `FP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`)
    .replace('{days}', String(3 + Math.floor(Math.random() * 25)))
    .replace('{bin}', `4${Math.floor(Math.random() * 99999).toString().padStart(5, '0')}`)
    .replace('{ms}', String(30 + Math.floor(Math.random() * 70)))
    .replace('{city1}', ['New York', 'London', 'Tokyo', 'Berlin', 'Sydney'][Math.floor(Math.random() * 5)])
    .replace('{city2}', ['Lagos', 'Moscow', 'São Paulo', 'Mumbai', 'Jakarta'][Math.floor(Math.random() * 5)])
    .replace('{minutes}', String(5 + Math.floor(Math.random() * 20)))
    .replace('{hours}', String(6 + Math.floor(Math.random() * 12)))
}

function generateEvidence(): EvidenceItem[] {
  const count = 2 + Math.floor(Math.random() * 2) // 2-3 items
  const shuffled = [...EVIDENCE_TEMPLATES].sort(() => Math.random() - 0.5)
  const now = Date.now()

  return shuffled.slice(0, count).map((tmpl, i) => ({
    id: `ev-${now}-${i}`,
    text: fillTemplate(tmpl.text),
    source: tmpl.source,
    sourceType: tmpl.sourceType,
    relevanceScore: 0.75 + Math.random() * 0.24,
    timestamp: now + i * 600,
  }))
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean
  triggerKey: string | null // changes on BLOCK events
}

export default function GraphRAGEvidencePanel({ visible, triggerKey }: Props) {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [graphHops, setGraphHops] = useState(0)
  const [retrievalLatency, setRetrievalLatency] = useState(0)
  const [visibleCards, setVisibleCards] = useState<Set<string>>(new Set())
  const [animState, setAnimState] = useState<'hidden' | 'entering' | 'visible' | 'exiting'>('hidden')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    // Cleanup card timers
    return () => {
      cardTimers.current.forEach(t => clearTimeout(t))
    }
  }, [])

  useEffect(() => {
    if (!visible || !triggerKey) {
      setAnimState('hidden')
      setVisibleCards(new Set())
      return
    }

    // Generate new evidence
    const newEvidence = generateEvidence()
    setEvidence(newEvidence)
    setGraphHops(2 + Math.floor(Math.random() * 3)) // 2-4 hops
    setRetrievalLatency(45 + Math.floor(Math.random() * 80))
    setVisibleCards(new Set())
    setAnimState('entering')

    // Animate cards sliding in one by one
    cardTimers.current.forEach(t => clearTimeout(t))
    cardTimers.current = []

    newEvidence.forEach((ev, i) => {
      const timer = setTimeout(() => {
        setVisibleCards(prev => new Set([...prev, ev.id]))
      }, 400 + i * 500) // stagger 500ms per card
      cardTimers.current.push(timer)
    })

    const enterTimer = setTimeout(() => setAnimState('visible'), 300)
    cardTimers.current.push(enterTimer)

    // Auto-dismiss after 12 seconds
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setAnimState('exiting')
      setTimeout(() => {
        setAnimState('hidden')
        setVisibleCards(new Set())
      }, 400)
    }, 12000)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      cardTimers.current.forEach(t => clearTimeout(t))
    }
  }, [triggerKey, visible])

  if (animState === 'hidden') return null

  const opacity = animState === 'exiting' ? 0 : animState === 'entering' ? 0.5 : 1

  return (
    <div
      className="rounded-xl p-3 transition-all"
      style={{
        background: 'linear-gradient(135deg, rgba(87,148,242,0.06) 0%, rgba(77,208,225,0.04) 100%)',
        border: '1px solid rgba(87,148,242,0.2)',
        opacity,
        transitionDuration: '400ms',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs">📚</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300">
            Evidence Retrieved
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{
            background: 'rgba(77,208,225,0.15)',
            color: '#4DD0E1',
            border: '1px solid rgba(77,208,225,0.3)',
          }}>
            Graph Hops: {graphHops}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{
            background: 'rgba(87,148,242,0.1)',
            color: '#5794F2',
          }}>
            GraphRAG
          </span>
        </div>
      </div>

      {/* Evidence Cards */}
      <div className="space-y-2">
        {evidence.map((ev) => {
          const style = SOURCE_STYLES[ev.sourceType]
          const isVisible = visibleCards.has(ev.id)

          return (
            <div
              key={ev.id}
              className="rounded-lg px-2.5 py-2 transition-all duration-500"
              style={{
                background: style.bg,
                border: `1px solid ${style.color}22`,
                opacity: isVisible ? 1 : 0,
                transform: `translateX(${isVisible ? 0 : -20}px)`,
              }}
            >
              <div className="flex items-start gap-2">
                <span className="text-[10px] mt-0.5">{style.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-300 leading-relaxed">
                    "{ev.text}"
                  </p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[9px] font-medium" style={{ color: style.color }}>
                      [Source: {ev.source}]
                    </span>
                    <span className="text-[9px] text-gray-600 font-mono">
                      relevance: {ev.relevanceScore.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <span className="text-[9px] text-gray-600">
          Retrieved {evidence.length} evidence fragments via {graphHops}-hop graph traversal
        </span>
        <span className="text-[9px] text-gray-600 font-mono">
          latency: {retrievalLatency}ms
        </span>
      </div>
    </div>
  )
}
