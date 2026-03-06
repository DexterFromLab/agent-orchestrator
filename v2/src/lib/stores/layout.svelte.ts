import {
  listSessions,
  saveSession,
  deleteSession,
  updateSessionTitle,
  touchSession,
  saveLayout,
  loadLayout,
  type PersistedSession,
} from '../adapters/session-bridge';

export type LayoutPreset = '1-col' | '2-col' | '3-col' | '2x2' | 'master-stack';

export type PaneType = 'terminal' | 'agent' | 'markdown' | 'empty';

export interface Pane {
  id: string;
  type: PaneType;
  title: string;
  shell?: string;
  cwd?: string;
  args?: string[];
  focused: boolean;
}

let panes = $state<Pane[]>([]);
let activePreset = $state<LayoutPreset>('1-col');
let focusedPaneId = $state<string | null>(null);
let initialized = false;

// --- Persistence helpers (fire-and-forget with error logging) ---

function persistSession(pane: Pane): void {
  const now = Math.floor(Date.now() / 1000);
  const session: PersistedSession = {
    id: pane.id,
    type: pane.type,
    title: pane.title,
    shell: pane.shell,
    cwd: pane.cwd,
    args: pane.args,
    created_at: now,
    last_used_at: now,
  };
  saveSession(session).catch(e => console.warn('Failed to persist session:', e));
}

function persistLayout(): void {
  saveLayout({
    preset: activePreset,
    pane_ids: panes.map(p => p.id),
  }).catch(e => console.warn('Failed to persist layout:', e));
}

// --- Public API ---

export function getPanes(): Pane[] {
  return panes;
}

export function getActivePreset(): LayoutPreset {
  return activePreset;
}

export function getFocusedPaneId(): string | null {
  return focusedPaneId;
}

export function addPane(pane: Omit<Pane, 'focused'>): void {
  panes.push({ ...pane, focused: false });
  focusPane(pane.id);
  autoPreset();
  persistSession({ ...pane, focused: false });
  persistLayout();
}

export function removePane(id: string): void {
  panes = panes.filter(p => p.id !== id);
  if (focusedPaneId === id) {
    focusedPaneId = panes.length > 0 ? panes[0].id : null;
  }
  autoPreset();
  deleteSession(id).catch(e => console.warn('Failed to delete session:', e));
  persistLayout();
}

export function focusPane(id: string): void {
  focusedPaneId = id;
  panes = panes.map(p => ({ ...p, focused: p.id === id }));
  touchSession(id).catch(e => console.warn('Failed to touch session:', e));
}

export function focusPaneByIndex(index: number): void {
  if (index >= 0 && index < panes.length) {
    focusPane(panes[index].id);
  }
}

export function setPreset(preset: LayoutPreset): void {
  activePreset = preset;
  persistLayout();
}

export function renamePaneTitle(id: string, title: string): void {
  const pane = panes.find(p => p.id === id);
  if (pane) {
    pane.title = title;
    updateSessionTitle(id, title).catch(e => console.warn('Failed to update title:', e));
  }
}

/** Restore panes and layout from SQLite on app startup */
export async function restoreFromDb(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const [sessions, layout] = await Promise.all([listSessions(), loadLayout()]);

    if (layout.preset) {
      activePreset = layout.preset as LayoutPreset;
    }

    // Restore panes in layout order, falling back to DB order
    const sessionMap = new Map(sessions.map(s => [s.id, s]));
    const orderedIds = layout.pane_ids.length > 0 ? layout.pane_ids : sessions.map(s => s.id);

    for (const id of orderedIds) {
      const s = sessionMap.get(id);
      if (!s) continue;
      panes.push({
        id: s.id,
        type: s.type as PaneType,
        title: s.title,
        shell: s.shell ?? undefined,
        cwd: s.cwd ?? undefined,
        args: s.args ?? undefined,
        focused: false,
      });
    }

    if (panes.length > 0) {
      focusPane(panes[0].id);
    }
  } catch (e) {
    console.warn('Failed to restore sessions from DB:', e);
  }
}

function autoPreset(): void {
  const count = panes.length;
  if (count <= 1) activePreset = '1-col';
  else if (count === 2) activePreset = '2-col';
  else if (count === 3) activePreset = 'master-stack';
  else activePreset = '2x2';
}

/** CSS grid-template for current preset */
export function getGridTemplate(): { columns: string; rows: string } {
  switch (activePreset) {
    case '1-col':
      return { columns: '1fr', rows: '1fr' };
    case '2-col':
      return { columns: '1fr 1fr', rows: '1fr' };
    case '3-col':
      return { columns: '1fr 1fr 1fr', rows: '1fr' };
    case '2x2':
      return { columns: '1fr 1fr', rows: '1fr 1fr' };
    case 'master-stack':
      return { columns: '2fr 1fr', rows: '1fr 1fr' };
  }
}

/** For master-stack: first pane spans full height */
export function getPaneGridArea(index: number): string | undefined {
  if (activePreset === 'master-stack' && index === 0) {
    return '1 / 1 / 3 / 2';
  }
  return undefined;
}
