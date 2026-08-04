import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'

interface Props { domain: string }

export default function Briefing({ domain }: Props) {
  const [searchParams] = useSearchParams()
  const [entityId, setEntityId] = useState('')
  const [briefing, setBriefing] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = searchParams.get('entity')
    if (q) setEntityId(q)
  }, [searchParams])

  const [status, setStatus] = useState('')

  const handleGenerate = async () => {
    setLoading(true)
    setStatus('')
    setBriefing(null)
    try {
      const res = await api.getBriefing(entityId, domain)
      setBriefing(res)
    } catch (err: any) {
      const msg = err.message || ''
      if (msg.includes('timeout') || msg.includes('504') || msg.includes('Task timed out') || msg.includes('Failed to fetch') || msg.includes('timed out')) {
        setStatus('Generating briefing... this may take up to 60 seconds on first request.')
        // Retry up to 3 times with increasing delay (Lambda caches result in DynamoDB)
        for (let attempt = 1; attempt <= 3; attempt++) {
          await new Promise(r => setTimeout(r, attempt * 10000))
          try {
            const res = await api.getBriefing(entityId, domain)
            setBriefing(res)
            setStatus('')
            setLoading(false)
            return
          } catch {
            if (attempt < 3) setStatus(`Still generating... retry ${attempt + 1}/3`)
          }
        }
        setBriefing({ error: 'Briefing generation is taking longer than expected. The result will be cached — try again in 30 seconds.' })
        setStatus('')
      } else {
        setBriefing({ error: msg })
      }
    }
    setLoading(false)
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Investigation Briefing (Claude via Bedrock)</h2>

      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm border border-gray-600"
            placeholder="Enter entity ID for briefing..."
            value={entityId}
            onChange={e => setEntityId(e.target.value)}
          />
          <button
            onClick={handleGenerate}
            disabled={loading || !entityId}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Briefing'}
          </button>
        </div>
      </div>

      {status && <p className="text-yellow-400 mb-4">{status}</p>}

      {briefing && !briefing.error && (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-2">{briefing.title}</h3>
            <p className="text-sm text-gray-400">Generated: {briefing.generated_at}</p>
            <div className="mt-4 prose prose-invert max-w-none">
              <p className="whitespace-pre-wrap text-sm">{briefing.narrative}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h4 className="font-semibold mb-3">Risk Assessment</h4>
              <p className="text-lg font-bold text-yellow-400">{briefing.risk_assessment}</p>
              <p className="text-sm text-gray-400 mt-2">Confidence: {((briefing.confidence_score || 0) * 100).toFixed(0)}%</p>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <h4 className="font-semibold mb-3">Recommended Actions</h4>
              <ul className="space-y-2">
                {(briefing.recommended_actions || []).map((action: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-blue-400">•</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {briefing?.error && <p className="text-red-400">{briefing.error}</p>}
    </div>
  )
}
