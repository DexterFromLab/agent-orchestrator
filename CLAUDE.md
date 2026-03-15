# agent_orchestrator

On session start, load context:
```bash
ctx get agent_orchestrator
```

Context manager: `ctx --help`

During work:
- Save important discoveries: `ctx set agent_orchestrator <key> <value>`
- Append to existing: `ctx append agent_orchestrator <key> <value>`
- Before ending session: `ctx summary agent_orchestrator "<what was done>"`

## External AI consultation (OpenRouter)

Consult other models (GPT, Gemini, DeepSeek, etc.) for code review, cross-checks, or analysis:
```bash
consult "question"                        # ask default model
consult -m model_id "question"            # ask specific model
consult -f file.py "review this code"     # include file
consult                                   # show available models
```

## Task management (CLI tool)

IMPORTANT: Use the `tasks` CLI tool via Bash — NOT the built-in TaskCreate/TaskUpdate/TaskList tools.
The built-in task tools are a different system. Always use `tasks` in Bash.

```bash
tasks list agent_orchestrator                           # show all tasks
tasks context agent_orchestrator                        # show tasks + next task instructions
tasks add agent_orchestrator "description"              # add a task
tasks done agent_orchestrator <task_id>                 # mark task as done
tasks --help                                # full help
```

Do NOT pick up tasks on your own. Only execute tasks when the auto-trigger system sends you a command.
