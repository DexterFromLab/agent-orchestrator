import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock groups-bridge before importing the workspace store
function mockGroupsData() {
  return {
    version: 1,
    groups: [
      {
        id: 'g1',
        name: 'Group One',
        projects: [
          { id: 'p1', name: 'Project 1', identifier: 'project-1', description: '', icon: '', cwd: '/tmp/p1', profile: 'default', enabled: true },
          { id: 'p2', name: 'Project 2', identifier: 'project-2', description: '', icon: '', cwd: '/tmp/p2', profile: 'default', enabled: true },
          { id: 'p3', name: 'Disabled', identifier: 'disabled', description: '', icon: '', cwd: '/tmp/p3', profile: 'default', enabled: false },
        ],
      },
      {
        id: 'g2',
        name: 'Group Two',
        projects: [
          { id: 'p4', name: 'Project 4', identifier: 'project-4', description: '', icon: '', cwd: '/tmp/p4', profile: 'default', enabled: true },
        ],
      },
    ],
    activeGroupId: 'g1',
  };
}

vi.mock('../stores/agents.svelte', () => ({
  clearAllAgentSessions: vi.fn(),
}));

vi.mock('../stores/conflicts.svelte', () => ({
  clearAllConflicts: vi.fn(),
}));

vi.mock('../agent-dispatcher', () => ({
  waitForPendingPersistence: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../adapters/groups-bridge', () => ({
  loadGroups: vi.fn().mockImplementation(() => Promise.resolve(mockGroupsData())),
  saveGroups: vi.fn().mockResolvedValue(undefined),
  getCliGroup: vi.fn().mockResolvedValue(null),
}));

import {
  getGroupsConfig,
  getActiveGroupId,
  getActiveTab,
  getActiveProjectId,
  getActiveGroup,
  getEnabledProjects,
  getAllGroups,
  setActiveTab,
  setActiveProject,
  switchGroup,
  getTerminalTabs,
  addTerminalTab,
  removeTerminalTab,
  loadWorkspace,
  addGroup,
  removeGroup,
  updateProject,
  addProject,
  removeProject,
} from './workspace.svelte';

import { saveGroups, getCliGroup } from '../adapters/groups-bridge';

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset state by reloading
  await loadWorkspace();
});

