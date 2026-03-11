import type { ProviderId } from '../providers/types';
import type { AnchorBudgetScale } from './anchors';

export interface ProjectConfig {
  id: string;
  name: string;
  identifier: string;
  description: string;
  icon: string;
  cwd: string;
  profile: string;
  enabled: boolean;
  /** Agent provider for this project (defaults to 'claude') */
  provider?: ProviderId;
  /** When true, agents for this project use git worktrees for isolation */
  useWorktrees?: boolean;
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
  return {
    id: agent.id,
    name: agent.name,
    identifier: agent.role,
    description: `${agent.role.charAt(0).toUpperCase() + agent.role.slice(1)} agent`,
    icon: AGENT_ROLE_ICONS[agent.role] ?? '🤖',
    cwd: agent.cwd ?? groupCwd,
    profile: 'default',
    enabled: agent.enabled,
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
  id: string;
  name: string;
  role: GroupAgentRole;
  model?: string;
  cwd?: string;
  systemPrompt?: string;
  enabled: boolean;
  /** Auto-wake interval in minutes (Manager only, default 3) */
  wakeIntervalMin?: number;
}

export interface GroupConfig {
  id: string;
  name: string;
  projects: ProjectConfig[];
  /** Group-level orchestration agents (Tier 1) */
  agents?: GroupAgentConfig[];
}

export interface GroupsFile {
  version: number;
  groups: GroupConfig[];
  activeGroupId: string;
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
