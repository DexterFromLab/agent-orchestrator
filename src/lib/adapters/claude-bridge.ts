// Claude Bridge — Tauri IPC adapter for Claude profiles and skills
import { invoke } from '@tauri-apps/api/core';

export interface ClaudeProfile {
  name: string;
  email: string | null;
  subscription_type: string | null;
  display_name: string | null;
  config_dir: string;
}

export interface ClaudeSkill {
  name: string;
  description: string;
  source_path: string;
}

export async function listProfiles(): Promise<ClaudeProfile[]> {
  return invoke<ClaudeProfile[]>('claude_list_profiles');
}

export async function listSkills(): Promise<ClaudeSkill[]> {
  return invoke<ClaudeSkill[]>('claude_list_skills');
}

export async function readSkill(path: string): Promise<string> {
  return invoke<string>('claude_read_skill', { path });
}
