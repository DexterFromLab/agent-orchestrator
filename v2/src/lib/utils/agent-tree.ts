// Agent tree builder — constructs hierarchical tree from agent messages
// Subagents are identified by parent_tool_use_id on their messages

import type { AgentMessage, ToolCallContent, CostContent } from '../adapters/sdk-messages';

export interface AgentTreeNode {
  id: string;
  label: string;
  toolName?: string;
  status: 'running' | 'done' | 'error';
  costUsd: number;
  tokens: number;
  children: AgentTreeNode[];
}

/**
 * Build a tree from a flat list of agent messages.
 * Root node represents the main agent session.
 * Child nodes represent tool_use calls (potential subagents).
 */
export function buildAgentTree(
  sessionId: string,
  messages: AgentMessage[],
  sessionStatus: string,
  sessionCost: number,
  sessionTokens: number,
): AgentTreeNode {
  const root: AgentTreeNode = {
    id: sessionId,
    label: sessionId.slice(0, 8),
    status: sessionStatus === 'running' || sessionStatus === 'starting' ? 'running' :
            sessionStatus === 'error' ? 'error' : 'done',
    costUsd: sessionCost,
    tokens: sessionTokens,
    children: [],
  };

  // Map tool_use_id -> node for nesting
  const toolNodes = new Map<string, AgentTreeNode>();

  for (const msg of messages) {
    if (msg.type === 'tool_call') {
      const tc = msg.content as ToolCallContent;
      const node: AgentTreeNode = {
        id: tc.toolUseId,
        label: tc.name,
        toolName: tc.name,
        status: 'running', // will be updated by result
        costUsd: 0,
        tokens: 0,
        children: [],
      };
      toolNodes.set(tc.toolUseId, node);

      if (msg.parentId) {
        // This is a subagent tool call — attach to parent tool node
        const parent = toolNodes.get(msg.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          root.children.push(node);
        }
      } else {
        root.children.push(node);
      }
    }

    if (msg.type === 'tool_result') {
      const tr = msg.content as { toolUseId: string };
      const node = toolNodes.get(tr.toolUseId);
      if (node) {
        node.status = 'done';
      }
    }
  }

  return root;
}

/** Flatten tree to get total count of nodes */
export function countTreeNodes(node: AgentTreeNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countTreeNodes(c), 0);
}

/** Aggregate cost across a subtree */
export function subtreeCost(node: AgentTreeNode): number {
  return node.costUsd + node.children.reduce((sum, c) => sum + subtreeCost(c), 0);
}
