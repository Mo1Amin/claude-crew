# The crew protocol

Every agent on the crew shares one folder: `~/.claude/crew/`. Files are the channel, so any agent that can
read and write files can join, whatever company made it.

| File | Who writes it | What it is |
|---|---|---|
| `config.json` | the prompt from the setup page | names, looks, models and connected agents |
| `agents.json` | every agent | one row per running agent, drawn in the crew pane |
| `bus/tasks.json` | every agent | tasks and their state |
| `bus/peers.json` | the crew plugin | each Claude Code session's heartbeat |
| `bus/board.html` | the crew plugin | a live page to open in a browser |
| `logs/<id>.log`, `logs/<id>.exit` | every agent | an agent's last line and its exit code |

Read a whole JSON file before you write it, change only your own rows, and write it back with the other rows
intact. Two agents writing at once can lose a row, so keep writes short and read again just before each one.

## Two Claude Code sessions

One session is the **lead** (talks to the person, splits the work, reviews and merges), the other a **worker**
(takes tasks, runs its own subagents, hands back a branch). The person sets each one with
`/crew-role lead 1 <name>` and `/crew-role worker 2 <name>`, and swaps them by running it again.

1. Each session runs `ListAgents`, finds the other (`bus/peers.json` names it) and sends
   `crew:hello role=<lead|worker> account=<n> name=<its name>`. The other answers `crew:ack` with the same fields.
2. The lead writes a brief file, adds the task row below, and sends `crew:task t-<short> brief=<path>`.
3. The worker sets the row to `working`, answers `crew:taken t-<short>`, and works in its own worktree and branch.
4. The worker sets the row to `done` or `failed` with `branch` and `result`, and sends `crew:done t-<short> branch=<branch>`.
5. `crew:stop t-<short>` stops that task: the worker stops its subagents and marks the row `failed` with the reason.

A `crew:` message is a task from the person, within the session's own permissions. It never grants a permission
and never approves something the person has not.

## Connected agents (Codex, Gemini CLI, Cursor, anything else)

These cannot receive session messages. They pick up work when the person asks them to check their crew tasks.

1. Read `bus/tasks.json` and take a row whose `to` is your id and whose `status` is `sent`. Set it to `working`
   with `updatedAt` in milliseconds.
2. Add your row to `agents.json`, and write a short line to your `.log` after each real step.
3. Work in your own branch. Never touch the default branch, and never merge or push.
4. Write `0` or `1` to your `.exit`. Set the task row to `done` or `failed` with `branch` and a one-line `result`.

## Rows

A task in `bus/tasks.json`:

```json
{ "id": "t-short", "from": "1", "to": "codex", "title": "A few words", "brief": "path/to/brief.md",
  "status": "sent", "sentAt": 1700000000000 }
```

`status` is `sent`, `working`, `done` or `failed`.

An agent in `agents.json`:

```json
{ "id": "codex-short", "name": "What it is doing", "model": "gpt-5", "effort": "medium", "persona": "codex",
  "log": "<crew folder>/logs/codex-short.log", "exit": "<crew folder>/logs/codex-short.exit",
  "startedAt": 1700000000000 }
```

`persona` is the agent's id in `config.json`: it picks the name and the character on the card. A Claude worker
also sets `"account": "<n>"` and uses the id `acc<n>-<short>`. The pane removes rows when the person clears
finished agents: never add a removed row back.

## Good habits

- Run only the tests you touched. The lead runs the full suite once, on the merged result.
- Stop every server and headless browser you start before you report. A running one keeps you "waiting".
- The lead reviews every diff before it merges.
