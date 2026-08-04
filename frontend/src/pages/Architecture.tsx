import { useState, useEffect, useRef, useCallback } from 'react'

interface Props { domain: string }

// ─── Animated Particle ─────────────────────────────────────────────────────────
interface Particle {
  id: number
  x: number
  y: number
  startX: number
  startY: number
  targetX: number
  targetY: number
  progress: number
  speed: number
  color: string
  size: number
  trail: Array<{ x: number; y: number; alpha: number }>
  stage: number
  lane?: 'cache' | 'pgvector' | 'neptune'
  decision?: 'ALLOW' | 'FLAG' | 'BLOCK'
  layer: 1 | 2
  pairId?: number // shared ID for split particles on cache miss
  waitingAtFusion?: boolean // particle arrived at fusion, waiting for partner
}

// ─── Layer 1: Real-Time Detection Nodes ─────────────────────────────────────────
const L1_NODES = {
  source: { x: 0.04, y: 0.35, label: 'Event\nSource', color: '#5794F2', icon: '⚡' },
  kinesis: { x: 0.14, y: 0.35, label: 'Kinesis\nStream', color: '#FF9830', icon: '🔥' },
  lambda: { x: 0.25, y: 0.35, label: 'Lambda\nOrchestrator', color: '#73BF69', icon: 'λ' },
  cache: { x: 0.37, y: 0.35, label: 'ElastiCache\nValkey', color: '#F2495C', icon: '💾' },
  // Fast path (cache hit) — goes straight to fusion
  // Slow path (cache miss) — fans out to pgvector + neptune
  pgvector: { x: 0.52, y: 0.22, label: 'Aurora\npgvector', color: '#5794F2', icon: '🧠' },
  neptune: { x: 0.52, y: 0.48, label: 'Neptune\nAnalytics', color: '#B877D9', icon: '🕸️' },
  fusion: { x: 0.65, y: 0.35, label: 'Composite\nScore', color: '#FF9830', icon: '🎯' },
  decision: { x: 0.76, y: 0.35, label: 'Decision\nEngine', color: '#73BF69', icon: '✓' },
  allow: { x: 0.87, y: 0.20, label: 'ALLOW\n→ S3', color: '#73BF69', icon: '✅' },
  flagblock: { x: 0.87, y: 0.50, label: 'FLAG/BLOCK\n→ DynamoDB', color: '#F2495C', icon: '🚨' },
}

// ─── Layer 2: AI Intelligence Nodes ─────────────────────────────────────────────
const L2_NODES = {
  trigger: { x: 0.12, y: 0.82, label: 'Flagged\nEvent', color: '#F2495C', icon: '🚨' },
  ontology: { x: 0.27, y: 0.82, label: 'Semantic\nOntology', color: '#B877D9', icon: '🧬' },
  gnn: { x: 0.42, y: 0.82, label: 'GNN\nPrediction', color: '#4dd0e1', icon: '🔮' },
  graphrag: { x: 0.57, y: 0.82, label: 'GraphRAG\nEvidence', color: '#5794F2', icon: '📚' },
  agent: { x: 0.72, y: 0.82, label: 'Agentic\nInvestigation', color: '#73BF69', icon: '🕵️' },
  brief: { x: 0.87, y: 0.82, label: 'Investigation\nBrief', color: '#FADE2A', icon: '📋' },
}

// ─── Edges ──────────────────────────────────────────────────────────────────────
const L1_EDGES_ALWAYS = [
  { from: 'source', to: 'kinesis' },
  { from: 'kinesis', to: 'lambda' },
  { from: 'lambda', to: 'cache' },
  { from: 'fusion', to: 'decision' },
  { from: 'decision', to: 'allow' },
  { from: 'decision', to: 'flagblock' },
]

// Cache HIT fast path (dashed green)
const L1_EDGE_FAST = { from: 'cache', to: 'fusion', style: 'fast' as const }

// Cache MISS slow path edges
const L1_EDGES_SLOW = [
  { from: 'cache', to: 'pgvector' },
  { from: 'cache', to: 'neptune' },
  { from: 'pgvector', to: 'fusion' },
  { from: 'neptune', to: 'fusion' },
]

const L2_EDGES = [
  { from: 'trigger', to: 'ontology' },
  { from: 'ontology', to: 'gnn' },
  { from: 'gnn', to: 'graphrag' },
  { from: 'graphrag', to: 'agent' },
  { from: 'agent', to: 'brief' },
]

// Cross-layer edge (FLAG/BLOCK triggers Layer 2)
const CROSS_EDGE = { from: 'flagblock', to: 'trigger' }

// ─── Path labels ────────────────────────────────────────────────────────────────
const PATH_LABELS = [
  { x: 0.50, y: 0.34, text: '⚡ CACHE HIT → fast path (~5ms)', color: '#73BF69' },
  { x: 0.56, y: 0.17, text: 'Content Similarity (~15ms)', color: '#5794F2' },
  { x: 0.56, y: 0.55, text: 'Graph Traversal (~25ms)', color: '#B877D9' },
]

