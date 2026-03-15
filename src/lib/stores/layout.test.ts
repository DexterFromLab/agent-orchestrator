import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock session-bridge before importing the layout store
vi.mock('../adapters/session-bridge', () => ({
  listSessions: vi.fn().mockResolvedValue([]),
  saveSession: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  updateSessionTitle: vi.fn().mockResolvedValue(undefined),
  touchSession: vi.fn().mockResolvedValue(undefined),
  saveLayout: vi.fn().mockResolvedValue(undefined),
  loadLayout: vi.fn().mockResolvedValue({ preset: '1-col', pane_ids: [] }),
}));

import {
  getPanes,
  getActivePreset,
  getFocusedPaneId,
  addPane,
  removePane,
  focusPane,
  focusPaneByIndex,
  setPreset,
  renamePaneTitle,
  getGridTemplate,
  getPaneGridArea,
  type LayoutPreset,
  type Pane,
} from './layout.svelte';

// Helper to reset module state between tests
// The layout store uses module-level $state, so we need to clean up
function clearAllPanes(): void {
  const panes = getPanes();
  const ids = panes.map(p => p.id);
  for (const id of ids) {
    removePane(id);
  }
}

beforeEach(() => {
  clearAllPanes();
  setPreset('1-col');
  vi.clearAllMocks();
});

