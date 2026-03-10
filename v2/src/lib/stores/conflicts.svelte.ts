// File overlap conflict detection — Svelte 5 runes
// Tracks which files each agent session writes to per project.
// Detects when two or more sessions write to the same file (file overlap conflict).

export interface FileConflict {
  /** Absolute file path */
  filePath: string;
  /** Short display name (last path segment) */
  shortName: string;
  /** Session IDs that have written to this file */
  sessionIds: string[];
  /** Timestamp of most recent write */
  lastWriteTs: number;
}

export interface ProjectConflicts {
  projectId: string;
  /** Active file conflicts (2+ sessions writing same file) */
  conflicts: FileConflict[];
  /** Total conflicting files */
  conflictCount: number;
}

// --- State ---

interface FileWriteEntry {
  sessionIds: Set<string>;
  lastWriteTs: number;
}

// projectId -> filePath -> FileWriteEntry
let projectFileWrites = $state<Map<string, Map<string, FileWriteEntry>>>(new Map());

// --- Public API ---

/** Record that a session wrote to a file. Returns true if this creates a new conflict. */
export function recordFileWrite(projectId: string, sessionId: string, filePath: string): boolean {
  let projectMap = projectFileWrites.get(projectId);
  if (!projectMap) {
    projectMap = new Map();
    projectFileWrites.set(projectId, projectMap);
  }

  let entry = projectMap.get(filePath);
  const hadConflict = entry ? entry.sessionIds.size >= 2 : false;

  if (!entry) {
    entry = { sessionIds: new Set([sessionId]), lastWriteTs: Date.now() };
    projectMap.set(filePath, entry);
    return false;
  }

  entry.sessionIds.add(sessionId);
  entry.lastWriteTs = Date.now();

  // New conflict = we just went from 1 session to 2+
  return !hadConflict && entry.sessionIds.size >= 2;
}

/** Get all conflicts for a project */
export function getProjectConflicts(projectId: string): ProjectConflicts {
  const projectMap = projectFileWrites.get(projectId);
  if (!projectMap) return { projectId, conflicts: [], conflictCount: 0 };

  const conflicts: FileConflict[] = [];
  for (const [filePath, entry] of projectMap) {
    if (entry.sessionIds.size >= 2) {
      conflicts.push({
        filePath,
        shortName: filePath.split('/').pop() ?? filePath,
        sessionIds: Array.from(entry.sessionIds),
        lastWriteTs: entry.lastWriteTs,
      });
    }
  }

  // Most recent conflicts first
  conflicts.sort((a, b) => b.lastWriteTs - a.lastWriteTs);
  return { projectId, conflicts, conflictCount: conflicts.length };
}

/** Check if a project has any file conflicts */
export function hasConflicts(projectId: string): boolean {
  const projectMap = projectFileWrites.get(projectId);
  if (!projectMap) return false;
  for (const entry of projectMap.values()) {
    if (entry.sessionIds.size >= 2) return true;
  }
  return false;
}

/** Get total conflict count across all projects */
export function getTotalConflictCount(): number {
  let total = 0;
  for (const projectMap of projectFileWrites.values()) {
    for (const entry of projectMap.values()) {
      if (entry.sessionIds.size >= 2) total++;
    }
  }
  return total;
}

/** Remove a session from all file write tracking (call on session end) */
export function clearSessionWrites(projectId: string, sessionId: string): void {
  const projectMap = projectFileWrites.get(projectId);
  if (!projectMap) return;

  for (const [filePath, entry] of projectMap) {
    entry.sessionIds.delete(sessionId);
    if (entry.sessionIds.size === 0) {
      projectMap.delete(filePath);
    }
  }

  if (projectMap.size === 0) {
    projectFileWrites.delete(projectId);
  }
}

/** Clear all conflict tracking for a project */
export function clearProjectConflicts(projectId: string): void {
  projectFileWrites.delete(projectId);
}

/** Clear all conflict state */
export function clearAllConflicts(): void {
  projectFileWrites = new Map();
}
