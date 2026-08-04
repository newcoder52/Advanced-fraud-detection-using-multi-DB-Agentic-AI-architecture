import { useState, useRef, useEffect } from 'react'
import { api } from '../api'

interface Message {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: string
  metadata?: {
    queries_executed?: string[]
    entities_found?: string[]
    risk_assessment?: string
    investigation_steps?: Array<{ step: string; result: string }>
  }
}

export default function AgentInvestigation({ domain }: { domain: string }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [explainEntity, setExplainEntity] = useState('')
  const [explanation, setExplanation] = useState<any>(null)
  const [loading, setLoading] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading('chat')

    try {
      const data = await api.agentInvestigate({ question: input, domain })
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: data.response || data.explanation || data.verdict?.explanation || JSON.stringify(data.verdict || data, null, 2),
        timestamp: new Date().toISOString(),
        metadata: {
          queries_executed: data.queries_executed || data.investigation_steps?.map((s: any) => s.query) || [],
          entities_found: data.entities_found || [],
          risk_assessment: data.risk_assessment,
          investigation_steps: data.investigation_steps,
        },
      }
      setMessages(prev => [...prev, agentMsg])
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: `⚠️ Error: ${err.message}`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading('')
    }
  }

  const handleExplain = async () => {
    if (!explainEntity.trim()) return
    setLoading('explain')
    try {
      const data = await api.agentExplain(explainEntity)
      setExplanation(data)
    } catch (err: any) {
      setExplanation({ error: err.message })
    } finally {
      setLoading('')
    }
  }

  const quickQueries = [
    'Investigate recent high-risk accounts',
    'Find fraud rings in the last 24h',
    'Which entities share the most devices?',
    'Show me the riskiest transaction pattern',
  ]

  return (
    <div className="flex gap-4 h-[calc(100vh-48px)]">
      {/* Chat Panel */}
      <div className="flex-1 flex flex-col rounded-xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Chat Header */}
        <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h1 className="text-lg font-bold gradient-text">AI Fraud Investigator</h1>
          <p className="text-[11px] text-gray-500">Autonomous investigation agent powered by Neptune MCP + Bedrock</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🤖</p>
              <p className="text-sm text-gray-400">Ask me to investigate any fraud pattern, entity, or suspicious activity.</p>
              <p className="text-xs text-gray-600 mt-1">I'll query the graph, analyze patterns, and explain my findings.</p>
              <div className="flex flex-wrap gap-2 justify-center mt-6">
                {quickQueries.map((q, i) => (
                  <button key={i} onClick={() => setInput(q)}
                    className="text-xs px-3 py-1.5 rounded-lg transition-all hover:bg-white/5"
                    style={{ color: '#5794F2', border: '1px solid rgba(87,148,242,0.2)' }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl p-3 ${msg.role === 'user' ? '' : ''}`}
                style={{
                  background: msg.role === 'user' ? 'rgba(87,148,242,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${msg.role === 'user' ? 'rgba(87,148,242,0.2)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                {/* Agent Metadata */}
                {msg.metadata && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Investigation Steps */}
                    {msg.metadata.investigation_steps?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] text-gray-500 uppercase mb-1">Investigation Steps</p>
                        {msg.metadata.investigation_steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px] mb-1">
                            <span className="text-green-400 mt-0.5">✓</span>
                            <div>
                              <span className="text-gray-300">{step.step}</span>
                              <span className="text-gray-500 ml-1">→ {step.result}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Queries Executed */}
                    {msg.metadata.queries_executed?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] text-gray-500 uppercase mb-1">Queries Executed</p>
                        {msg.metadata.queries_executed.map((q, i) => (
                          <code key={i} className="block text-[10px] text-purple-400 font-mono mb-0.5 truncate">{q}</code>
                        ))}
                      </div>
                    )}

                    {/* Entities Found */}
                    {msg.metadata.entities_found?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {msg.metadata.entities_found.map((e, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(184,119,217,0.1)', color: '#B877D9' }}>
                            {e}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Risk Assessment */}
                    {msg.metadata.risk_assessment && (
                      <div className="rounded p-2" style={{ background: 'rgba(242,73,92,0.08)' }}>
                        <p className="text-[10px] text-red-400">⚠️ Risk: {msg.metadata.risk_assessment}</p>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-gray-600 mt-2">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {loading === 'chat' && (
            <div className="flex justify-start">
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="animate-pulse">🔍</span> Investigating...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask the agent to investigate..."
              className="flex-1 rounded-lg px-4 py-2.5 text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <button onClick={handleSend} disabled={loading === 'chat'}
              className="px-5 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: 'rgba(87,148,242,0.2)', color: '#5794F2', border: '1px solid rgba(87,148,242,0.3)' }}>
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Side Panel - Entity Explain */}
      <div className="w-80 space-y-4">
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Entity Explainer</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={explainEntity}
              onChange={(e) => setExplainEntity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleExplain()}
              placeholder="Entity ID..."
              className="flex-1 rounded-lg px-3 py-2 text-xs outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <button onClick={handleExplain} disabled={loading === 'explain'}
              className="px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(255,152,48,0.15)', color: '#FF9830', border: '1px solid rgba(255,152,48,0.3)' }}>
              {loading === 'explain' ? '⏳' : 'Explain'}
            </button>
          </div>

          {explanation && !explanation.error && (
            <div className="mt-3 space-y-2">
              <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-xs text-gray-400 leading-relaxed">{explanation.explanation}</p>
              </div>
              {explanation.risk_factors?.map((f: string, i: number) => (
                <div key={i} className="flex items-center gap-1 text-[11px] text-gray-400">
                  <span className="text-red-400">•</span> {f}
                </div>
              ))}
              {explanation.connections_summary && (
                <p className="text-[11px] text-gray-500">{explanation.connections_summary}</p>
              )}
            </div>
          )}
          {explanation?.error && (
            <p className="text-xs text-red-400 mt-2">⚠️ {explanation.error}</p>
          )}
        </div>

        {/* Investigation History */}
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Session Stats</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Messages</span>
              <span className="text-white font-mono">{messages.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Entities Discovered</span>
              <span className="text-white font-mono">
                {messages.reduce((acc, m) => acc + (m.metadata?.entities_found?.length || 0), 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Queries Run</span>
              <span className="text-white font-mono">
                {messages.reduce((acc, m) => acc + (m.metadata?.queries_executed?.length || 0), 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
