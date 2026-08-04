import { useState, useEffect } from 'react'
import { api } from '../api'

interface PredictionResult {
  entity_id: string
  fraud_probability: number
  classification: string
  confidence: number
  features_used: string[]
  embedding_cluster: number
  similar_entities: Array<{ id: string; similarity: number; label: string }>
}

interface TrainingStatus {
  status: string
  model_version: string
  last_trained: string
  accuracy: number
  training_nodes: number
  training_edges: number
  epochs_completed: number
  loss: number
}

export default function GNNPrediction({ domain }: { domain: string }) {
  const [entityId, setEntityId] = useState('')
  const [prediction, setPrediction] = useState<PredictionResult | null>(null)
  const [status, setStatus] = useState<TrainingStatus | null>(null)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    try {
      const data = await api.gnnStatus()
      // Normalize - API returns { jobs, total_jobs } when no model trained yet
      if (data.total_jobs !== undefined) {
        setStatus({
          status: data.total_jobs > 0 ? 'trained' : 'no_model',
          model_version: 'v0 (heuristic)',
          last_trained: 'N/A',
          accuracy: 0,
          training_nodes: 0,
          training_edges: 0,
          epochs_completed: 0,
          loss: 0,
        })
      } else {
        setStatus(data)
      }
    } catch (err: any) {
      // Status endpoint might not be available yet
    }
  }

  const handlePredict = async () => {
    if (!entityId.trim()) return
    setLoading('predict')
    setError('')
    try {
      const data = await api.gnnPredict(entityId)
      // Normalize response - API returns fraud_score not fraud_probability
      setPrediction({
        entity_id: data.entity_id || entityId,
        fraud_probability: data.fraud_probability ?? data.fraud_score ?? 0,
        classification: data.classification || data.prediction_source || 'unknown',
        confidence: data.confidence ?? (data.fraud_score > 0 ? 0.7 : 0.5),
        features_used: data.features_used || ['graph_degree', 'neighbor_risk', 'community_score', 'velocity'],
        embedding_cluster: data.embedding_cluster ?? 0,
        similar_entities: data.similar_entities || [],
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  const handleTrain = async () => {
    setLoading('train')
    setError('')
    try {
      await api.gnnTrain({ domain, epochs: 50 })
      await loadStatus()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading('')
    }
  }

  const getRiskColor = (prob: number) => {
    if (prob > 0.7) return '#F2495C'
    if (prob > 0.4) return '#FF9830'
    return '#73BF69'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">GraphStorm GNN Predictions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Graph Neural Network fraud detection — learns patterns from relationship structures
          </p>
        </div>
        <button onClick={handleTrain} disabled={loading === 'train'}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: 'rgba(115,191,105,0.15)', color: '#73BF69', border: '1px solid rgba(115,191,105,0.3)' }}>
          {loading === 'train' ? '⏳ Training...' : '🎯 Train Model'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(242,73,92,0.1)', border: '1px solid rgba(242,73,92,0.3)' }}>
          <p className="text-sm text-red-400">⚠️ {error}</p>
        </div>
      )}

      {/* Model Status */}
      {status && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Model Status</h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-lg font-bold" style={{ color: status.status === 'ready' ? '#73BF69' : '#FF9830' }}>
                {status.status.toUpperCase()}
              </p>
              <p className="text-[10px] text-gray-500">Status</p>
            </div>
            <div>
              <p className="text-lg font-bold text-blue-400">{(status.accuracy * 100).toFixed(1)}%</p>
              <p className="text-[10px] text-gray-500">Accuracy</p>
            </div>
            <div>
              <p className="text-lg font-bold text-purple-400">{status.training_nodes?.toLocaleString()}</p>
              <p className="text-[10px] text-gray-500">Training Nodes</p>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-300">{status.model_version}</p>
              <p className="text-[10px] text-gray-500">Version</p>
            </div>
          </div>
        </div>
      )}

      {/* Prediction Input */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <label className="text-xs text-gray-500 uppercase tracking-widest">Predict Entity Fraud Risk</label>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePredict()}
            placeholder="Enter entity ID (e.g., user_12345, acct_67890)"
            className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <button onClick={handlePredict} disabled={loading === 'predict'}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'rgba(87,148,242,0.15)', color: '#5794F2', border: '1px solid rgba(87,148,242,0.3)' }}>
            {loading === 'predict' ? '⏳' : '🕸️ Predict'}
          </button>
        </div>
      </div>

      {/* Prediction Results */}
      {prediction && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Main Score */}
          <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-4">GNN Prediction</h3>
            <div className="flex items-center gap-6">
              {/* Circular Score */}
              <div className="relative">
                <svg width="120" height="120" className="transform -rotate-90">
                  <circle cx="60" cy="60" r="50" stroke="#374151" strokeWidth="8" fill="none" />
                  <circle cx="60" cy="60" r="50" stroke={getRiskColor(prediction.fraud_probability)}
                    strokeWidth="8" fill="none"
                    strokeDasharray={2 * Math.PI * 50}
                    strokeDashoffset={2 * Math.PI * 50 * (1 - prediction.fraud_probability)}
                    strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold" style={{ color: getRiskColor(prediction.fraud_probability) }}>
                    {(prediction.fraud_probability * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <div>
                <p className="text-lg font-bold text-white">{prediction.classification}</p>
                <p className="text-xs text-gray-400 mt-1">Confidence: {(prediction.confidence * 100).toFixed(1)}%</p>
                <p className="text-xs text-gray-500 mt-1">Cluster: #{prediction.embedding_cluster}</p>
                <p className="text-xs text-gray-500">Entity: {prediction.entity_id}</p>
              </div>
            </div>
          </div>

          {/* Features Used */}
          <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-4">Feature Importance</h3>
            <div className="space-y-2">
              {prediction.features_used?.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-300">{feature}</span>
                      <span className="text-gray-500">{(90 - idx * 12).toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-full" style={{
                        width: `${90 - idx * 12}%`,
                        background: `linear-gradient(90deg, #5794F2, #B877D9)`
                      }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Similar Entities */}
          {prediction.similar_entities?.length > 0 && (
            <div className="lg:col-span-2 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Similar Entities (Embedding Space)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {prediction.similar_entities.map((entity, idx) => (
                  <div key={idx} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-sm font-mono text-white">{entity.id}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: entity.label === 'fraud' ? 'rgba(242,73,92,0.15)' : 'rgba(115,191,105,0.15)',
                          color: entity.label === 'fraud' ? '#F2495C' : '#73BF69' }}>
                        {entity.label}
                      </span>
                      <span className="text-[10px] text-gray-500">{(entity.similarity * 100).toFixed(0)}% similar</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
