import { useRef, useEffect, useCallback, useState } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskLevel = 'ALLOW' | 'FLAG' | 'BLOCK' | 'INVESTIGATING'

export type OntologyCategory = 'financial' | 'content_manipulation' | 'social_engineering' | 'platform_abuse'

export interface GraphNode {
  id: string
  label: string
  type: 'account' | 'device' | 'ip' | 'email' | 'phone' | 'track' | 'content'
  risk: RiskLevel
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  pulsePhase: number
  isPulsing: boolean
  pulseStart: number
  opacity: number
  birthTime: number
  annotation?: string
  annotationExpiry?: number
  ontologyCategory?: OntologyCategory
  ontologyLeaf?: string
  ontologyClassifiedAt?: number
}

export interface GraphEdge {
  source: string
  target: string
  label: string
  pulseProgress: number // 0-1 animated travel
  isPulsing: boolean
  pulseStart: number
  risk: RiskLevel
  isSemantic?: boolean // ontology-derived semantic edge
  semanticCategory?: OntologyCategory
}

export interface GraphEvent {
  sourceId: string
  sourceLabel: string
  sourceType: GraphNode['type']
  targetId: string
  targetLabel: string
  targetType: GraphNode['type']
  edgeLabel: string
  risk: RiskLevel
  annotation?: string
}

// ─── Color Scheme ─────────────────────────────────────────────────────────────

const RISK_COLORS: Record<RiskLevel, string> = {
  ALLOW: '#73BF69',
  FLAG: '#FADE2A',
  BLOCK: '#F2495C',
  INVESTIGATING: '#B877D9',
}

const RISK_GLOW: Record<RiskLevel, string> = {
  ALLOW: 'rgba(115, 191, 105, 0.4)',
  FLAG: 'rgba(250, 222, 42, 0.4)',
  BLOCK: 'rgba(242, 73, 92, 0.5)',
  INVESTIGATING: 'rgba(184, 119, 217, 0.5)',
}

const ONTOLOGY_COLORS: Record<OntologyCategory, string> = {
  financial: '#FF9830',           // orange/amber
  content_manipulation: '#00BCD4', // cyan/teal
  social_engineering: '#E040FB',   // magenta/pink
  platform_abuse: '#3D5AFE',       // deep blue
}

const ONTOLOGY_GLOW: Record<OntologyCategory, string> = {
  financial: 'rgba(255, 152, 48, 0.5)',
  content_manipulation: 'rgba(0, 188, 212, 0.5)',
  social_engineering: 'rgba(224, 64, 251, 0.5)',
  platform_abuse: 'rgba(61, 90, 254, 0.5)',
}

const ONTOLOGY_LEAVES: Record<OntologyCategory, string[]> = {
  financial: ['Card-Not-Present', 'Account Takeover', 'Refund Abuse', 'Synthetic Identity', 'Credential Stuffing', 'Layering', 'Smurfing', 'Shell Company'],
  content_manipulation: ['Stream Farming', 'Click Fraud', 'Bot Network', 'View Inflation', 'Deepfake', 'AI-Generated Disinfo', 'Coordinated Inauthentic'],
  social_engineering: ['Pig Butchering', 'Catfishing', 'Military Impersonation', 'Spear Phishing', 'Credential Harvesting'],
  platform_abuse: ['Ticket Scalping', 'Inventory Hoarding', 'Bot Purchasing', 'Aimbot / Cheating', 'Real Money Trading', 'Account Boosting'],
}

const TYPE_ICONS: Record<GraphNode['type'], string> = {
  account: '👤',
  device: '📱',
  ip: '🌐',
  email: '✉️',
  phone: '📞',
  track: '🎵',
  content: '📄',
}

// ─── Floating Ontology Labels ─────────────────────────────────────────────────

interface FloatingLabel {
  text: string
  category: OntologyCategory
  x: number
  y: number
  createdAt: number
  duration: number // ms
}

// ─── Force Simulation ─────────────────────────────────────────────────────────

const REPULSION = 3000
const ATTRACTION = 0.008
const DAMPING = 0.92
const CENTER_GRAVITY = 0.01
const MIN_DISTANCE = 60
const ONTOLOGY_CLUSTER_STRENGTH = 0.003 // weaker than edge attraction

