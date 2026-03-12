import type { ProviderId } from '../providers/types';
import type { AnchorBudgetScale } from './anchors';
import type { WakeStrategy } from './wake';
import type { ProjectId, GroupId, AgentId } from './ids';

export interface ProjectConfig {
  id: ProjectId;
  name: string;
  identifier: string;
  description: string;
  icon: string;
  cwd: string;
  profile: string;
  enabled: boolean;
  /** Agent provider for this project (defaults to 'claude') */
  provider?: ProviderId;
  /** Model override (e.g. 'claude-sonnet-4-5-20250514'). Falls back to provider default. */
  model?: string;
  /** When true, agents for this project use git worktrees for isolation */
  useWorktrees?: boolean;
  /** When true, sidecar process is sandboxed via Landlock (Linux 5.13+, restricts filesystem access) */
  sandboxEnabled?: boolean;
  /** Anchor token budget scale (defaults to 'medium' = 6K tokens) */
  anchorBudgetScale?: AnchorBudgetScale;
  /** Stall detection threshold in minutes (defaults to 15) */
  stallThresholdMin?: number;
  /** True for Tier 1 management agents rendered as project boxes */
  isAgent?: boolean;
  /** Agent role (manager/architect/tester/reviewer) — only when isAgent */
  agentRole?: GroupAgentRole;
  /** System prompt injected at session start — only when isAgent */
  systemPrompt?: string;
}

export const AGENT_ROLE_ICONS: Record<string, string> = {
  manager: '🎯',
  architect: '🏗',
  tester: '🧪',
  reviewer: '🔍',
};

/** Convert a GroupAgentConfig to a ProjectConfig for unified rendering */
export function agentToProject(agent: GroupAgentConfig, groupCwd: string): ProjectConfig {
  // Agent IDs serve as project IDs in the workspace (agents render as project boxes)
  return {
    id: agent.id as unknown as ProjectId,
    name: agent.name,
    identifier: agent.role,
    description: `${agent.role.charAt(0).toUpperCase() + agent.role.slice(1)} agent`,
    icon: AGENT_ROLE_ICONS[agent.role] ?? '🤖',
    cwd: agent.cwd ?? groupCwd,
    profile: 'default',
    enabled: agent.enabled,
    provider: agent.provider,
    model: agent.model,
    isAgent: true,
    agentRole: agent.role,
    systemPrompt: agent.systemPrompt,
  };
}

/** Group-level agent role (Tier 1 management agents) */
export type GroupAgentRole = 'manager' | 'architect' | 'tester' | 'reviewer';

/** Group-level agent status */
export type GroupAgentStatus = 'active' | 'sleeping' | 'stopped';

/** Group-level agent configuration */
export interface GroupAgentConfig {
  id: AgentId;
  name: string;
  role: GroupAgentRole;
  /** Agent provider (defaults to 'claude') */
  provider?: ProviderId;
  /** Model override (e.g. 'claude-sonnet-4-5-20250514'). Falls back to provider default. */
  model?: string;
  cwd?: string;
  systemPrompt?: string;
  enabled: boolean;
  /** Auto-wake interval in minutes (Manager only, default 3) */
  wakeIntervalMin?: number;
  /** Wake strategy: persistent (always-on), on-demand (fresh session), smart (threshold-gated) */
  wakeStrategy?: WakeStrategy;
  /** Wake threshold 0..1 for smart strategy (default 0.5) */
  wakeThreshold?: number;
}

export interface GroupConfig {
  id: GroupId;
  name: string;
  projects: ProjectConfig[];
  /** Group-level orchestration agents (Tier 1) */
  agents?: GroupAgentConfig[];
}

export interface GroupsFile {
  version: number;
  groups: GroupConfig[];
  activeGroupId: GroupId;
}

/** Derive a project identifier from a name: lowercase, spaces to dashes */
export function deriveIdentifier(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/** Project accent colors by slot index (0-4), Catppuccin Mocha */
export const PROJECT_ACCENTS = [
  '--ctp-blue',
  '--ctp-green',
  '--ctp-mauve',
  '--ctp-peach',
  '--ctp-pink',
] as const;
