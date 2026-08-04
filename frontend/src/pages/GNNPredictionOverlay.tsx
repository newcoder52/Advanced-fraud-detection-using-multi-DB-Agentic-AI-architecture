import { useState, useEffect, useRef } from 'react'

// ─── GNN Prediction Data Types ────────────────────────────────────────────────

interface GNNNodeScore {
  nodeId: string
  label: string
  score: number
  x: number // percentage position for overlay
  y: number
  timestamp: number
}

interface GNNCluster {
  id: string
  nodeCount: number
  pattern: string
  riskLevel: 'high' | 'critical'
  centerX: number
  centerY: number
  radius: number
  timestamp: number
}

interface GNNEdgeHighlight {
  id: string
  label: string
  suspicionScore: number
  timestamp: number
}

// ─── Pattern Data ─────────────────────────────────────────────────────────────

const NETWORK_PATTERNS = [
  'Ring detected (5 nodes)',
  'Ring detected (8 nodes)',
  'Star topology (1 hub, 6 spokes)',
  'Chain pattern (7 hops)',
  'Isolation anomaly',
  'Dense cluster (12 nodes, 34 edges)',
  'Bipartite fraud ring',
  'Fan-out pattern (1→9)',
  'Circular flow detected',
  'Multi-hop laundering chain',
]

const SUSPICIOUS_EDGES = [
  'SHARED_PAYMENT',
  'SAME_DEVICE',
  'TRANSACTED_WITH',
  'REFERRED_BY',
  'SAME_IP',
  'LINKED_TO',
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean
  triggerKey: string | null
  isFlagOrBlock: boolean
}