describe('layout store', () => {
  describe('addPane', () => {
    it('adds a pane to the list', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'Terminal 1' });

      const panes = getPanes();
      expect(panes).toHaveLength(1);
      expect(panes[0].id).toBe('p1');
      expect(panes[0].type).toBe('terminal');
      expect(panes[0].title).toBe('Terminal 1');
    });

    it('sets focused to false initially then focuses via focusPane', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });

      // addPane calls focusPane internally, so the pane should be focused
      expect(getFocusedPaneId()).toBe('p1');
      const panes = getPanes();
      expect(panes[0].focused).toBe(true);
    });

    it('focuses the newly added pane', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });
      addPane({ id: 'p2', type: 'agent', title: 'Agent 1' });

      expect(getFocusedPaneId()).toBe('p2');
    });

    it('calls autoPreset when adding panes', () => {
      // 1 pane -> 1-col
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });
      expect(getActivePreset()).toBe('1-col');

      // 2 panes -> 2-col
      addPane({ id: 'p2', type: 'terminal', title: 'T2' });
      expect(getActivePreset()).toBe('2-col');

      // 3 panes -> master-stack
      addPane({ id: 'p3', type: 'terminal', title: 'T3' });
      expect(getActivePreset()).toBe('master-stack');

      // 4+ panes -> 2x2
      addPane({ id: 'p4', type: 'terminal', title: 'T4' });
      expect(getActivePreset()).toBe('2x2');
    });
  });

  describe('removePane', () => {
    it('removes a pane by id', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });
      addPane({ id: 'p2', type: 'terminal', title: 'T2' });

      removePane('p1');

      const panes = getPanes();
      expect(panes).toHaveLength(1);
      expect(panes[0].id).toBe('p2');
    });

    it('focuses the first remaining pane when focused pane is removed', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });
      addPane({ id: 'p2', type: 'terminal', title: 'T2' });
      addPane({ id: 'p3', type: 'terminal', title: 'T3' });

      // p3 is focused (last added)
      expect(getFocusedPaneId()).toBe('p3');

      removePane('p3');

      // Should focus p1 (first remaining)
      expect(getFocusedPaneId()).toBe('p1');
    });

    it('sets focusedPaneId to null when last pane is removed', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });
      removePane('p1');

      expect(getFocusedPaneId()).toBeNull();
    });

    it('adjusts preset via autoPreset after removal', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });
      addPane({ id: 'p2', type: 'terminal', title: 'T2' });
      expect(getActivePreset()).toBe('2-col');

      removePane('p2');
      expect(getActivePreset()).toBe('1-col');
    });

    it('does not change focus if removed pane was not focused', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });
      addPane({ id: 'p2', type: 'terminal', title: 'T2' });

      // p2 is focused (last added). Remove p1
      focusPane('p2');
      removePane('p1');

      expect(getFocusedPaneId()).toBe('p2');
    });
  });

  describe('focusPane', () => {
    it('sets focused flag on the target pane', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });
      addPane({ id: 'p2', type: 'terminal', title: 'T2' });

      focusPane('p1');

      const panes = getPanes();
      expect(panes.find(p => p.id === 'p1')?.focused).toBe(true);
      expect(panes.find(p => p.id === 'p2')?.focused).toBe(false);
      expect(getFocusedPaneId()).toBe('p1');
    });
  });

  describe('focusPaneByIndex', () => {
    it('focuses pane at the given index', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });
      addPane({ id: 'p2', type: 'terminal', title: 'T2' });

      focusPaneByIndex(0);

      expect(getFocusedPaneId()).toBe('p1');
    });

    it('ignores out-of-bounds indices', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });

      focusPaneByIndex(5);

      // Should remain on p1
      expect(getFocusedPaneId()).toBe('p1');
    });

    it('ignores negative indices', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });

      focusPaneByIndex(-1);

      expect(getFocusedPaneId()).toBe('p1');
    });
  });

  describe('setPreset', () => {
    it('overrides the active preset', () => {
      setPreset('3-col');
      expect(getActivePreset()).toBe('3-col');
    });

    it('allows setting any valid preset', () => {
      const presets: LayoutPreset[] = ['1-col', '2-col', '3-col', '2x2', 'master-stack'];
      for (const preset of presets) {
        setPreset(preset);
        expect(getActivePreset()).toBe(preset);
      }
    });
  });

  describe('renamePaneTitle', () => {
    it('updates the title of a pane', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'Old Title' });

      renamePaneTitle('p1', 'New Title');

      const panes = getPanes();
      expect(panes[0].title).toBe('New Title');
    });

    it('does nothing for non-existent pane', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'Title' });

      renamePaneTitle('p-nonexistent', 'New Title');

      expect(getPanes()[0].title).toBe('Title');
    });
  });

  describe('getGridTemplate', () => {
    it('returns 1fr / 1fr for 1-col', () => {
      setPreset('1-col');
      expect(getGridTemplate()).toEqual({ columns: '1fr', rows: '1fr' });
    });

    it('returns 1fr 1fr / 1fr for 2-col', () => {
      setPreset('2-col');
      expect(getGridTemplate()).toEqual({ columns: '1fr 1fr', rows: '1fr' });
    });

    it('returns 1fr 1fr 1fr / 1fr for 3-col', () => {
      setPreset('3-col');
      expect(getGridTemplate()).toEqual({ columns: '1fr 1fr 1fr', rows: '1fr' });
    });

    it('returns 1fr 1fr / 1fr 1fr for 2x2', () => {
      setPreset('2x2');
      expect(getGridTemplate()).toEqual({ columns: '1fr 1fr', rows: '1fr 1fr' });
    });

    it('returns 2fr 1fr / 1fr 1fr for master-stack', () => {
      setPreset('master-stack');
      expect(getGridTemplate()).toEqual({ columns: '2fr 1fr', rows: '1fr 1fr' });
    });
  });

  describe('getPaneGridArea', () => {
    it('returns grid area for first pane in master-stack', () => {
      setPreset('master-stack');
      expect(getPaneGridArea(0)).toBe('1 / 1 / 3 / 2');
    });

    it('returns undefined for non-first panes in master-stack', () => {
      setPreset('master-stack');
      expect(getPaneGridArea(1)).toBeUndefined();
      expect(getPaneGridArea(2)).toBeUndefined();
    });

    it('returns undefined for all panes in non-master-stack presets', () => {
      setPreset('2-col');
      expect(getPaneGridArea(0)).toBeUndefined();
      expect(getPaneGridArea(1)).toBeUndefined();
    });
  });

  describe('autoPreset behavior', () => {
    it('0 panes -> 1-col', () => {
      expect(getActivePreset()).toBe('1-col');
    });

    it('1 pane -> 1-col', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });
      expect(getActivePreset()).toBe('1-col');
    });

    it('2 panes -> 2-col', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });
      addPane({ id: 'p2', type: 'terminal', title: 'T2' });
      expect(getActivePreset()).toBe('2-col');
    });

    it('3 panes -> master-stack', () => {
      addPane({ id: 'p1', type: 'terminal', title: 'T1' });
      addPane({ id: 'p2', type: 'terminal', title: 'T2' });
      addPane({ id: 'p3', type: 'terminal', title: 'T3' });
      expect(getActivePreset()).toBe('master-stack');
    });

    it('4+ panes -> 2x2', () => {
      for (let i = 1; i <= 5; i++) {
        addPane({ id: `p${i}`, type: 'terminal', title: `T${i}` });
      }
      expect(getActivePreset()).toBe('2x2');
    });
  });
});
