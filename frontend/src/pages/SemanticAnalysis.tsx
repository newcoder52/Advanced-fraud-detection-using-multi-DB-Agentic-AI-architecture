import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'

interface Props { domain: string }

const SUGGESTED_INPUTS: Record<string, { label: string; text: string }[]> = {
  press_distribution: [
    { label: 'Insider leak pattern', text: 'Unauthorized early access to embargoed M&A press release from unverified journalist IP. Multiple access attempts to acquisition announcement before embargo lift time.' },
    { label: 'Early access violation', text: 'Suspicious pattern: same IP address accessed 5 different embargoed financial releases within 2 hours. Known association with insider trading network.' },
    { label: 'Coordinated breach', text: 'Coordinated embargo breach detected. Three unverified accounts accessed earnings release 4 hours before scheduled publication from Eastern European IP range.' },
  ],
  dating_platform: [
    { label: 'Military romance script', text: 'Hello beautiful, I am a US military officer stationed overseas. I would love to get to know you better. Can we move to WhatsApp for more private conversation?' },
    { label: 'Oil rig engineer scam', text: 'I am a successful engineer working on an oil rig. My wife passed away last year and I am looking for true love again. You seem special.' },
    { label: 'UN deployment script', text: 'I work for the United Nations in Syria. I have been deployed here for 6 months. Your profile caught my eye and I feel a deep connection already.' },
    { label: 'Widowed surgeon scam', text: 'I am a widowed surgeon at Johns Hopkins. I have a teenage daughter. Looking for a mature woman who understands commitment and family values.' },
  ],
  umg: [
    { label: 'Bot stream pattern', text: 'Account streaming over 50000 times per day with average listen duration under 5 seconds from shared device fingerprint. Identical listening pattern across 47 accounts.' },
    { label: 'AI-generated farm', text: 'Multiple accounts streaming identical AI-generated tracks exclusively with zero playlist diversity. All accounts created within same 24-hour window using similar email patterns.' },
    { label: 'Royalty manipulation', text: 'Bot farm pattern detected: 661000 streams per day from single account, 0.3 second average duration, same device ID shared across 47 accounts in network.' },
  ],
  imax: [
    { label: 'Scalper bot network', text: 'Automated ticket purchase bot: interaction speed 85ms, impossible for human. Navigation directly to premium cinema showing checkout. Device fingerprint shared with 23 other sessions.' },
    { label: 'Bulk purchase attack', text: 'Scalper bot network detected: 200 simultaneous sessions within 30 seconds targeting same premium showing. All sessions share 5 device fingerprints and 3 payment BINs.' },
    { label: 'Superhuman checkout', text: 'Coordinated bot purchase: superhuman checkout speed under 200ms, bulk quantity 8 tickets per session, automated CAPTCHA solving detected, device fingerprint reuse across network.' },
  ],
  news_platform: [
    { label: 'AI health misinfo', text: 'AI-generated article with sensationalist health misinformation claiming vaccine causes severe side effects. Content signature matches GPT-generated text patterns.' },
    { label: 'Bot amplification network', text: 'Coordinated amplification network of 50 bot accounts created within same week all sharing identical AI-generated misinformation content about pharmaceutical companies.' },
    { label: 'Fake disaster relief', text: 'AI-generated fake disaster relief article linking to fraudulent GoFundMe page. 50-account bot network amplifying across social platforms. Credibility score 0.12.' },
  ],
}

export default function SemanticAnalysis({ domain }: Props) {
  const [searchParams] = useSearchParams()
  const [content, setContent] = useState('')
  const [threshold, setThreshold] = useState(0.55)
  const [results, setResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const autoRanRef = useRef(false)

  useEffect(() => {
    const q = searchParams.get('content')
    if (q) {
      setContent(q)
      autoRanRef.current = false
    }
  }, [searchParams])

  const chips = SUGGESTED_INPUTS[domain] || SUGGESTED_INPUTS.press_distribution

  const handleSearch = async (overrideContent?: string) => {
    const searchContent = overrideContent || content
    if (!searchContent) return
    setLoading(true)
    try {
      const res = await api.triggerSemantic({ domain, content: searchContent, similarity_threshold: threshold, top_k: 10 })
      setResults(res)
    } catch (err: any) {
      setResults({ error: err.message })
    }
    setLoading(false)
  }

  // Auto-run when content arrives from URL params
  useEffect(() => {
    if (content && searchParams.get('content') && !autoRanRef.current) {
      autoRanRef.current = true
      handleSearch(content)
    }
  }, [content])

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Semantic Analysis (pgvector)</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-3">Content to Analyze</h3>

          {/* Suggested Input Chips */}
          <div className="mb-3">
            <p className="text-xs text-gray-400 mb-2">Try an example:</p>
            <div className="flex flex-wrap gap-2">
              {chips.map(chip => (
                <button
                  key={chip.label}
                  onClick={() => setContent(chip.text)}
                  className="text-xs px-3 py-1.5 rounded-full bg-blue-900/40 border border-blue-700/50 text-blue-300 hover:bg-blue-800/60 hover:border-blue-600 transition-colors"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            className="w-full h-40 bg-gray-700 rounded px-3 py-2 text-sm border border-gray-600 focus:border-blue-500 outline-none resize-none"
            placeholder="Enter text content to find similar items..."
            value={content}
            onChange={e => setContent(e.target.value)}
          />
          <div className="mt-4">
            <label className="text-sm text-gray-400">Similarity Threshold: {threshold}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-full mt-1"
            />
          </div>
          <button
            onClick={() => handleSearch()}
            disabled={loading || !content}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : 'Run Similarity Search'}
          </button>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Similarity Matches</h3>
          {results?.matches ? (
            <div className="space-y-3">
              {results.matches.map((m: any, i: number) => (
                <div key={i} className="bg-gray-700 rounded p-3 border-l-4 border-blue-500">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-sm">{m.matched_id}</span>
                    <span className={`text-sm font-bold ${m.cosine_score > 0.9 ? 'text-red-400' : m.cosine_score > 0.8 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {(m.cosine_score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{m.content_preview || 'No preview'}</p>
                </div>
              ))}
              <div className="text-sm text-gray-400 mt-4">
                Search latency: {results.search_latency_ms?.toFixed(1)}ms | Total matches: {results.total_matches}
              </div>
            </div>
          ) : results?.error ? (
            <p className="text-red-400">{results.error}</p>
          ) : (
            <p className="text-gray-400">Run a search to see results</p>
          )}
        </div>
      </div>
    </div>
  )
}
