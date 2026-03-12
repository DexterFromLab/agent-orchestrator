# Testing Gate (Post-Implementation)

Run the full test suite after every major change before considering work complete.

## What Counts as a Major Change

- New feature or component
- Refactoring that touches 3+ files
- Store, adapter, or bridge modifications
- Rust backend changes (commands, SQLite, sidecar)
- Build or CI configuration changes

## Required Command

```bash
cd v2 && npm run test:all
```

This runs vitest (frontend) + cargo test (backend). For changes touching E2E-relevant UI or interaction flows, also run:

```bash
cd v2 && npm run test:all:e2e
```

## Rules

- Do NOT skip tests to save time. A broken test suite is a blocking issue.
- If tests fail, fix them before moving on. Do not defer test fixes to a follow-up.
- If a change breaks existing tests, that's signal — investigate whether the change or the test is wrong.
- When adding new logic, add tests in the same commit (TDD preferred, see rule 06).
- After fixing test failures, re-run the full suite to confirm no cascading breakage.
- Report test results to the user: pass count, fail count, skip count.
