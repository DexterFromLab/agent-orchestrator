// Auto-anchoring — creates session anchors on first compaction event
// Extracted from agent-dispatcher.ts (SRP: anchor creation concern)

import type { ProjectId as ProjectIdType } from '../types/ids';
import type { AgentMessage } from '../adapters/claude-messages';
import type { SessionAnchor } from '../types/anchors';
import { getAnchorSettings, addAnchors } from '../stores/anchors.svelte';
import { selectAutoAnchors, serializeAnchorsForInjection } from '../utils/anchor-serializer';
import { getEnabledProjects } from '../stores/workspace.svelte';
import { tel } from '../adapters/telemetry-bridge';
import { notify } from '../stores/notifications.svelte';

/** Auto-anchor first N turns on first compaction event for a project */
export function triggerAutoAnchor(
  projectId: ProjectIdType,
  messages: AgentMessage[],
  sessionPrompt: string,
): void {
  const project = getEnabledProjects().find(p => p.id === projectId);
  const settings = getAnchorSettings(project?.anchorBudgetScale);
  const { turns, totalTokens } = selectAutoAnchors(
    messages,
    sessionPrompt,
    settings.anchorTurns,
    settings.anchorTokenBudget,
  );

  if (turns.length === 0) return;

  const nowSecs = Math.floor(Date.now() / 1000);
  const anchors: SessionAnchor[] = turns.map((turn) => {
    const content = serializeAnchorsForInjection([turn], settings.anchorTokenBudget);
    return {
      id: crypto.randomUUID(),
      projectId,
      messageId: `turn-${turn.index}`,
      anchorType: 'auto' as const,
      content: content,
      estimatedTokens: turn.estimatedTokens,
      turnIndex: turn.index,
      createdAt: nowSecs,
    };
  });

  addAnchors(projectId, anchors);
  tel.info('auto_anchor_created', {
    projectId,
    anchorCount: anchors.length,
    totalTokens,
  });
  notify('info', `Anchored ${anchors.length} turns (${totalTokens} tokens) for context preservation`);
}
