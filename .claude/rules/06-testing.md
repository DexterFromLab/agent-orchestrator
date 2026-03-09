# Testing

Assume nothing about correctness — prove it with tests.

## Unit Tests

- Write the test first for non-trivial logic (TDD). Implement until it passes.
- Every new function/method/module with logic gets unit tests.
- Run existing tests after every change. Fix breaks before moving on.

## Integration Tests

- Test module boundaries: DB queries, external APIs, filesystem, message queues.
- Use real dependencies (or containers) — not mocks. Mocks belong in unit tests.
- Target 70/20/10 ratio: unit/integration/E2E.

## End-to-End Tests

- Critical user journeys only (~10% of suite). Test API endpoints with integration tests, not E2E.

## Browser Automation

Choose the right tool for the job:

| Tool | Use When |
|------|----------|
| **Claude in Chrome** | Authenticated sites, user's logged-in session needed |
| **Playwright MCP** | Cross-browser testing, E2E test suites, CI-style validation |
| **Puppeteer MCP** | Quick DOM scripting, page scraping, lightweight checks |
| **Chrome DevTools MCP** | Deep debugging (performance traces, network waterfall, memory) |

- Prefer Playwright for repeatable E2E tests (deterministic, headless-capable).
- Use Claude in Chrome when the test requires an existing authenticated session.
- Use DevTools MCP for performance profiling and network analysis, not functional tests.

## After Every Change

- Run the test suite, report results, fix failures before continuing.
- If no test framework exists, flag it and propose a testing strategy.
