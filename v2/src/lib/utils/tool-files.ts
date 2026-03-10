// Extracts file paths from agent tool_call inputs
// Used by ContextTab (all file ops) and conflicts store (write ops only)

import type { ToolCallContent } from '../adapters/sdk-messages';

export interface ToolFileRef {
  path: string;
  op: 'read' | 'write' | 'glob' | 'grep' | 'bash';
}

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
      const fileMatch = cmd.match(/(?:cat|head|tail|less|vim|nano|code)\s+["']?([^\s"'|;&]+)/);
      if (fileMatch) results.push({ path: fileMatch[1], op: 'bash' });
      break;
    }
  }
  return results;
}

/** Extract only write-operation file paths (Write, Edit) */
export function extractWritePaths(tc: ToolCallContent): string[] {
  return extractFilePaths(tc)
    .filter(r => r.op === 'write')
    .map(r => r.path);
}
