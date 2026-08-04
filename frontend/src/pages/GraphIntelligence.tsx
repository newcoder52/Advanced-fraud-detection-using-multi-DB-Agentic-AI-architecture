import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'

interface Props { domain: string }

const ALGORITHMS = ['louvain', 'pagerank', 'shortest_path', 'wcc']

export default function GraphIntelligence({ domain }: Props) {
  const [searchParams] = useSearchParams()
  const [entityId, setEntityId] = useState('')
  const [algorithm, setAlgorithm] = useState('louvain')
  const [maxDepth, setMaxDepth] = useState(3)
  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = searchParams.get('entity')
    if (q) setEntityId(q)
  }, [searchParams])

  const handleAnalyze = async () => {
    setLoading(true)
    try {
      const res = await api.triggerGraph({ entity_id: entityId, algorithm, max_depth: maxDepth })
      setResults(res)
    } catch (err: any) {
      setResults({ error: err.message })
    }
    setLoading(false)
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Graph Intelligence (Neptune Analytics)</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Analysis Controls</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400">Entity ID</label>
              <input
                type="text"
                className="w-full mt-1 bg-gray-700 rounded px-3 py-2 text-sm border border-gray-600"
                placeholder="Enter entity ID..."
                value={entityId}
                onChange={e => setEntityId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">Algorithm</label>
              <select
                value={algorithm}
                onChange={e => setAlgorithm(e.target.value)}
                className="w-full mt-1 bg-gray-700 rounded px-3 py-2 text-sm border border-gray-600"
              >
                {ALGORITHMS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400">Max Depth: {maxDepth}</label>
              <input
                type="range" min="1" max="5" value={maxDepth}
                onChange={e => setMaxDepth(parseInt(e.target.value))}
                className="w-full mt-1"
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={loading || !entityId}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 rounded disabled:opacity-50"
            >
              {loading ? 'Analyzing...' : 'Run Graph Analysis'}
            </button>
          </div>
        </div>

        {/* Graph Visualization Area */}
        <div className="lg:col-span-2 bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Graph Results</h3>
          {results ? (
            <div>
              {results.error ? (
                <p className="text-yellow-400 text-sm">{results.error}</p>
              ) : (
                <pre className="text-xs bg-gray-900 rounded p-4 overflow-auto max-h-96">
                  {JSON.stringify(results, null, 2)}
                </pre>
              )}
              {results.latency_ms && (
                <p className="text-sm text-gray-400 mt-4">Analysis latency: {results.latency_ms?.toFixed(1)}ms</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <p>Enter an entity ID and run analysis to see the graph</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
