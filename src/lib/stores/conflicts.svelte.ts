// File overlap conflict detection — Svelte 5 runes
// Tracks which files each agent session writes to per project.
// Detects when two or more sessions write to the same file (file overlap conflict).
// Also detects external filesystem writes (S-1 Phase 2) via inotify events.

import { SessionId, ProjectId, type SessionId as SessionIdType, type ProjectId as ProjectIdType } from '../types/ids';

/** Sentinel session ID for external (non-agent) writes */
export const EXTERNAL_SESSION_ID = SessionId('__external__');

export interface FileConflict {
  /** Absolute file path */
  filePath: string;
  /** Short display name (last path segment) */
  shortName: string;
  /** Session IDs that have written to this file */
  sessionIds: SessionIdType[];
  /** Timestamp of most recent write */
  lastWriteTs: number;
  /** True if this conflict involves an external (non-agent) writer */
  isExternal: boolean;
}

export interface ProjectConflicts {
  projectId: ProjectIdType;
  /** Active file conflicts (2+ sessions writing same file) */
  conflicts: FileConflict[];
  /** Total conflicting files */
  conflictCount: number;
  /** Number of files with external write conflicts */
  externalConflictCount: number;
}

// --- State ---

interface FileWriteEntry {
  sessionIds: Set<SessionIdType>;
  lastWriteTs: number;
}

// projectId -> filePath -> FileWriteEntry
let projectFileWrites = $state<Map<ProjectIdType, Map<string, FileWriteEntry>>>(new Map());

// projectId -> set of acknowledged file paths (suppresses badge until new conflict on that file)
let acknowledgedFiles = $state<Map<ProjectIdType, Set<string>>>(new Map());

// sessionId -> worktree path (null = main working tree)
let sessionWorktrees = $state<Map<SessionIdType, string | null>>(new Map());

// projectId -> filePath -> timestamp of most recent agent write (for external write heuristic)
let agentWriteTimestamps = $state<Map<ProjectIdType, Map<string, number>>>(new Map());

// Time window: if an fs event arrives within this window after an agent tool_call write,
// it's attributed to the agent (suppressed). Otherwise it's external.
const AGENT_WRITE_GRACE_MS = 2000;

// --- Public API ---

/** Register the worktree path for a session (null = main working tree) */
export function setSessionWorktree(sessionId: SessionIdType, worktreePath: string | null): void {
  sessionWorktrees.set(sessionId, worktreePath ?? null);
}

/** Check if two sessions are in different worktrees (conflict suppression) */
function areInDifferentWorktrees(sessionIdA: SessionIdType, sessionIdB: SessionIdType): boolean {
  const wtA = sessionWorktrees.get(sessionIdA) ?? null;
  const wtB = sessionWorktrees.get(sessionIdB) ?? null;
  // Both null = same main tree, both same string = same worktree → not different
  if (wtA === wtB) return false;
  // One or both non-null and different → different worktrees
  return true;
}

/** Record that a session wrote to a file. Returns true if this creates a new conflict. */
export function recordFileWrite(projectId: ProjectIdType, sessionId: SessionIdType, filePath: string): boolean {
  let projectMap = projectFileWrites.get(projectId);
  if (!projectMap) {
    projectMap = new Map();
    projectFileWrites.set(projectId, projectMap);
  }

  // Track agent write timestamp for external write heuristic
  if (sessionId !== EXTERNAL_SESSION_ID) {
    let tsMap = agentWriteTimestamps.get(projectId);
    if (!tsMap) {
      tsMap = new Map();
      agentWriteTimestamps.set(projectId, tsMap);
    }
    tsMap.set(filePath, Date.now());
  }

  let entry = projectMap.get(filePath);
  const hadConflict = entry ? countRealConflictSessions(entry, sessionId) >= 2 : false;

  if (!entry) {
    entry = { sessionIds: new Set([sessionId]), lastWriteTs: Date.now() };
    projectMap.set(filePath, entry);
    return false;
  }

  const isNewSession = !entry.sessionIds.has(sessionId);
  entry.sessionIds.add(sessionId);
  entry.lastWriteTs = Date.now();

  // Check if this is a real conflict (not suppressed by worktrees)
  const realConflictCount = countRealConflictSessions(entry, sessionId);
  const isNewConflict = !hadConflict && realConflictCount >= 2;

  // Clear acknowledgement when a new session writes to a previously-acknowledged file
  if (isNewSession && realConflictCount >= 2) {
    const ackSet = acknowledgedFiles.get(projectId);
    if (ackSet) ackSet.delete(filePath);
  }

  return isNewConflict;
}

/**
 * Record an external filesystem write detected via inotify.
 * Uses timing heuristic: if an agent wrote this file within AGENT_WRITE_GRACE_MS,
 * the write is attributed to the agent and suppressed.
 * Returns true if this creates a new external write conflict.
 */
