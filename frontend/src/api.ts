const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path: string, options: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 35000)
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    clearTimeout(timeout)
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(error.detail || 'Request failed')
    }
    return res.json()
  } catch (err: any) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      throw new Error('Request timed out — the pipeline is still processing. Try again in a few seconds.')
    }
    throw err
  }
}

export const api = {
  // ─────────────────────────────────────────────────────
  // Core APIs (v1)
  // ─────────────────────────────────────────────────────

  // Events
  ingestEvent: (data: any) => request('/api/v1/events/ingest', { method: 'POST', body: JSON.stringify(data) }),
  getEvents: (domain: string, limit = 50) => request(`/api/v1/events/?domain=${domain}&limit=${limit}`),
  getEvent: (eventId: string, domain: string) => request(`/api/v1/events/${eventId}?domain=${domain}`),

  // Semantic
  triggerSemantic: (data: any) => request('/api/v1/analysis/semantic/', { method: 'POST', body: JSON.stringify(data) }),
  generateEmbedding: (text: string) => request('/api/v1/analysis/semantic/embed', { method: 'POST', body: JSON.stringify({ text }) }),

  // Graph
  triggerGraph: (data: any) => request('/api/v1/analysis/graph/', { method: 'POST', body: JSON.stringify(data) }),
  getCommunity: (entityId: string, algorithm = 'louvain') => request(`/api/v1/analysis/graph/${entityId}/community?algorithm=${algorithm}`),
  getNeighbors: (entityId: string, depth = 2) => request(`/api/v1/analysis/graph/${entityId}/neighbors?depth=${depth}`),

  // Scores
  getScore: (entityId: string) => request(`/api/v1/scores/${entityId}`),
  setScore: (entityId: string, data: any) => request(`/api/v1/scores/${entityId}`, { method: 'POST', body: JSON.stringify(data) }),

  // Pipeline
  executePipeline: (data: any) => request('/api/v1/pipeline/execute', { method: 'POST', body: JSON.stringify(data) }),

  // Briefing
  getBriefing: (entityId: string, domain: string) => request(`/api/v1/briefing/${entityId}?domain=${domain}`),

  // Dashboard
  getMetrics: (domain: string) => request(`/api/v1/dashboard/metrics?domain=${domain}`),
  healthCheck: () => request('/api/v1/dashboard/health'),

  // ─────────────────────────────────────────────────────
  // AI/Agentic APIs (v2)
  // ─────────────────────────────────────────────────────

  // Ontology
  ontologyDiscover: (data: any) => request('/api/v1/ontology/discover', { method: 'POST', body: JSON.stringify(data) }),
  ontologyConcepts: () => request('/api/v1/ontology/concepts'),
  ontologyNavigate: (term: string) => request(`/api/v1/ontology/navigate/${encodeURIComponent(term)}`),

  // GNN (GraphStorm)
  gnnTrain: (data: any) => request('/api/v1/gnn/train', { method: 'POST', body: JSON.stringify(data) }),
  gnnPredict: (entityId: string) => request(`/api/v1/gnn/predict/${entityId}`),
  gnnStatus: () => request('/api/v1/gnn/status'),

  // GraphRAG (Bedrock Knowledge Bases)
  graphragQuery: (data: any) => request('/api/v1/graphrag/query', { method: 'POST', body: JSON.stringify(data) }),
  graphragIngest: (data: any) => request('/api/v1/graphrag/ingest', { method: 'POST', body: JSON.stringify(data) }),
  graphragInvestigate: (entityId: string) => request(`/api/v1/graphrag/investigate/${entityId}`),

  // Agent (MCP-pattern Agentic Investigation)
  agentInvestigate: (data: any) => request('/api/v1/agent/investigate', { method: 'POST', body: JSON.stringify(data) }),
  agentQuery: (data: any) => request('/api/v1/agent/query', { method: 'POST', body: JSON.stringify(data) }),
  agentExplain: (entityId: string) => request(`/api/v1/agent/explain/${entityId}`),

  // Memory (Mem0)
  memoryStore: (data: any) => request('/api/v1/memory/store', { method: 'POST', body: JSON.stringify(data) }),
  memoryRecall: (entityId: string) => request(`/api/v1/memory/recall/${entityId}`),
  memoryPatterns: () => request('/api/v1/memory/patterns'),
}
