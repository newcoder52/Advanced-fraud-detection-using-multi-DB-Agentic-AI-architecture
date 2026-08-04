import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import EventIngestion from './pages/EventIngestion'
import LiveStream from './pages/LiveStream'
import SemanticAnalysis from './pages/SemanticAnalysis'
import GraphIntelligence from './pages/GraphIntelligence'
import Scoring from './pages/Scoring'
import Briefing from './pages/Briefing'
import DemoWalkthrough from './pages/DemoWalkthrough'
import Architecture from './pages/Architecture'
import DatabaseIntelligence from './pages/DatabaseIntelligence'
import Configure from './pages/Configure'

const DOMAINS = [
  { id: 'press_distribution', name: 'Press Distribution', color: 'bg-blue-600' },
  { id: 'dating_platform', name: 'Dating Platform', color: 'bg-pink-600' },
  { id: 'music_streaming', name: 'Music Streaming', color: 'bg-purple-600' },
  { id: 'cinema_booking', name: 'Cinema Booking', color: 'bg-yellow-600' },
  { id: 'news_platform', name: 'News Platform', color: 'bg-green-600' },
  { id: 'live_streaming', name: 'Live Streaming', color: 'bg-violet-600' },
  { id: 'ticketing_platform', name: 'Ticketing Platform', color: 'bg-sky-600' },
  { id: 'gaming_platform', name: 'Gaming Platform', color: 'bg-indigo-600' },
]

const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { path: '/', label: 'Dashboard', icon: '📊' },
      { path: '/live', label: 'Live Stream', icon: '📡' },
      { path: '/events', label: 'Events', icon: '📥' },
      { path: '/demo', label: 'Demo', icon: '▶️' },
    ],
  },
  {
    label: 'Investigation',
    items: [
      { path: '/semantic', label: 'Semantic', icon: '🧠' },
      { path: '/graph', label: 'Graph', icon: '🕸️' },
      { path: '/scoring', label: 'Scoring', icon: '⚡' },
      { path: '/briefing', label: 'Briefing', icon: '📋' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { path: '/architecture', label: 'Architecture', icon: '🏗️' },
      { path: '/db-intelligence', label: 'DB Intelligence', icon: '🧬' },
      { path: '/configure', label: 'Configure', icon: '⚙️' },
    ],
  },
]

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const fmt = time.toLocaleTimeString('en-US', { hour12: false })
  const tz = time.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop()
  return (
    <span className="text-xs text-green-400 font-mono">
      <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1 animate-pulse"></span>
      LIVE {fmt} {tz}
    </span>
  )
}

function PipelineHealth() {
  const pct = 97
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  return (
    <div className="flex items-center gap-3">
      <svg width="64" height="64" className="transform -rotate-90">
        <circle cx="32" cy="32" r={radius} stroke="#374151" strokeWidth="5" fill="none" />
        <circle cx="32" cy="32" r={radius} stroke="#22c55e" strokeWidth="5" fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div>
        <p className="text-lg font-bold text-white">{pct}%</p>
        <p className="text-xs text-gray-400">Pipeline Health</p>
      </div>
    </div>
  )
}

export default function App() {
  const [domain, setDomain] = useState('press_distribution')
  const location = useLocation()

  return (
    <div className="flex h-screen" style={{ background: '#0a0b0f' }}>
      {/* Sidebar */}
      <aside className="w-64 flex flex-col" style={{ background: '#0f1014', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h1 className="text-lg font-bold gradient-text">Threat Intel</h1>
          <p className="text-[10px] text-gray-500 mt-0.5">Real-Time Threat Intelligence · Multi-DB · Agentic AI</p>
          <div className="mt-2"><LiveClock /></div>
        </div>

        {/* Domain Selector */}
        <div className="p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <label className="text-[10px] text-gray-500 uppercase tracking-widest">Customer</label>
          <select value={domain} onChange={(e) => setDomain(e.target.value)}
            className="mt-1 w-full text-sm rounded-lg px-3 py-2 border-none outline-none"
            style={{ background: '#1a1b1e', color: '#e4e4e7' }}>
            {DOMAINS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 overflow-auto">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="mb-3">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest px-3 mb-1">{group.label}</p>
              {group.items.map(item => (
                <Link key={item.path} to={item.path}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 transition-all ${
                    location.pathname === item.path
                      ? 'text-white font-medium'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                  style={location.pathname === item.path ? { background: 'rgba(87,148,242,0.12)', boxShadow: 'inset 0 0 20px rgba(87,148,242,0.05)' } : {}}>
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.path === '/live' && <span className="ml-auto live-dot"></span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Services */}
        <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Services</p>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            {[
              { name: 'DynamoDB', c: '#FF9830' }, { name: 'pgvector', c: '#5794F2' },
              { name: 'Neptune', c: '#B877D9' }, { name: 'Valkey', c: '#F2495C' },
              { name: 'Kinesis', c: '#5794F2' }, { name: 'SageMaker', c: '#73BF69' },
              { name: 'OpenSearch', c: '#4dd0e1' }, { name: 'Bedrock', c: '#73BF69' },
              { name: 'GraphStorm', c: '#FF6B9D' }, { name: 'MCP', c: '#FFD93D' },
              { name: 'Mem0', c: '#C084FC' },
            ].map(s => (
              <div key={s.name} className="flex items-center gap-1.5 px-1.5 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.c, boxShadow: `0 0 4px ${s.c}60` }}></span>
                <span className="text-gray-500">{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6" style={{ background: '#0a0b0f' }}>
        <Routes>
          <Route path="/" element={<Dashboard domain={domain} />} />
          <Route path="/live" element={<LiveStream domain={domain} />} />
          <Route path="/events" element={<EventIngestion domain={domain} />} />
          <Route path="/semantic" element={<SemanticAnalysis domain={domain} />} />
          <Route path="/graph" element={<GraphIntelligence domain={domain} />} />
          <Route path="/scoring" element={<Scoring domain={domain} />} />
          <Route path="/briefing" element={<Briefing domain={domain} />} />
          <Route path="/demo" element={<DemoWalkthrough domain={domain} />} />
          <Route path="/architecture" element={<Architecture domain={domain} />} />
          <Route path="/db-intelligence" element={<DatabaseIntelligence domain={domain} />} />
          <Route path="/configure" element={<Configure domain={domain} />} />
        </Routes>
      </main>
    </div>
  )
}