export function recordExternalWrite(projectId: ProjectIdType, filePath: string, timestampMs: number): boolean {
  // Timing heuristic: check if any agent recently wrote this file
  const tsMap = agentWriteTimestamps.get(projectId);
  if (tsMap) {
    const lastAgentWrite = tsMap.get(filePath);
    if (lastAgentWrite && (timestampMs - lastAgentWrite) < AGENT_WRITE_GRACE_MS) {
      // This is likely our agent's write — suppress
      return false;
    }
  }

  // Check if any agent session has written this file (for conflict to be meaningful)
  const projectMap = projectFileWrites.get(projectId);
  if (!projectMap) return false; // No agent writes at all — not a conflict
  const entry = projectMap.get(filePath);
  if (!entry || entry.sessionIds.size === 0) return false; // No agent wrote this file

  // Record external write as a conflict
  return recordFileWrite(projectId, EXTERNAL_SESSION_ID, filePath);
}

/** Get the count of external write conflicts for a project */
export function getExternalConflictCount(projectId: ProjectIdType): number {
  const projectMap = projectFileWrites.get(projectId);
  if (!projectMap) return 0;
  const ackSet = acknowledgedFiles.get(projectId);
  let count = 0;
  for (const [filePath, entry] of projectMap) {
    if (entry.sessionIds.has(EXTERNAL_SESSION_ID) && !(ackSet?.has(filePath))) {
      count++;
    }
  }
  return count;
}

/**
 * Count sessions that are in a real conflict with the given session
 * (same worktree or both in main tree). Returns total including the session itself.
 */
function countRealConflictSessions(entry: FileWriteEntry, forSessionId: SessionIdType): number {
  let count = 0;
  for (const sid of entry.sessionIds) {
    if (sid === forSessionId || !areInDifferentWorktrees(sid, forSessionId)) {
      count++;
    }
  }
  return count;
}

/** Get all conflicts for a project (excludes acknowledged and worktree-suppressed) */
export function getProjectConflicts(projectId: ProjectIdType): ProjectConflicts {
  const projectMap = projectFileWrites.get(projectId);
  if (!projectMap) return { projectId, conflicts: [], conflictCount: 0, externalConflictCount: 0 };

  const ackSet = acknowledgedFiles.get(projectId);
  const conflicts: FileConflict[] = [];
  let externalConflictCount = 0;
  for (const [filePath, entry] of projectMap) {
    if (hasRealConflict(entry) && !(ackSet?.has(filePath))) {
      const isExternal = entry.sessionIds.has(EXTERNAL_SESSION_ID);
      if (isExternal) externalConflictCount++;
      conflicts.push({
        filePath,
        shortName: filePath.split('/').pop() ?? filePath,
        sessionIds: Array.from(entry.sessionIds),
        lastWriteTs: entry.lastWriteTs,
        isExternal,
      });
    }
  }

  // Most recent conflicts first
  conflicts.sort((a, b) => b.lastWriteTs - a.lastWriteTs);
  return { projectId, conflicts, conflictCount: conflicts.length, externalConflictCount };
}

/** Check if a project has any unacknowledged real conflicts */
export function hasConflicts(projectId: ProjectIdType): boolean {
  const projectMap = projectFileWrites.get(projectId);
  if (!projectMap) return false;
  const ackSet = acknowledgedFiles.get(projectId);
  for (const [filePath, entry] of projectMap) {
    if (hasRealConflict(entry) && !(ackSet?.has(filePath))) return true;
  }
  return false;
}

/** Get total unacknowledged conflict count across all projects */
export function getTotalConflictCount(): number {
  let total = 0;
  for (const [projectId, projectMap] of projectFileWrites) {
    const ackSet = acknowledgedFiles.get(projectId);
    for (const [filePath, entry] of projectMap) {
      if (hasRealConflict(entry) && !(ackSet?.has(filePath))) total++;
    }
  }
  return total;
}

/** Check if a file write entry has a real conflict (2+ sessions in same worktree) */
function hasRealConflict(entry: FileWriteEntry): boolean {
  if (entry.sessionIds.size < 2) return false;
  // Check all pairs for same-worktree conflict
  const sids = Array.from(entry.sessionIds);
  for (let i = 0; i < sids.length; i++) {
    for (let j = i + 1; j < sids.length; j++) {
      if (!areInDifferentWorktrees(sids[i], sids[j])) return true;
    }
  }
  return false;
}

/** Acknowledge all current conflicts for a project (suppresses badge until new conflict) */
export function acknowledgeConflicts(projectId: ProjectIdType): void {
  const projectMap = projectFileWrites.get(projectId);
  if (!projectMap) return;

  const ackSet = acknowledgedFiles.get(projectId) ?? new Set();
  for (const [filePath, entry] of projectMap) {
    if (hasRealConflict(entry)) {
      ackSet.add(filePath);
    }
  }
  acknowledgedFiles.set(projectId, ackSet);
}

/** Remove a session from all file write tracking (call on session end) */
export function clearSessionWrites(projectId: ProjectIdType, sessionId: SessionIdType): void {
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
    acknowledgedFiles.delete(projectId);
  }

  // Clean up worktree tracking
  sessionWorktrees.delete(sessionId);
}

/** Clear all conflict tracking for a project */
export function clearProjectConflicts(projectId: ProjectIdType): void {
  projectFileWrites.delete(projectId);
  acknowledgedFiles.delete(projectId);
  agentWriteTimestamps.delete(projectId);
}

/** Clear all conflict state */
export function clearAllConflicts(): void {
  projectFileWrites = new Map();
  acknowledgedFiles = new Map();
  sessionWorktrees = new Map();
  agentWriteTimestamps = new Map();
}
