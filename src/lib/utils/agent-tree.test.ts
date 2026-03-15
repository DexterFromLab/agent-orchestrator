import { describe, it, expect } from 'vitest';
import { buildAgentTree, countTreeNodes, subtreeCost } from './agent-tree';
import type { AgentMessage, ToolCallContent, ToolResultContent } from '../adapters/claude-messages';
import type { AgentTreeNode } from './agent-tree';

// Helper to create typed AgentMessages
function makeToolCall(
  uuid: string,
  toolUseId: string,
  name: string,
  parentId?: string,
): AgentMessage {
  return {
    id: uuid,
    type: 'tool_call',
    parentId,
    content: { toolUseId, name, input: {} } satisfies ToolCallContent,
    timestamp: Date.now(),
  };
}

function makeToolResult(uuid: string, toolUseId: string, parentId?: string): AgentMessage {
  return {
    id: uuid,
    type: 'tool_result',
    parentId,
    content: { toolUseId, output: 'ok' } satisfies ToolResultContent,
    timestamp: Date.now(),
  };
}

function makeTextMessage(uuid: string, text: string, parentId?: string): AgentMessage {
  return {
    id: uuid,
    type: 'text',
    parentId,
    content: { text },
    timestamp: Date.now(),
  };
}

describe('buildAgentTree', () => {
  it('creates a root node with no children from empty messages', () => {
    const tree = buildAgentTree('session-1', [], 'done', 0.05, 1500);

    expect(tree.id).toBe('session-1');
    expect(tree.label).toBe('session-');
    expect(tree.status).toBe('done');
    expect(tree.costUsd).toBe(0.05);
    expect(tree.tokens).toBe(1500);
    expect(tree.children).toEqual([]);
  });

  it('maps running/starting status to running', () => {
    const tree1 = buildAgentTree('s1', [], 'running', 0, 0);
    expect(tree1.status).toBe('running');

    const tree2 = buildAgentTree('s2', [], 'starting', 0, 0);
    expect(tree2.status).toBe('running');
  });

  it('maps error status to error', () => {
    const tree = buildAgentTree('s3', [], 'error', 0, 0);
    expect(tree.status).toBe('error');
  });

  it('maps other statuses to done', () => {
    const tree = buildAgentTree('s4', [], 'completed', 0, 0);
    expect(tree.status).toBe('done');
  });

  it('adds tool_call messages as children of root', () => {
    const messages: AgentMessage[] = [
      makeToolCall('m1', 'tool-1', 'Read'),
      makeToolCall('m2', 'tool-2', 'Write'),
    ];

    const tree = buildAgentTree('sess', messages, 'done', 0, 0);

    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].id).toBe('tool-1');
    expect(tree.children[0].label).toBe('Read');
    expect(tree.children[0].toolName).toBe('Read');
    expect(tree.children[1].id).toBe('tool-2');
    expect(tree.children[1].label).toBe('Write');
  });

  it('marks tool nodes as running until a result arrives', () => {
    const messages: AgentMessage[] = [
      makeToolCall('m1', 'tool-1', 'Bash'),
    ];

    const tree = buildAgentTree('sess', messages, 'running', 0, 0);
    expect(tree.children[0].status).toBe('running');
  });

  it('marks tool nodes as done when result arrives', () => {
    const messages: AgentMessage[] = [
      makeToolCall('m1', 'tool-1', 'Bash'),
      makeToolResult('m2', 'tool-1'),
    ];

    const tree = buildAgentTree('sess', messages, 'done', 0, 0);
    expect(tree.children[0].status).toBe('done');
  });

  it('nests subagent tool calls under their parent tool node', () => {
    const messages: AgentMessage[] = [
      makeToolCall('m1', 'tool-parent', 'Agent'),
      makeToolCall('m2', 'tool-child', 'Read', 'tool-parent'),
    ];

    const tree = buildAgentTree('sess', messages, 'done', 0, 0);

    expect(tree.children).toHaveLength(1);
    const parentNode = tree.children[0];
    expect(parentNode.id).toBe('tool-parent');
    expect(parentNode.children).toHaveLength(1);
    expect(parentNode.children[0].id).toBe('tool-child');
    expect(parentNode.children[0].label).toBe('Read');
  });

  it('handles deeply nested subagents (3 levels)', () => {
    const messages: AgentMessage[] = [
      makeToolCall('m1', 'level-1', 'Agent'),
      makeToolCall('m2', 'level-2', 'SubAgent', 'level-1'),
      makeToolCall('m3', 'level-3', 'Read', 'level-2'),
    ];

    const tree = buildAgentTree('sess', messages, 'done', 0, 0);

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].children[0].id).toBe('level-3');
  });

  it('attaches to root when parentId references a non-existent tool node', () => {
    const messages: AgentMessage[] = [
      makeToolCall('m1', 'orphan-tool', 'Bash', 'nonexistent-parent'),
    ];

    const tree = buildAgentTree('sess', messages, 'done', 0, 0);

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].id).toBe('orphan-tool');
  });

  it('ignores non-tool messages (text, thinking, etc.)', () => {
    const messages: AgentMessage[] = [
      makeTextMessage('m1', 'Hello'),
      makeToolCall('m2', 'tool-1', 'Read'),
      makeTextMessage('m3', 'Done'),
    ];

    const tree = buildAgentTree('sess', messages, 'done', 0, 0);

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].id).toBe('tool-1');
  });

  it('handles tool_result for a non-existent tool gracefully', () => {
    const messages: AgentMessage[] = [
      makeToolResult('m1', 'nonexistent-tool'),
    ];

    // Should not throw
    const tree = buildAgentTree('sess', messages, 'done', 0, 0);
    expect(tree.children).toHaveLength(0);
  });

  it('truncates session ID to 8 chars for label', () => {
    const tree = buildAgentTree('abcdefghijklmnop', [], 'done', 0, 0);
    expect(tree.label).toBe('abcdefgh');
  });
});

