import { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassificationProp {
  path: string[]
  leafId: string
  confidence: number
  description: string
  indicators: string[]
  recommendedAction: string
  severity: 'critical' | 'high' | 'medium'
  historicalRate: string
}

interface Props {
  visible: boolean
  triggerKey: string | null
  classification: ClassificationProp | null
  entityId: string | null
  entityType: string | null
  eventId: string | null
}

// ─── Simulated Data ───────────────────────────────────────────────────────────

const GRAPH_CONTEXTS = [
  'Connected to 4 known bad actors via shared payment method',
  'Member of 12-node fraud ring identified in Neptune traversal (depth=3)',
  'Shares device fingerprint with 3 previously blocked accounts',
  'IP address linked to 7 flagged entities in last 48 hours',
  'Part of coordinated cluster: 8 accounts created within same 5-minute window',
  'Second-hop connection to confirmed fraud ring (23 nodes, 41 edges)',
  'Shares email domain with 6 other blocked entities (disposable provider)',
  'Account referred by entity BLOCK-flagged 48h ago — recruitment pattern',
  'Payment BIN matches 5 other chargebacked transactions this week',
  'Behavioral fingerprint 94% similar to known bot-farm operator BOT-FARM-015',
]

function generateTimeline(entityId: string): { time: string; event: string }[] {
  const timelines = [
    [
      { time: '5m ago', event: 'Entity first observed — new account creation' },
      { time: '3m ago', event: 'First interaction flagged (velocity anomaly)' },
      { time: '1m ago', event: 'Escalation: matched 3 fraud signals' },
      { time: 'Now', event: `BLOCKED — composite score exceeded threshold` },
    ],
    [
      { time: '12m ago', event: 'Login from new device + new geographic region' },
      { time: '8m ago', event: 'Password change + recovery email updated' },
      { time: '2m ago', event: 'High-value transaction initiated' },
      { time: 'Now', event: `BLOCKED — account takeover pattern confirmed` },
    ],
    [
      { time: '4m ago', event: 'First message sent to target user' },
      { time: '2m ago', event: 'Off-platform messaging request detected' },
      { time: '45s ago', event: 'Financial solicitation language flagged' },
      { time: 'Now', event: `BLOCKED — social engineering pattern` },
    ],
    [
      { time: '8m ago', event: 'Bulk action initiated (50+ items)' },
      { time: '5m ago', event: 'Rate limit triggered — automated behavior' },
      { time: '1m ago', event: 'Device fingerprint matched known bot farm' },
      { time: 'Now', event: `BLOCKED — bot network confirmed` },
    ],
    [
      { time: '15m ago', event: 'Session created from datacenter IP' },
      { time: '10m ago', event: 'CAPTCHA bypass detected (<200ms solve)' },
      { time: '3m ago', event: 'Checkout velocity: 150ms (human avg: 4.2s)' },
      { time: 'Now', event: `BLOCKED — automated purchasing` },
    ],
  ]
  return timelines[Math.floor(Math.random() * timelines.length)]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InvestigationBriefPanel({ visible, triggerKey, classification, entityId, entityType, eventId }: Props) {
  const [animState, setAnimState] = useState<'hidden' | 'entering' | 'visible' | 'exiting'>('hidden')
  const [briefData, setBriefData] = useState<{
    timestamp: string
    graphContext: string
    timeline: { time: string; event: string }[]
    confidence: number
  } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!visible || !triggerKey || !classification) {
      setAnimState('hidden')
      return
    }

    // Generate brief data
    setBriefData({
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      graphContext: GRAPH_CONTEXTS[Math.floor(Math.random() * GRAPH_CONTEXTS.length)],
      timeline: generateTimeline(entityId || 'UNKNOWN'),
      confidence: 82 + Math.floor(Math.random() * 15), // 82-96%
    })
    setAnimState('entering')

    const enterTimeout = setTimeout(() => setAnimState('visible'), 400)

    // Auto-dismiss after 15 seconds
    timeoutRef.current = setTimeout(() => {
      setAnimState('exiting')
      setTimeout(() => setAnimState('hidden'), 400)
    }, 15000)

    return () => {
      clearTimeout(enterTimeout)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [triggerKey, visible, classification, entityId])

  if (animState === 'hidden' || !classification || !briefData) return null

  const opacity = animState === 'entering' ? 0 : animState === 'exiting' ? 0 : 1
  const translateX = animState === 'entering' ? 30 : animState === 'exiting' ? 30 : 0

  const severityColor = classification.severity === 'critical' ? '#F2495C' : classification.severity === 'high' ? '#FF9830' : '#FADE2A'
  const borderColor = classification.severity === 'critical' ? 'rgba(242,73,92,0.6)' : 'rgba(255,152,48,0.5)'

  return (
    <div
      className="rounded-xl overflow-hidden transition-all ease-out"
      style={{
        background: 'linear-gradient(135deg, rgba(20,22,28,0.97) 0%, rgba(30,32,40,0.97) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: `3px solid ${borderColor}`,
        opacity,
        transform: `translateX(${translateX}px)`,
        transitionDuration: '400ms',
        backdropFilter: 'blur(8px)',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}
    >
      <div className="p-3.5 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚡</span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-white">
              Investigation Brief
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-gray-500">{briefData.timestamp}</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-800/80 text-gray-400">
              {eventId || 'EVT-???'}
            </span>
          </div>
        </div>

        {/* Entity Summary */}
        <div className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(242,73,92,0.05)', border: '1px solid rgba(242,73,92,0.15)' }}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[9px] text-gray-500 uppercase tracking-wide">Entity</span>
              <p className="text-[11px] font-mono font-bold text-white">{entityId || 'UNKNOWN'}</p>
            </div>
            <div className="text-right">
              <span className="text-[9px] text-gray-500 uppercase tracking-wide">Type</span>
              <p className="text-[10px] text-gray-300 capitalize">{entityType || 'account'}</p>
            </div>
            <div className="text-right">
              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-900/40 text-red-300 ring-1 ring-red-500/40">
                🔴 BLOCK
              </span>
            </div>
          </div>
        </div>

        {/* Ontology Classification */}
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wide text-purple-400">Ontology Classification</span>

          {/* Path */}
          <div className="flex items-center gap-1 mt-1.5 mb-1.5 flex-wrap">
            {classification.path.map((segment, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-600 text-[9px]">›</span>}
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                    i === classification.path.length - 1
                      ? 'bg-purple-500/20 text-purple-200 ring-1 ring-purple-500/40'
                      : 'bg-gray-800/60 text-gray-400'
                  }`}
                >
                  {segment}
                </span>
              </span>
            ))}
          </div>

          {/* Severity + Confidence */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{
                background: `${severityColor}20`,
                color: severityColor,
                border: `1px solid ${severityColor}66`,
              }}
            >
              {classification.severity}
            </span>
            <span className="text-[9px] text-gray-500">Confidence:</span>
            <span className="text-[10px] font-mono font-bold text-white">{classification.confidence}%</span>
          </div>

          {/* Description */}
          <p className="text-[10px] text-gray-300 leading-relaxed mb-1.5">{classification.description}</p>

          {/* Indicators */}
          <div className="space-y-0.5">
            {classification.indicators.map((ind, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-[8px] mt-0.5" style={{ color: severityColor }}>⚠</span>
                <span className="text-[9px] text-gray-300">{ind}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Graph Context */}
        <div className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(184,119,217,0.05)', border: '1px solid rgba(184,119,217,0.15)' }}>
          <span className="text-[9px] font-bold uppercase tracking-wide text-purple-300">🕸️ Graph Intelligence</span>
          <p className="text-[10px] text-gray-300 mt-1">{briefData.graphContext}</p>
        </div>

        {/* Recommended Actions */}
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wide text-blue-400">Recommended Actions</span>
          <div className="mt-1.5 space-y-1">
            <div className="flex items-start gap-2">
              <span className="text-[9px] font-mono text-blue-500 mt-0.5 flex-shrink-0">1.</span>
              <span className="text-[10px] text-gray-300">{classification.recommendedAction}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[9px] font-mono text-blue-500 mt-0.5 flex-shrink-0">2.</span>
              <span className="text-[10px] text-gray-300">Preserve evidence chain for compliance review and potential law enforcement referral.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[9px] font-mono text-blue-500 mt-0.5 flex-shrink-0">3.</span>
              <span className="text-[10px] text-gray-300">Update fraud model training set with confirmed classification for pattern reinforcement.</span>
            </div>
          </div>
        </div>

        {/* Event Timeline */}
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Event Timeline</span>
          <div className="mt-1.5 relative pl-3">
            {/* Timeline line */}
            <div className="absolute left-[5px] top-1 bottom-1 w-px" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(242,73,92,0.5))' }} />
            <div className="space-y-1.5">
              {briefData.timeline.map((entry, i) => {
                const isLast = i === briefData.timeline.length - 1
                return (
                  <div key={i} className="flex items-start gap-2 relative">
                    {/* Timeline dot */}
                    <div
                      className="absolute -left-[2px] top-[5px] w-[5px] h-[5px] rounded-full flex-shrink-0"
                      style={{ background: isLast ? '#F2495C' : 'rgba(255,255,255,0.3)' }}
                    />
                    <span className="text-[9px] font-mono text-gray-500 w-12 flex-shrink-0 ml-2">{entry.time}</span>
                    <span className={`text-[9px] ${isLast ? 'text-red-300 font-bold' : 'text-gray-400'}`}>{entry.event}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Overall Confidence */}
        <div className="pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-gray-500 uppercase tracking-wide">Investigation Confidence</span>
            <span className="text-[11px] font-mono font-bold text-white">{briefData.confidence}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${briefData.confidence}%`,
                background: briefData.confidence >= 90
                  ? 'linear-gradient(90deg, #73BF69, #4CAF50)'
                  : 'linear-gradient(90deg, #5794F2, #3D5AFE)',
              }}
            />
          </div>
          <p className="text-[9px] text-gray-600 mt-1 italic">{classification.historicalRate}</p>
        </div>
      </div>
    </div>
  )
}