export default function GNNPredictionOverlay({ visible, triggerKey, isFlagOrBlock }: Props) {
  const [scores, setScores] = useState<GNNNodeScore[]>([])
  const [cluster, setCluster] = useState<GNNCluster | null>(null)
  const [pattern, setPattern] = useState<string | null>(null)
  const [suspiciousEdges, setSuspiciousEdges] = useState<GNNEdgeHighlight[]>([])
  const [animState, setAnimState] = useState<'hidden' | 'visible'>('hidden')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!visible || !triggerKey || !isFlagOrBlock) {
      // Fade out scores after a delay
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        setAnimState('hidden')
      }, 10000)
      return
    }

    const now = Date.now()

    // Generate 1-3 node scores for flagged nodes
    const numScores = 1 + Math.floor(Math.random() * 3)
    const newScores: GNNNodeScore[] = Array.from({ length: numScores }, (_, i) => ({
      nodeId: `node-${now}-${i}`,
      label: ['ACCT', 'DEV', 'IP', 'BOT'][Math.floor(Math.random() * 4)] + '-' + Math.floor(Math.random() * 100).toString().padStart(3, '0'),
      score: 0.7 + Math.random() * 0.28,
      x: 15 + Math.random() * 70,
      y: 15 + Math.random() * 60,
      timestamp: now + i * 200,
    }))
    setScores(newScores)

    // Generate cluster detection
    if (Math.random() > 0.3) {
      setCluster({
        id: `cluster-${now}`,
        nodeCount: 4 + Math.floor(Math.random() * 9),
        pattern: Math.random() > 0.5 ? 'fraud_ring' : 'dense_subgraph',
        riskLevel: Math.random() > 0.5 ? 'critical' : 'high',
        centerX: 30 + Math.random() * 40,
        centerY: 25 + Math.random() * 50,
        radius: 12 + Math.random() * 10,
        timestamp: now,
      })
    }

    // Network pattern
    setPattern(NETWORK_PATTERNS[Math.floor(Math.random() * NETWORK_PATTERNS.length)])

    // Suspicious edges
    const numEdges = 1 + Math.floor(Math.random() * 3)
    const newEdges: GNNEdgeHighlight[] = Array.from({ length: numEdges }, (_, i) => ({
      id: `edge-${now}-${i}`,
      label: SUSPICIOUS_EDGES[Math.floor(Math.random() * SUSPICIOUS_EDGES.length)],
      suspicionScore: 0.75 + Math.random() * 0.24,
      timestamp: now + i * 300,
    }))
    setSuspiciousEdges(newEdges)

    setAnimState('visible')

    // Auto-hide after 10s
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setAnimState('hidden')
    }, 10000)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [triggerKey, visible, isFlagOrBlock])

  if (animState === 'hidden') return null

  return (
    <>
      {/* GNN Score Badges floating over graph area */}
      {scores.map((score, i) => (
        <div
          key={score.nodeId}
          className="absolute pointer-events-none transition-all duration-500"
          style={{
            left: `${score.x}%`,
            top: `${score.y}%`,
            opacity: animState === 'visible' ? 1 : 0,
            transform: `scale(${animState === 'visible' ? 1 : 0.5})`,
            transitionDelay: `${i * 150}ms`,
            zIndex: 20,
          }}
        >
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md shadow-lg"
            style={{
              background: score.score >= 0.9
                ? 'rgba(242, 73, 92, 0.9)'
                : 'rgba(250, 222, 42, 0.85)',
              backdropFilter: 'blur(4px)',
              boxShadow: score.score >= 0.9
                ? '0 0 12px rgba(242, 73, 92, 0.5)'
                : '0 0 8px rgba(250, 222, 42, 0.4)',
            }}
          >
            <span className="text-[9px] font-bold text-white">GNN:</span>
            <span className="text-[10px] font-mono font-bold text-white">
              {score.score.toFixed(2)}
            </span>
          </div>
        </div>
      ))}

      {/* Cluster heatmap glow */}
      {cluster && (
        <div
          className="absolute pointer-events-none transition-opacity duration-700"
          style={{
            left: `${cluster.centerX}%`,
            top: `${cluster.centerY}%`,
            width: `${cluster.radius * 2}%`,
            height: `${cluster.radius * 2}%`,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: cluster.riskLevel === 'critical'
              ? 'radial-gradient(circle, rgba(242,73,92,0.2) 0%, rgba(242,73,92,0.05) 60%, transparent 100%)'
              : 'radial-gradient(circle, rgba(250,222,42,0.15) 0%, rgba(250,222,42,0.03) 60%, transparent 100%)',
            border: cluster.riskLevel === 'critical'
              ? '1px solid rgba(242,73,92,0.3)'
              : '1px solid rgba(250,222,42,0.2)',
            opacity: animState === 'visible' ? 1 : 0,
            animation: 'pulse 3s ease-in-out infinite',
            zIndex: 10,
          }}
        />
      )}

      {/* Bottom-left: Network Pattern Indicator */}
      <div
        className="absolute bottom-2 left-2 transition-all duration-500 z-20"
        style={{
          opacity: animState === 'visible' ? 1 : 0,
          transform: `translateY(${animState === 'visible' ? 0 : 10}px)`,
        }}
      >
        <div className="rounded-lg px-2.5 py-1.5 space-y-1" style={{
          background: 'rgba(0,0,0,0.85)',
          border: '1px solid rgba(184,119,217,0.3)',
          backdropFilter: 'blur(8px)',
        }}>
          {/* Pattern */}
          {pattern && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-[9px] text-gray-400">Pattern:</span>
              <span className="text-[10px] text-purple-300 font-medium">{pattern}</span>
            </div>
          )}
          {/* Suspicious edges */}
          {suspiciousEdges.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span className="text-[9px] text-gray-400">Hot edges:</span>
              <span className="text-[10px] text-rose-300 font-mono">
                {suspiciousEdges.map(e => `${e.label}(${e.suspicionScore.toFixed(2)})`).join(', ')}
              </span>
            </div>
          )}
          {/* Cluster info */}
          {cluster && (
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${cluster.riskLevel === 'critical' ? 'bg-red-400' : 'bg-yellow-400'}`} />
              <span className="text-[9px] text-gray-400">Cluster:</span>
              <span className={`text-[10px] font-medium ${cluster.riskLevel === 'critical' ? 'text-red-300' : 'text-yellow-300'}`}>
                {cluster.nodeCount} nodes — {cluster.riskLevel}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
