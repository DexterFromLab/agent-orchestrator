import { describe, it, expect } from 'vitest';
import { detectWorktreeFromCwd } from './worktree-detection';

describe('detectWorktreeFromCwd', () => {
  it('detects Claude Code worktree path', () => {
    const result = detectWorktreeFromCwd('/home/user/project/.claude/worktrees/my-session');
    expect(result).toBe('/.claude/worktrees/my-session');
  });

  it('detects Codex worktree path', () => {
    const result = detectWorktreeFromCwd('/home/user/project/.codex/worktrees/task-1');
    expect(result).toBe('/.codex/worktrees/task-1');
  });

  it('detects Cursor worktree path', () => {
    const result = detectWorktreeFromCwd('/home/user/project/.cursor/worktrees/feature-x');
    expect(result).toBe('/.cursor/worktrees/feature-x');
  });

  it('returns null for non-worktree CWD', () => {
    expect(detectWorktreeFromCwd('/home/user/project')).toBeNull();
    expect(detectWorktreeFromCwd('/tmp/work')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(detectWorktreeFromCwd('')).toBeNull();
  });
});
