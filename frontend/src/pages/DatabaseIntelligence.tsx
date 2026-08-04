interface Props { domain: string }

export default function DatabaseIntelligence({ domain }: Props) {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white">Database-Layer Intelligence</h2>
        <p className="text-sm text-gray-500 mt-1">How purpose-built databases create a defense system that improves with every decision</p>
      </div>

      {/* Core Concept */}
      <div className="glass-card p-6">
        <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg, rgba(87,148,242,0.06), rgba(183,119,217,0.06))' }}>
          <p className="text-sm text-gray-300 leading-relaxed">
            Each database in this architecture contributes a <strong className="text-white">unique intelligence dimension</strong> that the others cannot replicate. 
            DynamoDB provides temporal context, Aurora pgvector understands content meaning, Neptune reveals hidden relationships, 
            and ElastiCache stores learned attack patterns. Together they form a system where 
            <strong className="text-white"> blocking one attacker automatically teaches the system to block similar future attacks</strong> — 
            even from completely new, never-before-seen entities.
          </p>
        </div>
      </div>

      {/* The 4 Intelligence Layers */}
      <div className="glass-card p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-5">What Each Database Uniquely Contributes</p>
        <div className="grid grid-cols-2 gap-4">

          {/* DynamoDB */}
          <div className="rounded-xl p-5" style={{ background: '#FF983006', border: '1px solid #FF983020' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full" style={{ background: '#FF9830', boxShadow: '0 0 8px #FF983060' }} />
              <span className="text-sm font-semibold text-white">DynamoDB — Temporal Context</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
              Tracks <strong className="text-gray-200">event history and velocity</strong>. The pipeline queries events in the last 5 minutes to compute velocity scores. 
              The escalation stage checks score history — entities flagged 3+ times prior are auto-escalated regardless of current content.
            </p>
            <div className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.3)' }}>
              <p className="text-[10px] font-mono" style={{ color: '#FF9830' }}>How it helps:</p>
              <p className="text-[10px] text-gray-500 mt-1">Entity flagged 3× previously → score boosted +0.15. Flagged 5× → auto-BLOCK. Without temporal history, each attempt looks independent.</p>
            </div>
          </div>

          {/* Aurora pgvector */}
          <div className="rounded-xl p-5" style={{ background: '#5794F206', border: '1px solid #5794F220' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full" style={{ background: '#5794F2', boxShadow: '0 0 8px #5794F260' }} />
              <span className="text-sm font-semibold text-white">Aurora pgvector — Semantic Understanding</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
              Converts content into 1024-dimensional embeddings (via Bedrock Titan) and performs cosine similarity search against 
              a library of known threat patterns. Catches content that <strong className="text-gray-200">means the same thing but uses different words</strong>.
            </p>
            <div className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.3)' }}>
              <p className="text-[10px] font-mono" style={{ color: '#5794F2' }}>How it helps:</p>
              <p className="text-[10px] text-gray-500 mt-1">Attacker rephrases a scam message completely — keyword matching fails, but embedding similarity still scores 0.88 against known patterns.</p>
            </div>
          </div>

          {/* Neptune */}
          <div className="rounded-xl p-5" style={{ background: '#B877D906', border: '1px solid #B877D920' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full" style={{ background: '#B877D9', boxShadow: '0 0 8px #B877D960' }} />
              <span className="text-sm font-semibold text-white">Neptune Analytics — Relationship Discovery</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
              Performs 3-hop graph traversal to find direct connections, indirect connections through intermediaries, 
              shared devices, and ring membership. Reveals <strong className="text-gray-200">guilt by association</strong> that's invisible without graph structure.
            </p>
            <div className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.3)' }}>
              <p className="text-[10px] font-mono" style={{ color: '#B877D9' }}>How it helps:</p>
              <p className="text-[10px] text-gray-500 mt-1">Account looks clean individually, but Neptune finds it shares a device fingerprint with 23 other sessions in a known bot ring — graph score jumps to 0.66.</p>
            </div>
          </div>

          {/* ElastiCache */}
          <div className="rounded-xl p-5" style={{ background: '#F2495C06', border: '1px solid #F2495C20' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full" style={{ background: '#F2495C', boxShadow: '0 0 8px #F2495C60' }} />
              <span className="text-sm font-semibold text-white">ElastiCache Valkey — Pattern Learning</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
              When the pipeline produces a CHALLENGE or BLOCK decision, the content embedding is stored as a "known-bad pattern." 
              On subsequent requests, incoming content is compared against these stored patterns. If similarity ≥75%, 
              the entity is <strong className="text-gray-200">instant-blocked without running the full pipeline</strong>.
            </p>
            <div className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.3)' }}>
              <p className="text-[10px] font-mono" style={{ color: '#F2495C' }}>How it helps:</p>
              <p className="text-[10px] text-gray-500 mt-1">Brand new user, no history, no graph connections — but content is 83% similar to a previously-blocked pattern → instant BLOCK without full analysis.</p>
            </div>
          </div>
        </div>
      </div>

      {/* The Learning Loop */}
      <div className="glass-card p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">How the System Learns</p>
        <div className="rounded-xl p-5" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center justify-between">
            {[
              { step: '1', label: 'New Attack', desc: 'Unknown entity, unknown pattern', color: '#FF9830' },
              { step: '2', label: 'Full Pipeline', desc: 'All 4 DBs evaluate (semantic + graph + features)', color: '#5794F2' },
              { step: '3', label: 'Decision', desc: 'Convergence of signals → BLOCK', color: '#F2495C' },
              { step: '4', label: 'Pattern Stored', desc: 'Content embedding saved as known-bad', color: '#B877D9' },
              { step: '5', label: 'Next Attack', desc: 'Similar content → pattern match → instant block', color: '#73BF69' },
            ].map((s, i) => (
              <div key={s.step} className="flex items-center">
                <div className="text-center" style={{ width: '120px' }}>
                  <div className="w-8 h-8 rounded-full mx-auto flex items-center justify-center text-xs font-bold text-white" style={{ background: `${s.color}30`, border: `2px solid ${s.color}` }}>
                    {s.step}
                  </div>
                  <p className="text-[10px] font-medium text-white mt-2">{s.label}</p>
                  <p className="text-[9px] text-gray-500 mt-0.5">{s.desc}</p>
                </div>
                {i < 4 && <span className="text-gray-600 mx-1">→</span>}
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-center">
            <div className="rounded-full px-4 py-1.5" style={{ background: 'rgba(115,191,105,0.08)', border: '1px solid rgba(115,191,105,0.2)' }}>
              <p className="text-[10px] text-center" style={{ color: '#73BF69' }}>
                ↻ Each BLOCK decision adds a new pattern — similar future attacks are caught faster
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* What a Single Database Misses */}
      <div className="glass-card p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Attack Scenarios: Single DB vs Multi-DB</p>
        <div className="space-y-3">
          {[
            {
              attack: 'Rephrased content (different words, same intent)',
              singleDb: 'Keyword/regex match fails — no match found',
              multiDb: 'pgvector cosine similarity still matches known threat pattern',
              icon: '🔤',
            },
            {
              attack: 'Clean account sharing a device with a known bot ring',
              singleDb: 'No rule violation on this account — passes',
              multiDb: 'Neptune 3-hop traversal reveals shared device with flagged entities',
              icon: '🕸️',
            },
            {
              attack: 'New user with content matching prior blocked attacks',
              singleDb: 'No history for this user — passes',
              multiDb: 'Pattern cache matches content embedding at ≥75% similarity → blocked',
              icon: '⚡',
            },
            {
              attack: 'Repeat offender with clean-looking current request',
              singleDb: 'Current request looks normal — passes',
              multiDb: 'DynamoDB score history shows 5 prior flags → auto-escalation to BLOCK',
              icon: '🕐',
            },
            {
              attack: 'Bot rotating IPs, devices, and accounts each request',
              singleDb: 'Every identifier is new — no way to correlate',
              multiDb: 'Content embedding stays consistent → pgvector + pattern cache catches it',
              icon: '🎭',
            },
          ].map((row) => (
            <div key={row.attack} className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <span className="text-base">{row.icon}</span>
                <span className="text-xs font-medium text-white">{row.attack}</span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-700">
                <div className="px-4 py-3" style={{ background: 'rgba(242,73,92,0.05)' }}>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">Single Database</p>
                  <p className="text-[11px] text-red-300">{row.singleDb}</p>
                </div>
                <div className="px-4 py-3" style={{ background: 'rgba(115,191,105,0.05)' }}>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">Multi-DB Architecture</p>
                  <p className="text-[11px] text-green-300">{row.multiDb}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Signal Convergence — from actual code */}
      <div className="glass-card p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Signal Convergence (from scoring logic)</p>
        <p className="text-[11px] text-gray-400 mb-4">
          The scoring engine counts how many independent signals exceed their thresholds (similarity &gt; 0.5, graph &gt; 0.3, behavioral &gt; 0.3, velocity &gt; 0.3). 
          When multiple databases agree, the composite score is amplified:
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-2xl font-bold text-white">1 signal</p>
            <p className="text-[10px] text-gray-500 mt-1">Only one DB flags it</p>
            <p className="text-sm font-mono mt-2 text-gray-400">score × 1.0</p>
            <p className="text-[10px] text-gray-600 mt-1">Low confidence — could be noise</p>
          </div>
          <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(250,222,42,0.04)', border: '1px solid rgba(250,222,42,0.12)' }}>
            <p className="text-2xl font-bold text-white">2 signals</p>
            <p className="text-[10px] text-gray-500 mt-1">Two DBs agree</p>
            <p className="text-sm font-mono mt-2" style={{ color: '#FADE2A' }}>score × 1.7</p>
            <p className="text-[10px] text-gray-600 mt-1">Medium confidence — likely suspicious</p>
          </div>
          <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(242,73,92,0.04)', border: '1px solid rgba(242,73,92,0.12)' }}>
            <p className="text-2xl font-bold text-white">3+ signals</p>
            <p className="text-[10px] text-gray-500 mt-1">Three or more DBs agree</p>
            <p className="text-sm font-mono mt-2" style={{ color: '#F2495C' }}>score × 2.2</p>
            <p className="text-[10px] text-gray-600 mt-1">High confidence — strong convergence</p>
          </div>
        </div>
        <div className="mt-4 rounded-lg p-3 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-[10px] text-gray-500">This is why multiple databases matter: a single DB can only produce one signal. 
            With 4 independent signals that either converge or diverge, the system can distinguish true threats from false positives.</p>
        </div>
      </div>

      {/* Key Takeaway */}
      <div className="glass-card p-6">
        <div className="rounded-xl p-5 text-center" style={{ background: 'linear-gradient(135deg, rgba(87,148,242,0.05), rgba(115,191,105,0.05))' }}>
          <p className="text-lg font-bold text-white mb-2">Why This Matters</p>
          <p className="text-xs text-gray-400 leading-relaxed max-w-2xl mx-auto">
            Each BLOCK decision deposits intelligence back into the system: an embedding into pgvector's pattern library, 
            a pattern into the Valkey cache, a score record into DynamoDB's history, and relationship edges into Neptune. 
            The result is a system where <strong className="text-white">later attacks matching known patterns are caught faster and with higher confidence</strong> 
            than the first occurrence — because each database layer retains what it learned from prior decisions.
          </p>
        </div>
      </div>
    </div>
  )
}