describe('countTreeNodes', () => {
  it('returns 1 for a leaf node', () => {
    const leaf: AgentTreeNode = {
      id: 'leaf',
      label: 'leaf',
      status: 'done',
      costUsd: 0,
      tokens: 0,
      children: [],
    };
    expect(countTreeNodes(leaf)).toBe(1);
  });

  it('counts all nodes in a flat tree', () => {
    const root: AgentTreeNode = {
      id: 'root',
      label: 'root',
      status: 'done',
      costUsd: 0,
      tokens: 0,
      children: [
        { id: 'a', label: 'a', status: 'done', costUsd: 0, tokens: 0, children: [] },
        { id: 'b', label: 'b', status: 'done', costUsd: 0, tokens: 0, children: [] },
        { id: 'c', label: 'c', status: 'done', costUsd: 0, tokens: 0, children: [] },
      ],
    };
    expect(countTreeNodes(root)).toBe(4);
  });

  it('counts all nodes in a nested tree', () => {
    const root: AgentTreeNode = {
      id: 'root',
      label: 'root',
      status: 'done',
      costUsd: 0,
      tokens: 0,
      children: [
        {
          id: 'a',
          label: 'a',
          status: 'done',
          costUsd: 0,
          tokens: 0,
          children: [
            { id: 'a1', label: 'a1', status: 'done', costUsd: 0, tokens: 0, children: [] },
            { id: 'a2', label: 'a2', status: 'done', costUsd: 0, tokens: 0, children: [] },
          ],
        },
        { id: 'b', label: 'b', status: 'done', costUsd: 0, tokens: 0, children: [] },
      ],
    };
    expect(countTreeNodes(root)).toBe(5);
  });
});

describe('subtreeCost', () => {
  it('returns own cost for a leaf node', () => {
    const leaf: AgentTreeNode = {
      id: 'leaf',
      label: 'leaf',
      status: 'done',
      costUsd: 0.05,
      tokens: 0,
      children: [],
    };
    expect(subtreeCost(leaf)).toBe(0.05);
  });

  it('aggregates cost across children', () => {
    const root: AgentTreeNode = {
      id: 'root',
      label: 'root',
      status: 'done',
      costUsd: 0.10,
      tokens: 0,
      children: [
        { id: 'a', label: 'a', status: 'done', costUsd: 0.03, tokens: 0, children: [] },
        { id: 'b', label: 'b', status: 'done', costUsd: 0.02, tokens: 0, children: [] },
      ],
    };
    expect(subtreeCost(root)).toBeCloseTo(0.15);
  });

  it('aggregates cost recursively across nested children', () => {
    const root: AgentTreeNode = {
      id: 'root',
      label: 'root',
      status: 'done',
      costUsd: 1.0,
      tokens: 0,
      children: [
        {
          id: 'a',
          label: 'a',
          status: 'done',
          costUsd: 0.5,
          tokens: 0,
          children: [
            { id: 'a1', label: 'a1', status: 'done', costUsd: 0.25, tokens: 0, children: [] },
          ],
        },
      ],
    };
    expect(subtreeCost(root)).toBeCloseTo(1.75);
  });

  it('returns 0 for a tree with all zero costs', () => {
    const root: AgentTreeNode = {
      id: 'root',
      label: 'root',
      status: 'done',
      costUsd: 0,
      tokens: 0,
      children: [
        { id: 'a', label: 'a', status: 'done', costUsd: 0, tokens: 0, children: [] },
      ],
    };
    expect(subtreeCost(root)).toBe(0);
  });
});
