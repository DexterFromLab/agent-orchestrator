// Test results store — persists test run outcomes as JSON for analysis
// No native deps needed — reads/writes a JSON file

import { resolve, dirname } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = resolve(__dirname, '../../test-results/results.json');

export interface TestRunRow {
  run_id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'passed' | 'failed' | 'error';
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  duration_ms: number | null;
  git_branch: string | null;
  git_sha: string | null;
}

export interface TestStepRow {
  run_id: string;
  scenario_name: string;
  step_name: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration_ms: number | null;
  error_message: string | null;
  screenshot_path: string | null;
  agent_cost_usd: number | null;
  created_at: string;
}

interface ResultsStore {
  runs: TestRunRow[];
  steps: TestStepRow[];
}

export class ResultsDb {
  private filePath: string;
  private store: ResultsStore;

  constructor(filePath = DEFAULT_PATH) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
    this.store = this.load();
  }

  private load(): ResultsStore {
    if (existsSync(this.filePath)) {
      try {
        return JSON.parse(readFileSync(this.filePath, 'utf-8'));
      } catch {
        return { runs: [], steps: [] };
      }
    }
    return { runs: [], steps: [] };
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2));
  }

  startRun(runId: string, gitBranch?: string, gitSha?: string): void {
    this.store.runs.push({
      run_id: runId,
      started_at: new Date().toISOString(),
      finished_at: null,
      status: 'running',
      total_tests: 0,
      passed_tests: 0,
      failed_tests: 0,
      duration_ms: null,
      git_branch: gitBranch ?? null,
      git_sha: gitSha ?? null,
    });
    this.save();
  }

  finishRun(runId: string, status: 'passed' | 'failed' | 'error', durationMs: number): void {
    const run = this.store.runs.find(r => r.run_id === runId);
    if (!run) return;

    const steps = this.store.steps.filter(s => s.run_id === runId);
    run.finished_at = new Date().toISOString();
    run.status = status;
    run.duration_ms = durationMs;
    run.total_tests = steps.length;
    run.passed_tests = steps.filter(s => s.status === 'passed').length;
    run.failed_tests = steps.filter(s => s.status === 'failed' || s.status === 'error').length;
    this.save();
  }

  recordStep(step: Omit<TestStepRow, 'created_at'>): void {
    this.store.steps.push({
      ...step,
      created_at: new Date().toISOString(),
    });
    this.save();
  }

  getRecentRuns(limit = 20): TestRunRow[] {
    return this.store.runs
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, limit);
  }

  getStepsForRun(runId: string): TestStepRow[] {
    return this.store.steps.filter(s => s.run_id === runId);
  }
}
