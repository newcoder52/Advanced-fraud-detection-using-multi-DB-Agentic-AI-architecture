import { useState } from 'react'
import { api } from '../api'

interface RAGResult {
  answer: string
  sources: Array<{
    title: string
    content: string
    relevance_score: number
    source_type: string
  }>
  graph_context: {
    entities_found: string[]
    relationships_traversed: number
    hops: number
  }
}

interface InvestigationResult {
  entity_id: string
  summary: string
  risk_level: string
  connected_documents: Array<{ title: string; relevance: number }>
  graph_insights: string[]
  recommendations: string[]
}

export default function GraphRAGQuery({ domain }: { domain: string }) {
  const [query, setQuery] = useState('')
  const [entityId, setEntityId] = useState('')
  const [ingestText, setIngestText] = useState('')
  const [ingestTitle, setIngestTitle] = useState('')
  const [ragResult, setRagResult] = useState<RAGResult | null>(null)
  const [investigation, setInvestigation] = useState<InvestigationResult | null>(null)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [ingestSuccess, setIngestSuccess] = useState(false)

  const handleQuery = async () => {
    if (!query.trim()) return
    setLoading('query')
    setError('')
    try {
      const data = await api.graphragQuery({ question: query, domain })
      // Normalize response - API returns { synthesis: { answer, citations, ... } }
      const synthesis = data.synthesis || data
      setRagResult({
        answer: synthesis.answer || data.answer || '',
        sources: (synthesis.citations || data.sources || []).map((s: any) => ({
          title: s.title || s.source || 'Document',
          content: s.content || s.text || '',
          relevance_score: s.relevance_score || s.relevance || 0,
          source_type: s.source_type || s.type || 'document',
        })),
        graph_context: {
          entities_found: data.entities_extracted || synthesis.graph_evidence || [],
          relationships_traversed: data.graph_hops_traversed || 0,
          hops: data.graph_hops_traversed || 0,
        },
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  const handleInvestigate = async () => {
    if (!entityId.trim()) return
    setLoading('investigate')
    setError('')
    try {
      const data = await api.graphragInvestigate(entityId)
      setInvestigation(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  const handleIngest = async () => {
    if (!ingestText.trim() || !ingestTitle.trim()) return
    setLoading('ingest')
    setError('')
    setIngestSuccess(false)
    try {
      await api.graphragIngest({ title: ingestTitle, content: ingestText, domain })
      setIngestSuccess(true)
      setIngestText('')
      setIngestTitle('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold gradient-text">GraphRAG Intelligence</h1>
        <p className="text-sm text-gray-500 mt-1">
          Multi-hop knowledge retrieval combining Neptune graph with Bedrock Knowledge Bases
        </p>
      </div>

      {error && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(242,73,92,0.1)', border: '1px solid rgba(242,73,92,0.3)' }}>
          <p className="text-sm text-red-400">⚠️ {error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Query Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Natural Language Query */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <label className="text-xs text-gray-500 uppercase tracking-widest">Fraud Intelligence Query</label>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                placeholder="Ask anything... (e.g., 'What fraud patterns involve shared devices across accounts?')"
                className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <button onClick={handleQuery} disabled={loading === 'query'}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'rgba(87,148,242,0.15)', color: '#5794F2', border: '1px solid rgba(87,148,242,0.3)' }}>
                {loading === 'query' ? '⏳' : '📚 Query'}
              </button>
            </div>
          </div>

          {/* RAG Results */}
          {ragResult && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-semibold text-white mb-3">Answer</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{ragResult.answer}</p>

              {/* Graph Context */}
              {ragResult.graph_context && (
                <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(184,119,217,0.08)', border: '1px solid rgba(184,119,217,0.2)' }}>
                  <p className="text-xs text-purple-400 font-medium mb-1">🕸️ Graph Context</p>
                  <div className="flex gap-4 text-xs text-gray-400">
                    <span>Entities: <span className="text-white">{ragResult.graph_context.entities_found.length}</span></span>
                    <span>Relationships: <span className="text-white">{ragResult.graph_context.relationships_traversed}</span></span>
                    <span>Hops: <span className="text-white">{ragResult.graph_context.hops}</span></span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {ragResult.graph_context.entities_found.map((e, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(184,119,217,0.15)', color: '#B877D9' }}>
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sources */}
              {ragResult.sources?.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Sources</p>
                  <div className="space-y-2">
                    {ragResult.sources.map((source, idx) => (
                      <div key={idx} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-white">{source.title}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(87,148,242,0.1)', color: '#5794F2' }}>
                              {source.source_type}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {(source.relevance_score * 100).toFixed(0)}% relevant
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-400 italic">"{source.content}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Entity Investigation */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <label className="text-xs text-gray-500 uppercase tracking-widest">Investigate Entity</label>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvestigate()}
                placeholder="Entity ID to investigate..."
                className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <button onClick={handleInvestigate} disabled={loading === 'investigate'}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'rgba(255,152,48,0.15)', color: '#FF9830', border: '1px solid rgba(255,152,48,0.3)' }}>
                {loading === 'investigate' ? '⏳' : '🔎 Investigate'}
              </button>
            </div>
          </div>

          {investigation && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-white">Investigation: {investigation.entity_id}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    background: investigation.risk_level === 'high' ? 'rgba(242,73,92,0.15)' : 'rgba(255,152,48,0.15)',
                    color: investigation.risk_level === 'high' ? '#F2495C' : '#FF9830'
                  }}>
                  {investigation.risk_level} risk
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-3">{investigation.summary}</p>
              {investigation.graph_insights?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1">Graph Insights:</p>
                  <ul className="space-y-1">
                    {investigation.graph_insights.map((insight, i) => (
                      <li key={i} className="text-xs text-gray-400 flex items-start gap-1">
                        <span className="text-purple-400">•</span> {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {investigation.recommendations?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Recommendations:</p>
                  <ul className="space-y-1">
                    {investigation.recommendations.map((rec, i) => (
                      <li key={i} className="text-xs text-green-400 flex items-start gap-1">
                        <span>→</span> {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ingest Panel */}
        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Ingest Document</h3>
            <input
              type="text"
              value={ingestTitle}
              onChange={(e) => setIngestTitle(e.target.value)}
              placeholder="Document title..."
              className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-2"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <textarea
              value={ingestText}
              onChange={(e) => setIngestText(e.target.value)}
              placeholder="Paste fraud report, investigation notes, or regulatory text..."
              rows={8}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <button onClick={handleIngest} disabled={loading === 'ingest'}
              className="w-full mt-2 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'rgba(115,191,105,0.15)', color: '#73BF69', border: '1px solid rgba(115,191,105,0.3)' }}>
              {loading === 'ingest' ? '⏳ Indexing...' : '📥 Ingest & Index'}
            </button>
            {ingestSuccess && (
              <p className="text-xs text-green-400 mt-2 text-center">✓ Document ingested successfully</p>
            )}
          </div>

          {/* Quick Queries */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Quick Queries</h3>
            <div className="space-y-2">
              {[
                'What are common fraud ring patterns?',
                'Show account takeover techniques',
                'How do shared devices indicate fraud?',
                'Recent suspicious activity patterns',
              ].map((q, i) => (
                <button key={i} onClick={() => { setQuery(q); }}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg transition-all hover:bg-white/5"
                  style={{ color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.04)' }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
