import { useRef, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IntelMessage {
  id: string
  timestamp: string
  icon: string
  type: 'ontology' | 'gnn' | 'cache' | 'ring' | 'block' | 'escalation'
  headline: string
  explanation: string
  impact: string
}

interface Props {
  messages: IntelMessage[]
}

// ─── Color Map ────────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<IntelMessage['type'], { border: string; headlineColor: string; bg: string }> = {
  ontology: { border: 'rgba(184,119,217,0.4)', headlineColor: '#D8A8FF', bg: 'rgba(184,119,217,0.04)' },
  gnn: { border: 'rgba(77,208,225,0.4)', headlineColor: '#80DEEA', bg: 'rgba(77,208,225,0.04)' },
  cache: { border: 'rgba(115,191,105,0.4)', headlineColor: '#A5D6A7', bg: 'rgba(115,191,105,0.04)' },
  ring: { border: 'rgba(255,152,48,0.4)', headlineColor: '#FFB74D', bg: 'rgba(255,152,48,0.04)' },
  block: { border: 'rgba(242,73,92,0.4)', headlineColor: '#EF9A9A', bg: 'rgba(242,73,92,0.04)' },
  escalation: { border: 'rgba(250,222,42,0.4)', headlineColor: '#FFF59D', bg: 'rgba(250,222,42,0.04)' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ThreatIntelFeed({ messages }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-xs">🧠</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-300">
          AI Intelligence Feed
        </span>
        <span className="ml-auto text-[9px] text-gray-500 font-mono">{messages.length} insights</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-2 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-xs">Waiting for threat signals...</p>
            <p className="text-gray-600 text-[10px] mt-1">AI narration appears when events are flagged or blocked</p>
          </div>
        ) : (
          messages.map(msg => {
            const style = TYPE_STYLES[msg.type]
            return (
              <div
                key={msg.id}
                className="rounded-lg px-2.5 py-2 transition-all"
                style={{
                  background: style.bg,
                  borderLeft: `3px solid ${style.border}`,
                }}
              >
                {/* Header */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px]">{msg.icon}</span>
                  <span className="text-[10px] font-bold" style={{ color: style.headlineColor }}>
                    {msg.headline}
                  </span>
                  <span className="ml-auto text-[9px] text-gray-500 font-mono">{msg.timestamp}</span>
                </div>

                {/* Explanation */}
                <p className="text-[10px] text-gray-300 leading-relaxed mb-1">
                  → {msg.explanation}
                </p>

                {/* Impact */}
                <p className="text-[10px] text-gray-400 italic">
                  💡 {msg.impact}
                </p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Message Generators ──────────────────────────────────────────────────────

export function generateOntologyMessage(entityId: string, leafId: string, severity: string, confidence: number, historicalRate: string): IntelMessage {
  const explanations: Record<string, string> = {
    'Pig Butchering': 'The system recognized a known pattern — a fake romantic interest grooming the victim before pressuring them into fraudulent crypto investments.',
    'Catfishing': 'A fabricated persona using stolen photos was detected. The profile fails reverse-image verification and refuses video calls.',
    'Military Impersonation': 'Scammer posing as deployed military personnel — exploiting patriotism and sympathy to extract money for fake "leave" or "shipping" costs.',
    'Credential Stuffing': 'Automated injection of stolen username/password pairs from a breach dump to hijack accounts at scale.',
    'Account Takeover': 'Unauthorized access to a legitimate account detected — likely via compromised credentials or session hijacking.',
    'Stream Farming': 'Bot network artificially inflating streaming counts to generate fraudulent royalty payments.',
    'Bot Network': 'Coordinated network of automated accounts acting in unison — likely manipulating platform metrics or executing attacks.',
    'Click Fraud': 'Automated clicking pattern detected — draining advertiser budgets or inflating publisher revenue.',
    'Ticket Scalping': 'Automated bulk purchasing at superhuman speed — denying genuine fans access to limited inventory.',
    'Bot Purchasing': 'Scripts completing purchases faster than humanly possible to acquire high-demand items.',
    'Spear Phishing': 'Highly targeted attack using the victim\'s personal information to craft a convincing fraudulent message.',
    'Credential Harvesting': 'Fake login page mimicking a legitimate service — capturing credentials for account takeover.',
    'Deepfake': 'AI-generated synthetic media designed to impersonate a real person for fraud or manipulation.',
  }

  const explanation = explanations[leafId] || `Known threat pattern "${leafId}" detected with ${confidence}% confidence. The system matched behavioral indicators to the threat intelligence taxonomy.`

  return {
    id: `onto-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    icon: '🧬',
    type: 'ontology',
    headline: `CLASSIFIED: ${entityId} → "${leafId}" (${severity})`,
    explanation,
    impact: historicalRate + `. Early detection at this stage prevents escalation.`,
  }
}

export function generateGNNMessage(entityId: string, leafId: string): IntelMessage {
  const connectedCount = 2 + Math.floor(Math.random() * 5)
  const confidence = 82 + Math.floor(Math.random() * 15)
  const entities = Array.from({ length: Math.min(connectedCount, 3) }, () => {
    const pools = ['ACCT-0034', 'ACCT-0056', 'DEV-A2', 'IP-VPN-POOL-3', 'BOT-FARM-001', 'ACCT-0078', 'DEV-C1']
    return pools[Math.floor(Math.random() * pools.length)]
  })

  return {
    id: `gnn-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    icon: '🔮',
    type: 'gnn',
    headline: `PREDICTED: ${connectedCount} at-risk entities linked to ${entityId}`,
    explanation: `These accounts haven't triggered rules yet, but their graph structure matches known "${leafId}" patterns with ${confidence}% confidence. The GNN learned this topology from historical confirmed cases.`,
    impact: `Now monitoring: ${entities.join(', ')}. Pre-emptive detection prevents network spread.`,
  }
}

export function generateCacheMessage(hitRate: number): IntelMessage {
  const costSavings = Math.round(hitRate * 0.95)
  return {
    id: `cache-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    icon: '⚡',
    type: 'cache',
    headline: `EFFICIENCY: Cache hit rate reached ${hitRate}%`,
    explanation: `${hitRate} out of every 100 events now resolve in <5ms without hitting any database. The system has learned which entities are safe and which need full analysis.`,
    impact: `Estimated ${costSavings}% reduction in Aurora + Neptune query costs. Average latency dropped to single-digit milliseconds for known entities.`,
  }
}

export function generateRingMessage(entityId: string): IntelMessage {
  const ringSize = 3 + Math.floor(Math.random() * 6)
  const sharedSignals = ['device fingerprint', 'payment BIN', 'IP subnet', 'creation timestamp', 'behavioral pattern']
  const signal1 = sharedSignals[Math.floor(Math.random() * sharedSignals.length)]
  const signal2 = sharedSignals[Math.floor(Math.random() * sharedSignals.length)]

  return {
    id: `ring-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    icon: '🕸️',
    type: 'ring',
    headline: `RING DETECTED: ${ringSize} entities form a connected cluster`,
    explanation: `Neptune graph traversal revealed ${ringSize} entities sharing ${signal1} and ${signal2}. This cluster pattern matches known coordinated fraud operations — individual entities may look innocent, but the network structure exposes them.`,
    impact: `All ${ringSize} entities flagged for monitoring. Graph-based detection catches threats invisible to content or rule-based systems.`,
  }
}

export function generateBlockMessage(entityId: string, score: number, decision: string): IntelMessage {
  return {
    id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    icon: '🚨',
    type: 'block',
    headline: `BLOCKED: ${entityId} (score: ${score}/100)`,
    explanation: `Multiple detection signals converged — the entity scored ${score}/100, exceeding the block threshold. The decision was made in real-time (<500ms) using the combined output of cache, content similarity, and graph analysis.`,
    impact: `Full Layer 2 investigation triggered automatically. AI agent will produce an analyst-ready brief within seconds.`,
  }
}

export function generateEscalationMessage(entityId: string, priorFlags: number): IntelMessage {
  return {
    id: `esc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    icon: '⬆️',
    type: 'escalation',
    headline: `ESCALATED: ${entityId} — repeat offender (${priorFlags} prior flags)`,
    explanation: `This entity has been flagged ${priorFlags} times previously. The system automatically escalated the risk score — repeat offenders get progressively less benefit of the doubt.`,
    impact: `Score boosted by +15% per prior flag. At 5+ flags, entities are auto-blocked regardless of current event content.`,
  }
}
