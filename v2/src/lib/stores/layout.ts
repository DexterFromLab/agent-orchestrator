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
}

export function removePane(id: string): void {
  panes = panes.filter(p => p.id !== id);
  if (focusedPaneId === id) {
    focusedPaneId = panes.length > 0 ? panes[0].id : null;
  }
  autoPreset();
}

export function focusPane(id: string): void {
  focusedPaneId = id;
  panes = panes.map(p => ({ ...p, focused: p.id === id }));
}

export function focusPaneByIndex(index: number): void {
  if (index >= 0 && index < panes.length) {
    focusPane(panes[index].id);
  }
}

export function setPreset(preset: LayoutPreset): void {
  activePreset = preset;
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
