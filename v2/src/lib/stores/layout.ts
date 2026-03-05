// Layout state management — Svelte 5 runes
// Phase 2: pane positions, resize, presets

export type LayoutPreset = '1-col' | '2-col' | '3-col' | '2x2' | 'master-stack';

export interface PaneState {
  id: string;
  sessionId: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

let activePreset = $state<LayoutPreset>('1-col');
let panes = $state<PaneState[]>([]);

export function getActivePreset() {
  return activePreset;
}

export function setPreset(preset: LayoutPreset) {
  activePreset = preset;
}

export function getPanes() {
  return panes;
}
