<script lang="ts">
  import { buildAgentTree, subtreeCost, type AgentTreeNode } from '../../utils/agent-tree';
  import type { AgentSession } from '../../stores/agents.svelte';

  interface Props {
    session: AgentSession;
    onNodeClick?: (nodeId: string) => void;
  }

  let { session, onNodeClick }: Props = $props();

  let tree = $derived(buildAgentTree(
    session.id,
    session.messages,
    session.status,
    session.costUsd,
    session.inputTokens + session.outputTokens,
  ));

  // Layout constants
  const NODE_W = 100;
  const NODE_H = 40;
  const H_GAP = 24;
  const V_GAP = 12;

  interface LayoutNode {
    node: AgentTreeNode;
    x: number;
    y: number;
    children: LayoutNode[];
  }

  function layoutTree(node: AgentTreeNode, x: number, y: number): { layout: LayoutNode; height: number } {
    if (node.children.length === 0) {
      return {
        layout: { node, x, y, children: [] },
        height: NODE_H,
      };
    }

    const childLayouts: LayoutNode[] = [];
    let childY = y;
    let totalHeight = 0;

    for (const child of node.children) {
      const result = layoutTree(child, x + NODE_W + H_GAP, childY);
      childLayouts.push(result.layout);
      childY += result.height + V_GAP;
      totalHeight += result.height + V_GAP;
    }
    totalHeight -= V_GAP; // remove trailing gap

    // Center parent vertically relative to children
    const parentY = childLayouts.length > 0
      ? (childLayouts[0].y + childLayouts[childLayouts.length - 1].y) / 2
      : y;

    return {
      layout: { node, x, y: parentY, children: childLayouts },
      height: Math.max(NODE_H, totalHeight),
    };
  }

  let layoutResult = $derived(layoutTree(tree, 8, 8));
  let svgHeight = $derived(Math.max(80, layoutResult.height + 24));
  let svgWidth = $derived(computeWidth(layoutResult.layout));

  function computeWidth(layout: LayoutNode): number {
    let maxX = layout.x + NODE_W;
    for (const child of layout.children) {
      maxX = Math.max(maxX, computeWidth(child));
    }
    return maxX + 16;
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'running': return 'var(--ctp-blue)';
      case 'done': return 'var(--ctp-green)';
      case 'error': return 'var(--ctp-red)';
      default: return 'var(--ctp-overlay1)';
    }
  }

  function truncateLabel(text: string, maxLen: number): string {
    return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
  }
</script>

<div class="agent-tree">
  <svg width={svgWidth} height={svgHeight}>
    {#snippet renderNode(layout: LayoutNode)}
      <!-- Edges to children -->
      {#each layout.children as child}
        <path
          d="M {layout.x + NODE_W} {layout.y + NODE_H / 2}
             C {layout.x + NODE_W + H_GAP / 2} {layout.y + NODE_H / 2},
               {child.x - H_GAP / 2} {child.y + NODE_H / 2},
               {child.x} {child.y + NODE_H / 2}"
          fill="none"
          stroke="var(--border)"
          stroke-width="1.5"
        />
      {/each}

      <!-- Node rectangle -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g
        class="tree-node"
        onclick={() => onNodeClick?.(layout.node.id)}
        style="cursor: {onNodeClick ? 'pointer' : 'default'}"
      >
        <rect
          x={layout.x}
          y={layout.y}
          width={NODE_W}
          height={NODE_H}
          rx="4"
          fill="var(--bg-surface)"
          stroke={statusColor(layout.node.status)}
          stroke-width="1.5"
        />
        <!-- Status dot -->
        <circle
          cx={layout.x + 10}
          cy={layout.y + NODE_H / 2 - 4}
          r="3"
          fill={statusColor(layout.node.status)}
        />
        <!-- Label -->
        <text
          x={layout.x + 18}
          y={layout.y + NODE_H / 2 - 4}
          fill="var(--text-primary)"
          font-size="10"
          font-family="var(--font-mono)"
          dominant-baseline="middle"
        >{truncateLabel(layout.node.label, 10)}</text>
        <!-- Subtree cost -->
        {#if subtreeCost(layout.node) > 0}
          <text
            x={layout.x + 18}
            y={layout.y + NODE_H / 2 + 9}
            fill="var(--ctp-yellow)"
            font-size="8"
            font-family="var(--font-mono)"
            dominant-baseline="middle"
          >${subtreeCost(layout.node).toFixed(4)}</text>
        {/if}
      </g>

      <!-- Recurse children -->
      {#each layout.children as child}
        {@render renderNode(child)}
      {/each}
    {/snippet}

    {@render renderNode(layoutResult.layout)}
  </svg>
</div>

<style>
  .agent-tree {
    overflow: auto;
    padding: 4px;
    background: var(--bg-primary);
  }

  .tree-node:hover rect {
    fill: var(--bg-surface-hover, var(--ctp-surface1));
  }
</style>