describe('workspace store', () => {
  describe('loadWorkspace', () => {
    it('loads groups config and sets active group', async () => {
      expect(getGroupsConfig()).not.toBeNull();
      expect(getActiveGroupId()).toBe('g1');
    });

    it('auto-focuses first enabled project', async () => {
      expect(getActiveProjectId()).toBe('p1');
    });

    it('accepts initialGroupId override', async () => {
      await loadWorkspace('g2');
      expect(getActiveGroupId()).toBe('g2');
      expect(getActiveProjectId()).toBe('p4');
    });

    it('falls back to first group if target not found', async () => {
      await loadWorkspace('nonexistent');
      expect(getActiveGroupId()).toBe('g1');
    });

    it('uses CLI --group flag when no initialGroupId given', async () => {
      vi.mocked(getCliGroup).mockResolvedValueOnce('Group Two');
      await loadWorkspace();
      expect(getActiveGroupId()).toBe('g2');
    });
  });

  describe('getters', () => {
    it('getActiveGroup returns the active group config', () => {
      const group = getActiveGroup();
      expect(group).toBeDefined();
      expect(group!.id).toBe('g1');
      expect(group!.name).toBe('Group One');
    });

    it('getEnabledProjects filters disabled projects', () => {
      const projects = getEnabledProjects();
      expect(projects).toHaveLength(2);
      expect(projects.map(p => p.id)).toEqual(['p1', 'p2']);
    });

    it('getAllGroups returns all groups', () => {
      const groups = getAllGroups();
      expect(groups).toHaveLength(2);
    });
  });

  describe('setters', () => {
    it('setActiveTab changes the active tab', () => {
      setActiveTab('docs');
      expect(getActiveTab()).toBe('docs');
      setActiveTab('sessions');
      expect(getActiveTab()).toBe('sessions');
    });

    it('setActiveProject changes the active project', () => {
      setActiveProject('p2');
      expect(getActiveProjectId()).toBe('p2');
    });
  });

  describe('switchGroup', () => {
    it('switches to a different group and auto-focuses first project', async () => {
      await switchGroup('g2');
      expect(getActiveGroupId()).toBe('g2');
      expect(getActiveProjectId()).toBe('p4');
    });

    it('clears terminal tabs on group switch', async () => {
      addTerminalTab('p1', { id: 't1', title: 'Shell', type: 'shell' });
      expect(getTerminalTabs('p1')).toHaveLength(1);

      await switchGroup('g2');
      expect(getTerminalTabs('p1')).toHaveLength(0);
    });

    it('no-ops when switching to current group', async () => {
      const projectBefore = getActiveProjectId();
      vi.mocked(saveGroups).mockClear();
      await switchGroup('g1');
      // State should remain unchanged
      expect(getActiveGroupId()).toBe('g1');
      expect(getActiveProjectId()).toBe(projectBefore);
      expect(saveGroups).not.toHaveBeenCalled();
    });

    it('persists active group', async () => {
      await switchGroup('g2');
      expect(saveGroups).toHaveBeenCalled();
    });
  });

  describe('terminal tabs', () => {
    it('adds and retrieves terminal tabs per project', () => {
      addTerminalTab('p1', { id: 't1', title: 'Shell 1', type: 'shell' });
      addTerminalTab('p1', { id: 't2', title: 'Agent', type: 'agent-terminal' });
      addTerminalTab('p2', { id: 't3', title: 'SSH', type: 'ssh', sshSessionId: 'ssh1' });

      expect(getTerminalTabs('p1')).toHaveLength(2);
      expect(getTerminalTabs('p2')).toHaveLength(1);
      expect(getTerminalTabs('p2')[0].sshSessionId).toBe('ssh1');
    });

    it('removes terminal tabs by id', () => {
      addTerminalTab('p1', { id: 't1', title: 'Shell', type: 'shell' });
      addTerminalTab('p1', { id: 't2', title: 'Agent', type: 'agent-terminal' });

      removeTerminalTab('p1', 't1');
      expect(getTerminalTabs('p1')).toHaveLength(1);
      expect(getTerminalTabs('p1')[0].id).toBe('t2');
    });

    it('returns empty array for unknown project', () => {
      expect(getTerminalTabs('unknown')).toEqual([]);
    });
  });

  describe('group mutation', () => {
    it('addGroup adds a new group', () => {
      addGroup({ id: 'g3', name: 'New Group', projects: [] });
      expect(getAllGroups()).toHaveLength(3);
      expect(saveGroups).toHaveBeenCalled();
    });

    it('removeGroup removes the group and resets active if needed', () => {
      removeGroup('g1');
      expect(getAllGroups()).toHaveLength(1);
      expect(getActiveGroupId()).toBe('g2');
    });

    it('removeGroup with non-active group keeps active unchanged', () => {
      removeGroup('g2');
      expect(getAllGroups()).toHaveLength(1);
      expect(getActiveGroupId()).toBe('g1');
    });
  });

  describe('project mutation', () => {
    it('updateProject updates project fields', () => {
      updateProject('g1', 'p1', { name: 'Renamed' });
      const group = getActiveGroup()!;
      expect(group.projects.find(p => p.id === 'p1')!.name).toBe('Renamed');
      expect(saveGroups).toHaveBeenCalled();
    });

    it('addProject adds a project to a group', () => {
      addProject('g1', {
        id: 'p5', name: 'New', identifier: 'new', description: '',
        icon: '', cwd: '/tmp', profile: 'default', enabled: true,
      });
      const group = getActiveGroup()!;
      expect(group.projects).toHaveLength(4);
    });

    it('addProject respects 5-project limit', () => {
      // g1 already has 3 projects, add 2 more to reach 5
      addProject('g1', { id: 'x1', name: 'X1', identifier: 'x1', description: '', icon: '', cwd: '/tmp', profile: 'default', enabled: true });
      addProject('g1', { id: 'x2', name: 'X2', identifier: 'x2', description: '', icon: '', cwd: '/tmp', profile: 'default', enabled: true });
      // This 6th should be rejected
      addProject('g1', { id: 'x3', name: 'X3', identifier: 'x3', description: '', icon: '', cwd: '/tmp', profile: 'default', enabled: true });
      const group = getActiveGroup()!;
      expect(group.projects).toHaveLength(5);
    });

    it('removeProject removes and clears activeProjectId if needed', () => {
      setActiveProject('p1');
      removeProject('g1', 'p1');
      expect(getActiveProjectId()).toBeNull();
      const group = getActiveGroup()!;
      expect(group.projects.find(p => p.id === 'p1')).toBeUndefined();
    });
  });
});
