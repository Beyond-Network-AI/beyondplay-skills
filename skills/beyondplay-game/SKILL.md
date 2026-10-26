---
name: beyondplay-game
description: Build, check, or submit a BeyondPlay mini-game. Use when asked to make a game for BeyondPlay (a mobile-first social arcade that runs each game in an iframe on its own beyondplay.xyz subdomain), to port an existing web game into it, to check whether a game folder passes the platform's checks (validator, build, render, seed determinism, conformance, idle), or to publish a game unlisted and submit it for review through the BeyondPlay creator MCP. Covers the starter game, the single config file, the emitted manifest, the test hook the checks drive, mobile and feed rules, asset and audio licensing, wording rules, and the submit path.
license: MIT
---

# BeyondPlay game

## What a game is on this platform

A BeyondPlay game is one folder, `games/<slug>/`, inside a checkout of the
`beyondplay-skills` kit (https://github.com/Beyond-Network-AI/beyondplay-skills).
The folder is a copy of `template/` plus your code. It builds with Vite,
React 18 and TypeScript into a static `dist/`. The platform serves that
`dist/` inside an iframe: in the swipe feed, on the game page, in Telegram and
in the iOS app's WebView, at `https://<slug>.beyondplay.xyz` and
`https://app.beyondplay.xyz/game/<slug>`.

Facts that shape every decision:

- One config file: `src/beyondplay.config.ts`. The build emits
  `dist/beyondplay.json` from it. Nothing else declares the game to the platform.
- Mobile first, portrait first, one thumb. Runs last 30 to 90 seconds, restart
  is instant, and there is one clear score.
- The feed is a swipe surface: the card is already playing when it scrolls in.
  No title screen, no tap-to-start, no instruction text.
- Duels: the platform hands both players the same seed. Same seed plus same
  inputs must reproduce the identical run.
- Platform-owned files in the folder are never edited: `index.html` (except
  `<title>`), `src/main.tsx`, `src/beyondplay-kit.ts`. The hosted build
  installs the platform's own copies anyway; the validator fails a changed one.
- Nothing is published from your machine. The creator MCP uploads the source,
  builds and checks it on the platform, publishes it unlisted and submits it
  for review. See `references/submit.md`.

Read `references/contract.md`, `references/mobile-rules.md` and
`references/smoke-ladder.md` before writing code. The other references cover
assets, style and submission.

## Steps

### 0. Set up the kit (once)

```bash
git clone https://github.com/Beyond-Network-AI/beyondplay-skills
cd beyondplay-skills
npm install
npm run browser                               # Playwright's Chromium for the checks
```

Node 20 or newer. The checks on a machine without that browser can point
`CHROME_PATH` at any Chrome or Chromium binary.

### 1. Scaffold

```bash
npm run new-game -- <slug> "Display Name"      # slug: ^[a-z0-9][a-z0-9-]{2,40}$
```

The scaffold copies the template, sets `<title>`, writes
`publish.config.json` (visibility `unlisted`), `CREDITS.md`, and
`assets/icon-source.html` and `assets/banner-source.html`.

The scaffold is a complete, playable game (Tap Timing): `src/game.ts` is the
engine, `src/App.tsx` the shell, `src/beyondplay.config.ts` the declaration
and `smoke.driver.mjs` tells the checks how to play it. It builds and passes
the whole ladder as scaffolded. Replace the engine and the shell with your
game; keep their shape. `npm run dev -- games/<slug>` serves it on
http://localhost:5173 while you work.

### 2. Declare the game

`src/beyondplay.config.ts` is the only place the platform reads. A game with
a score that two players can compare declares a challenge (preferred, it
enters duels):

```ts
import { defineChallenge, defineSoloGame } from './beyondplay-kit';

export const challenge = defineChallenge({
  metricLabel: 'Score',     // what the number means: "Score", "Time", "Strokes"
  lowerIsBetter: false,     // true for time, strokes, moves
  seed: true,               // true if content varies per play
  instanceKind: 'random',   // 'static' when every play is identical
  minValue: 0,
  maxValue: 8000,           // the server rejects values outside the bounds
});

export const game = defineSoloGame({ challenge });
```

A score-only game with no duel declares itself solo and reports runs with
`game.endRun(score)`; the manifest then says `playerMode: 'single'`:

```ts
import { defineSoloGame } from './beyondplay-kit';

export const game = defineSoloGame({ lowerIsBetter: false });
```

Solo games pass the same checks and publish the same way; they do not appear
in the duel picker.

### 3. Write the engine (`src/game.ts`)

Plain TypeScript, no DOM. Seed a local PRNG (xmur3 + mulberry32) from
`getMatch()?.seed`, with a fallback string when there is no match. Fixed
timestep of 1/120 s driven by a step counter, never the wall clock. Draw all
run-plan randomness up front at run start. Keep a separate RNG for cosmetics.
Queue inputs at exact steps (`<verb>AtStep(step, ...)`) and apply the
immediate form on the next step. Fold a trajectory hash every step. Expose
`phase`, `score` and `reset()`.

### 4. Write the shell (`src/App.tsx`)

React mounts one canvas, the HUD and the end card; nothing else. Pointer events
only, with `setPointerCapture`. An accumulator loop over `requestAnimationFrame`
steps the engine in fixed steps. Hold the simulation until the iframe is in the
top-level viewport (preboot hold), then call `window.BeyondPlay?.ready()` after
the first real draw. At game over call `challenge.submit(score)` exactly once.
Listen for `window.BeyondPlay?.on('play_again', reset)` and also ship an
in-page replay button. Fire haptics from event callbacks, never from the loop.

### 5. Expose the test hook

When `?bp_test=1` is in the URL the game must expose:

```ts
window.__bpTest = {
  tick(n),                         // advance n fixed steps synchronously
  <verb>AtStep(step, ...args),     // your input verb, scheduled at an exact sim step
  state(),                         // { phase, score, hash, plan, ... }
  reset(),
};
```

In test mode the loop draws but never steps; stepping happens only through
`tick`. The checks, and any agent debugging a live game, drive this hook.

Then teach the checks to play your game in `smoke.driver.mjs` at the game
root: `play(t)` reaches game over with a score through your verb, and
`script(t)` is a fixed input schedule for the seed check. Both run inside the
page and must be self-contained. The template's driver shows the shape.

### 6. Build and run the ladder

```bash
npm run ladder -- games/<slug>          # everything below, in order, stopping at the first failure
```

or step by step:

```bash
npm run check -- game games/<slug>      # -> PASS          static validator
npm run check-build -- games/<slug>     # -> BUILD-OK      vite build + manifest, bundle shape
npm run smoke:render -- games/<slug>    # -> RENDER-OK     pixels, a played run, one bp_game_over
npm run smoke:seed -- games/<slug>      # -> DETERMINISTIC same seed, same run
npm run conformance -- games/<slug>     # -> CONFORMANT    declaration matches behaviour and dist
npm run smoke:idle -- games/<slug>      # -> IDLE-OK       an untouched run survives 12 s
npm run typecheck -- games/<slug>       # -> TYPECHECK-OK  strict TypeScript
```

`npm run check` is static: it compares the platform-owned files with the
template by hash, evaluates `src/beyondplay.config.ts`, scans the source for
the test hook, the game-over call, wallet code and external hosts, and
measures `dist/`. Each issue has a code, a path, a line and a fix; `--json`
gives the same as one object. Fix every error before the smokes; warnings
need a human decision. The hosted check runs the same rules.

The checks take the game folder and play it through its `smoke.driver.mjs`.
Never bend the game to fit a check; teach the driver instead.
`references/smoke-ladder.md` says what each check asserts and how to read a
failure.

### 7. Art, credits and metadata

Draw the game's identity in `assets/icon-source.html` (512 x 512, required)
and `assets/banner-source.html` (1920 x 1080, optional), then:

```bash
npm run render-icon -- games/<slug>        # -> assets/icon.png
npm run render-banner -- games/<slug>      # -> assets/banner.jpg
```

Fill `publish.config.json`: `name`, `tagline`, `description`, `tags`,
`ageRating`. Keep `visibility: "unlisted"`. List every asset and track in
`CREDITS.md` with author, source and licence; the scaffold ships none.

### 8. Done, then submit

Done means all of: `npm run ladder` prints `LADDER-OK`; the game boots into
play with no gate and no instruction text; you have looked at portrait
screenshots (390 x 780) of the intro, two mid-run moments and the end card
and fixed what looked wrong; the icon exists; `publish.config.json` and
`CREDITS.md` are complete.

Then `npm run pack -- games/<slug>` writes `out/<slug>.tar.gz`, and the
creator MCP takes it from there (`references/submit.md`): upload, hosted
build and checks, listing text and icon, publish unlisted, submit for review.
Approval is what lists the game.

## Hard rules

Breaking any of these ships a broken game or a rejected one.

- Report a finished run exactly once through the kit: `challenge.submit(score)`
  or `game.endRun(score)`. Never call the leaderboard yourself and never
  hand-edit `beyondplay.json`.
- Derive all procedural content from the match seed. Never `Date.now()`,
  `performance.now()` or unseeded entropy in the simulation.
- No network calls except the platform's own. No CDNs, no ads, no fonts beyond
  the template's, no localStorage abuse. Strip them when porting.
- No wallet, token or NFT gating. Holding an asset unlocks nothing; wallet
  operations belong to the host shell. Character traits are cosmetic only.
- No third-party brand names, characters or logos without a written partner
  agreement. A fan game made under such an agreement ends its description
  with the disclaimer the agreement prescribes, in the form "not affiliated
  with <the rights holder>"; see `references/style.md`.
- Every asset is one the creator has the right to put in a commercial game:
  their own work, public domain (CC0), or under a licence that allows games
  that earn money. Music follows the same rule. Name every track and clip in
  `CREDITS.md` with its source and licence; the creator attests to it on
  submission and carries the liability. CC0 is the default to reach for,
  because it needs no paperwork. Procedural sound first, before any recorded
  clip.
- Pointer events only, `touch-action: none` kept, no `100vh`, canvas scaled to
  the viewport with `devicePixelRatio` capped at 2.
- No instruction text in the UI ("tap to", "swipe to", "hold to", "drag to",
  "how to play"). No emoji in UI text unless asked.
- Do not edit platform-owned files or `template/`.
- Import only packages the kit's root `package.json` declares; the hosted
  build has exactly those and nothing else. Every addition grows every
  player's download.

## Budgets

| Item | Limit | Checked by |
|---|---|---|
| Bundle | well under 1 MB gzipped (the scaffold ships about 51 KB) | `npm run check` warns above it |
| Frame rate | 60 fps on a mid-range iPhone; one canvas; no per-frame allocations | reviewers, on a phone |
| 3D scene | at most 60 draw calls and 300k triangles with the character loaded | your own `__bpTest.perf()` |
| Idle | an untouched run is still playing at 12 s | `npm run smoke:idle` |
| Haptics | at most 400 `bp_haptic` messages in one run | reviewers |
| Initial download | at most 20 MB on phones | `npm run check`, the hosted check |
| Time to gameplay | at most 20 s, target 10 s | reviewers |
| Source archive | at most 1,500 files, 50 MB, 10 MB per file | `npm run check`, the hosted build |

## Checklist before submitting

- [ ] `npm run ladder -- games/<slug>` prints `LADDER-OK`
- [ ] `dist/beyondplay.json` has no `emitError`
- [ ] `challenge.submit()` runs once per run; restart works from the in-page button and from `bp_play_again`
- [ ] Boots into play; `bp_ready` fires once after the first draw; no how-to text; idle survives 12 s
- [ ] Portrait screenshots inspected; text readable at phone size; canvas fills the viewport
- [ ] No external requests in the network log beyond the platform and the template's font
- [ ] No brand names or third-party IP; fan disclaimer present where required; no emoji
- [ ] Every asset and track is owned, CC0 or commercially licensed, and named in `CREDITS.md`; audio unlocks on a gesture
- [ ] `assets/icon.png` rendered (and `assets/banner.jpg` if you want one)
- [ ] `publish.config.json` complete; `visibility` is `unlisted`
- [ ] `npm run pack` done; then the MCP path in `references/submit.md`

## References

- `references/contract.md`: config fields, manifest fields, the `window.BeyondPlay` SDK, messages, URL parameters, build config, `publish.config.json`.
- `references/mobile-rules.md`: touch, viewport, the feed contract, preboot hold, performance, haptics, known iOS and CSP traps.
- `references/smoke-ladder.md`: the static validator, the checks, what each asserts, how to read a failure.
- `references/assets-and-audio.md`: free libraries, procedural audio, the music and licence rule, 3D pipeline notes.
- `references/style.md`: visual direction, palettes, motion, wording rules, store metadata.
- `references/submit.md`: the creator MCP, publish unlisted first, the review ladder, what reviewers reject.
