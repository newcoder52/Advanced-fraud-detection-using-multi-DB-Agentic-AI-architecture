import { useState } from 'react'
import { api } from '../api'

interface Concept {
  id: string
  name: string
  type: string
  description: string
  related_concepts: string[]
  properties: Record<string, string>
}

interface DiscoveryResult {
  discovered_relationships: Array<{
    source: string
    target: string
    relationship: string
    confidence: number
  }>
  new_concepts: string[]
  total_processed: number
}

export default function OntologyExplorer({ domain }: { domain: string }) {
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<any>(null)
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')

  const loadConcepts = async () => {
    setLoading('concepts')
    setError('')
    try {
      const data = await api.ontologyConcepts()
      setConcepts(data.concepts || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  const handleDiscover = async () => {
    setLoading('discover')
    setError('')
    try {
      const data = await api.ontologyDiscover({ domain, depth: 3 })
      // Normalize API response to match component expectations
      const discoveries = data.discoveries || data
      setDiscoveryResult({
        discovered_relationships: (discoveries.discovered_relationships || []).map((r: any) => ({
          source: r.source || r.source_type || '',
          target: r.target || r.target_type || '',
          relationship: r.relationship || '',
          confidence: r.confidence || 0,
        })),
        new_concepts: discoveries.new_concepts || data.new_concepts || [],
        total_processed: data.total_processed || data.entities_sampled || 0,
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  const handleSearch = async () => {
    if (!searchTerm.trim()) return
    setLoading('search')
    setError('')
    try {
      const data = await api.ontologyNavigate(searchTerm)
      // Build concept list from ranked_concepts (semantic matches)
      const normalizedConcepts: any[] = []
      
      // Add ranked concepts with descriptions
      if (data.ranked_concepts?.length > 0) {
        const descriptions: Record<string, string> = {
          'Embargo Breach Actor': 'An individual or entity that leaks embargoed financial information before official release, enabling insider trading.',
          'Embargo Breach': 'The act of distributing restricted press releases or financial data before the authorized publication time.',
          'Identity Impersonation Campaign': 'Coordinated effort using fake identities to gain unauthorized access to embargoed materials.',
          'Credential Harvesting Campaign': 'Systematic collection of login credentials to access restricted financial information systems.',
          'Journalist Impersonator': 'Bad actor posing as legitimate press to gain early access to embargoed releases.',
        }
        data.ranked_concepts.forEach((name: string, idx: number) => {
          normalizedConcepts.push({
            type: idx === 0 ? (data.related_concepts?.[0]?.source_category || 'Concept') : 'Related',
            name,
            description: descriptions[name] || `Semantically related to "${data.matched_concept}" in the fraud domain ontology.`,
            related_concepts: data.ranked_concepts.filter((r: string) => r !== name).slice(0, 3),
          })
        })
      }
      
      setSearchResults({
        concepts: normalizedConcepts,
        matched: data.matched_concept,
        paths: data.paths || [],
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Semantic Ontology Explorer</h1>
          <p className="text-sm text-gray-500 mt-1">
            Navigate fraud domain concepts, relationships, and LLM-discovered patterns
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadConcepts} disabled={loading === 'concepts'}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'rgba(87,148,242,0.15)', color: '#5794F2', border: '1px solid rgba(87,148,242,0.3)' }}>
            {loading === 'concepts' ? '⏳ Loading...' : '📖 Load Concepts'}
          </button>
          <button onClick={handleDiscover} disabled={loading === 'discover'}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'rgba(115,191,105,0.15)', color: '#73BF69', border: '1px solid rgba(115,191,105,0.3)' }}>
            {loading === 'discover' ? '⏳ Discovering...' : '🔍 Auto-Discover'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(242,73,92,0.1)', border: '1px solid rgba(242,73,92,0.3)' }}>
          <p className="text-sm text-red-400">⚠️ {error}</p>
        </div>
      )}

      {/* Search */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <label className="text-xs text-gray-500 uppercase tracking-widest">Navigate Ontology</label>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search concepts... (e.g., 'money laundering', 'account takeover')"
            className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <button onClick={handleSearch} disabled={loading === 'search'}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'rgba(184,119,217,0.15)', color: '#B877D9', border: '1px solid rgba(184,119,217,0.3)' }}>
            {loading === 'search' ? '⏳' : '🧭 Navigate'}
          </button>
        </div>
      </div>

      {/* Search Results */}
      {searchResults && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-sm font-semibold text-white mb-1">Navigation Results: "{searchTerm}"</h3>
          {searchResults.matched && (
            <p className="text-xs text-green-400 mb-3">✓ Best match: <span className="font-mono">{searchResults.matched}</span></p>
          )}
          <div className="space-y-3">
            {searchResults.concepts?.length > 0 ? (
              searchResults.concepts.map((concept: any, idx: number) => (
                <div key={idx} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                      style={{ background: 'rgba(87,148,242,0.15)', color: '#5794F2' }}>
                      {concept.type}
                    </span>
                    <span className="text-sm font-medium text-white">{concept.name}</span>
                    {idx === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900 text-green-300">best match</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{concept.description}</p>
                  {concept.related_concepts?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {concept.related_concepts.map((rel: string, i: number) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80"
                          onClick={() => { setSearchTerm(rel); }}
                          style={{ background: 'rgba(184,119,217,0.1)', color: '#B877D9' }}>
                          {rel}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500">No concepts found for this term.</p>
            )}
          </div>
          <div className="mt-4 rounded-lg p-3" style={{ background: 'rgba(87,148,242,0.05)', border: '1px solid rgba(87,148,242,0.1)' }}>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">How to use</p>
            <p className="text-xs text-gray-400">
              The ontology maps fraud domain concepts and their relationships. Search for terms like 
              "account takeover", "velocity spike", or "device fingerprint" to explore how fraud indicators 
              connect. Use <strong className="text-blue-400">Load Concepts</strong> to see all known concepts, 
              or <strong className="text-green-400">Auto-Discover</strong> to let the LLM find new hidden relationships in your graph data.
            </p>
          </div>
        </div>
      )}

      {/* Discovery Results */}
      {discoveryResult && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-sm font-semibold text-white mb-3">🔍 LLM Discovery Results</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(115,191,105,0.08)' }}>
              <p className="text-2xl font-bold text-green-400">{discoveryResult.discovered_relationships.length}</p>
              <p className="text-[10px] text-gray-500">Relationships Found</p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(87,148,242,0.08)' }}>
              <p className="text-2xl font-bold text-blue-400">{discoveryResult.new_concepts.length}</p>
              <p className="text-[10px] text-gray-500">New Concepts</p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(184,119,217,0.08)' }}>
              <p className="text-2xl font-bold text-purple-400">{discoveryResult.total_processed}</p>
              <p className="text-[10px] text-gray-500">Entities Processed</p>
            </div>
          </div>
          <div className="space-y-2">
            {discoveryResult.discovered_relationships.slice(0, 10).map((rel, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="text-white font-mono">{rel.source}</span>
                <span className="text-gray-600">—[</span>
                <span className="text-green-400">{rel.relationship}</span>
                <span className="text-gray-600">]→</span>
                <span className="text-white font-mono">{rel.target}</span>
                <span className="ml-auto text-gray-500">{(rel.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Concepts Grid */}
      {concepts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">Domain Concepts ({concepts.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {concepts.map((concept) => (
              <div key={concept.id} className="rounded-xl p-4"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                    style={{ background: 'rgba(87,148,242,0.15)', color: '#5794F2' }}>
                    {concept.type}
                  </span>
                  <span className="text-sm font-medium text-white">{concept.name}</span>
                </div>
                <p className="text-xs text-gray-400">{concept.description}</p>
                {concept.related_concepts?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {concept.related_concepts.map((rel, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(255,255,255,0.05)', color: '#a1a1aa' }}>
                        {rel}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
