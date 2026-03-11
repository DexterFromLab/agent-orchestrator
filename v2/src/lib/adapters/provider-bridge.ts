// Provider Bridge — generic adapter that delegates to provider-specific bridges
// Currently only Claude is implemented; future providers add their own bridge files

import type { ProviderId } from '../providers/types';
import { listProfiles as claudeListProfiles, listSkills as claudeListSkills, readSkill as claudeReadSkill, type ClaudeProfile, type ClaudeSkill } from './claude-bridge';

// Re-export types for consumers
export type { ClaudeProfile, ClaudeSkill };

/** List profiles for a given provider (only Claude supports this) */
export async function listProviderProfiles(provider: ProviderId): Promise<ClaudeProfile[]> {
  if (provider === 'claude') return claudeListProfiles();
  return [];
}

/** List skills for a given provider (only Claude supports this) */
export async function listProviderSkills(provider: ProviderId): Promise<ClaudeSkill[]> {
  if (provider === 'claude') return claudeListSkills();
  return [];
}

/** Read a skill file (only Claude supports this) */
export async function readProviderSkill(provider: ProviderId, path: string): Promise<string> {
  if (provider === 'claude') return claudeReadSkill(path);
  return '';
}
