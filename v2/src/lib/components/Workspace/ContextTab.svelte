<script lang="ts">
  import { getAgentSession, getTotalCost, type AgentSession } from '../../stores/agents.svelte';
  import type { AgentMessage, ToolCallContent, CostContent, CompactionContent } from '../../adapters/claude-messages';
  import { extractFilePaths } from '../../utils/tool-files';

  interface Props {
    sessionId: string | null;
  }

  let { sessionId }: Props = $props();

  // Reactive session data
  let session = $derived(sessionId ? getAgentSession(sessionId) : undefined);
  let messages = $derived(session?.messages ?? []);
  let totalCost = $derived(sessionId ? getTotalCost(sessionId) : { costUsd: 0, inputTokens: 0, outputTokens: 0 });

  // Context window size (Claude 3.5 Sonnet = 200k, Opus = 200k)
  const CONTEXT_WINDOW = 200_000;

  // --- Compaction tracking ---
  interface CompactionEvent {
    timestamp: number;
    trigger: 'manual' | 'auto';
    preTokens: number;
    messageIndex: number;
  }

  let compactions = $derived.by((): CompactionEvent[] => {
    const events: CompactionEvent[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.type === 'compaction') {
        const c = msg.content as CompactionContent;
        events.push({
          timestamp: msg.timestamp,
          trigger: c.trigger,
          preTokens: c.preTokens,
          messageIndex: i,
        });
      }
    }
    return events;
  });

  let lastCompaction = $derived(compactions.length > 0 ? compactions[compactions.length - 1] : null);

  // --- Token category breakdown ---
  interface TokenCategory {
    label: string;
    tokens: number;
    color: string;
    pct: number;
  }

  let categories = $derived.by(() => {
    const msgs = messages;
    let toolCallTokens = 0;
    let toolResultTokens = 0;
    let textTokens = 0;
    let thinkingTokens = 0;
    let otherTokens = 0;

    for (const msg of msgs) {
      const est = estimateTokens(msg);
      switch (msg.type) {
        case 'tool_call': toolCallTokens += est; break;
        case 'tool_result': toolResultTokens += est; break;
        case 'text': textTokens += est; break;
        case 'thinking': thinkingTokens += est; break;
        default: otherTokens += est; break;
      }
    }

    const total = totalCost.inputTokens || (toolCallTokens + toolResultTokens + textTokens + thinkingTokens + otherTokens);
    if (total === 0) return [];

    const cats: TokenCategory[] = [];
    const add = (label: string, tokens: number, color: string) => {
      if (tokens > 0) cats.push({ label, tokens, color, pct: (tokens / CONTEXT_WINDOW) * 100 });
    };

    add('Assistant', textTokens, 'var(--ctp-green)');
    add('Thinking', thinkingTokens, 'var(--ctp-mauve)');
    add('Tool Calls', toolCallTokens, 'var(--ctp-peach)');
    add('Tool Results', toolResultTokens, 'var(--ctp-blue)');
    add('Other', otherTokens, 'var(--ctp-overlay1)');

    return cats;
  });

  let meterFillPct = $derived(() => {
    const total = totalCost.inputTokens;
    return total > 0 ? Math.min((total / CONTEXT_WINDOW) * 100, 100) : 0;
  });

  // --- Turn groups ---
  interface TurnGroup {
    index: number;
    userPrompt: string;
    messages: AgentMessage[];
    toolCalls: { name: string; input: string }[];
    estimatedTokens: number;
  }

  let turns = $derived.by(() => {
    const msgs = messages;
    const groups: TurnGroup[] = [];
    let current: TurnGroup | null = null;
    let turnIdx = 0;

    for (const msg of msgs) {
      if (msg.type === 'text' && !current) {
        // First text from assistant before any user prompt
        current = { index: turnIdx++, userPrompt: '(initial)', messages: [msg], toolCalls: [], estimatedTokens: 0 };
      } else if (msg.type === 'init' || msg.type === 'status') {
        if (current) current.messages.push(msg);
        else {
          current = { index: turnIdx++, userPrompt: '(session start)', messages: [msg], toolCalls: [], estimatedTokens: 0 };
        }
      } else if (msg.type === 'cost') {
        if (current) {
          current.messages.push(msg);
          groups.push(current);
          current = null;
        }
      } else {
        if (!current) {
          current = { index: turnIdx++, userPrompt: '', messages: [], toolCalls: [], estimatedTokens: 0 };
        }
        current.messages.push(msg);
        if (msg.type === 'tool_call') {
          const tc = msg.content as ToolCallContent;
          current.toolCalls.push({
            name: tc.name,
            input: typeof tc.input === 'string' ? tc.input.slice(0, 100) : JSON.stringify(tc.input).slice(0, 100),
          });
        }
      }
    }
    if (current && current.messages.length > 0) groups.push(current);

    // Compute estimated tokens per turn
    for (const g of groups) {
      g.estimatedTokens = g.messages.reduce((sum, m) => sum + estimateTokens(m), 0);
    }

    return groups;
  });

  // --- File references ---
  interface FileRef {
    path: string;
    shortName: string;
    ops: Set<string>; // 'read', 'write', 'grep', 'bash', etc.
    count: number;
  }

  let fileRefs = $derived.by(() => {
    const refs = new Map<string, FileRef>();
    for (const msg of messages) {
      if (msg.type !== 'tool_call') continue;
      const tc = msg.content as ToolCallContent;
      const files = extractFilePaths(tc);
      for (const { path, op } of files) {
        const existing = refs.get(path);
        if (existing) {
          existing.ops.add(op);
          existing.count++;
        } else {
          refs.set(path, {
            path,
            shortName: path.split('/').pop() ?? path,
            ops: new Set([op]),
            count: 1,
          });
        }
      }
    }
    return Array.from(refs.values()).sort((a, b) => b.count - a.count);
  });

  // --- Helpers ---
  function estimateTokens(msg: AgentMessage): number {
    const content = msg.content;
    if (!content) return 0;
    if (msg.type === 'cost') return 0; // meta, not in context
    let text = '';
    if (typeof content === 'string') text = content;
    else if (typeof content === 'object' && content !== null) {
      if ('text' in content) text = String((content as Record<string, unknown>).text ?? '');
      else if ('output' in content) text = String((content as Record<string, unknown>).output ?? '');
      else if ('name' in content) text = JSON.stringify(content);
      else text = JSON.stringify(content);
    }
    // ~4 chars per token
    return Math.ceil(text.length / 4);
  }


  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  function formatCost(usd: number): string {
    if (usd === 0) return '$0.00';
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(2)}`;
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  }

  function opColor(op: string): string {
    switch (op) {
      case 'read': return 'var(--ctp-blue)';
      case 'write': return 'var(--ctp-peach)';
      case 'grep': return 'var(--ctp-mauve)';
      case 'glob': return 'var(--ctp-teal)';
      case 'bash': return 'var(--ctp-yellow)';
      default: return 'var(--ctp-overlay1)';
    }
  }

  function msgTypeLabel(type: string): string {
    switch (type) {
      case 'text': return 'Assistant';
      case 'thinking': return 'Thinking';
      case 'tool_call': return 'Tool Call';
      case 'tool_result': return 'Tool Result';
      case 'init': return 'Init';
      case 'cost': return 'Cost';
      case 'error': return 'Error';
      case 'status': return 'Status';
      default: return type;
    }
  }

  function msgTypeColor(type: string): string {
    switch (type) {
      case 'text': return 'var(--ctp-green)';
      case 'thinking': return 'var(--ctp-mauve)';
      case 'tool_call': return 'var(--ctp-peach)';
      case 'tool_result': return 'var(--ctp-blue)';
      case 'error': return 'var(--ctp-red)';
      default: return 'var(--ctp-overlay1)';
    }
  }

  // Expanded turn tracking
  let expandedTurns = $state<Set<number>>(new Set());

  function toggleTurn(idx: number) {
    const next = new Set(expandedTurns);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    expandedTurns = next;
  }

  // --- Sub-tab navigation ---
  type ContextSubTab = 'overview' | 'ast' | 'graph';
  let activeSubTab = $state<ContextSubTab>('overview');

  // --- AST Tree ---
  interface AstNode {
    id: string;
    label: string;
    type: 'turn' | 'thinking' | 'text' | 'tool_call' | 'tool_result' | 'file' | 'error';
    color: string;
    tokens: number;
    children: AstNode[];
    detail?: string;
  }

  let astTree = $derived.by((): AstNode[] => {
    const turnNodes: AstNode[] = [];
    let turnIdx = 0;
    let currentTurn: AstNode | null = null;
    let currentToolCall: AstNode | null = null;

    for (const msg of messages) {
      if (msg.type === 'init' || msg.type === 'status') continue;

      if (msg.type === 'compaction') {
        // Insert compaction boundary marker
        if (currentTurn) {
          turnNodes.push(currentTurn);
          currentTurn = null;
          currentToolCall = null;
        }
        const c = msg.content as CompactionContent;
        turnNodes.push({
          id: `compact-${msg.id}`,
          label: `Compacted (${c.trigger})`,
          type: 'turn',
          color: 'var(--ctp-red)',
          tokens: c.preTokens,
          children: [{
            id: `compact-detail-${msg.id}`,
            label: `${formatTokens(c.preTokens)} tokens removed`,
            type: 'error',
            color: 'var(--ctp-red)',
            tokens: 0,
            children: [],
            detail: `Context was ${c.trigger === 'auto' ? 'automatically' : 'manually'} compacted. ${formatTokens(c.preTokens)} tokens of earlier conversation were summarized.`,
          }],
        });
        continue;
      }

      if (msg.type === 'cost') {
        // End of turn
        if (currentTurn) {
          turnNodes.push(currentTurn);
          currentTurn = null;
          currentToolCall = null;
        }
        continue;
      }

      // Start new turn if needed
      if (!currentTurn) {
        currentTurn = {
          id: `turn-${turnIdx}`,
          label: `Turn ${++turnIdx}`,
          type: 'turn',
          color: 'var(--ctp-lavender)',
          tokens: 0,
          children: [],
        };
      }

      const est = estimateTokens(msg);
      currentTurn.tokens += est;

      if (msg.type === 'thinking') {
        currentTurn.children.push({
          id: `think-${msg.id}`,
          label: 'Thinking',
          type: 'thinking',
          color: 'var(--ctp-mauve)',
          tokens: est,
          children: [],
          detail: truncateText(extractText(msg), 60),
        });
        currentToolCall = null;
      } else if (msg.type === 'text') {
        currentTurn.children.push({
          id: `text-${msg.id}`,
          label: 'Response',
          type: 'text',
          color: 'var(--ctp-green)',
          tokens: est,
          children: [],
          detail: truncateText(extractText(msg), 60),
        });
        currentToolCall = null;
      } else if (msg.type === 'tool_call') {
        const tc = msg.content as ToolCallContent;
        const tcNode: AstNode = {
          id: `tc-${tc.toolUseId}`,
          label: tc.name,
          type: 'tool_call',
          color: 'var(--ctp-peach)',
          tokens: est,
          children: [],
        };

        // Add file references as children of tool call
        const files = extractFilePaths(tc);
        for (const f of files) {
          tcNode.children.push({
            id: `file-${tc.toolUseId}-${f.path}`,
            label: f.path.split('/').pop() ?? f.path,
            type: 'file',
            color: opColor(f.op),
            tokens: 0,
            children: [],
            detail: f.path,
          });
        }

        currentTurn.children.push(tcNode);
        currentToolCall = tcNode;
      } else if (msg.type === 'tool_result') {
        // Attach result size to the matching tool call
        if (currentToolCall) {
          currentToolCall.tokens += est;
          currentToolCall.detail = `${formatTokens(currentToolCall.tokens)} tokens`;
        }
      } else if (msg.type === 'error') {
        currentTurn.children.push({
          id: `err-${msg.id}`,
          label: 'Error',
          type: 'error',
          color: 'var(--ctp-red)',
          tokens: est,
          children: [],
          detail: extractText(msg),
        });
      }
    }

    // Push final turn if not ended by cost
    if (currentTurn && currentTurn.children.length > 0) {
      turnNodes.push(currentTurn);
    }

    return turnNodes;
  });

  // --- Tool Graph ---
  interface GraphNode {
    id: string;
    label: string;
    type: 'file' | 'tool';
    x: number;
    y: number;
    color: string;
    count: number;
  }

  interface GraphEdge {
    from: string;
    to: string;
    op: string;
    color: string;
  }

  let toolGraph = $derived.by((): { nodes: GraphNode[]; edges: GraphEdge[] } => {
    const fileNodes = new Map<string, { label: string; count: number; ops: Set<string> }>();
    const toolNodes = new Map<string, { count: number }>();
    const edges: GraphEdge[] = [];

    for (const msg of messages) {
      if (msg.type !== 'tool_call') continue;
      const tc = msg.content as ToolCallContent;
      const toolName = tc.name;

      // Track tool node
      const existing = toolNodes.get(toolName);
      if (existing) existing.count++;
      else toolNodes.set(toolName, { count: 1 });

      // Track file nodes and edges
      const files = extractFilePaths(tc);
      for (const f of files) {
        const fNode = fileNodes.get(f.path);
        if (fNode) {
          fNode.count++;
          fNode.ops.add(f.op);
        } else {
          fileNodes.set(f.path, {
            label: f.path.split('/').pop() ?? f.path,
            count: 1,
            ops: new Set([f.op]),
          });
        }

        edges.push({
          from: `tool-${toolName}`,
          to: `file-${f.path}`,
          op: f.op,
          color: opColor(f.op),
        });
      }
    }

    // Layout: tools on left, files on right
    const nodes: GraphNode[] = [];
    const toolList = Array.from(toolNodes.entries()).sort((a, b) => b[1].count - a[1].count);
    const fileList = Array.from(fileNodes.entries()).sort((a, b) => b[1].count - a[1].count);

    const NODE_SPACING = 36;
    const LEFT_X = 20;
    const RIGHT_X = 220;

    toolList.forEach(([name, data], i) => {
      nodes.push({
        id: `tool-${name}`,
        label: name,
        type: 'tool',
        x: LEFT_X,
        y: 20 + i * NODE_SPACING,
        color: toolColor(name),
        count: data.count,
      });
    });

    fileList.forEach(([path, data], i) => {
      nodes.push({
        id: `file-${path}`,
        label: data.label,
        type: 'file',
        x: RIGHT_X,
        y: 20 + i * NODE_SPACING,
        color: 'var(--ctp-text)',
        count: data.count,
      });
    });

    // Deduplicate edges (same from→to, aggregate)
    const edgeMap = new Map<string, GraphEdge>();
    for (const e of edges) {
      const key = `${e.from}→${e.to}`;
      if (!edgeMap.has(key)) edgeMap.set(key, e);
    }

    return { nodes, edges: Array.from(edgeMap.values()) };
  });

  // AST layout helpers
  const AST_NODE_W = 110;
  const AST_NODE_H = 28;
  const AST_H_GAP = 16;
  const AST_V_GAP = 6;

  interface AstLayout {
    node: AstNode;
    x: number;
    y: number;
    children: AstLayout[];
  }

  function layoutAst(node: AstNode, x: number, y: number): { layout: AstLayout; height: number } {
    if (node.children.length === 0) {
      return { layout: { node, x, y, children: [] }, height: AST_NODE_H };
    }

    const childLayouts: AstLayout[] = [];
    let childY = y;
    let totalHeight = 0;

    for (const child of node.children) {
      const result = layoutAst(child, x + AST_NODE_W + AST_H_GAP, childY);
      childLayouts.push(result.layout);
      childY += result.height + AST_V_GAP;
      totalHeight += result.height + AST_V_GAP;
    }
    totalHeight -= AST_V_GAP;

    const parentY = childLayouts.length > 0
      ? (childLayouts[0].y + childLayouts[childLayouts.length - 1].y) / 2
      : y;

    return {
      layout: { node, x, y: parentY, children: childLayouts },
      height: Math.max(AST_NODE_H, totalHeight),
    };
  }

  function astSvgWidth(layout: AstLayout): number {
    let maxX = layout.x + AST_NODE_W;
    for (const child of layout.children) maxX = Math.max(maxX, astSvgWidth(child));
    return maxX + 12;
  }

  // Helpers
  function extractText(msg: AgentMessage): string {
    const c = msg.content;
    if (typeof c === 'string') return c;
    if (c && typeof c === 'object' && 'text' in c) return String((c as Record<string, unknown>).text ?? '');
    if (c && typeof c === 'object' && 'message' in c) return String((c as Record<string, unknown>).message ?? '');
    return '';
  }

  function truncateText(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 1) + '…';
  }

  function toolColor(name: string): string {
    switch (name) {
      case 'Read': case 'read': return 'var(--ctp-blue)';
      case 'Write': case 'write': return 'var(--ctp-peach)';
      case 'Edit': case 'edit': return 'var(--ctp-peach)';
      case 'Grep': case 'grep': return 'var(--ctp-mauve)';
      case 'Glob': case 'glob': return 'var(--ctp-teal)';
      case 'Bash': case 'bash': return 'var(--ctp-yellow)';
      case 'Agent': case 'Task': return 'var(--ctp-flamingo)';
      default: return 'var(--ctp-sapphire)';
    }
  }
</script>

<div class="context-tab">
  {#if !session}
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <p class="empty-title">No active session</p>
      <p class="empty-hint">Start an agent session to see context window analysis</p>
    </div>
  {:else}
    <!-- Sub-tab switcher -->
    <div class="sub-tabs">
      <button class="sub-tab" class:active={activeSubTab === 'overview'} onclick={() => activeSubTab = 'overview'}>Overview</button>
      <button class="sub-tab" class:active={activeSubTab === 'ast'} onclick={() => activeSubTab = 'ast'}>AST</button>
      <button class="sub-tab" class:active={activeSubTab === 'graph'} onclick={() => activeSubTab = 'graph'}>Graph</button>
    </div>

    <!-- Overview panel -->
    <div class="sub-panel" style:display={activeSubTab === 'overview' ? 'flex' : 'none'}>
    <!-- Stats Bar -->
    <div class="stats-bar">
      <div class="stat">
        <span class="stat-value">{formatTokens(totalCost.inputTokens)}</span>
        <span class="stat-label">input</span>
      </div>
      <div class="stat">
        <span class="stat-value">{formatTokens(totalCost.outputTokens)}</span>
        <span class="stat-label">output</span>
      </div>
      <div class="stat">
        <span class="stat-value">{session.numTurns}</span>
        <span class="stat-label">turns</span>
      </div>
      <div class="stat">
        <span class="stat-value cost">{formatCost(totalCost.costUsd)}</span>
        <span class="stat-label">cost</span>
      </div>
      <div class="stat">
        <span class="stat-value">{formatDuration(session.durationMs)}</span>
        <span class="stat-label">time</span>
      </div>
      <div class="stat status-pill" class:running={session.status === 'running'} class:done={session.status === 'done'} class:error={session.status === 'error'}>
        <span class="stat-value">{session.status}</span>
      </div>
      {#if compactions.length > 0}
        <div class="stat compaction-pill" title="Context compacted {compactions.length} time{compactions.length > 1 ? 's' : ''}. Last: {lastCompaction?.trigger} ({formatTokens(lastCompaction?.preTokens ?? 0)} tokens summarized)">
          <span class="stat-value">{compactions.length}×</span>
          <span class="stat-label">compacted</span>
        </div>
      {/if}
    </div>

    <!-- Context Meter -->
    <div class="meter-section">
      <div class="meter-header">
        <span class="meter-title">Context Window</span>
        <span class="meter-usage">{formatTokens(totalCost.inputTokens)} / {formatTokens(CONTEXT_WINDOW)}</span>
      </div>
      <div class="meter-bar">
        {#each categories as cat}
          <div
            class="meter-segment"
            style="width: {cat.pct}%; background: {cat.color}"
            title="{cat.label}: {formatTokens(cat.tokens)} ({cat.pct.toFixed(1)}%)"
          ></div>
        {/each}
        <div class="meter-empty" style="flex: 1"></div>
      </div>
      <div class="meter-legend">
        {#each categories as cat}
          <div class="legend-item">
            <span class="legend-dot" style="background: {cat.color}"></span>
            <span class="legend-label">{cat.label}</span>
            <span class="legend-value">{formatTokens(cat.tokens)}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- File References -->
    {#if fileRefs.length > 0}
      <div class="files-section">
        <div class="section-header">
          <span class="section-title">Files Touched</span>
          <span class="section-count">{fileRefs.length}</span>
        </div>
        <div class="files-list">
          {#each fileRefs.slice(0, 30) as ref (ref.path)}
            <div class="file-ref">
              <div class="file-ops">
                {#each Array.from(ref.ops) as op}
                  <span class="file-op" style="color: {opColor(op)}" title="{op}">{op[0].toUpperCase()}</span>
                {/each}
              </div>
              <span class="file-name" title={ref.path}>{ref.shortName}</span>
              <span class="file-count">{ref.count}×</span>
            </div>
          {/each}
          {#if fileRefs.length > 30}
            <div class="files-more">+{fileRefs.length - 30} more</div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Turn Breakdown -->
    <div class="turns-section">
      <div class="section-header">
        <span class="section-title">Turns</span>
        <span class="section-count">{turns.length}</span>
      </div>
      <div class="turns-list">
        {#each turns as turn (turn.index)}
          <div class="turn-group">
            <button class="turn-header" onclick={() => toggleTurn(turn.index)}>
              <span class="turn-chevron" class:open={expandedTurns.has(turn.index)}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span class="turn-index">#{turn.index + 1}</span>
              <span class="turn-tools">
                {#each turn.toolCalls.slice(0, 3) as tc}
                  <span class="turn-tool-badge">{tc.name}</span>
                {/each}
                {#if turn.toolCalls.length > 3}
                  <span class="turn-tool-more">+{turn.toolCalls.length - 3}</span>
                {/if}
              </span>
              <span class="turn-tokens">{formatTokens(turn.estimatedTokens)}</span>
            </button>

            {#if expandedTurns.has(turn.index)}
              <div class="turn-detail">
                {#each turn.messages as msg}
                  {#if msg.type !== 'cost' && msg.type !== 'status' && msg.type !== 'init'}
                    <div class="turn-msg">
                      <span class="turn-msg-type" style="color: {msgTypeColor(msg.type)}">{msgTypeLabel(msg.type)}</span>
                      <span class="turn-msg-tokens">~{formatTokens(estimateTokens(msg))}</span>
                      {#if msg.type === 'tool_call'}
                        {@const tc = msg.content as ToolCallContent}
                        <span class="turn-msg-name">{tc.name}</span>
                      {/if}
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        {#if turns.length === 0}
          <div class="turns-empty">No turns yet</div>
        {/if}
      </div>
    </div>
    </div>

    <!-- AST panel -->
    <div class="sub-panel ast-panel" style:display={activeSubTab === 'ast' ? 'flex' : 'none'}>
      {#if astTree.length === 0}
        <div class="turns-empty">No conversation data yet</div>
      {:else}
        <div class="ast-scroll">
          {#each astTree as turnNode (turnNode.id)}
            {@const result = layoutAst(turnNode, 8, 8)}
            {@const svgW = astSvgWidth(result.layout)}
            {@const svgH = Math.max(50, result.height + 20)}
            <div class="ast-turn-block">
              <div class="ast-turn-label">
                <span class="ast-turn-name">{turnNode.label}</span>
                <span class="ast-turn-tokens">{formatTokens(turnNode.tokens)}</span>
              </div>
              <div class="ast-svg-wrap">
                <svg width={svgW} height={svgH}>
                  {#snippet renderAstNode(layout: AstLayout)}
                    <!-- Edges -->
                    {#each layout.children as child}
                      <path
                        d="M {layout.x + AST_NODE_W} {layout.y + AST_NODE_H / 2}
                           C {layout.x + AST_NODE_W + AST_H_GAP / 2} {layout.y + AST_NODE_H / 2},
                             {child.x - AST_H_GAP / 2} {child.y + AST_NODE_H / 2},
                             {child.x} {child.y + AST_NODE_H / 2}"
                        fill="none"
                        stroke="var(--ctp-surface1)"
                        stroke-width="1"
                      />
                    {/each}

                    <!-- Node -->
                    <rect
                      x={layout.x}
                      y={layout.y}
                      width={AST_NODE_W}
                      height={AST_NODE_H}
                      rx="4"
                      fill="color-mix(in srgb, {layout.node.color} 12%, var(--ctp-surface0))"
                      stroke={layout.node.color}
                      stroke-width="1"
                    />
                    <!-- Status dot -->
                    <circle
                      cx={layout.x + 8}
                      cy={layout.y + AST_NODE_H / 2}
                      r="3"
                      fill={layout.node.color}
                    />
                    <!-- Label -->
                    <text
                      x={layout.x + 16}
                      y={layout.y + AST_NODE_H / 2}
                      fill="var(--ctp-text)"
                      font-size="9"
                      font-family="var(--term-font-family, monospace)"
                      dominant-baseline="middle"
                    >{truncateText(layout.node.label, 12)}</text>
                    <!-- Token count (right side) -->
                    {#if layout.node.tokens > 0}
                      <text
                        x={layout.x + AST_NODE_W - 4}
                        y={layout.y + AST_NODE_H / 2}
                        fill="var(--ctp-overlay0)"
                        font-size="7"
                        font-family="var(--term-font-family, monospace)"
                        dominant-baseline="middle"
                        text-anchor="end"
                      >{formatTokens(layout.node.tokens)}</text>
                    {/if}

                    <!-- Tooltip title -->
                    {#if layout.node.detail}
                      <title>{layout.node.detail}</title>
                    {/if}

                    {#each layout.children as child}
                      {@render renderAstNode(child)}
                    {/each}
                  {/snippet}

                  {@render renderAstNode(result.layout)}
                </svg>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Graph panel -->
    <div class="sub-panel graph-panel" style:display={activeSubTab === 'graph' ? 'flex' : 'none'}>
      {#if toolGraph.nodes.length === 0}
        <div class="turns-empty">No tool calls yet</div>
      {:else}
        {@const maxY = Math.max(...toolGraph.nodes.map(n => n.y)) + 40}
        <div class="graph-scroll">
          <svg width="380" height={maxY}>
            <!-- Edges -->
            {#each toolGraph.edges as edge}
              {@const fromNode = toolGraph.nodes.find(n => n.id === edge.from)}
              {@const toNode = toolGraph.nodes.find(n => n.id === edge.to)}
              {#if fromNode && toNode}
                <path
                  d="M {fromNode.x + 80} {fromNode.y + 14}
                     C {fromNode.x + 140} {fromNode.y + 14},
                       {toNode.x - 60} {toNode.y + 14},
                       {toNode.x} {toNode.y + 14}"
                  fill="none"
                  stroke={edge.color}
                  stroke-width="1"
                  opacity="0.4"
                />
              {/if}
            {/each}

            <!-- Nodes -->
            {#each toolGraph.nodes as node (node.id)}
              {#if node.type === 'tool'}
                <!-- Tool node (left side) -->
                <rect
                  x={node.x}
                  y={node.y}
                  width="80"
                  height="28"
                  rx="4"
                  fill="color-mix(in srgb, {node.color} 15%, var(--ctp-surface0))"
                  stroke={node.color}
                  stroke-width="1"
                />
                <text
                  x={node.x + 8}
                  y={node.y + 14}
                  fill={node.color}
                  font-size="9"
                  font-weight="600"
                  font-family="var(--term-font-family, monospace)"
                  dominant-baseline="middle"
                >{node.label}</text>
                <text
                  x={node.x + 76}
                  y={node.y + 14}
                  fill="var(--ctp-overlay0)"
                  font-size="7"
                  font-family="var(--term-font-family, monospace)"
                  dominant-baseline="middle"
                  text-anchor="end"
                >{node.count}×</text>
              {:else}
                <!-- File node (right side) -->
                <rect
                  x={node.x}
                  y={node.y}
                  width="140"
                  height="28"
                  rx="4"
                  fill="var(--ctp-surface0)"
                  stroke="var(--ctp-surface1)"
                  stroke-width="1"
                />
                <text
                  x={node.x + 8}
                  y={node.y + 14}
                  fill="var(--ctp-text)"
                  font-size="8"
                  font-family="var(--term-font-family, monospace)"
                  dominant-baseline="middle"
                >{truncateText(node.label, 16)}</text>
                <text
                  x={node.x + 136}
                  y={node.y + 14}
                  fill="var(--ctp-overlay0)"
                  font-size="7"
                  font-family="var(--term-font-family, monospace)"
                  dominant-baseline="middle"
                  text-anchor="end"
                >{node.count}×</text>
              {/if}
            {/each}

            <!-- Column headers -->
            <text x="20" y="10" fill="var(--ctp-overlay0)" font-size="8" font-weight="600" text-transform="uppercase">Tools</text>
            <text x="220" y="10" fill="var(--ctp-overlay0)" font-size="8" font-weight="600" text-transform="uppercase">Files</text>
          </svg>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .context-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    background: var(--ctp-base);
    color: var(--ctp-text);
    gap: 0.125rem;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.5rem;
    padding: 2rem;
    text-align: center;
  }

  .empty-icon { color: var(--ctp-overlay0); }
  .empty-title { font-size: 0.85rem; font-weight: 600; color: var(--ctp-subtext1); margin: 0; }
  .empty-hint { font-size: 0.7rem; color: var(--ctp-overlay0); margin: 0; }

  /* Stats bar */
  .stats-bar {
    display: flex;
    gap: 0.125rem;
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.25rem 0.5rem;
    background: var(--ctp-surface0);
    border-radius: 0.25rem;
    min-width: 3rem;
  }

  .stat-value {
    font-size: 0.75rem;
    font-weight: 700;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-text);
  }

  .stat-value.cost { color: var(--ctp-green); }

  .stat-label {
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-pill {
    margin-left: auto;
  }

  .status-pill.running { background: color-mix(in srgb, var(--ctp-green) 15%, transparent); }
  .status-pill.running .stat-value { color: var(--ctp-green); }
  .status-pill.done { background: color-mix(in srgb, var(--ctp-blue) 15%, transparent); }
  .status-pill.done .stat-value { color: var(--ctp-blue); }
  .status-pill.error { background: color-mix(in srgb, var(--ctp-red) 15%, transparent); }
  .status-pill.error .stat-value { color: var(--ctp-red); }

  .compaction-pill {
    background: color-mix(in srgb, var(--ctp-yellow) 15%, transparent);
  }
  .compaction-pill .stat-value { color: var(--ctp-yellow); }
  .compaction-pill .stat-label { color: var(--ctp-yellow); opacity: 0.7; }

  /* Context meter */
  .meter-section {
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .meter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.375rem;
  }

  .meter-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ctp-subtext1);
  }

  .meter-usage {
    font-size: 0.625rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-overlay1);
  }

  .meter-bar {
    display: flex;
    height: 1.25rem;
    border-radius: 0.375rem;
    overflow: hidden;
    background: var(--ctp-surface0);
    gap: 1px;
  }

  .meter-segment {
    height: 100%;
    min-width: 2px;
    transition: width 0.4s ease;
    position: relative;
  }

  .meter-segment:hover {
    filter: brightness(1.2);
  }

  .meter-empty {
    background: transparent;
  }

  .meter-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem 0.75rem;
    margin-top: 0.375rem;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .legend-dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .legend-label {
    font-size: 0.575rem;
    color: var(--ctp-overlay1);
  }

  .legend-value {
    font-size: 0.575rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-subtext0);
  }

  /* File references */
  .files-section {
    padding: 0.375rem 0.625rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.375rem;
  }

  .section-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ctp-subtext1);
  }

  .section-count {
    font-size: 0.575rem;
    color: var(--ctp-overlay0);
    background: var(--ctp-surface0);
    padding: 0.0625rem 0.3125rem;
    border-radius: 0.625rem;
    font-family: var(--term-font-family, monospace);
  }

  .files-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 12rem;
    overflow-y: auto;
  }

  .file-ref {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.1875rem 0.375rem;
    border-radius: 0.1875rem;
    transition: background 0.1s;
  }

  .file-ref:hover {
    background: var(--ctp-surface0);
  }

  .file-ops {
    display: flex;
    gap: 0.125rem;
    flex-shrink: 0;
  }

  .file-op {
    font-size: 0.5rem;
    font-weight: 700;
    font-family: var(--term-font-family, monospace);
    width: 0.875rem;
    height: 0.875rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.125rem;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  .file-name {
    font-size: 0.65rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .file-count {
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
    font-family: var(--term-font-family, monospace);
    flex-shrink: 0;
  }

  .files-more {
    font-size: 0.6rem;
    color: var(--ctp-overlay0);
    padding: 0.25rem 0.375rem;
    text-align: center;
  }

  /* Turns */
  .turns-section {
    padding: 0.375rem 0.625rem;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .turns-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow-y: auto;
    flex: 1;
  }

  .turn-group {
    border-radius: 0.1875rem;
    overflow: hidden;
  }

  .turn-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    padding: 0.25rem 0.375rem;
    background: transparent;
    border: none;
    color: var(--ctp-text);
    font-size: 0.65rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .turn-header:hover {
    background: var(--ctp-surface0);
  }

  .turn-chevron {
    flex-shrink: 0;
    color: var(--ctp-overlay0);
    transition: transform 0.15s;
    display: flex;
  }

  .turn-chevron.open {
    transform: rotate(90deg);
  }

  .turn-index {
    font-family: var(--term-font-family, monospace);
    font-size: 0.6rem;
    color: var(--ctp-overlay1);
    flex-shrink: 0;
    min-width: 1.5rem;
  }

  .turn-tools {
    display: flex;
    gap: 0.1875rem;
    flex: 1;
    overflow: hidden;
    flex-wrap: wrap;
  }

  .turn-tool-badge {
    font-size: 0.525rem;
    padding: 0.0625rem 0.25rem;
    border-radius: 0.125rem;
    background: color-mix(in srgb, var(--ctp-peach) 12%, transparent);
    color: var(--ctp-peach);
    font-family: var(--term-font-family, monospace);
    white-space: nowrap;
  }

  .turn-tool-more {
    font-size: 0.525rem;
    color: var(--ctp-overlay0);
  }

  .turn-tokens {
    font-size: 0.575rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-overlay1);
    flex-shrink: 0;
    margin-left: auto;
  }

  .turn-detail {
    padding: 0.1875rem 0.375rem 0.375rem 1.5rem;
    background: color-mix(in srgb, var(--ctp-surface0) 40%, transparent);
  }

  .turn-msg {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0;
    font-size: 0.6rem;
  }

  .turn-msg-type {
    font-weight: 600;
    font-size: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    min-width: 4.5rem;
  }

  .turn-msg-tokens {
    font-family: var(--term-font-family, monospace);
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
  }

  .turn-msg-name {
    font-family: var(--term-font-family, monospace);
    font-size: 0.575rem;
    color: var(--ctp-subtext0);
  }

  .turns-empty {
    color: var(--ctp-overlay0);
    font-size: 0.7rem;
    text-align: center;
    padding: 1rem;
  }

  /* Sub-tabs */
  .sub-tabs {
    display: flex;
    gap: 0;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .sub-tab {
    padding: 0.25rem 0.75rem;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--ctp-overlay1);
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 0.12s, background 0.12s, border-color 0.12s;
  }

  .sub-tab:hover {
    color: var(--ctp-subtext1);
    background: var(--ctp-surface0);
  }

  .sub-tab.active {
    color: var(--ctp-text);
    font-weight: 600;
    border-bottom-color: var(--ctp-blue);
    background: var(--ctp-base);
  }

  .sub-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* AST */
  .ast-panel {
    gap: 0.125rem;
  }

  .ast-scroll {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.375rem;
    overflow-y: auto;
    flex: 1;
  }

  .ast-turn-block {
    border: 1px solid var(--ctp-surface0);
    border-radius: 0.375rem;
    overflow: hidden;
    background: var(--ctp-base);
  }

  .ast-turn-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
  }

  .ast-turn-name {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--ctp-lavender);
  }

  .ast-turn-tokens {
    font-size: 0.575rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-overlay1);
  }

  .ast-svg-wrap {
    overflow-x: auto;
    padding: 0.25rem;
  }

  .ast-svg-wrap svg {
    display: block;
  }

  /* Graph */
  .graph-panel {
    padding: 0.375rem;
  }

  .graph-scroll {
    overflow: auto;
    flex: 1;
  }

  .graph-scroll svg {
    display: block;
  }
</style>
