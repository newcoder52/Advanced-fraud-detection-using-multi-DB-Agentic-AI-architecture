import { useState } from 'react'
import { api } from '../api'

interface Memory {
  id: string
  entity_id: string
  summary: string
  findings: string[]
  timestamp: string
  confidence: number
  related_cases: string[]
  tags: string[]
}

interface Pattern {
  pattern_id: string
  description: string
  frequency: number
  entities_involved: string[]
  first_seen: string
  last_seen: string
  risk_level: string
}

export default function AgentMemory({ domain }: { domain: string }) {
  const [recallEntity, setRecallEntity] = useState('')
  const [memories, setMemories] = useState<Memory[]>([])
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [storeSuccess, setStoreSuccess] = useState(false)

  // Store form
  const [storeEntityId, setStoreEntityId] = useState('')
  const [storeSummary, setStoreSummary] = useState('')
  const [storeFindings, setStoreFindings] = useState('')

  const handleRecall = async () => {
    if (!recallEntity.trim()) return
    setLoading('recall')
    setError('')
    try {
      const data = await api.memoryRecall(recallEntity)
      setMemories(data.memories || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  const handlePatterns = async () => {
    setLoading('patterns')
    setError('')
    try {
      const data = await api.memoryPatterns()
      setPatterns(data.patterns || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  const handleStore = async () => {
    if (!storeEntityId.trim() || !storeSummary.trim()) return
    setLoading('store')
    setError('')
    setStoreSuccess(false)
    try {
      await api.memoryStore({
        content: storeSummary + (storeFindings ? '\n\nFindings:\n' + storeFindings : ''),
        memory_type: 'investigation_finding',
        entity_ids: [storeEntityId],
        metadata: { domain },
      })
      setStoreSuccess(true)
      setStoreEntityId('')
      setStoreSummary('')
      setStoreFindings('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return '#F2495C'
      case 'medium': return '#FF9830'
      default: return '#73BF69'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Agent Memory (Mem0)</h1>
          <p className="text-sm text-gray-500 mt-1">
            Persistent investigation memory — cross-case pattern recognition & contextual recall
          </p>
        </div>
        <button onClick={handlePatterns} disabled={loading === 'patterns'}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: 'rgba(184,119,217,0.15)', color: '#B877D9', border: '1px solid rgba(184,119,217,0.3)' }}>
          {loading === 'patterns' ? '⏳' : '🧩 Detect Patterns'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(242,73,92,0.1)', border: '1px solid rgba(242,73,92,0.3)' }}>
          <p className="text-sm text-red-400">⚠️ {error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Recall + Timeline */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recall Input */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <label className="text-xs text-gray-500 uppercase tracking-widest">Recall Memories</label>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={recallEntity}
                onChange={(e) => setRecallEntity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRecall()}
                placeholder="Entity ID to recall memories for..."
                className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <button onClick={handleRecall} disabled={loading === 'recall'}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'rgba(87,148,242,0.15)', color: '#5794F2', border: '1px solid rgba(87,148,242,0.3)' }}>
                {loading === 'recall' ? '⏳' : '🧠 Recall'}
              </button>
            </div>
          </div>

          {/* Memory Timeline */}
          {memories.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-semibold text-white mb-4">
                Memories for: <span className="font-mono text-blue-400">{recallEntity}</span>
                <span className="text-xs text-gray-500 ml-2">({memories.length} found)</span>
              </h3>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-3 top-0 bottom-0 w-px" style={{ background: 'rgba(255,255,255,0.08)' }}></div>

                <div className="space-y-4">
                  {memories.map((memory) => (
                    <div key={memory.id} className="flex gap-4 ml-1">
                      {/* Timeline dot */}
                      <div className="relative z-10 mt-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#5794F2', boxShadow: '0 0 8px rgba(87,148,242,0.4)' }}></div>
                      </div>

                      {/* Memory card */}
                      <div className="flex-1 rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">
                            {new Date(memory.timestamp).toLocaleDateString()} {new Date(memory.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono">
                            confidence: {(memory.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-sm text-gray-200 mb-2">{memory.summary}</p>

                        {memory.findings?.length > 0 && (
                          <div className="space-y-1 mb-2">
                            {memory.findings.map((f, i) => (
                              <p key={i} className="text-[11px] text-gray-400 flex items-start gap-1">
                                <span className="text-green-400">→</span> {f}
                              </p>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1">
                          {memory.tags?.map((tag, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(184,119,217,0.1)', color: '#B877D9' }}>
                              {tag}
                            </span>
                          ))}
                          {memory.related_cases?.map((c, i) => (
                            <span key={`case-${i}`} className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(87,148,242,0.1)', color: '#5794F2' }}>
                              🔗 {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Cross-Case Patterns */}
          {patterns.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-semibold text-white mb-4">🧩 Cross-Case Patterns Detected</h3>
              <div className="space-y-3">
                {patterns.map((pattern) => (
                  <div key={pattern.pattern_id} className="rounded-lg p-3"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white font-medium">{pattern.description}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: `${getRiskColor(pattern.risk_level)}20`, color: getRiskColor(pattern.risk_level) }}>
                        {pattern.risk_level} risk
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-400 mb-2">
                      <span>Frequency: <span className="text-white">{pattern.frequency}x</span></span>
                      <span>First: <span className="text-white">{new Date(pattern.first_seen).toLocaleDateString()}</span></span>
                      <span>Last: <span className="text-white">{new Date(pattern.last_seen).toLocaleDateString()}</span></span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pattern.entities_involved.map((e, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                          style={{ background: 'rgba(255,152,48,0.1)', color: '#FF9830' }}>
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Store Memory */}
        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Store Investigation Memory</h3>
            <div className="space-y-2">
              <input
                type="text"
                value={storeEntityId}
                onChange={(e) => setStoreEntityId(e.target.value)}
                placeholder="Entity ID..."
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <textarea
                value={storeSummary}
                onChange={(e) => setStoreSummary(e.target.value)}
                placeholder="Investigation summary..."
                rows={3}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <textarea
                value={storeFindings}
                onChange={(e) => setStoreFindings(e.target.value)}
                placeholder="Findings (one per line)..."
                rows={4}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <button onClick={handleStore} disabled={loading === 'store'}
                className="w-full px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'rgba(115,191,105,0.15)', color: '#73BF69', border: '1px solid rgba(115,191,105,0.3)' }}>
                {loading === 'store' ? '⏳ Storing...' : '💾 Store Memory'}
              </button>
              {storeSuccess && (
                <p className="text-xs text-green-400 text-center">✓ Memory stored successfully</p>
              )}
            </div>
          </div>

          {/* Memory Stats */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Memory Stats</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Memories</span>
                <span className="text-white font-mono">{memories.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Patterns Detected</span>
                <span className="text-white font-mono">{patterns.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Retention Period</span>
                <span className="text-white font-mono">90 days</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
