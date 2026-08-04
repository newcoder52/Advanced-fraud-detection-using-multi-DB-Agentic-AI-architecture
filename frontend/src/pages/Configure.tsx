import { useState } from 'react'

interface Props { domain: string }

const STEPS = [
  { label: 'Event Schema', icon: '📋' },
  { label: 'Threat Patterns', icon: '🎯' },
  { label: 'Graph Model', icon: '🕸️' },
  { label: 'Scoring Rules', icon: '⚡' },
]

const SAMPLE_SCHEMAS: Record<string, string> = {
  press_distribution: `{
  "event_type": "embargo_access",
  "entity_id": "string (journalist/user ID)",
  "payload": {
    "release_id": "string",
    "access_type": "authorized | unauthorized_early_access",
    "content": "string (release text)"
  }
}`,
  dating_platform: `{
  "event_type": "message_sent",
  "entity_id": "string (sender user ID)",
  "payload": {
    "recipient_id": "string",
    "message_text": "string",
    "device_fingerprint": "string"
  }
}`,
  umg: `{
  "event_type": "stream",
  "entity_id": "string (account ID)",
  "payload": {
    "track_id": "string",
    "duration_ms": "number",
    "device_id": "string",
    "streams_per_day": "number"
  }
}`,
  imax: `{
  "event_type": "purchase_attempt",
  "entity_id": "string (session ID)",
  "payload": {
    "showtime_id": "string",
    "quantity": "number",
    "device_fingerprint": "string",
    "payment_bin": "string"
  }
}`,
  news_platform: `{
  "event_type": "content_published",
  "entity_id": "string (author ID)",
  "payload": {
    "content_id": "string",
    "content_text": "string",
    "source_url": "string"
  }
}`,
}

export default function Configure({ domain }: Props) {
  const [step, setStep] = useState(0)

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">⚙️ Configure Your Domain</h2>
      <p className="text-gray-400 mb-8">How a new customer onboards to the 4-database pipeline</p>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              onClick={() => setStep(i)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                i === step ? 'bg-blue-600 text-white' : i < step ? 'bg-green-900/40 text-green-400 border border-green-700' : 'bg-gray-700 text-gray-400'
              }`}
            >
              <span>{s.icon}</span> {s.label}
            </button>
            {i < STEPS.length - 1 && <span className="text-gray-600">→</span>}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-2">Step 1: Define Event Schema</h3>
          <p className="text-gray-400 text-sm mb-4">Define the shape of events your platform will send. Each event needs an entity_id (the actor), event_type, and domain-specific payload.</p>
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-auto">
            <pre className="text-green-300">{SAMPLE_SCHEMAS[domain] || SAMPLE_SCHEMAS.press_distribution}</pre>
          </div>
          <div className="mt-4 bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <p className="text-xs text-blue-400 font-semibold uppercase mb-1">How it works</p>
            <p className="text-sm text-gray-300">Events are sent via EventBridge or direct API. DynamoDB stores the raw event (Tier 1), then the <code className="text-blue-300">content</code> field is embedded via Bedrock Titan for semantic search (Tier 2).</p>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-2">Step 2: Seed Threat Patterns</h3>
          <p className="text-gray-400 text-sm mb-4">Upload known-bad content samples. These become the reference embeddings in Aurora pgvector that new events are compared against.</p>
          <div className="space-y-3">
            {[
              { label: 'Known fraud scripts/content', desc: 'Text samples of confirmed threats for your domain' },
              { label: 'Historical incident data', desc: 'Past confirmed fraud events with entity IDs and outcomes' },
              { label: 'Similarity threshold', desc: 'Configure match sensitivity (default: 0.75 cosine similarity)' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3 bg-gray-700/50 rounded p-4">
                <span className="text-green-400 mt-0.5">✓</span>
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <p className="text-xs text-blue-400 font-semibold uppercase mb-1">How it works</p>
            <p className="text-sm text-gray-300">Each pattern is embedded and stored in pgvector. When a new event arrives, its embedding is compared against all patterns using cosine similarity. Matches above threshold trigger the next pipeline stage.</p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-2">Step 3: Define Graph Model</h3>
          <p className="text-gray-400 text-sm mb-4">Configure how entities relate to each other in Neptune. This enables fraud ring detection via community algorithms.</p>
          <div className="space-y-3">
            {[
              { label: 'Entity types', desc: 'Users, devices, accounts, IPs, payment methods' },
              { label: 'Edge types', desc: 'SHARES_DEVICE, SAME_IP, SENT_TO, PURCHASED_WITH' },
              { label: 'Community algorithm', desc: 'Louvain (default) or Label Propagation for ring detection' },
              { label: 'Traversal depth', desc: 'How many hops to explore (default: 2)' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3 bg-gray-700/50 rounded p-4">
                <span className="text-purple-400 mt-0.5">⬡</span>
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <p className="text-xs text-blue-400 font-semibold uppercase mb-1">How it works</p>
            <p className="text-sm text-gray-300">Neptune Analytics runs community detection (Louvain) on the entity graph. When a flagged entity belongs to a cluster of connected bad actors, the ring size amplifies the final risk score.</p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-2">Step 4: Configure Scoring Rules</h3>
          <p className="text-gray-400 text-sm mb-4">Define how semantic, graph, and velocity signals combine into a final risk score and automated decision.</p>
          <div className="space-y-3">
            <div className="bg-gray-700/50 rounded p-4">
              <p className="font-medium text-sm mb-2">Score Weights</p>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div className="bg-blue-900/30 rounded p-2"><p className="font-bold text-blue-300">40%</p><p className="text-gray-400">Semantic</p></div>
                <div className="bg-purple-900/30 rounded p-2"><p className="font-bold text-purple-300">35%</p><p className="text-gray-400">Graph</p></div>
                <div className="bg-orange-900/30 rounded p-2"><p className="font-bold text-orange-300">25%</p><p className="text-gray-400">Velocity</p></div>
              </div>
            </div>
            <div className="bg-gray-700/50 rounded p-4">
              <p className="font-medium text-sm mb-2">Decision Thresholds</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-green-400">ALLOW</span><span className="text-gray-400">score &lt; 0.50</span></div>
                <div className="flex justify-between"><span className="text-yellow-400">FLAG</span><span className="text-gray-400">0.50 – 0.74</span></div>
                <div className="flex justify-between"><span className="text-orange-400">CHALLENGE</span><span className="text-gray-400">0.75 – 0.89</span></div>
                <div className="flex justify-between"><span className="text-red-400">BLOCK</span><span className="text-gray-400">≥ 0.90</span></div>
              </div>
            </div>
          </div>
          <div className="mt-4 bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <p className="text-xs text-blue-400 font-semibold uppercase mb-1">How it works</p>
            <p className="text-sm text-gray-300">ElastiCache Valkey stores the composite score with sub-5ms read latency. The score combines all signals, applies weights, and maps to a decision. Scores are cached for deduplication and real-time lookups.</p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm disabled:opacity-30 transition-colors"
        >
          ← Previous
        </button>
        <button
          onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
          disabled={step === STEPS.length - 1}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-sm disabled:opacity-30 transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