function applyForces(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
) {
  const cx = width / 2
  const cy = height / 2

  // Repulsion between all nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j].x - nodes[i].x
      const dy = nodes[j].y - nodes[i].y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = REPULSION / (dist * dist)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      nodes[i].vx -= fx
      nodes[i].vy -= fy
      nodes[j].vx += fx
      nodes[j].vy += fy
    }
  }

  // Attraction along edges
  for (const edge of edges) {
    const source = nodes.find(n => n.id === edge.source)
    const target = nodes.find(n => n.id === edge.target)
    if (!source || !target) continue
    const dx = target.x - source.x
    const dy = target.y - source.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const force = (dist - MIN_DISTANCE * 2) * ATTRACTION
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force
    source.vx += fx
    source.vy += fy
    target.vx -= fx
    target.vy -= fy
  }

  // Ontology clustering force — same-category nodes attract each other
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i].ontologyCategory) continue
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[j].ontologyCategory !== nodes[i].ontologyCategory) continue
      const dx = nodes[j].x - nodes[i].x
      const dy = nodes[j].y - nodes[i].y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      // Only attract if beyond a min distance to avoid collapse
      if (dist > MIN_DISTANCE * 1.5) {
        const force = (dist - MIN_DISTANCE * 1.5) * ONTOLOGY_CLUSTER_STRENGTH
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        nodes[i].vx += fx
        nodes[i].vy += fy
        nodes[j].vx -= fx
        nodes[j].vy -= fy
      }
    }
  }

  // Center gravity
  for (const node of nodes) {
    node.vx += (cx - node.x) * CENTER_GRAVITY
    node.vy += (cy - node.y) * CENTER_GRAVITY
  }

  // Apply velocities with damping
  for (const node of nodes) {
    node.vx *= DAMPING
    node.vy *= DAMPING
    node.x += node.vx
    node.y += node.vy
    // Keep within bounds
    node.x = Math.max(40, Math.min(width - 40, node.x))
    node.y = Math.max(40, Math.min(height - 40, node.y))
  }
}

// ─── Mock Data Generator ──────────────────────────────────────────────────────

const ENTITY_POOL = {
  accounts: ['ACCT-0012', 'ACCT-0034', 'ACCT-0056', 'ACCT-0078', 'ACCT-0091', 'BOT-FARM-001', 'BOT-FARM-015', 'ACCT-0123', 'ACCT-0145', 'ACCT-0167'],
  devices: ['DEV-A1', 'DEV-A2', 'DEV-B1', 'DEV-C1', 'DEV-C2', 'EMULATOR-07', 'VM-INST-44'],
  ips: ['IP-192.168.1.x', 'IP-10.0.0.x', 'IP-TOR-EXIT-1', 'IP-VPN-POOL-3', 'IP-DATACENTER-7'],
  emails: ['user@legit.com', 'fraud@temp.io', 'real@mail.com', 'fake@burner.net'],
  phones: ['+1-555-0100', '+1-555-0200', '+44-7700-900', '+1-555-VOIP'],
}

const EDGE_TYPES = ['SHARES_DEVICE', 'TRANSACTED_WITH', 'LINKED_TO', 'SAME_IP', 'SAME_EMAIL', 'SHARED_PAYMENT', 'REFERRED_BY']

const ANNOTATIONS = [
  'Shared device with 3 blocked accounts',
  'Part of known fraud ring (12 nodes)',
  'IP matches blacklisted datacenter',
  'Velocity spike: 50x normal rate',
  'Same payment method as blocked entity',
  'Cross-platform identity match',
  'Behavioral anomaly detected',
  'New entity in existing fraud cluster',
  'Geo-impossible access pattern',
  'Account created 2min ago, high activity',
]

function randomFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateGraphEvent(): GraphEvent {
  const riskRoll = Math.random()
  let risk: RiskLevel
  if (riskRoll < 0.4) risk = 'ALLOW'
  else if (riskRoll < 0.65) risk = 'FLAG'
  else if (riskRoll < 0.85) risk = 'BLOCK'
  else risk = 'INVESTIGATING'

  // Pick source type and entity
  const sourceTypes: GraphNode['type'][] = ['account', 'account', 'account', 'device', 'email']
  const targetTypes: GraphNode['type'][] = ['device', 'ip', 'account', 'phone', 'email', 'account']
  const sourceType = randomFromArray(sourceTypes)
  const targetType = randomFromArray(targetTypes)

  let sourceId: string, sourceLabel: string
  let targetId: string, targetLabel: string

  if (sourceType === 'account') {
    sourceId = randomFromArray(ENTITY_POOL.accounts)
    sourceLabel = sourceId
  } else if (sourceType === 'device') {
    sourceId = randomFromArray(ENTITY_POOL.devices)
    sourceLabel = sourceId
  } else {
    sourceId = randomFromArray(ENTITY_POOL.emails)
    sourceLabel = sourceId
  }

  if (targetType === 'device') {
    targetId = randomFromArray(ENTITY_POOL.devices)
    targetLabel = targetId
  } else if (targetType === 'ip') {
    targetId = randomFromArray(ENTITY_POOL.ips)
    targetLabel = targetId
  } else if (targetType === 'phone') {
    targetId = randomFromArray(ENTITY_POOL.phones)
    targetLabel = targetId
  } else if (targetType === 'email') {
    targetId = randomFromArray(ENTITY_POOL.emails)
    targetLabel = targetId
  } else {
    targetId = randomFromArray(ENTITY_POOL.accounts)
    targetLabel = targetId
  }

  // Avoid self-loops
  if (sourceId === targetId) {
    targetId = targetId + '-2'
    targetLabel = targetId
  }

  const edgeLabel = randomFromArray(EDGE_TYPES)
  const annotation = (risk === 'BLOCK' || risk === 'FLAG') && Math.random() < 0.5
    ? randomFromArray(ANNOTATIONS)
    : undefined

  return { sourceId, sourceLabel, sourceType, targetId, targetLabel, targetType, edgeLabel, risk, annotation }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export interface OntologyClassificationProp {
  entityIds: string[]
  category: string
  leaf: string
  timestamp: number
}

interface Props {
  isStreaming: boolean
  ontologyClassification?: OntologyClassificationProp | null
}

export default function GraphNetworkViz({ isStreaming, ontologyClassification }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  const floatingLabelsRef = useRef<FloatingLabel[]>([])
  const animFrameRef = useRef<number>(0)
  const eventIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sizeRef = useRef<{ width: number; height: number }>({ width: 800, height: 500 })
  const [stats, setStats] = useState({ nodes: 0, edges: 0, clusters: 0 })

  // Add a new event to the graph
  const addEvent = useCallback((event: GraphEvent) => {
    const now = Date.now()
    const { width, height } = sizeRef.current

    // Add/update source node
    let source = nodesRef.current.find(n => n.id === event.sourceId)
    if (!source) {
      source = {
        id: event.sourceId,
        label: event.sourceLabel,
        type: event.sourceType,
        risk: event.risk,
        x: width / 2 + (Math.random() - 0.5) * 200,
        y: height / 2 + (Math.random() - 0.5) * 200,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        radius: 18,
        pulsePhase: 0,
        isPulsing: true,
        pulseStart: now,
        opacity: 0,
        birthTime: now,
      }
      nodesRef.current.push(source)
    } else {
      source.isPulsing = true
      source.pulseStart = now
      // Upgrade risk if worse
      if (riskSeverity(event.risk) > riskSeverity(source.risk)) {
        source.risk = event.risk
      }
    }

    // Add/update target node
    let target = nodesRef.current.find(n => n.id === event.targetId)
    if (!target) {
      // Place near source
      target = {
        id: event.targetId,
        label: event.targetLabel,
        type: event.targetType,
        risk: event.risk,
        x: (source.x || width / 2) + (Math.random() - 0.5) * 100,
        y: (source.y || height / 2) + (Math.random() - 0.5) * 100,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        radius: 16,
        pulsePhase: 0,
        isPulsing: true,
        pulseStart: now + 300, // delayed pulse
        opacity: 0,
        birthTime: now,
      }
      nodesRef.current.push(target)
    } else {
      target.isPulsing = true
      target.pulseStart = now + 300
      if (riskSeverity(event.risk) > riskSeverity(target.risk)) {
        target.risk = event.risk
      }
    }

    // Add annotation if present
    if (event.annotation) {
      source.annotation = event.annotation
      source.annotationExpiry = now + 5000
    }

    // Add edge
    const existingEdge = edgesRef.current.find(
      e => (e.source === event.sourceId && e.target === event.targetId) ||
           (e.source === event.targetId && e.target === event.sourceId)
    )
    if (!existingEdge) {
      edgesRef.current.push({
        source: event.sourceId,
        target: event.targetId,
        label: event.edgeLabel,
        pulseProgress: 0,
        isPulsing: true,
        pulseStart: now + 150,
        risk: event.risk,
      })
    } else {
      existingEdge.isPulsing = true
      existingEdge.pulseStart = now + 150
      existingEdge.pulseProgress = 0
      if (riskSeverity(event.risk) > riskSeverity(existingEdge.risk)) {
        existingEdge.risk = event.risk
      }
    }

    // Limit graph size
    if (nodesRef.current.length > 50) {
      const oldest = nodesRef.current[0]
      nodesRef.current = nodesRef.current.slice(1)
      edgesRef.current = edgesRef.current.filter(
        e => e.source !== oldest.id && e.target !== oldest.id
      )
    }

    // Count clusters (connected components with risk)
    const riskNodes = nodesRef.current.filter(n => n.risk === 'BLOCK' || n.risk === 'FLAG')
    setStats({
      nodes: nodesRef.current.length,
      edges: edgesRef.current.length,
      clusters: Math.max(1, Math.floor(riskNodes.length / 3)),
    })
  }, [])

  // Apply ontology classification from prop (driven by LiveStream/OntologyClassificationPanel)
  const applyOntologyClassification = useCallback((classification: OntologyClassificationProp) => {
    const now = Date.now()
    const nodes = nodesRef.current

    // Map category string to OntologyCategory type
    const categoryMap: Record<string, OntologyCategory> = {
      financial: 'financial',
      content_manipulation: 'content_manipulation',
      content: 'content_manipulation',
      social_engineering: 'social_engineering',
      platform_abuse: 'platform_abuse',
    }
    const category = categoryMap[classification.category] || 'financial'
    const leaf = classification.leaf

    // Classify matching entity nodes
    for (const entityId of classification.entityIds) {
      const node = nodes.find(n => n.id === entityId)
      if (node && !node.ontologyCategory) {
        node.ontologyCategory = category
        node.ontologyLeaf = leaf
        node.ontologyClassifiedAt = now
      }
    }

    // Create semantic edges between all nodes with same leaf classification
    const classifiedNodes = nodes.filter(n => n.ontologyLeaf === leaf)
    for (let i = 0; i < classifiedNodes.length; i++) {
      for (let j = i + 1; j < classifiedNodes.length; j++) {
        const existingSemantic = edgesRef.current.find(
          e => e.isSemantic &&
            ((e.source === classifiedNodes[i].id && e.target === classifiedNodes[j].id) ||
             (e.source === classifiedNodes[j].id && e.target === classifiedNodes[i].id))
        )
        if (!existingSemantic) {
          edgesRef.current.push({
            source: classifiedNodes[i].id,
            target: classifiedNodes[j].id,
            label: leaf,
            pulseProgress: 0,
            isPulsing: false,
            pulseStart: 0,
            risk: 'INVESTIGATING',
            isSemantic: true,
            semanticCategory: category,
          })
        }
      }
    }

    // Add floating label at cluster centroid if 2+ nodes share same leaf
    if (classifiedNodes.length >= 2) {
      const cx = classifiedNodes.reduce((s, n) => s + n.x, 0) / classifiedNodes.length
      const cy = classifiedNodes.reduce((s, n) => s + n.y, 0) / classifiedNodes.length
      const hasActive = floatingLabelsRef.current.some(
        fl => fl.text === leaf && (now - fl.createdAt) < fl.duration
      )
      if (!hasActive) {
        floatingLabelsRef.current.push({
          text: leaf,
          category,
          x: cx,
          y: cy - 40,
          createdAt: now,
          duration: 6000,
        })
      }
    }

    // Clean up expired floating labels
    floatingLabelsRef.current = floatingLabelsRef.current.filter(
      fl => (now - fl.createdAt) < fl.duration
    )
  }, [])

  // React to ontologyClassification prop changes
  useEffect(() => {
    if (ontologyClassification) {
      applyOntologyClassification(ontologyClassification)
    } else {
      // Domain changed — reset graph
      nodesRef.current = []
      edgesRef.current = []
      floatingLabelsRef.current = []
      setStats({ nodes: 0, edges: 0, clusters: 0 })
    }
  }, [ontologyClassification, applyOntologyClassification])

  // Start/stop event generation
  useEffect(() => {
    if (isStreaming) {
      // Fire one immediately
      addEvent(generateGraphEvent())
      eventIntervalRef.current = setInterval(() => {
        addEvent(generateGraphEvent())
      }, 1200 + Math.random() * 800)
    } else {
      if (eventIntervalRef.current) {
        clearInterval(eventIntervalRef.current)
        eventIntervalRef.current = null
      }
    }
    return () => {
      if (eventIntervalRef.current) {
        clearInterval(eventIntervalRef.current)
      }
    }
  }, [isStreaming, addEvent])

  // Canvas resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        sizeRef.current = { width, height }
        const canvas = canvasRef.current
        if (canvas) {
          canvas.width = width * window.devicePixelRatio
          canvas.height = height * window.devicePixelRatio
          canvas.style.width = `${width}px`
          canvas.style.height = `${height}px`
        }
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Animation loop
  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current
      if (!canvas) {
        animFrameRef.current = requestAnimationFrame(render)
        return
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        animFrameRef.current = requestAnimationFrame(render)
        return
      }

      const { width, height } = sizeRef.current
      const dpr = window.devicePixelRatio
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const now = Date.now()
      const nodes = nodesRef.current
      const edges = edgesRef.current

      // Apply force simulation
      applyForces(nodes, edges, width, height)

      // Draw edges
      for (const edge of edges) {
        const source = nodes.find(n => n.id === edge.source)
        const target = nodes.find(n => n.id === edge.target)
        if (!source || !target) continue

        // Semantic edges (ontology-derived) — dashed glowing lines
        if (edge.isSemantic && edge.semanticCategory) {
          const catColor = ONTOLOGY_COLORS[edge.semanticCategory]
          const catGlow = ONTOLOGY_GLOW[edge.semanticCategory]

          ctx.beginPath()
          ctx.moveTo(source.x, source.y)
          ctx.lineTo(target.x, target.y)
          ctx.setLineDash([6, 4])
          ctx.strokeStyle = catColor + '88'
          ctx.lineWidth = 1.5
          ctx.shadowColor = catGlow
          ctx.shadowBlur = 8
          ctx.stroke()
          ctx.shadowBlur = 0
          ctx.setLineDash([])

          // Semantic edge label at midpoint
          const mx = (source.x + target.x) / 2
          const my = (source.y + target.y) / 2
          ctx.font = '8px monospace'
          ctx.fillStyle = catColor + 'AA'
          ctx.textAlign = 'center'
          ctx.fillText(edge.label, mx, my - 5)
          continue
        }

        const color = RISK_COLORS[edge.risk]
        const elapsed = now - edge.pulseStart
        const pulsing = edge.isPulsing && elapsed < 2000 && elapsed >= 0

        // Base edge
        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        ctx.strokeStyle = pulsing
          ? color + 'AA'
          : RISK_COLORS[edge.risk] + '30'
        ctx.lineWidth = pulsing ? 2.5 : 1
        ctx.stroke()

        // Animated pulse dot traveling along edge
        if (pulsing && elapsed >= 0) {
          const progress = Math.min(1, elapsed / 1500)
          const px = source.x + (target.x - source.x) * progress
          const py = source.y + (target.y - source.y) * progress

          ctx.beginPath()
          ctx.arc(px, py, 4, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.shadowColor = RISK_GLOW[edge.risk]
          ctx.shadowBlur = 12
          ctx.fill()
          ctx.shadowBlur = 0

          // Trail
          const trail = Math.max(0, progress - 0.15)
          const tx = source.x + (target.x - source.x) * trail
          const ty = source.y + (target.y - source.y) * trail
          ctx.beginPath()
          ctx.moveTo(tx, ty)
          ctx.lineTo(px, py)
          ctx.strokeStyle = color + '80'
          ctx.lineWidth = 3
          ctx.stroke()
        }

        if (elapsed > 2000) {
          edge.isPulsing = false
        }

        // Edge label (only show when pulsing)
        if (pulsing) {
          const mx = (source.x + target.x) / 2
          const my = (source.y + target.y) / 2
          ctx.font = '9px monospace'
          ctx.fillStyle = 'rgba(255,255,255,0.6)'
          ctx.textAlign = 'center'
          ctx.fillText(edge.label, mx, my - 6)
        }
      }

      // Draw nodes
      for (const node of nodes) {
        // Fade in
        const age = now - node.birthTime
        node.opacity = Math.min(1, age / 500)

        const elapsed = now - node.pulseStart
        const pulsing = node.isPulsing && elapsed < 2500 && elapsed >= 0
        const color = RISK_COLORS[node.risk]
        const glowColor = RISK_GLOW[node.risk]

        ctx.globalAlpha = node.opacity

        // Ontology category outer ring
        if (node.ontologyCategory) {
          const catColor = ONTOLOGY_COLORS[node.ontologyCategory]
          const catGlow = ONTOLOGY_GLOW[node.ontologyCategory]
          const ringRadius = node.radius + 5
          const classifyAge = now - (node.ontologyClassifiedAt || now)
          const ringOpacity = Math.min(1, classifyAge / 800) // fade in over 800ms

          ctx.save()
          ctx.globalAlpha = node.opacity * ringOpacity

          // Outer glow
          ctx.beginPath()
          ctx.arc(node.x, node.y, ringRadius + 2, 0, Math.PI * 2)
          ctx.strokeStyle = catGlow
          ctx.lineWidth = 3
          ctx.shadowColor = catGlow
          ctx.shadowBlur = 10
          ctx.stroke()
          ctx.shadowBlur = 0

          // Solid ring
          ctx.beginPath()
          ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2)
          ctx.strokeStyle = catColor
          ctx.lineWidth = 2.5
          ctx.stroke()

          ctx.restore()
          ctx.globalAlpha = node.opacity
        }

        // Glow ring when pulsing
        if (pulsing) {
          const pulseScale = 1 + 0.4 * Math.sin((elapsed / 300) * Math.PI)
          const glowRadius = node.radius * pulseScale + 8

          ctx.beginPath()
          ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2)
          ctx.fillStyle = glowColor
          ctx.shadowColor = glowColor
          ctx.shadowBlur = 20
          ctx.fill()
          ctx.shadowBlur = 0
        }

        if (elapsed > 2500) {
          node.isPulsing = false
        }

        // Node circle
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        const gradient = ctx.createRadialGradient(
          node.x - 3, node.y - 3, 0,
          node.x, node.y, node.radius
        )
        gradient.addColorStop(0, color + 'CC')
        gradient.addColorStop(1, color + '44')
        ctx.fillStyle = gradient
        ctx.fill()
        ctx.strokeStyle = color + '88'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Icon
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(TYPE_ICONS[node.type], node.x, node.y)

        // Label
        ctx.font = '9px monospace'
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const shortLabel = node.label.length > 12 ? node.label.slice(0, 12) + '…' : node.label
        ctx.fillText(shortLabel, node.x, node.y + node.radius + 4)

        // Annotation callout
        if (node.annotation && node.annotationExpiry && now < node.annotationExpiry) {
          const fadeOut = Math.min(1, (node.annotationExpiry - now) / 1000)
          ctx.globalAlpha = node.opacity * fadeOut

          const annotX = node.x + 30
          const annotY = node.y - 30
          const text = node.annotation
          ctx.font = '10px sans-serif'
          const metrics = ctx.measureText(text)
          const pad = 6
          const boxW = metrics.width + pad * 2
          const boxH = 18

          // Callout background
          ctx.fillStyle = 'rgba(0,0,0,0.85)'
          ctx.strokeStyle = color + '88'
          ctx.lineWidth = 1
          roundRect(ctx, annotX - pad, annotY - boxH / 2, boxW, boxH, 4)
          ctx.fill()
          ctx.stroke()

          // Line from node to callout
          ctx.beginPath()
          ctx.moveTo(node.x + node.radius, node.y)
          ctx.lineTo(annotX - pad, annotY)
          ctx.strokeStyle = color + '44'
          ctx.lineWidth = 1
          ctx.setLineDash([2, 2])
          ctx.stroke()
          ctx.setLineDash([])

          // Text
          ctx.fillStyle = color
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          ctx.fillText(text, annotX, annotY)
        }

        ctx.globalAlpha = 1
      }

      // Draw floating ontology labels
      for (const fl of floatingLabelsRef.current) {
        const flAge = now - fl.createdAt
        if (flAge > fl.duration) continue

        // Fade in (first 800ms) and fade out (last 1000ms)
        let flAlpha = 1
        if (flAge < 800) {
          flAlpha = flAge / 800
        } else if (flAge > fl.duration - 1000) {
          flAlpha = (fl.duration - flAge) / 1000
        }

        const catColor = ONTOLOGY_COLORS[fl.category]
        const catGlow = ONTOLOGY_GLOW[fl.category]

        ctx.globalAlpha = flAlpha * 0.9

        // Update position to track cluster centroid
        const clusterNodes = nodes.filter(n => n.ontologyLeaf === fl.text)
        if (clusterNodes.length >= 2) {
          fl.x = clusterNodes.reduce((s, n) => s + n.x, 0) / clusterNodes.length
          fl.y = clusterNodes.reduce((s, n) => s + n.y, 0) / clusterNodes.length - 40
        }

        // Background pill
        ctx.font = 'bold 10px sans-serif'
        const textMetrics = ctx.measureText(fl.text)
        const pillW = textMetrics.width + 16
        const pillH = 20
        const pillX = fl.x - pillW / 2
        const pillY = fl.y - pillH / 2

        ctx.shadowColor = catGlow
        ctx.shadowBlur = 12
        roundRect(ctx, pillX, pillY, pillW, pillH, 10)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
        ctx.strokeStyle = catColor + 'AA'
        ctx.lineWidth = 1
        ctx.fill()
        ctx.stroke()
        ctx.shadowBlur = 0

        // Text
        ctx.fillStyle = catColor
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(fl.text, fl.x, fl.y)

        ctx.globalAlpha = 1
      }

      // Draw legend
      drawLegend(ctx, width)

      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header with stats */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Neptune Graph — Live Traversal</span>
          {isStreaming && <span className="live-dot" style={{ width: 6, height: 6 }} />}
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <span className="text-gray-500">Nodes: <span className="font-mono text-white">{stats.nodes}</span></span>
          <span className="text-gray-500">Edges: <span className="font-mono text-white">{stats.edges}</span></span>
          <span className="text-gray-500">Clusters: <span className="font-mono text-purple-400">{stats.clusters}</span></span>
        </div>
      </div>
      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ background: 'radial-gradient(ellipse at center, rgba(30,32,40,1) 0%, rgba(10,11,15,1) 100%)' }}
        />
        {!isStreaming && nodesRef.current.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Start the live stream to see the graph network build in real-time</p>
              <p className="text-gray-700 text-xs mt-1">Nodes represent entities • Edges represent Neptune relationships</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskSeverity(risk: RiskLevel): number {
  switch (risk) {
    case 'ALLOW': return 0
    case 'INVESTIGATING': return 1
    case 'FLAG': return 2
    case 'BLOCK': return 3
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawLegend(ctx: CanvasRenderingContext2D, canvasWidth: number) {
  const x = canvasWidth - 180
  const y = 12
  const riskItems: [string, string][] = [
    ['ALLOW (safe)', RISK_COLORS.ALLOW],
    ['FLAG (suspicious)', RISK_COLORS.FLAG],
    ['BLOCK (fraud)', RISK_COLORS.BLOCK],
    ['Investigating', RISK_COLORS.INVESTIGATING],
  ]

  const ontologyItems: [string, string][] = [
    ['Financial', ONTOLOGY_COLORS.financial],
    ['Content Manip.', ONTOLOGY_COLORS.content_manipulation],
    ['Social Eng.', ONTOLOGY_COLORS.social_engineering],
    ['Platform Abuse', ONTOLOGY_COLORS.platform_abuse],
  ]

  ctx.font = '9px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  // Risk legend
  for (let i = 0; i < riskItems.length; i++) {
    const [label, color] = riskItems[i]
    const iy = y + i * 16

    ctx.beginPath()
    ctx.arc(x + 5, iy + 6, 4, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText(label, x + 14, iy + 6)
  }

  // Ontology category legend (ring indicators)
  const ontY = y + riskItems.length * 16 + 10
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '8px monospace'
  ctx.fillText('── Ontology Ring ──', x, ontY)

  for (let i = 0; i < ontologyItems.length; i++) {
    const [label, color] = ontologyItems[i]
    const iy = ontY + 12 + i * 16

    // Draw a ring indicator instead of filled circle
    ctx.beginPath()
    ctx.arc(x + 5, iy + 6, 4, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '9px monospace'
    ctx.fillText(label, x + 14, iy + 6)
  }
}
