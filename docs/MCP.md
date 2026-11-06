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
| `get_contract` | The rules as data (code, tier, the platform's alternative), the budgets, the path; `since` for what changed. |
| `check_concept` | The creator's idea and intended features against the rules: a verdict per feature with the alternative, before anything is built. |
| `get_template` | The starter game's files inline (the platform-owned shell and Tap Timing), for an agent without this kit; `files` selects a subset. |
| `list_projects`, `get_project` | Your projects and one project's state (build, publish, review). |
| `create_project` | A new project; send an `idempotencyKey` so a retry returns the same one. |
| `request_upload_url` | A short-lived URL to PUT one tar.gz of the game source. |
| `check_source` | The static rules over an upload, in seconds; fix every error before building. |
| `start_build`, `get_build` | The hosted build and checks on an upload; the report lists issues with codes, tiers and fixes. |
| `set_metadata` | Tagline, description, tags. |
| `request_icon_upload_url`, `set_icon` | The 512 x 512 icon (and the 1920 x 1080 banner). |
| `publish_unlisted` | Publish a passed build at `https://<slug>.beyondplay.xyz`, absent from the feed. |
| `reset_leaderboard` | Wipe a published game's scores, every board or one, for a fresh start after a balance change. Cannot be undone. |
| `submit_for_review`, `withdraw_submission`, `get_review_status` | The review gate. Submitting runs one more hosted build over the live archive; a reviewer approves once it passes, and approval lists the game. |

The archive: `npm run pack -- games/<slug>` writes `out/<slug>.tar.gz` with `src/`,
`public/`, `smoke.driver.mjs`, `CREDITS.md` and `publish.config.json`, and nothing else.
The platform keeps its own copies of the platform-owned files (`src/main.tsx`,
`src/beyondplay-kit.ts`) and notes it in the report. `src/beyondplay-platform.ts`
travels with the game; the report records the capabilities the game requests
(`facts.uses`, with the collection for `player.items:cobi`), and `get_contract` serves
the capability table.

## The capabilities

What a game may ask the platform for through `request(name, params)` from
`src/beyondplay-platform.ts`, declared in `uses` on `defineSoloGame`; `get_contract`
serves the live table with `since` and, for `player.items`, each offered collection
and its default item (`capabilities[].default`).

| Name | Params | Returns |
|---|---|---|
| `capabilities` | | `string[]`, the names this host offers. |
| `host` | | `{ surface, locale, reducedMotion, authenticated, apiVersion }`. |
| `player.profile` | | `{ displayName, handle, avatar }` or `null` when signed out. |
| `share` | `{ score?, text? }` | `{ outcome }`; the host opens its own share sheet. |
| `player.items` | `{ collection }` | `PlayerItem[]` in the one declared collection (`uses: ['player.items:cobi']`), `null` when signed out, no wallet, opted out or not allowed, `[]` when the wallet holds nothing. Look and sound only. |
| `player.stats` | | `{ best, plays, lastPlayedAt }` for this game, or `null`. |
| `player.friends` | | `[{ displayName, avatar, best }]` for friends who played this game, or `null`. |

Limits: 50 MB and 1,500 files per archive, 10 MB per file; one build at a time, 100 a
day, 10 in five minutes; 60 requests a minute.

The full path, step by step, with what each failure means:
`skills/beyondplay-game/references/submit.md`.

## The tiers

Every rule has a tier. `publish`: refused mechanically by the validator, `check_source` and
the hosted build. `listing`: allowed unlisted, refused at listing; the reviewer's approve waits
until the submission check carries none. `review`: the reviewer's eye. The server also sends
its rules in the MCP handshake, serves the contract, the rules and the template as resources
(`beyondplay://contract`, `beyondplay://rules`, `beyondplay://template/<path>`), and registers a
`new-game` prompt for chat clients.

## If sign-in fails

- "private beta": your account is not on the list yet.
- "no creator access": join the creator waitlist in the app first.
- A scope error names the scope; disconnect and connect again to re-authorize.
