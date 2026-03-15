// Test fixture generator — creates isolated test environments
// Used by E2E tests to set up temp data/config dirs with valid groups.json

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

export interface TestFixture {
  /** Root temp directory for this test run */
  rootDir: string;
  /** BTERMINAL_TEST_DATA_DIR — isolated data dir */
  dataDir: string;
  /** BTERMINAL_TEST_CONFIG_DIR — isolated config dir */
  configDir: string;
  /** Path to a minimal git repo for agent testing */
  projectDir: string;
  /** Environment variables to pass to the app */
  env: Record<string, string>;
}

/**
 * Create an isolated test fixture with:
 * - Temp data dir (sessions.db, btmsg.db created at runtime)
 * - Temp config dir with a minimal groups.json
 * - A simple git repo with one file for agent testing
 */
export function createTestFixture(name = 'bterminal-e2e'): TestFixture {
  const rootDir = join(tmpdir(), `${name}-${Date.now()}`);
  const dataDir = join(rootDir, 'data');
  const configDir = join(rootDir, 'config');
  const projectDir = join(rootDir, 'test-project');

  // Create directory structure
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });

  // Create a minimal git repo for agent testing
  execSync('git init', { cwd: projectDir, stdio: 'ignore' });
  execSync('git config user.email "test@bterminal.dev"', { cwd: projectDir, stdio: 'ignore' });
  execSync('git config user.name "BTerminal Test"', { cwd: projectDir, stdio: 'ignore' });
  writeFileSync(join(projectDir, 'README.md'), '# Test Project\n\nA simple test project for BTerminal E2E tests.\n');
  writeFileSync(join(projectDir, 'hello.py'), 'def greet(name: str) -> str:\n    return f"Hello, {name}!"\n');
  execSync('git add -A && git commit -m "initial commit"', { cwd: projectDir, stdio: 'ignore' });

  // Write groups.json with one group containing the test project
  const groupsJson = {
    version: 1,
    groups: [
      {
        id: 'test-group',
        name: 'Test Group',
        projects: [
          {
            id: 'test-project',
            name: 'Test Project',
            identifier: 'test-project',
            description: 'E2E test project',
            icon: '\uf120',
            cwd: projectDir,
            profile: 'default',
            enabled: true,
          },
        ],
        agents: [],
      },
    ],
    activeGroupId: 'test-group',
  };

  writeFileSync(
    join(configDir, 'groups.json'),
    JSON.stringify(groupsJson, null, 2),
  );

  const env: Record<string, string> = {
    BTERMINAL_TEST: '1',
    BTERMINAL_TEST_DATA_DIR: dataDir,
    BTERMINAL_TEST_CONFIG_DIR: configDir,
  };

  return { rootDir, dataDir, configDir, projectDir, env };
}

/**
 * Clean up a test fixture's temporary directories.
 */
export function destroyTestFixture(fixture: TestFixture): void {
  if (existsSync(fixture.rootDir)) {
    rmSync(fixture.rootDir, { recursive: true, force: true });
  }
}

/**
 * Create a groups.json with multiple projects for multi-project testing.
 */
export function createMultiProjectFixture(projectCount = 3): TestFixture {
  const fixture = createTestFixture('bterminal-multi');

  const projects = [];
  for (let i = 0; i < projectCount; i++) {
    const projDir = join(fixture.rootDir, `project-${i}`);
    mkdirSync(projDir, { recursive: true });
    execSync('git init', { cwd: projDir, stdio: 'ignore' });
    execSync('git config user.email "test@bterminal.dev"', { cwd: projDir, stdio: 'ignore' });
    execSync('git config user.name "BTerminal Test"', { cwd: projDir, stdio: 'ignore' });
    writeFileSync(join(projDir, 'README.md'), `# Project ${i}\n`);
    execSync('git add -A && git commit -m "init"', { cwd: projDir, stdio: 'ignore' });

    projects.push({
      id: `project-${i}`,
      name: `Project ${i}`,
      identifier: `project-${i}`,
      description: `Test project ${i}`,
      icon: '\uf120',
      cwd: projDir,
      profile: 'default',
      enabled: true,
    });
  }

  const groupsJson = {
    version: 1,
    groups: [
      {
        id: 'multi-group',
        name: 'Multi Project Group',
        projects,
        agents: [],
      },
    ],
    activeGroupId: 'multi-group',
  };

  writeFileSync(
    join(fixture.configDir, 'groups.json'),
    JSON.stringify(groupsJson, null, 2),
  );

  return fixture;
}
