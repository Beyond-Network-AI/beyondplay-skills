# Run another model as the creator's agent

`npm run agent` drives any OpenAI-compatible chat model (xAI's Grok by default)
through the whole creator path: it reads the skill, scaffolds a game in this
kit, replaces the engine and the shell, runs the ladder until it passes,
renders the icon, packs the archive and takes it through the creator MCP to an
unlisted publish. The model sees the same tools a person would use: the files,
the kit's npm scripts, and the MCP. It is the honest test of the skill: a model
that never saw this platform, building a game from the written contract alone.

## Once per machine

```bash
git clone https://github.com/Beyond-Network-AI/beyondplay-skills && cd beyondplay-skills
npm install && npm run browser
npm run mcp login          # opens the browser: sign in with the account you create games with
```

The sign-in is the standard OAuth flow with a callback on this machine, so it
needs a browser here. The token is kept in `~/.config/beyondplay-skills/mcp-auth.json`
(refreshed on its own; `npm run mcp logout` forgets it). `npm run mcp` alone
prints `whoami`.

## A run

```bash
export XAI_API_KEY=...      # in your shell or a secrets manager, never in a chat
npm run agent -- "a one-thumb game about catching falling fruit"
```

Options, all optional:

| Flag | Meaning |
|---|---|
| `--slug <slug>` | The folder and the live address; the model picks one otherwise. |
| `--model <name>` | Default `grok-4` (or `XAI_MODEL`). |
| `--base-url <url>` | Any OpenAI-compatible chat endpoint; default `https://api.x.ai/v1` (or `XAI_BASE_URL`). |
| `--api-key-env <VAR>` | The variable the key is read from; default `XAI_API_KEY`. |
| `--steps <n>` | The budget of model turns; default 80. The run stops there whatever the state. |
| `--no-publish` | Stop after the ladder, the icon and the archive; nothing goes to the platform. |
| `--offline` | No sign-in and no MCP at all: build and check only. |
| `--submit` | Allow `submit_for_review` at the end; off by default, a person submits. |

The run prints each tool call and ends with the model's own summary (name,
slug, URL, what passed). The full transcript, with every tool result, is in
`out/agent-<timestamp>.log`. The game stays in `games/<slug>/` for you to read,
play and change.

## What the model may and may not do

- Read any file in the kit; write only inside `games/<slug>/`, never the
  platform-owned files.
- Run only the kit's npm scripts (`new-game`, `ladder` and its steps,
  `render-icon`, `render-banner`, `pack`) with plain arguments; no shell.
- Call the MCP tools, PUT files under `games/` or `out/` to the signed URLs the
  MCP hands out. `submit_for_review` only with `--submit`.
- Spend at most `--steps` turns.

Nothing here can touch the platform beyond the signed-in creator's own
projects, which is what the MCP's scopes allow a person too.

## Cost

Each turn resends the whole conversation, which includes the skill and the
files the model read. A run that reaches a publish is typically 30 to 60
turns; with a 128k-context model that is in the order of a few million input
tokens. Set `--steps` lower to cap it, and use `--offline` or `--no-publish`
while you are tuning the idea.
