import { loadGroups, saveGroups, getCliGroup } from '../adapters/groups-bridge';
import type { GroupsFile, GroupConfig, ProjectConfig } from '../types/groups';
import { clearAllAgentSessions } from '../stores/agents.svelte';
import { waitForPendingPersistence } from '../agent-dispatcher';

export type WorkspaceTab = 'sessions' | 'docs' | 'context' | 'settings';

export interface TerminalTab {
  id: string;
  title: string;
  type: 'shell' | 'ssh' | 'agent-terminal' | 'agent-preview';
  /** SSH session ID if type === 'ssh' */
  sshSessionId?: string;
  /** Agent session ID if type === 'agent-preview' */
  agentSessionId?: string;
}

// --- Core state ---

let groupsConfig = $state<GroupsFile | null>(null);
let activeGroupId = $state<string>('');
let activeTab = $state<WorkspaceTab>('sessions');
let activeProjectId = $state<string | null>(null);

/** Terminal tabs per project (keyed by project ID) */
let projectTerminals = $state<Record<string, TerminalTab[]>>({});

// --- Getters ---

export function getGroupsConfig(): GroupsFile | null {
  return groupsConfig;
}

export function getActiveGroupId(): string {
  return activeGroupId;
}

export function getActiveTab(): WorkspaceTab {
  return activeTab;
}

export function getActiveProjectId(): string | null {
  return activeProjectId;
}

export function getActiveGroup(): GroupConfig | undefined {
  return groupsConfig?.groups.find(g => g.id === activeGroupId);
}

export function getEnabledProjects(): ProjectConfig[] {
  const group = getActiveGroup();
  if (!group) return [];
  return group.projects.filter(p => p.enabled);
}

export function getAllGroups(): GroupConfig[] {
  return groupsConfig?.groups ?? [];
}

// --- Setters ---

export function setActiveTab(tab: WorkspaceTab): void {
  activeTab = tab;
}

export function setActiveProject(projectId: string | null): void {
  activeProjectId = projectId;
}

export async function switchGroup(groupId: string): Promise<void> {
  if (groupId === activeGroupId) return;

  // Wait for any in-flight persistence before clearing state
  await waitForPendingPersistence();

  // Teardown: clear terminal tabs and agent sessions for the old group
  projectTerminals = {};
  clearAllAgentSessions();

  activeGroupId = groupId;
  activeProjectId = null;

  // Auto-focus first enabled project
  const projects = getEnabledProjects();
  if (projects.length > 0) {
    activeProjectId = projects[0].id;
  }

  // Persist active group
  if (groupsConfig) {
    groupsConfig.activeGroupId = groupId;
    saveGroups(groupsConfig).catch(e => console.warn('Failed to save groups:', e));
  }
}

// --- Terminal tab management per project ---

export function getTerminalTabs(projectId: string): TerminalTab[] {
  return projectTerminals[projectId] ?? [];
}

export function addTerminalTab(projectId: string, tab: TerminalTab): void {
  const tabs = projectTerminals[projectId] ?? [];
  projectTerminals[projectId] = [...tabs, tab];
}

export function removeTerminalTab(projectId: string, tabId: string): void {
  const tabs = projectTerminals[projectId] ?? [];
  projectTerminals[projectId] = tabs.filter(t => t.id !== tabId);
}

// --- Persistence ---

export async function loadWorkspace(initialGroupId?: string): Promise<void> {
  try {
    const config = await loadGroups();
    groupsConfig = config;
    projectTerminals = {};

    // CLI --group flag takes priority, then explicit param, then persisted
    let cliGroup: string | null = null;
    if (!initialGroupId) {
      cliGroup = await getCliGroup();
    }
    const targetId = initialGroupId || cliGroup || config.activeGroupId;
    // Match by ID or by name (CLI users may pass name)
    const targetGroup = config.groups.find(
      g => g.id === targetId || g.name === targetId,
    );

    if (targetGroup) {
      activeGroupId = targetGroup.id;
    } else if (config.groups.length > 0) {
      activeGroupId = config.groups[0].id;
    }

    // Auto-focus first enabled project
    const projects = getEnabledProjects();
    if (projects.length > 0) {
      activeProjectId = projects[0].id;
    }
  } catch (e) {
    console.warn('Failed to load groups config:', e);
    groupsConfig = { version: 1, groups: [], activeGroupId: '' };
  }
}

export async function saveWorkspace(): Promise<void> {
  if (!groupsConfig) return;
  await saveGroups(groupsConfig);
}

// --- Group/project mutation ---

export function addGroup(group: GroupConfig): void {
  if (!groupsConfig) return;
  groupsConfig = {
    ...groupsConfig,
    groups: [...groupsConfig.groups, group],
  };
  saveGroups(groupsConfig).catch(e => console.warn('Failed to save groups:', e));
}

export function removeGroup(groupId: string): void {
  if (!groupsConfig) return;
  groupsConfig = {
    ...groupsConfig,
    groups: groupsConfig.groups.filter(g => g.id !== groupId),
  };
  if (activeGroupId === groupId) {
    activeGroupId = groupsConfig.groups[0]?.id ?? '';
    activeProjectId = null;
  }
  saveGroups(groupsConfig).catch(e => console.warn('Failed to save groups:', e));
}

export function updateProject(groupId: string, projectId: string, updates: Partial<ProjectConfig>): void {
  if (!groupsConfig) return;
  groupsConfig = {
    ...groupsConfig,
    groups: groupsConfig.groups.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        projects: g.projects.map(p => {
          if (p.id !== projectId) return p;
          return { ...p, ...updates };
        }),
      };
    }),
  };
  saveGroups(groupsConfig).catch(e => console.warn('Failed to save groups:', e));
}

export function addProject(groupId: string, project: ProjectConfig): void {
  if (!groupsConfig) return;
  const group = groupsConfig.groups.find(g => g.id === groupId);
  if (!group || group.projects.length >= 5) return;
  groupsConfig = {
    ...groupsConfig,
    groups: groupsConfig.groups.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, projects: [...g.projects, project] };
    }),
  };
  saveGroups(groupsConfig).catch(e => console.warn('Failed to save groups:', e));
}

export function removeProject(groupId: string, projectId: string): void {
  if (!groupsConfig) return;
  groupsConfig = {
    ...groupsConfig,
    groups: groupsConfig.groups.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, projects: g.projects.filter(p => p.id !== projectId) };
    }),
  };
  if (activeProjectId === projectId) {
    activeProjectId = null;
  }
  saveGroups(groupsConfig).catch(e => console.warn('Failed to save groups:', e));
}
