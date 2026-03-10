import { describe, it, expect } from 'vitest';
import { extractFilePaths, extractWritePaths } from './tool-files';
import type { ToolCallContent } from '../adapters/sdk-messages';

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

  it('extracts Bash file paths from common commands', () => {
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
});

describe('extractWritePaths', () => {
  it('returns only write-op paths', () => {
    expect(extractWritePaths(makeTc('Write', { file_path: '/a.ts' }))).toEqual(['/a.ts']);
    expect(extractWritePaths(makeTc('Edit', { file_path: '/b.ts' }))).toEqual(['/b.ts']);
  });

  it('returns empty for read-only tools', () => {
    expect(extractWritePaths(makeTc('Read', { file_path: '/c.ts' }))).toEqual([]);
    expect(extractWritePaths(makeTc('Glob', { pattern: '*.ts' }))).toEqual([]);
    expect(extractWritePaths(makeTc('Grep', { path: '/src' }))).toEqual([]);
  });

  it('returns empty for bash commands', () => {
    expect(extractWritePaths(makeTc('Bash', { command: 'cat /foo' }))).toEqual([]);
  });
});
