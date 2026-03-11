// Worktree path detection — extracts worktree paths from CWD strings
// Used by agent-dispatcher for conflict suppression (agents in different worktrees don't conflict)

const WORKTREE_CWD_PATTERNS = [
  /\/\.claude\/worktrees\/([^/]+)/,    // Claude Code: <repo>/.claude/worktrees/<name>/
  /\/\.codex\/worktrees\/([^/]+)/,     // Codex
  /\/\.cursor\/worktrees\/([^/]+)/,    // Cursor
];

/** Extract worktree path from CWD if it matches a known worktree pattern */
export function detectWorktreeFromCwd(cwd: string): string | null {
  for (const pattern of WORKTREE_CWD_PATTERNS) {
    const match = cwd.match(pattern);
    if (match) return match[0]; // Return the full worktree path segment
  }
  return null;
}
