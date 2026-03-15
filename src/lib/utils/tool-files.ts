// Extracts file paths from agent tool_call inputs
// Used by ContextTab (all file ops) and conflicts store (write ops only)

import type { ToolCallContent } from '../adapters/claude-messages';

export interface ToolFileRef {
  path: string;
  op: 'read' | 'write' | 'glob' | 'grep' | 'bash';
}

// Patterns for read-like bash commands
const BASH_READ_RE = /(?:cat|head|tail|less|vim|nano|code)\s+["']?([^\s"'|;&]+)/;

// Patterns for bash commands that write to files
const BASH_WRITE_PATTERNS: RegExp[] = [
  // Redirection: echo/printf/cat ... > file or >> file
  /(?:>>?)\s*["']?([^\s"'|;&]+)/,
  // sed -i (in-place edit)
  /\bsed\s+(?:-[^i\s]*)?-i[^-]?\s*(?:'[^']*'|"[^"]*"|[^\s]+\s+)["']?([^\s"'|;&]+)/,
  // tee file
  /\btee\s+(?:-a\s+)?["']?([^\s"'|;&]+)/,
  // cp source dest — last arg is destination
  /\bcp\s+(?:-[^\s]*\s+)*[^\s]+\s+["']?([^\s"'|;&]+)/,
  // mv source dest — last arg is destination
  /\bmv\s+(?:-[^\s]*\s+)*[^\s]+\s+["']?([^\s"'|;&]+)/,
  // chmod/chown — modifies file metadata
  /\b(?:chmod|chown)\s+(?:-[^\s]*\s+)*[^\s]+\s+["']?([^\s"'|;&]+)/,
];

/** Extract file paths referenced by a tool call */
export function extractFilePaths(tc: ToolCallContent): ToolFileRef[] {
  const results: ToolFileRef[] = [];
  const input = tc.input as Record<string, unknown>;

  switch (tc.name) {
    case 'Read':
    case 'read':
      if (input?.file_path) results.push({ path: String(input.file_path), op: 'read' });
      break;
    case 'Write':
    case 'write':
      if (input?.file_path) results.push({ path: String(input.file_path), op: 'write' });
      break;
    case 'Edit':
    case 'edit':
      if (input?.file_path) results.push({ path: String(input.file_path), op: 'write' });
      break;
    case 'Glob':
    case 'glob':
      if (input?.pattern) results.push({ path: String(input.pattern), op: 'glob' });
      break;
    case 'Grep':
    case 'grep':
      if (input?.path) results.push({ path: String(input.path), op: 'grep' });
      break;
    case 'Bash':
    case 'bash': {
      const cmd = String(input?.command ?? '');
      // Check for write patterns first
      const writeRefs = extractBashWritePaths(cmd);
      for (const path of writeRefs) {
        results.push({ path, op: 'write' });
      }
      // Check for read patterns (only if no write detected to avoid double-counting)
      if (writeRefs.length === 0) {
        const readMatch = cmd.match(BASH_READ_RE);
        if (readMatch) results.push({ path: readMatch[1], op: 'bash' });
      }
      break;
    }
  }
  return results;
}

/** Extract write-target file paths from a bash command string */
function extractBashWritePaths(cmd: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const pattern of BASH_WRITE_PATTERNS) {
    const match = cmd.match(pattern);
    if (match && match[1] && !seen.has(match[1])) {
      // Filter out obvious non-file targets (flags, -, /dev/null)
      const target = match[1];
      if (target === '-' || target.startsWith('-') || target === '/dev/null') continue;
      seen.add(target);
      paths.push(target);
    }
  }

  return paths;
}

/** Extract only write-operation file paths (Write, Edit, and Bash writes) */
export function extractWritePaths(tc: ToolCallContent): string[] {
  return extractFilePaths(tc)
    .filter(r => r.op === 'write')
    .map(r => r.path);
}

/** Extract worktree path from an Agent/Task tool call with isolation: "worktree", or EnterWorktree */
export function extractWorktreePath(tc: ToolCallContent): string | null {
  const input = tc.input as Record<string, unknown> | null;
  if (!input) return null;

  const name = tc.name;
  // Agent/Task tool with isolation: "worktree"
  if ((name === 'Agent' || name === 'Task' || name === 'dispatch_agent') && input.isolation === 'worktree') {
    // The worktree path comes from the tool_result, not the tool_call.
    // But we can flag this session as "worktree-isolated" with a synthetic marker.
    return `worktree:${tc.toolUseId}`;
  }

  // EnterWorktree tool call carries the path directly
  if (name === 'EnterWorktree' && typeof input.path === 'string') {
    return input.path;
  }

  return null;
}
