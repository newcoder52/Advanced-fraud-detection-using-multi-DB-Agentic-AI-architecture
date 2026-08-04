import { useState } from 'react'
import { api } from '../api'

interface Props { domain: string }

const DOMAIN_FIELDS: Record<string, { event_type: string; fields: string[] }> = {
  press_distribution: { event_type: 'embargo_access', fields: ['release_id', 'journalist_id', 'access_type', 'content'] },
  dating_platform: { event_type: 'message_sent', fields: ['user_id', 'recipient_id', 'message_text'] },
  umg: { event_type: 'stream', fields: ['account_id', 'track_id', 'artist', 'duration_ms'] },
  imax: { event_type: 'purchase_attempt', fields: ['session_id', 'showtime_id', 'quantity', 'device_fingerprint'] },
  news_platform: { event_type: 'content_published', fields: ['content_id', 'author_id', 'content_text', 'source_url'] },
}

export default function EventIngestion({ domain }: Props) {
  const [payload, setPayload] = useState<Record<string, string>>({})
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [events, setEvents] = useState<any[]>([])

  const config = DOMAIN_FIELDS[domain] || DOMAIN_FIELDS.press_distribution

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const res = await api.ingestEvent({
        domain,
        event_type: config.event_type,
        payload,
        metadata: { source: 'poc_ui' },
      })
      setResult(res)
    } catch (err: any) {
      setResult({ error: err.message })
    }
    setLoading(false)
  }

  const loadEvents = async () => {
    try {
      const res = await api.getEvents(domain, 20)
      setEvents(res.events || [])
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Event Ingestion</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Submit Event ({domain.replace(/_/g, ' ')})</h3>
          <div className="space-y-3">
            {config.fields.map(field => (
              <div key={field}>
                <label className="text-sm text-gray-400">{field}</label>
                <input
                  type="text"
                  className="w-full mt-1 bg-gray-700 rounded px-3 py-2 text-sm border border-gray-600 focus:border-blue-500 outline-none"
                  placeholder={field}
                  value={payload[field] || ''}
                  onChange={e => setPayload({ ...payload, [field]: e.target.value })}
                />
              </div>
            ))}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Ingesting...' : 'Ingest Event'}
            </button>
          </div>
        </div>

        {/* Result */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Response</h3>
          {result ? (
            <pre className="text-xs bg-gray-900 rounded p-4 overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          ) : (
            <p className="text-gray-400">Submit an event to see the response</p>
          )}
        </div>
      </div>

      {/* Recent Events */}
      <div className="bg-gray-800 rounded-lg p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Events</h3>
          <button onClick={loadEvents} className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded">Refresh</button>
        </div>
        {events.length > 0 ? (
          <div className="overflow-auto max-h-64">
            <table className="w-full text-sm">
              <thead><tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2">Event ID</th>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Timestamp</th>
              </tr></thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-b border-gray-700/50">
                    <td className="py-2 font-mono text-xs">{e.event_id?.slice(0, 8)}...</td>
                    <td className="py-2">{e.event_type}</td>
                    <td className="py-2 text-gray-400">{e.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No events loaded. Click Refresh.</p>
        )}
      </div>
    </div>
  )
}