// ─── Node Details ───────────────────────────────────────────────────────────────
const NODE_DETAILS: Record<string, { title: string; description: string; dataFlow: string; awsService: string; latency: string; scalability: string; costNote: string }> = {
  source: {
    title: 'Event Source',
    description: 'Customer platforms push events via REST API or SDK. Each event contains entity_id, content, metadata, and device fingerprints. Supports any domain — dating, streaming, ticketing, gaming, press, etc.',
    dataFlow: 'IN: Raw events (JSON) from customer SDKs | OUT: Validated event → Kinesis',
    awsService: 'API Gateway (REST) + Lambda authorizer',
    latency: '~5ms',
    scalability: 'API Gateway: auto-scales to 10K+ RPS with no provisioning',
    costNote: '$1/million API calls + $0.09/GB transfer',
  },
  kinesis: {
    title: 'Kinesis Data Stream',
    description: 'Partitioned by entity_id for ordered processing per entity. Replay-capable for reprocessing after model updates. Firehose delivery stream archives ALL events to S3 in Parquet format for compliance and cold analytics.',
    dataFlow: 'IN: Raw events from API Gateway | OUT: Fan-out to Lambda consumer + Firehose → S3',
    awsService: 'Kinesis Data Streams (on-demand mode) + Kinesis Firehose',
    latency: '~70ms (put-to-process)',
    scalability: 'On-demand: auto-scales 4MB/s→200MB/s. No shard management needed.',
    costNote: '$0.015/hr per shard-hr (on-demand ~$0.04/GB ingested)',
  },
  lambda: {
    title: 'Lambda Orchestrator',
    description: 'The brain of Layer 1. Receives events from Kinesis, checks the Valkey cache gate first, then fans out to pgvector + Neptune in parallel on cache miss. Fuses all signals into a composite score and renders a decision in <500ms.',
    dataFlow: 'IN: Event from Kinesis shard | OUT: Score + decision → Valkey cache, DynamoDB (if flagged), S3 (archive)',
    awsService: 'Lambda (Python 3.12, 1024MB, 30s timeout, VPC-attached)',
    latency: '~200ms total (cache hit: ~5ms)',
    scalability: '1000 concurrent executions (soft limit, raisable to 10K+)',
    costNote: '$0.20/1M invocations + $0.0000166/GB-sec compute',
  },
  cache: {
    title: 'ElastiCache Valkey — Cache Gate',
    description: 'The first check in the pipeline. Performs a microsecond lookup to determine if this entity has been scored before. On HIT (85-95% after warmup), returns the cached decision instantly — skipping ALL expensive database operations. On MISS, the pipeline fans out to parallel checks. Also maintains velocity counters (events/minute per entity) for behavioral analysis.',
    dataFlow: 'IN: entity_id lookup | OUT: cached score + decision (HIT) or "miss" signal (triggers parallel DBs)',
    awsService: 'ElastiCache Valkey (r7g.large, cluster mode, 2 replicas)',
    latency: '<1ms (sub-millisecond p99)',
    scalability: 'Cluster mode: 3.1M reads/sec, 500K writes/sec. Linear scaling with nodes.',
    costNote: '$0.068/hr per node. 3-node cluster ≈ $150/mo. Saves $$$$ by avoiding DB calls.',
  },
  pgvector: {
    title: 'Aurora PostgreSQL + pgvector',
    description: '"Does this content match a known threat pattern?" Bedrock Titan generates 1024-dimensional semantic embeddings of event content. HNSW index performs approximate nearest-neighbor search to find similar previously-flagged content — catches rephrased scams, paraphrased fraud scripts, and novel variants of known attacks.',
    dataFlow: 'IN: 1024-dim embedding vector | OUT: Top-5 similar matches with cosine scores',
    awsService: 'Aurora PostgreSQL 15 (db.r6g.large) + pgvector extension + HNSW index',
    latency: '~15ms (HNSW ANN search)',
    scalability: 'Aurora auto-scales storage. Read replicas for query throughput. 5K queries/sec per reader.',
    costNote: '$0.26/ACU-hr (serverless) or ~$200/mo (provisioned r6g.large)',
  },
  neptune: {
    title: 'Neptune Analytics',
    description: '"Is this entity connected to known bad actors?" Performs 3-hop graph traversal to find shared devices, payment methods, IP addresses, and fraud ring memberships. Detects relationships invisible to SQL — a user sharing a device with 3 blocked accounts is extremely suspicious even if their own behavior looks clean.',
    dataFlow: 'IN: entity_id | OUT: graph_score, connection count, ring membership, shared devices, hops to nearest bad actor',
    awsService: 'Neptune Analytics (graph-optimized, openCypher queries)',
    latency: '~25ms (3-hop traversal)',
    scalability: 'Neptune Analytics: auto-scales compute. 10K traversals/sec sustained.',
    costNote: '$0.306/hr per processing unit. Billed by query + storage.',
  },
  fusion: {
    title: 'Composite Score Fusion',
    description: 'Combines all signals using weighted convergence amplification. Individual signals are weighted (graph: 30%, similarity: 25%, behavioral: 25%, velocity: 20%), but when multiple signals AGREE (convergence), the composite score gets exponentially boosted. 3+ signals above threshold → 2.2x multiplier.',
    dataFlow: 'IN: graph_score, similarity_score, behavioral_score, velocity_score | OUT: composite_score (0-1) + decision',
    awsService: 'Computed in Lambda (no separate service)',
    latency: '~2ms',
    scalability: 'N/A — pure computation within Lambda',
    costNote: 'No additional cost (runs in Lambda)',
  },
  decision: {
    title: 'Decision Engine',
    description: 'Maps composite score to action: ALLOW (<0.3) → pass through, FLAG (0.3-0.7) → store + monitor + trigger Layer 2, BLOCK (>0.7) → deny + full investigation. Includes escalation logic: repeat offenders get auto-boosted scores. All decisions logged for audit trail.',
    dataFlow: 'IN: composite_score | OUT: decision (ALLOW/FLAG/BLOCK) → routing to S3 or DynamoDB + Layer 2',
    awsService: 'Computed in Lambda + cached in Valkey for future lookups',
    latency: '~1ms',
    scalability: 'N/A — decision logic within Lambda',
    costNote: 'No additional cost',
  },
  allow: {
    title: 'ALLOW → S3 Archive',
    description: 'Clean events are archived to S3 via Kinesis Firehose for cold storage, compliance, and future model retraining. No real-time processing needed. Events stored in Parquet format, partitioned by date and domain for cost-effective analytics with Athena.',
    dataFlow: 'IN: Allowed event + score | OUT: S3 object (Parquet, partitioned by domain/date)',
    awsService: 'Kinesis Firehose → S3 (Parquet, Snappy compression)',
    latency: 'Async (buffered 60s or 5MB)',
    scalability: 'Unlimited — S3 scales to any volume',
    costNote: '$0.023/GB stored (S3 Standard) + $0.029/GB delivered (Firehose)',
  },
  flagblock: {
    title: 'FLAG/BLOCK → DynamoDB + Layer 2',
    description: 'Suspicious events are stored in DynamoDB hot store for immediate access by investigators and the Layer 2 AI pipeline. DynamoDB provides single-digit ms reads for the investigation UI. Also triggers the sequential Layer 2 AI intelligence pipeline for deep automated analysis.',
    dataFlow: 'IN: Flagged event + all scores + features | OUT: Stored item + Layer 2 trigger',
    awsService: 'DynamoDB (on-demand, single-table design, TTL 30 days)',
    latency: '~5ms write',
    scalability: 'On-demand: auto-scales to any throughput. No capacity planning.',
    costNote: '$1.25/million writes, $0.25/million reads (on-demand)',
  },
  trigger: {
    title: 'Flagged Event → Layer 2',
    description: 'FLAG or BLOCK decisions enter the Layer 2 AI pipeline for deep investigation. This is the handoff point between real-time detection (Layer 1, <500ms) and autonomous investigation (Layer 2, seconds-minutes). Events are processed sequentially — each AI step enriches context for the next.',
    dataFlow: 'IN: Flagged event + Layer 1 scores | OUT: Event → Ontology classification',
    awsService: 'EventBridge rule or DynamoDB Streams → Lambda',
    latency: 'Event-driven (~100ms trigger)',
    scalability: 'On-demand — processes as fast as events arrive',
    costNote: 'Included in Lambda costs',
  },
  ontology: {
    title: 'Semantic Ontology — Threat Classification',
    description: 'Classifies the threat TYPE using a self-learning taxonomy of 28+ categories across 4 branches (Financial, Content Manipulation, Social Engineering, Platform Abuse). In production, Neptune\'s semantic ontology discovers new patterns from graph data — the taxonomy evolves as new threat types emerge. Returns classification path, severity, behavioral indicators, and recommended actions.',
    dataFlow: 'IN: Event content + entity features | OUT: Classification path, severity, indicators, recommended action, confidence',
    awsService: 'Neptune Analytics (ontology queries) + Bedrock Claude (classification reasoning)',
    latency: '~500ms',
    scalability: 'On-demand — scales with Neptune + Bedrock limits',
    costNote: '$0.003/1K input tokens (Claude) + Neptune query cost',
  },
  gnn: {
    title: 'GNN Prediction — Network Risk',
    description: 'Graph Neural Network predicts threat probability and network propagation risk. Trained on historical graph structure using GraphStorm on SageMaker. Identifies likely next targets, estimates how far the threat network might spread, and assigns a risk score based on graph topology rather than content.',
    dataFlow: 'IN: Entity subgraph (2-hop neighborhood) | OUT: Risk probability, propagation estimate, likely next targets',
    awsService: 'SageMaker (GraphStorm inference endpoint, ml.g4dn.xlarge)',
    latency: '~2s',
    scalability: 'Auto-scaling endpoint (min 1, max 4 instances)',
    costNote: '$0.526/hr per ml.g4dn.xlarge instance',
  },
  graphrag: {
    title: 'GraphRAG — Evidence Retrieval',
    description: 'Graph-augmented retrieval over investigation history, policy documents, and past case files. Unlike standard RAG, GraphRAG follows relationship paths in the knowledge graph to find multi-hop evidence chains — e.g., "this entity is 2 hops from a confirmed fraud ring prosecuted in Case #4821." Returns relevant precedents, regulatory context, and supporting evidence.',
    dataFlow: 'IN: Entity + classification + graph context | OUT: Similar historical cases, evidence chains, regulatory precedents',
    awsService: 'Bedrock Knowledge Bases (OpenSearch Serverless vector store) + Neptune path queries',
    latency: '~3s',
    scalability: 'Bedrock KB: serverless, auto-scales. Neptune: on-demand compute.',
    costNote: '$0.003/1K tokens (retrieval) + $0.10/GB indexed (OpenSearch)',
  },
  agent: {
    title: 'Agentic Investigation — Claude',
    description: 'Autonomous Claude-powered investigator that synthesizes ALL prior layer outputs into a coherent narrative. Runs follow-up queries, cross-references evidence, generates timeline reconstruction, and produces an analyst-ready investigation brief with confidence scores and recommended actions. Can request additional graph traversals or similarity searches as needed.',
    dataFlow: 'IN: All Layer 2 outputs (classification, GNN risk, evidence) | OUT: Investigation narrative + timeline + confidence + actions',
    awsService: 'Bedrock Claude 3 Sonnet (tool-use enabled, 200K context)',
    latency: '~10s',
    scalability: 'Bedrock: on-demand, rate-limited to 50 RPM (raisable)',
    costNote: '$0.003/1K input + $0.015/1K output tokens',
  },
  brief: {
    title: 'Investigation Brief — Final Output',
    description: 'The final deliverable: a complete, analyst-ready investigation package containing threat classification, evidence chain, entity timeline, confidence assessment, and prioritized recommended actions. Stored in DynamoDB for retrieval by the trust & safety team. Can be exported as PDF or fed into case management systems.',
    dataFlow: 'IN: Agent narrative + all enrichments | OUT: Structured brief → DynamoDB + UI + case management',
    awsService: 'DynamoDB (storage) + API Gateway (delivery to UI)',
    latency: 'Output (stored immediately)',
    scalability: 'N/A — final output',
    costNote: 'DynamoDB write cost only ($1.25/million)',
  },
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function Architecture({ domain }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animRef = useRef<number>(0)
  const sizeRef = useRef({ width: 900, height: 600 })
  const particleIdRef = useRef(0)
  const [activeNode, setActiveNode] = useState<string | null>(null)
  const [stats, setStats] = useState({ processed: 0, blocked: 0, flagged: 0, allowed: 0, avgLatency: 320, cacheHitRate: 0 })
  const [isAnimating, setIsAnimating] = useState(true)
  const simStartRef = useRef<number>(Date.now())
  const cacheHitsRef = useRef(0)
  const cacheTotalRef = useRef(0)
  const pairIdRef = useRef(0)
  const fusionWaitingRef = useRef<Set<number>>(new Set()) // pairIds waiting for partner at fusion

  // Spawn Layer 1 particle
  const spawnL1Particle = useCallback(() => {
    const { width, height } = sizeRef.current
    const startX = L1_NODES.source.x * width
    const startY = L1_NODES.source.y * height + (Math.random() - 0.5) * 10
    const targetX = L1_NODES.kinesis.x * width
    const targetY = L1_NODES.kinesis.y * height
    const p: Particle = {
      id: particleIdRef.current++,
      x: startX, y: startY,
      startX, startY,
      targetX, targetY,
      progress: 0,
      speed: 0.012 + Math.random() * 0.008,
      color: '#5794F2',
      size: 3 + Math.random() * 1.5,
      trail: [],
      stage: 0,
      layer: 1,
    }
    particlesRef.current.push(p)
  }, [])

  // Spawn Layer 2 particle (triggered by FLAG/BLOCK)
  const spawnL2Particle = useCallback(() => {
    const { width, height } = sizeRef.current
    const startX = L2_NODES.trigger.x * width
    const startY = L2_NODES.trigger.y * height
    const targetX = L2_NODES.ontology.x * width
    const targetY = L2_NODES.ontology.y * height
    const p: Particle = {
      id: particleIdRef.current++,
      x: startX, y: startY,
      startX, startY,
      targetX, targetY,
      progress: 0,
      speed: 0.006 + Math.random() * 0.004, // slower — AI layer takes longer
      color: '#B877D9',
      size: 3.5,
      trail: [],
      stage: 0,
      layer: 2,
    }
    particlesRef.current.push(p)
  }, [])

  // Advance Layer 1 particle through stages
  // Stages: 0=source→kinesis, 1=kinesis→lambda, 2=lambda→cache(gate),
  //   3=cacheHIT→fusion(fast) OR cacheMISS→pgvector/neptune(parallel split),
  //   4=fusion→decision (fast) OR pgvector/neptune→fusion(slow, wait for pair),
  //   5=fusion→decision(slow), 6=decision→allow/flagblock
  const advanceL1 = useCallback((p: Particle): boolean => {
    const { width, height } = sizeRef.current
    p.stage++
    p.progress = 0

    if (p.stage === 1) {
      // kinesis → lambda
      p.startX = p.x; p.startY = p.y
      p.targetX = L1_NODES.lambda.x * width
      p.targetY = L1_NODES.lambda.y * height
      p.color = '#73BF69'
    } else if (p.stage === 2) {
      // lambda → cache (ALWAYS — cache is the gate)
      p.startX = p.x; p.startY = p.y
      p.targetX = L1_NODES.cache.x * width
      p.targetY = L1_NODES.cache.y * height
      p.color = '#F2495C'
    } else if (p.stage === 3) {
      // Cache gate decision: HIT or MISS
      const elapsed = (Date.now() - simStartRef.current) / 1000
      const hitRate = Math.min(0.92, 0.10 + (elapsed / 30) * 0.82)
      const isHit = Math.random() < hitRate

      cacheTotalRef.current++
      if (isHit) cacheHitsRef.current++
      const currentRate = Math.round((cacheHitsRef.current / cacheTotalRef.current) * 100)
      setStats(prev => ({ ...prev, cacheHitRate: currentRate }))

      if (isHit) {
        // FAST PATH: cache hit → straight to fusion
        p.lane = 'cache'
        p.startX = p.x; p.startY = p.y
        p.targetX = L1_NODES.fusion.x * width
        p.targetY = L1_NODES.fusion.y * height
        p.color = '#73BF69'
        p.speed = 0.025 + Math.random() * 0.015
        p.size = 2.5
      } else {
        // SLOW PATH: cache miss → SPLIT into two parallel particles
        const currentPairId = pairIdRef.current++
        const baseSpeed = 0.010 + Math.random() * 0.006

        // Spawn pgvector particle
        const pgP: Particle = {
          id: particleIdRef.current++,
          x: p.x, y: p.y,
          startX: p.x, startY: p.y,
          targetX: L1_NODES.pgvector.x * width,
          targetY: L1_NODES.pgvector.y * height,
          progress: 0,
          speed: baseSpeed,
          color: L1_NODES.pgvector.color,
          size: 3,
          trail: [],
          stage: 3, // will advance to 4 when reaching target
          lane: 'pgvector',
          layer: 1,
          pairId: currentPairId,
        }

        // Spawn neptune particle
        const npP: Particle = {
          id: particleIdRef.current++,
          x: p.x, y: p.y,
          startX: p.x, startY: p.y,
          targetX: L1_NODES.neptune.x * width,
          targetY: L1_NODES.neptune.y * height,
          progress: 0,
          speed: baseSpeed + 0.002, // slightly different speed for visual variety
          color: L1_NODES.neptune.color,
          size: 3,
          trail: [],
          stage: 3, // will advance to 4 when reaching target
          lane: 'neptune',
          layer: 1,
          pairId: currentPairId,
        }

        particlesRef.current.push(pgP, npP)
        return false // remove original particle
      }
    } else if (p.stage === 4) {
      if (p.lane === 'cache') {
        // Fast path: fusion → decision
        p.startX = p.x; p.startY = p.y
        p.targetX = L1_NODES.decision.x * width
        p.targetY = L1_NODES.decision.y * height
        p.color = '#73BF69'
      } else {
        // Slow path: pgvector/neptune → fusion
        // Check if partner already arrived
        if (p.pairId != null && fusionWaitingRef.current.has(p.pairId)) {
          // Partner is waiting — merge! Remove from waiting set and continue as merged particle
          fusionWaitingRef.current.delete(p.pairId)
          p.startX = p.x; p.startY = p.y
          p.targetX = L1_NODES.fusion.x * width
          p.targetY = L1_NODES.fusion.y * height
          p.color = '#FF9830'
          p.size = 3.5 // slightly bigger — merged signal
          p.lane = 'pgvector' // mark as slow-path merged
          p.pairId = undefined // no longer paired
        } else if (p.pairId != null) {
          // First to arrive — register as waiting, head to fusion
          fusionWaitingRef.current.add(p.pairId)
          p.startX = p.x; p.startY = p.y
          p.targetX = L1_NODES.fusion.x * width
          p.targetY = L1_NODES.fusion.y * height
          p.color = '#FF9830'
          // This particle will be consumed at fusion (partner takes over)
          p.waitingAtFusion = true
        } else {
          // No pair (shouldn't happen), just go to fusion
          p.startX = p.x; p.startY = p.y
          p.targetX = L1_NODES.fusion.x * width
          p.targetY = L1_NODES.fusion.y * height
          p.color = '#FF9830'
        }
      }
    } else if (p.stage === 5) {
      if (p.lane === 'cache') {
        // Fast path: decision → allow/flagblock
        const roll = Math.random()
        if (roll < 0.75) {
          p.decision = 'ALLOW'; p.color = '#73BF69'
          p.startX = p.x; p.startY = p.y
          p.targetX = L1_NODES.allow.x * width
          p.targetY = L1_NODES.allow.y * height
        } else if (roll < 0.90) {
          p.decision = 'FLAG'; p.color = '#FF9830'
          p.startX = p.x; p.startY = p.y
          p.targetX = L1_NODES.flagblock.x * width
          p.targetY = L1_NODES.flagblock.y * height
        } else {
          p.decision = 'BLOCK'; p.color = '#F2495C'
          p.startX = p.x; p.startY = p.y
          p.targetX = L1_NODES.flagblock.x * width
          p.targetY = L1_NODES.flagblock.y * height
        }
      } else if (p.waitingAtFusion) {
        // This was the first-to-arrive partner — it gets consumed at fusion
        return false
      } else {
        // Slow path merged particle: fusion → decision
        p.startX = p.x; p.startY = p.y
        p.targetX = L1_NODES.decision.x * width
        p.targetY = L1_NODES.decision.y * height
        p.color = '#73BF69'
      }
    } else if (p.stage === 6) {
      if (p.lane === 'cache') {
        // Fast path done
        setStats(prev => ({
          ...prev,
          processed: prev.processed + 1,
          allowed: prev.allowed + (p.decision === 'ALLOW' ? 1 : 0),
          flagged: prev.flagged + (p.decision === 'FLAG' ? 1 : 0),
          blocked: prev.blocked + (p.decision === 'BLOCK' ? 1 : 0),
        }))
        if (p.decision === 'FLAG' || p.decision === 'BLOCK') {
          setTimeout(() => spawnL2Particle(), 200)
        }
        return false
      } else {
        // Slow path: decision → allow/flagblock
        const roll = Math.random()
        if (roll < 0.45) {
          p.decision = 'ALLOW'; p.color = '#73BF69'
          p.startX = p.x; p.startY = p.y
          p.targetX = L1_NODES.allow.x * width
          p.targetY = L1_NODES.allow.y * height
        } else if (roll < 0.75) {
          p.decision = 'FLAG'; p.color = '#FF9830'
          p.startX = p.x; p.startY = p.y
          p.targetX = L1_NODES.flagblock.x * width
          p.targetY = L1_NODES.flagblock.y * height
        } else {
          p.decision = 'BLOCK'; p.color = '#F2495C'
          p.startX = p.x; p.startY = p.y
          p.targetX = L1_NODES.flagblock.x * width
          p.targetY = L1_NODES.flagblock.y * height
        }
      }
    } else {
      // Slow path done
      setStats(prev => ({
        ...prev,
        processed: prev.processed + 1,
        allowed: prev.allowed + (p.decision === 'ALLOW' ? 1 : 0),
        flagged: prev.flagged + (p.decision === 'FLAG' ? 1 : 0),
        blocked: prev.blocked + (p.decision === 'BLOCK' ? 1 : 0),
      }))
      if (p.decision === 'FLAG' || p.decision === 'BLOCK') {
        setTimeout(() => spawnL2Particle(), 200)
      }
      return false
    }
    return true
  }, [spawnL2Particle])

  // Advance Layer 2 particle through sequential AI stages
  const advanceL2 = useCallback((p: Particle): boolean => {
    const { width, height } = sizeRef.current
    p.stage++
    p.progress = 0

    const l2Sequence = ['ontology', 'gnn', 'graphrag', 'agent', 'brief'] as const
    if (p.stage >= l2Sequence.length) {
      return false // done
    }

    const target = L2_NODES[l2Sequence[p.stage]]
    p.startX = p.x; p.startY = p.y
    p.targetX = target.x * width
    p.targetY = target.y * height
    p.color = target.color
    return true
  }, [])

  // Animation loop
  useEffect(() => {
    if (!isAnimating) return

    const spawnInterval = setInterval(spawnL1Particle, 500)

    const render = () => {
      const canvas = canvasRef.current
      if (!canvas) { animRef.current = requestAnimationFrame(render); return }
      const ctx = canvas.getContext('2d')
      if (!ctx) { animRef.current = requestAnimationFrame(render); return }

      const { width, height } = sizeRef.current
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      // ─── Draw Layer Labels ──────────────────────────────────────────
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(115,191,105,0.8)'
      ctx.fillText('LAYER 1: REAL-TIME DETECTION (<500ms)', 12, 20)
      ctx.fillStyle = 'rgba(184,119,217,0.8)'
      ctx.fillText('LAYER 2: AI INTELLIGENCE (seconds–minutes)', 12, height * 0.70)

      // Divider between layers
      ctx.beginPath()
      ctx.moveTo(0, height * 0.66)
      ctx.lineTo(width, height * 0.66)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.setLineDash([4, 8])
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])

      // ─── Draw L1 Edges (always-on) ─────────────────────────────────────
      for (const edge of L1_EDGES_ALWAYS) {
        const from = L1_NODES[edge.from as keyof typeof L1_NODES]
        const to = L1_NODES[edge.to as keyof typeof L1_NODES]
        ctx.beginPath()
        ctx.moveTo(from.x * width, from.y * height)
        ctx.lineTo(to.x * width, to.y * height)
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Fast path edge (cache → fusion, dashed green)
      {
        const from = L1_NODES[L1_EDGE_FAST.from as keyof typeof L1_NODES]
        const to = L1_NODES[L1_EDGE_FAST.to as keyof typeof L1_NODES]
        ctx.beginPath()
        ctx.moveTo(from.x * width, from.y * height)
        ctx.lineTo(to.x * width, to.y * height)
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = 'rgba(115,191,105,0.25)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Slow path edges (cache → pgvector/neptune → fusion)
      for (const edge of L1_EDGES_SLOW) {
        const from = L1_NODES[edge.from as keyof typeof L1_NODES]
        const to = L1_NODES[edge.to as keyof typeof L1_NODES]
        ctx.beginPath()
        ctx.moveTo(from.x * width, from.y * height)
        ctx.lineTo(to.x * width, to.y * height)
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // ─── Draw L2 Edges ──────────────────────────────────────────────
      for (const edge of L2_EDGES) {
        const from = L2_NODES[edge.from as keyof typeof L2_NODES]
        const to = L2_NODES[edge.to as keyof typeof L2_NODES]
        ctx.beginPath()
        ctx.moveTo(from.x * width, from.y * height)
        ctx.lineTo(to.x * width, to.y * height)
        ctx.strokeStyle = 'rgba(184,119,217,0.12)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // ─── Draw Cross-Layer Edge (FLAG/BLOCK → Layer 2) ───────────────
      const crossFrom = L1_NODES[CROSS_EDGE.from as keyof typeof L1_NODES]
      const crossTo = L2_NODES[CROSS_EDGE.to as keyof typeof L2_NODES]
      ctx.beginPath()
      ctx.moveTo(crossFrom.x * width, crossFrom.y * height)
      ctx.lineTo(crossTo.x * width, crossTo.y * height)
      ctx.strokeStyle = 'rgba(242,73,92,0.15)'
      ctx.setLineDash([3, 5])
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])

      // ─── Draw Path Labels ─────────────────────────────────────────
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      for (const ll of PATH_LABELS) {
        ctx.fillStyle = ll.color + 'CC'
        ctx.fillText(ll.text, ll.x * width, ll.y * height)
      }

      // ─── Draw L1 Nodes ─────────────────────────────────────────────
      for (const [key, node] of Object.entries(L1_NODES)) {
        drawNode(ctx, node, width, height, activeNode === key)
      }

      // ─── Draw L2 Nodes ─────────────────────────────────────────────
      for (const [key, node] of Object.entries(L2_NODES)) {
        drawNode(ctx, node, width, height, activeNode === key)
      }

      // ─── Update and Draw Particles ──────────────────────────────────
      const alive: Particle[] = []
      for (const p of particlesRef.current) {
        p.progress += p.speed

        // Interpolate position
        const t = Math.min(p.progress, 1)
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        const cx = p.startX + (p.targetX - p.startX) * easedT
        const cy = p.startY + (p.targetY - p.startY) * easedT

        // Trail
        p.trail.push({ x: cx, y: cy, alpha: 1 })
        if (p.trail.length > 10) p.trail.shift()
        for (const tp of p.trail) { tp.alpha *= 0.82 }

        // Draw trail
        for (const tp of p.trail) {
          ctx.beginPath()
          ctx.arc(tp.x, tp.y, p.size * 0.4, 0, Math.PI * 2)
          ctx.fillStyle = `${p.color}${Math.floor(tp.alpha * 60).toString(16).padStart(2, '0')}`
          ctx.fill()
        }

        // Draw particle
        ctx.beginPath()
        ctx.arc(cx, cy, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = 8
        ctx.fill()
        ctx.shadowBlur = 0

        if (p.progress >= 1) {
          p.x = p.targetX
          p.y = p.targetY
          const keepGoing = p.layer === 1 ? advanceL1(p) : advanceL2(p)
          if (keepGoing) alive.push(p)
        } else {
          alive.push(p)
        }
      }
      particlesRef.current = alive

      animRef.current = requestAnimationFrame(render)
    }

    animRef.current = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(animRef.current)
      clearInterval(spawnInterval)
    }
  }, [isAnimating, activeNode, spawnL1Particle, advanceL1, advanceL2])

  // Resize
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      sizeRef.current = { width: rect.width, height: rect.height }
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Handle click on canvas → detect node
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const { width, height } = sizeRef.current

    for (const [key, node] of Object.entries(L1_NODES)) {
      const nx = node.x * width
      const ny = node.y * height
      if (Math.sqrt((mx - nx) ** 2 + (my - ny) ** 2) < 30) {
        setActiveNode(prev => prev === key ? null : key)
        return
      }
    }
    for (const [key, node] of Object.entries(L2_NODES)) {
      const nx = node.x * width
      const ny = node.y * height
      if (Math.sqrt((mx - nx) ** 2 + (my - ny) ** 2) < 30) {
        setActiveNode(prev => prev === key ? null : key)
        return
      }
    }
    setActiveNode(null)
  }, [])

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Pipeline Architecture</h1>
          <p className="text-sm text-gray-300 mt-1">Real-Time Threat Intelligence — two-layer detection flow</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsAnimating(!isAnimating)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: isAnimating ? 'rgba(115,191,105,0.15)' : 'rgba(255,255,255,0.05)', color: isAnimating ? '#73BF69' : '#a1a1aa', border: `1px solid ${isAnimating ? 'rgba(115,191,105,0.3)' : 'rgba(255,255,255,0.1)'}` }}>
            {isAnimating ? '● Live' : '○ Paused'}
          </button>
          <button onClick={() => { particlesRef.current = []; simStartRef.current = Date.now(); cacheHitsRef.current = 0; cacheTotalRef.current = 0; fusionWaitingRef.current.clear(); setStats({ processed: 0, blocked: 0, flagged: 0, allowed: 0, avgLatency: 320, cacheHitRate: 0 }) }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white transition-all"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            Reset
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Processed', value: stats.processed, color: '#5794F2' },
          { label: 'Allowed', value: stats.allowed, color: '#73BF69' },
          { label: 'Flagged', value: stats.flagged, color: '#FF9830' },
          { label: 'Blocked', value: stats.blocked, color: '#F2495C' },
          { label: 'Cache Hit', value: `${stats.cacheHitRate}%`, color: '#4dd0e1' },
          { label: 'Avg Latency', value: `${stats.avgLatency}ms`, color: '#ffffff' },
        ].map(s => (
          <div key={s.label} className="rounded-lg px-3 py-2 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-lg font-bold text-white" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-gray-300">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Canvas + Detail Panel */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Canvas */}
        <div ref={containerRef} className="flex-1 rounded-xl overflow-hidden relative cursor-pointer"
          style={{ background: 'rgba(10,11,15,0.8)', border: '1px solid rgba(255,255,255,0.06)', minHeight: 400 }}>
          <canvas ref={canvasRef} onClick={handleCanvasClick} className="w-full h-full" />

          {/* Legend */}
          <div className="absolute bottom-3 left-3 flex gap-4 text-[10px] text-gray-300">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#73BF69' }} /> ALLOW</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#FF9830' }} /> FLAG</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#F2495C' }} /> BLOCK</span>
            <span className="flex items-center gap-1"><span className="w-6 h-0.5 rounded" style={{ background: '#73BF69', opacity: 0.7 }} /> Fast path (hit)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#B877D9' }} /> Layer 2 AI</span>
          </div>
        </div>

        {/* Detail Panel */}
        {activeNode && NODE_DETAILS[activeNode] && (
          <div className="w-80 rounded-xl p-4 flex flex-col overflow-auto" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{(L1_NODES as any)[activeNode]?.icon || (L2_NODES as any)[activeNode]?.icon}</span>
              <h3 className="text-base font-bold text-white">{NODE_DETAILS[activeNode].title}</h3>
            </div>
            <p className="text-[11px] text-gray-200 leading-relaxed mb-3">{NODE_DETAILS[activeNode].description}</p>

            {/* Data Flow */}
            <div className="mb-2.5 rounded-lg px-2.5 py-2" style={{ background: 'rgba(87,148,242,0.06)', border: '1px solid rgba(87,148,242,0.15)' }}>
              <p className="text-[9px] text-blue-300 font-bold uppercase tracking-wide mb-0.5">Data Flow</p>
              <p className="text-[10px] text-gray-200">{NODE_DETAILS[activeNode].dataFlow}</p>
            </div>

            {/* AWS Service */}
            <div className="mb-2.5">
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">AWS Service</p>
              <p className="text-[10px] text-orange-200 font-mono">{NODE_DETAILS[activeNode].awsService}</p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(87,148,242,0.06)' }}>
                <p className="text-[11px] font-bold text-blue-300">{NODE_DETAILS[activeNode].latency}</p>
                <p className="text-[9px] text-gray-400">Latency</p>
              </div>
              <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(115,191,105,0.06)' }}>
                <p className="text-[9px] font-bold text-green-300 leading-tight">{NODE_DETAILS[activeNode].scalability}</p>
                <p className="text-[9px] text-gray-400">Scale</p>
              </div>
            </div>

            {/* Cost */}
            <div className="rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(255,152,48,0.06)', border: '1px solid rgba(255,152,48,0.12)' }}>
              <p className="text-[9px] text-orange-300 font-bold uppercase tracking-wide">Cost</p>
              <p className="text-[10px] text-gray-200">{NODE_DETAILS[activeNode].costNote}</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom: Architecture Comparison */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4" style={{ background: 'rgba(242,73,92,0.05)', border: '1px solid rgba(242,73,92,0.12)' }}>
          <p className="text-xs font-bold mb-2" style={{ color: '#F2495C' }}>❌ Rules Engine</p>
          <p className="text-[10px] text-gray-300">Catches yesterday's fraud. No relationships. No learning. Brittle to evasion.</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,152,48,0.05)', border: '1px solid rgba(255,152,48,0.12)' }}>
          <p className="text-xs font-bold mb-2" style={{ color: '#FF9830' }}>⚠️ Single ML Model</p>
          <p className="text-[10px] text-gray-300">Catches patterns in isolation. No network awareness. Can't explain decisions.</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(115,191,105,0.05)', border: '1px solid rgba(115,191,105,0.12)' }}>
          <p className="text-xs font-bold mb-2" style={{ color: '#73BF69' }}>✅ Multi-DB + AI Layers</p>
          <p className="text-[10px] text-gray-300">Layer 1: parallel multi-signal, sub-500ms. Layer 2: deep AI investigation for flagged events.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Helper: Draw a node ────────────────────────────────────────────────────────

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: { x: number; y: number; label: string; color: string; icon: string },
  width: number,
  height: number,
  isActive: boolean
) {
  const nx = node.x * width
  const ny = node.y * height
  const radius = isActive ? 28 : 22

  // Glow
  const gradient = ctx.createRadialGradient(nx, ny, 0, nx, ny, radius * 1.5)
  gradient.addColorStop(0, `${node.color}15`)
  gradient.addColorStop(1, 'transparent')
  ctx.beginPath()
  ctx.arc(nx, ny, radius * 1.5, 0, Math.PI * 2)
  ctx.fillStyle = gradient
  ctx.fill()

  // Node circle
  ctx.beginPath()
  ctx.arc(nx, ny, radius, 0, Math.PI * 2)
  ctx.fillStyle = isActive ? `${node.color}25` : 'rgba(15,16,20,0.9)'
  ctx.strokeStyle = isActive ? node.color : `${node.color}50`
  ctx.lineWidth = isActive ? 2.5 : 1.5
  ctx.fill()
  ctx.stroke()

  // Icon (centered above label)
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = node.color
  ctx.fillText(node.icon, nx, ny - 5)

  // Label (below icon)
  ctx.fillStyle = isActive ? '#ffffff' : 'rgba(255,255,255,0.85)'
  ctx.font = '9px Inter, system-ui, sans-serif'
  ctx.textBaseline = 'top'
  const lines = node.label.split('\n')
  lines.forEach((line, i) => {
    ctx.fillText(line, nx, ny + 6 + i * 10)
  })
}
