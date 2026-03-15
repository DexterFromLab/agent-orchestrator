# Error Handling (PARAMOUNT)

Every error must be handled explicitly. Silent failures are the most dangerous bugs.

## Rules

- Handle every caught error: log, re-throw, return error state, or recover with documented fallback. Empty catch blocks are forbidden.
- Catch specific exceptions, not blanket `catch (e)`. Propagate errors to the level that can meaningfully handle them.
- Async: handle both success and failure paths. No unhandled rejections or fire-and-forget.
- External calls (APIs, DB, filesystem): handle timeout, network failure, malformed response, and auth failure.
- Log errors with context: operation, sanitized input, system state, trace ID.
- Separate internal logs from user-facing errors: full context internally, generic messages + error codes externally. Never expose stack traces or internal paths in responses (CWE-209).
- Never log credentials, tokens, PII, or session IDs (CWE-532).
