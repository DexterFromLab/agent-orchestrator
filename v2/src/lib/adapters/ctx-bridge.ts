import { invoke } from '@tauri-apps/api/core';

export interface CtxProject {
  name: string;
  description: string;
  work_dir: string | null;
  created_at: string;
}

export interface CtxEntry {
  project: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface CtxSummary {
  project: string;
  summary: string;
  created_at: string;
}

export async function ctxListProjects(): Promise<CtxProject[]> {
  return invoke('ctx_list_projects');
}

export async function ctxGetContext(project: string): Promise<CtxEntry[]> {
  return invoke('ctx_get_context', { project });
}

export async function ctxGetShared(): Promise<CtxEntry[]> {
  return invoke('ctx_get_shared');
}

export async function ctxGetSummaries(project: string, limit: number = 5): Promise<CtxSummary[]> {
  return invoke('ctx_get_summaries', { project, limit });
}

export async function ctxSearch(query: string): Promise<CtxEntry[]> {
  return invoke('ctx_search', { query });
}
