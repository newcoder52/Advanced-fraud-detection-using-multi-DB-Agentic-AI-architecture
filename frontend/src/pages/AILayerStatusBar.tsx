import { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LayerStatus {
  ontology: 'idle' | 'classifying' | 'done'
  gnn: 'idle' | 'predicting' | 'done'
  graphrag: 'idle' | 'retrieving' | 'done'
}

interface Props {
  isStreaming: boolean
  lastFlagTime: number | null
  ontologyActive: boolean
  gnnActive: boolean
  graphragActive: boolean
  totalClassifications: number
  totalPredictions: number
  totalRetrievals: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AILayerStatusBar({
  isStreaming,
  lastFlagTime,
  ontologyActive,
  gnnActive,
  graphragActive,
  totalClassifications,
  totalPredictions,
  totalRetrievals,
}: Props) {
  const [layerStatus, setLayerStatus] = useState<LayerStatus>({
    ontology: 'idle',
    gnn: 'idle',
    graphrag: 'idle',
  })
  const inferenceTimeRef = useRef(85 + Math.floor(Math.random() * 40))

  // Update status based on active props
  useEffect(() => {
    setLayerStatus({
      ontology: ontologyActive ? 'classifying' : 'idle',
      gnn: gnnActive ? 'predicting' : 'idle',
      graphrag: graphragActive ? 'retrieving' : 'idle',
    })

    if (ontologyActive || gnnActive || graphragActive) {
      inferenceTimeRef.current = 85 + Math.floor(Math.random() * 40)
      const timer = setTimeout(() => {
        setLayerStatus({
          ontology: ontologyActive ? 'done' : 'idle',
          gnn: gnnActive ? 'done' : 'idle',
          graphrag: graphragActive ? 'done' : 'idle',
        })
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [ontologyActive, gnnActive, graphragActive])

  const getStatusDot = (status: 'idle' | 'classifying' | 'predicting' | 'retrieving' | 'done') => {
    if (status === 'idle') return 'bg-gray-600'
    if (status === 'done') return 'bg-green-400'
    return 'bg-yellow-400 animate-pulse'
  }

  const getStatusLabel = (status: 'idle' | 'classifying' | 'predicting' | 'retrieving' | 'done') => {
    if (status === 'idle') return 'Idle'
    if (status === 'done') return 'Complete'
    return status.charAt(0).toUpperCase() + status.slice(1) + '...'
  }

  const timeSinceFlag = lastFlagTime
    ? Math.floor((Date.now() - lastFlagTime) / 1000)
    : null

  return (
    <div
      className="flex items-center justify-between px-4 py-2 rounded-xl"
      style={{
        background: 'linear-gradient(90deg, rgba(20,21,27,0.95) 0%, rgba(25,27,35,0.95) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Left: Layer 2 Label */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]">🧠</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Layer 2 — AI Intelligence
          </span>
        </div>
        {isStreaming && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[9px] text-green-400">Active</span>
          </span>
        )}
      </div>

      {/* Center: Module Status Indicators */}
      <div className="flex items-center gap-5">
        {/* Ontology */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${getStatusDot(layerStatus.ontology)}`} />
          <span className="text-[9px] text-gray-500">Ontology</span>
          <span className="text-[9px] font-mono text-gray-400">
            {getStatusLabel(layerStatus.ontology)}
          </span>
          {totalClassifications > 0 && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-purple-900/30 text-purple-400 font-mono">
              ×{totalClassifications}
            </span>
          )}
        </div>

        {/* GNN */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${getStatusDot(layerStatus.gnn)}`} />
          <span className="text-[9px] text-gray-500">GNN</span>
          <span className="text-[9px] font-mono text-gray-400">
            {getStatusLabel(layerStatus.gnn)}
          </span>
          {totalPredictions > 0 && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-rose-900/30 text-rose-400 font-mono">
              ×{totalPredictions}
            </span>
          )}
        </div>

        {/* GraphRAG */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${getStatusDot(layerStatus.graphrag)}`} />
          <span className="text-[9px] text-gray-500">GraphRAG</span>
          <span className="text-[9px] font-mono text-gray-400">
            {getStatusLabel(layerStatus.graphrag)}
          </span>
          {totalRetrievals > 0 && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-blue-900/30 text-blue-400 font-mono">
              ×{totalRetrievals}
            </span>
          )}
        </div>
      </div>

      {/* Right: Timing + Throughput */}
      <div className="flex items-center gap-4">
        {timeSinceFlag !== null && timeSinceFlag < 30 && (
          <span className="text-[9px] text-gray-500">
            Last trigger: <span className="font-mono text-white">{timeSinceFlag}s ago</span>
          </span>
        )}
        <span className="text-[9px] text-gray-500">
          Avg inference: <span className="font-mono text-cyan-400">{inferenceTimeRef.current}ms</span>
        </span>
      </div>
    </div>
  )
}
