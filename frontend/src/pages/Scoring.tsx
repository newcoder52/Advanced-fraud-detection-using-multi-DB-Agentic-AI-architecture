import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'

interface Props { domain: string }

export default function Scoring({ domain }: Props) {
  const [searchParams] = useSearchParams()
  const [entityId, setEntityId] = useState('')
  const [score, setScore] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = searchParams.get('entity')
    if (q) setEntityId(q)
  }, [searchParams])

  const handleLookup = async () => {
    setLoading(true)
    try {
      const res = await api.getScore(entityId)
      setScore(res)
    } catch (err: any) {
      setScore({ error: err.message })
    }
    setLoading(false)
  }

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'ALLOW': return 'text-green-400 bg-green-900/30'
      case 'FLAG': return 'text-yellow-400 bg-yellow-900/30'
      case 'CHALLENGE': return 'text-orange-400 bg-orange-900/30'
      case 'BLOCK': return 'text-red-400 bg-red-900/30'
      default: return 'text-gray-400'
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Real-Time Scoring (ElastiCache Valkey)</h2>

      {/* Lookup */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm border border-gray-600"
            placeholder="Enter entity ID to look up score..."
            value={entityId}
            onChange={e => setEntityId(e.target.value)}
          />
          <button
            onClick={handleLookup}
            disabled={loading || !entityId}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded disabled:opacity-50"
          >
            {loading ? '...' : 'Get Score'}
          </button>
        </div>
      </div>

      {score && !score.error && score.composite_score !== undefined && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Score Gauge */}
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <h3 className="text-lg font-semibold mb-4">Composite Score</h3>
            <div className="text-6xl font-bold mb-2">{(score.composite_score * 100).toFixed(0)}</div>
            <div className={`inline-block px-4 py-1 rounded-full text-sm font-bold ${getDecisionColor(score.decision)}`}>
              {score.decision}
            </div>
            <div className="mt-4 text-sm text-gray-400">
              {score.cache_hit ? '⚡ Cache Hit' : '🔄 Computed'} | {score.latency_ms?.toFixed(1)}ms
            </div>
          </div>

          {/* Components */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Score Components</h3>
            {score.components && Object.entries(score.components).map(([key, val]: [string, any]) => (
              <div key={key} className="mb-3">
                <div className="flex justify-between text-sm mb-1">
                  <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                  <span>{(val * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${val * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {score?.error && <p className="text-red-400 mt-4">{score.error}</p>}
      {score?.message && <p className="text-gray-400 mt-4">{score.message}</p>}
    </div>
  )
}
