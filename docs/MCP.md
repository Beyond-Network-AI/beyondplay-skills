# The BeyondPlay creator MCP

Server address: `https://app.beyondplay.xyz/api/mcp` (Streamable HTTP, OAuth 2.1
sign-in). Your BeyondPlay account needs creator access and, during the private beta,
a place on the allowlist; ask the team.

## Connect

Claude Code:

```bash
claude mcp add --transport http beyondplay https://app.beyondplay.xyz/api/mcp
```

Then `/mcp`, pick **beyondplay** and sign in. A browser window opens on BeyondPlay's
login; sign in with the account you create games with. The window closes and the tools
appear. The plugin in this repository registers the same server:

```
/plugin marketplace add Beyond-Network-AI/beyondplay-skills
/plugin install beyondplay-game@beyondplay
```

Claude.ai, ChatGPT and Cursor take the same address as a custom connector or MCP
server; each asks you to sign in the first time.

## The tools

| Tool | What it does |
|---|---|
| `whoami` | The account the agent acts as, and its access. |
| `get_contract` | The current limits, issue codes and terms version. |
| `get_template` | The starter game's files inline (the platform-owned shell and Tap Timing), for an agent without this kit; `files` selects a subset. |
| `list_projects`, `get_project` | Your projects and one project's state (build, publish, review). |
| `create_project` | A new project; send an `idempotencyKey` so a retry returns the same one. |
| `request_upload_url` | A short-lived URL to PUT one tar.gz of the game source. |
| `start_build`, `get_build` | The hosted build and checks on an upload; the report lists issues with codes and fixes. |
| `set_metadata` | Tagline, description, tags. |
| `request_icon_upload_url`, `set_icon` | The 512 x 512 icon (and the 1920 x 1080 banner). |
| `publish_unlisted` | Publish a passed build at `https://<slug>.beyondplay.xyz`, absent from the feed. |
| `submit_for_review`, `withdraw_submission`, `get_review_status` | The review gate. Submitting runs one more hosted build over the live archive; a reviewer approves once it passes, and approval lists the game. |

The archive: `npm run pack -- games/<slug>` writes `out/<slug>.tar.gz` with `src/`,
`public/`, `smoke.driver.mjs`, `CREDITS.md` and `publish.config.json`, and nothing else.
The platform keeps its own copies of the platform-owned files (`src/main.tsx`,
`src/beyondplay-kit.ts`) and notes it in the report.

Limits: 50 MB and 1,500 files per archive, 10 MB per file; one build at a time, 50 a
day, 10 in five minutes; 60 requests a minute.

The full path, step by step, with what each failure means:
`skills/beyondplay-game/references/submit.md`.

## If sign-in fails

- "private beta": your account is not on the list yet.
- "no creator access": join the creator waitlist in the app first.
- A scope error names the scope; disconnect and connect again to re-authorize.
