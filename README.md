# beyondplay-skills

Build a game for [BeyondPlay](https://beyondplay.xyz) with your own agent, on your
own machine, and ship it through the creator MCP. BeyondPlay is a mobile-first social
arcade: each game runs in an iframe on its own `beyondplay.xyz` subdomain, in a swipe
feed, on a game page, in Telegram and in the iOS app, with seeded duels between
players.

This kit is everything the agent needs and nothing it does not:

| Folder | What it is |
|---|---|
| `skills/beyondplay-game/` | The skill: the platform contract, the mobile and feed rules, the checks, assets and audio, style, submission. Works in Claude Code and in any agent that reads `SKILL.md`. |
| `template/` | The starter game (Tap Timing): the platform-owned shell, the one config file, a deterministic engine, a React shell, the test hook and the driver the checks use. Builds and passes every check as shipped. |
| `tools/beyondplay-check/` | The validator: the same rules, codes and limits as the platform's hosted check. |
| `scripts/` | Scaffold, build, the browser checks, conformance, art rendering, packing. |
| `docs/MCP.md` | Connecting to the creator MCP and what its tools do. |
| `docs/player-items.md` | The player's own bull in a game: declare the collection, request the items, load a kit bull or draw the image, what is not allowed. |
| `docs/display.md` | How a game is shown and played on a large screen: `defineDisplay` (orientation, input, keys), the key grammar, the viewport and key helpers, the checks. |

## Quick start

```bash
git clone https://github.com/Beyond-Network-AI/beyondplay-skills
cd beyondplay-skills
npm install
npm run browser                                   # Playwright's Chromium for the checks

npm run new-game -- my-game "My Game"             # games/my-game, a complete playable game
npm run dev -- games/my-game                      # http://localhost:5173
npm run ladder -- games/my-game                   # validator, build, render, seed, conformance, idle, keys, perf, typecheck
npm run render-icon -- games/my-game              # assets/icon.png from assets/icon-source.html
npm run pack -- games/my-game                     # out/my-game.tar.gz for the MCP
```

Node 20 or newer. On a machine without Playwright's download, point `CHROME_PATH` at
any Chrome or Chromium binary.

The ladder's steps, in order: the static validator (`PASS`), the build (`BUILD-OK`),
the render smoke (`RENDER-OK`, once per orientation the game declares), the seed smoke
(`DETERMINISTIC`), conformance (`CONFORMANT`), the idle smoke (`IDLE-OK`), the keys
smoke (`KEYS-OK`: each declared key moves the run; at once for a game without
keyboard), the performance smoke (`PERF-OK`, or `PERF-WARN` with its findings) and the
typecheck (`TYPECHECK-OK`). The performance smoke plays the game for a minute on a
portrait phone viewport with the CPU throttled four times and reports the time to first
frame (budget 5 s), the 95th percentile frame time (33 ms), draw calls and triangles
for a three.js game that exposes `__bpTest.perf()` (60 and 300,000) and the heap; its
findings are listing tier, so the ladder reports them and goes on (`--perf-strict`
stops it). `skills/beyondplay-game/references/smoke-ladder.md` has what each step
asserts.

## With Claude Code

```
/plugin marketplace add Beyond-Network-AI/beyondplay-skills
/plugin install beyondplay-game@beyondplay
```

That installs the skill and registers the creator MCP (`/mcp`, then sign in). Any
other agent can read `skills/beyondplay-game/SKILL.md` directly; the skill's commands
are plain `npm run` scripts in this repository.

Then ask for a game. The agent scaffolds it, replaces the engine and the shell,
teaches `smoke.driver.mjs` to play it, runs the ladder until it prints `LADDER-OK`,
packs it, and takes it through the MCP: upload, hosted build and checks, listing text
and icon, publish unlisted (playable by link), submit for review. A reviewer approves,
and the game is listed.

## Any model as the agent

```bash
npm run mcp login                                              # once: sign in through the browser
XAI_API_KEY=... npm run agent -- "a one-thumb game about catching falling fruit"
```

`npm run agent` drives any OpenAI-compatible model (xAI's Grok by default) through
the whole path above, with the kit's scripts and the creator MCP as its tools, and ends
with an unlisted publish. `docs/AGENT.md` has the flags (`--offline`, `--no-publish`,
`--steps`, `--model`, `--base-url`).

## The rules in one breath

One config file (`src/beyondplay.config.ts`). Portrait first, one thumb (a wide view
and keys are declared with `defineDisplay`), 30 to 90 second runs, no title screen and
no instruction text. Same seed plus same inputs reproduce the same run. One
`challenge.submit(score)` per run. No network beyond the platform, no wallet or token
gating, no third-party brands without an agreement, every asset and track owned, CC0 or
commercially licensed and named in `CREDITS.md`. The platform-owned files are never
edited. The skill has the long form.

A game can show the player's own bull. Declare the collection with the capability
(`uses: ['share', 'player.items:cobi']`), ask the platform for the items in
`src/App.tsx` (`request('player.items', { collection: 'cobi' })`), and fall back to
the collection's default when the answer is `null` or empty. The platform hands over
items (name, image, traits, a model the kit's `src/cobi-kit.ts` assembles), never a
wallet, a chain or a balance; items change how a run looks and sounds, never how it
plays. `docs/player-items.md` is the recipe.

## Maintenance

`npm run sync-cobi-kit -- <path to a beyondplay-games checkout>` brings the COBI loader (`library/characters/cobi.ts` there, the one copy) into `template/src/cobi-kit.ts` under a sync header and records its commit and SHA-256 in `template/src/cobi-kit.SOURCE.json`; `npm run sync-cobi-kit -- --check` confirms the copy still matches the record.

## Access

The creator MCP is in private beta: your BeyondPlay account needs creator access and a
place on the allowlist. Ask the team. Everything else here works without it.

## Licence

MIT. Games you build are yours; what you grant the platform is in the creator terms you
accept on submission.
