import { describe, it, expect } from 'vitest';
import { extractFilePaths, extractWritePaths, extractWorktreePath } from './tool-files';
import type { ToolCallContent } from '../adapters/claude-messages';

function makeTc(name: string, input: unknown): ToolCallContent {
  return { toolUseId: `tu-${Math.random()}`, name, input };
}

describe('extractFilePaths', () => {
  it('extracts Read file_path', () => {
    const result = extractFilePaths(makeTc('Read', { file_path: '/src/main.ts' }));
    expect(result).toEqual([{ path: '/src/main.ts', op: 'read' }]);
  });

  it('extracts Write file_path as write op', () => {
    const result = extractFilePaths(makeTc('Write', { file_path: '/src/out.ts' }));
    expect(result).toEqual([{ path: '/src/out.ts', op: 'write' }]);
  });

  it('extracts Edit file_path as write op', () => {
    const result = extractFilePaths(makeTc('Edit', { file_path: '/src/edit.ts' }));
    expect(result).toEqual([{ path: '/src/edit.ts', op: 'write' }]);
  });

  it('extracts Glob pattern', () => {
    const result = extractFilePaths(makeTc('Glob', { pattern: '**/*.ts' }));
    expect(result).toEqual([{ path: '**/*.ts', op: 'glob' }]);
  });

  it('extracts Grep path', () => {
    const result = extractFilePaths(makeTc('Grep', { path: '/src', pattern: 'TODO' }));
    expect(result).toEqual([{ path: '/src', op: 'grep' }]);
  });

  it('extracts Bash read paths from common commands', () => {
    const result = extractFilePaths(makeTc('Bash', { command: 'cat /etc/hosts' }));
    expect(result).toEqual([{ path: '/etc/hosts', op: 'bash' }]);
  });

  it('handles lowercase tool names', () => {
    const result = extractFilePaths(makeTc('read', { file_path: '/foo' }));
    expect(result).toEqual([{ path: '/foo', op: 'read' }]);
  });

  it('returns empty for unknown tool', () => {
    const result = extractFilePaths(makeTc('Agent', { prompt: 'do stuff' }));
    expect(result).toEqual([]);
  });

  it('returns empty when input has no file_path', () => {
    const result = extractFilePaths(makeTc('Read', {}));
    expect(result).toEqual([]);
  });

  // Bash write detection
  it('detects echo > redirect as write', () => {
    const result = extractFilePaths(makeTc('Bash', { command: 'echo "hello" > /tmp/out.txt' }));
    expect(result).toEqual([{ path: '/tmp/out.txt', op: 'write' }]);
  });

  it('detects >> append redirect as write', () => {
    const result = extractFilePaths(makeTc('Bash', { command: 'echo "data" >> /tmp/log.txt' }));
    expect(result).toEqual([{ path: '/tmp/log.txt', op: 'write' }]);
  });

  it('detects sed -i as write', () => {
    const result = extractFilePaths(makeTc('Bash', { command: "sed -i 's/foo/bar/g' /src/config.ts" }));
    expect(result).toEqual([{ path: '/src/config.ts', op: 'write' }]);
  });

  it('detects tee as write', () => {
    const result = extractFilePaths(makeTc('Bash', { command: 'echo "content" | tee /tmp/output.log' }));
    expect(result).toEqual([{ path: '/tmp/output.log', op: 'write' }]);
  });

  it('detects tee -a as write', () => {
    const result = extractFilePaths(makeTc('Bash', { command: 'echo "append" | tee -a /tmp/output.log' }));
    expect(result).toEqual([{ path: '/tmp/output.log', op: 'write' }]);
  });

  it('detects cp destination as write', () => {
    const result = extractFilePaths(makeTc('Bash', { command: 'cp /src/a.ts /src/b.ts' }));
    expect(result).toEqual([{ path: '/src/b.ts', op: 'write' }]);
  });

  it('detects mv destination as write', () => {
    const result = extractFilePaths(makeTc('Bash', { command: 'mv /old/file.ts /new/file.ts' }));
    expect(result).toEqual([{ path: '/new/file.ts', op: 'write' }]);
  });

  it('ignores /dev/null redirects', () => {
    const result = extractFilePaths(makeTc('Bash', { command: 'echo "test" > /dev/null' }));
    expect(result).toEqual([]);
  });

  it('prefers write detection over read for ambiguous commands', () => {
    // "cat file > out" should detect the write target, not the read source
    const result = extractFilePaths(makeTc('Bash', { command: 'cat /src/input.ts > /tmp/output.ts' }));
    expect(result).toEqual([{ path: '/tmp/output.ts', op: 'write' }]);
  });
});

describe('extractWritePaths', () => {
  it('returns only write-op paths for Write/Edit tools', () => {
    expect(extractWritePaths(makeTc('Write', { file_path: '/a.ts' }))).toEqual(['/a.ts']);
    expect(extractWritePaths(makeTc('Edit', { file_path: '/b.ts' }))).toEqual(['/b.ts']);
  });

  it('returns empty for read-only tools', () => {
    expect(extractWritePaths(makeTc('Read', { file_path: '/c.ts' }))).toEqual([]);
    expect(extractWritePaths(makeTc('Glob', { pattern: '*.ts' }))).toEqual([]);
    expect(extractWritePaths(makeTc('Grep', { path: '/src' }))).toEqual([]);
  });

  it('returns empty for bash read commands', () => {
    expect(extractWritePaths(makeTc('Bash', { command: 'cat /foo' }))).toEqual([]);
  });

  it('detects bash write commands', () => {
    expect(extractWritePaths(makeTc('Bash', { command: 'echo "x" > /tmp/out.ts' }))).toEqual(['/tmp/out.ts']);
    expect(extractWritePaths(makeTc('Bash', { command: "sed -i 's/a/b/' /src/file.ts" }))).toEqual(['/src/file.ts']);
    expect(extractWritePaths(makeTc('Bash', { command: 'cp /a.ts /b.ts' }))).toEqual(['/b.ts']);
  });
});

describe('extractWorktreePath', () => {
  it('detects Agent tool with isolation: worktree', () => {
    const result = extractWorktreePath(makeTc('Agent', { prompt: 'do stuff', isolation: 'worktree' }));
    expect(result).toMatch(/^worktree:/);
  });

  it('detects Task tool with isolation: worktree', () => {
    const result = extractWorktreePath(makeTc('Task', { prompt: 'do stuff', isolation: 'worktree' }));
    expect(result).toMatch(/^worktree:/);
  });

  it('returns null for Agent without isolation', () => {
    expect(extractWorktreePath(makeTc('Agent', { prompt: 'do stuff' }))).toBeNull();
  });

  it('detects EnterWorktree with path', () => {
    expect(extractWorktreePath(makeTc('EnterWorktree', { path: '/tmp/wt-1' }))).toBe('/tmp/wt-1');
  });

  it('returns null for unrelated tool', () => {
    expect(extractWorktreePath(makeTc('Read', { file_path: '/foo' }))).toBeNull();
  });
});
