# No Implicit Push

Never push to a remote repository unless the user explicitly asks for it.

## Rules

- Commits are local-only by default. Do not follow a commit with `git push`.
- Only push when the user says "push", "push it", "push to remote", or similar explicit instruction.
- When the user asks to "commit and push" in the same request, both are explicitly authorized.
- Creating a PR (via `gh pr create`) implies pushing — that is acceptable.
