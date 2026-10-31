# Crew

A live crew for Claude Code. Every agent gets its own name and animated character in a pane beside the chat, so you can see who is working, on which model, and what they are saying to each other. A setup page names your subagents and connects other agents, like Codex, Gemini CLI or Cursor, through plain shared files.

## Install

At the prompt of a terminal session:

```
/plugin install crew --marketplace Mo1Amin/claude-crew
```

From a shell:

```
claude plugin install crew --marketplace Mo1Amin/claude-crew
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `Mo1Amin/claude-crew`, then **Add plugin**.

## First run

The setup page opens in your browser the first time a session starts. Open it again any time with `/crew-setup`. It takes four steps, in Arabic or English:

1. **Lead**: name Claude Code and pick its look.
2. **Subagents**: keep the suggested crew, or choose names, looks, models and effort yourself.
3. **Connect**: pick the other agents you use.
4. **Finish**: copy the prompts. One goes into Claude Code and saves your crew. Each connected agent gets its own prompt that tells it how to join.

Nothing leaves your machine: the page runs from a local file, and your crew lives in `~/.claude/crew/config.json`.

## Commands

| Command | What it does |
|---|---|
| `/crew` | Opens the crew pane |
| `/crew-setup` | Opens the setup page |
| `/crew-role lead\|worker [account] [name]` | Sets this session's role when two Claude sessions work together |
| `/crew-sound` | Plays the "everyone finished" sound |

## How connecting works

Agents share the folder `~/.claude/crew/`: a task list, a list of running agents, and one log per agent. Any agent that can read and write files can join. The full protocol is in [protocol/HANDSHAKE.md](protocol/HANDSHAKE.md).

Connected agents cannot receive messages from Claude Code, so the lead adds a task and you ask that agent to "check crew tasks". Two Claude Code sessions can message each other directly.

The shared files grant no permissions. Each agent keeps its own rules and its own approval prompts. The files carry no locking, so two agents writing at the same moment can lose a row.

## Requirements

- Claude Code 2.1.310 or newer. The plugin API is in early access and may change between releases.
- The animated pane and cards draw in the desktop app. A terminal gets a plain line of names.

---

Developed by Eng. Mohamed Amin · 1l0mt
