export interface ProjectConfig {
  id: string;
  name: string;
  identifier: string;
  description: string;
  icon: string;
  cwd: string;
  profile: string;
  enabled: boolean;
  /** When true, agents for this project use git worktrees for isolation */
  useWorktrees?: boolean;
}

export interface GroupConfig {
  id: string;
  name: string;
  projects: ProjectConfig[];
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
