# The checks

Sources: `scripts/*.mjs` and `tools/beyondplay-check/` in this kit, and the
hosted check the creator MCP runs (`start_build` and `get_build`).

Every check prints one OK token on its last line and exits non-zero
otherwise. `npm run ladder -- games/<slug>` runs them all in order and stops
at the first failure. The local run is a fast doctor; the hosted run on
submission decides.

| Order | Command | OK token | Failure prefix |
|---|---|---|---|
| 0 | `npm run check -- game games/<slug>` | `PASS` | `FAIL:` |
| 1 | `npm run check-build -- games/<slug>` | `BUILD-OK` | `BUILD-FAIL:` |
| 2 | `npm run smoke:render -- games/<slug>` | `RENDER-OK` | `RENDER-FAIL:` |
| 3 | `npm run smoke:seed -- games/<slug>` | `DETERMINISTIC` | `SEED-FAIL:` |
| 4 | `npm run conformance -- games/<slug>` | `CONFORMANT` | `CONFORMANCE-FAIL:` |
| 5 | `npm run smoke:idle -- games/<slug>` | `IDLE-OK` | `IDLE-FAIL:` |
| 6 | `npm run typecheck -- games/<slug>` | `TYPECHECK-OK` | tsc errors |

The browser checks need Playwright's Chromium (`npm run browser`), or a
`CHROME_PATH` pointing at any Chrome or Chromium binary. They serve
`games/<slug>/dist` on a local port, so build first (`check-build` does).

## The driver

The checks take the game folder and play the game through
`games/<slug>/smoke.driver.mjs`:

```js
export default {
  play(t) { /* reach game over with a score through your __bpTest verb */ return t.state(); },
  script(t) { /* a fixed input schedule, the same for every seed */ return t.state(); },
  minColors: 3,   // optional: distinct colours the pixel check needs (WebGL scenes: raise it)
  settleMs: 800,  // optional: wait before the pixel check
  allowZero: false, // optional: true when a finished run can honestly score 0
};
```

`play` and `script` run inside the page with `t = window.__bpTest` and must
be self-contained (no imports, no closures). Either may also be a source
string to evaluate. Without a driver the checks play an idle run, which only
runners and dodgers finish. The template ships a working driver; the
validator warns when a game has none. `conformance` and `typecheck` need no
driver.

## 0. `check` (PASS)

```bash
npm run check -- game games/<slug>            # readable report
npm run check -- game games/<slug> --json     # { ok, target, counts, issues }
```

Static, no browser, about a second. It compares `index.html`, `src/main.tsx`
and `src/beyondplay-kit.ts` with the template by hash (`<title>` excepted),
bundles and evaluates `src/beyondplay.config.ts` exactly as the manifest
emitter does and replays the conformance board check, scans the source for
the test hook (`tick`, `state`, `reset`, gated on `bp_test`), the game-over
call, wallet and token patterns, external hosts, mouse and
touch handlers and `100vh`, checks `publish.config.json`, the icon and the
audio credits, and when `dist/` exists checks the shell markers, the manifest
against the declaration, the bundle limits and the initial download.

Every issue carries a stable code (`GAME_TEMPLATE_FILE_MODIFIED`,
`GAME_TEST_HOOK_MISSING`, ...), the path and line, a one-line fix and the
document it comes from. Exit `0` means no errors; `--fail-level warning` makes
warnings fail too. Codes and limits: `tools/beyondplay-check/README.md`.

It cannot prove determinism or that the game draws; the checks below do.

## 1. `check-build` (BUILD-OK)

Runs `npm run build -- games/<slug>` (Vite build, then
`scripts/emit-manifest.mjs`), then asserts:

- `dist/index.html` contains `BeyondPlay` (the shell marker) and `bp_seed`
  (the seed bootstrap). Missing means `index.html` was edited or replaced.
- `dist/beyondplay.json` exists, is non-empty, and has no `"emitError"`.

Reading a failure: `the build failed` sends you to the log path in the
message (`out/check-build-<slug>.log`, usually a TypeScript or import error);
`the manifest is a fallback` means `src/beyondplay.config.ts` did not build,
and the emitter printed the reason in a boxed `MANIFEST EMIT FAILED` block.

## 2. `smoke:render` (RENDER-OK)

Embeds the built game in an iframe (400 x 700 inside a 420 x 720 page) at
`/?bp_test=1&bp_seed=render-seed&bp_match=smoke`, then asserts in order:

1. `window.__bpTest` appears within 20 s.
2. After `settleMs` (800 ms) the first `<canvas>` has a non-zero size and at
   least `minColors` (3) distinct sampled colours, read through a 2D copy so
   WebGL canvases work too (enable `preserveDrawingBuffer` in test mode).
3. The driver's `play()` reaches `phase === 'gameover'` with a score above
   zero (`allowZero: true` in the driver waives the score).
4. The embedding parent received `bp_game_over` exactly once, with the run's
   score.
5. No page errors and no unexpected failed requests. Forgiven: `favicon`, the
   template's Google Fonts on a machine without network, and `score submit
   failed`.

Reading a failure: `__bpTest hook never appeared` means the hook is not
installed under `bp_test=1` or the game threw before mounting; `canvas blank
check failed` means nothing drew in the settle time (the preboot hold is not
exempt in test mode, or the loop stepped instead of drawing); `the run did
not reach gameover` means the driver's verb or step counts do not match the
game; `bp_game_over received 0 times` means `challenge.submit` was not
called, was called before the parent listener attached, or the game was not
in the iframe path; `page errors` lists the first three.

## 3. `smoke:seed` (DETERMINISTIC)

Loads the game three times in separate pages (seed A twice, seed B once),
each with the identical fixed input schedule (`script`, else `play`), and
asserts:

- Seed A run 1 and run 2 have the same `hash`, the same `score` and the same
  `plan`.
- Seed B has a different `plan` and a different `hash` from seed A.
- Every run reaches `gameover`.

Reading a failure: `same seed + same inputs diverged` means something in the
simulation reads the wall clock, frame timing, `Math.random` after the global
stream moved, or an unseeded source (cosmetic particles leaking into physics
is the usual cause); `same seed produced different courses` means the run
plan is not drawn from the seed up front; `different seeds produced the
identical course` means the seed does not reach the generator (check that
`getMatch()?.seed` is read and salted into the local PRNG); `did not finish`
means the schedule is too short for your game; `state() has no hash` means
the hook does not expose a per-step hash.

## 4. `conformance` (CONFORMANT)

Bundles `src/beyondplay.config.ts` and the kit with esbuild, runs them in a
Node sandbox with a stub `window.BeyondPlay` that records which board each
`gameOver` lands on, calls `submit(1234)` on the first exported challenge
handle, and asserts:

- A challenge handle (or a solo handle) is exported.
- `buildManifest()` reports `playerMode: 'duel'` with exactly one unit.
- The submission landed on the declared `boardId` and only there.
- `instanceKind === 'random'` implies `needsSeed === true`.
- `dist/beyondplay.json` exists, has no `emitError`, and equals the
  declaration as JSON.

A solo game (`export const game = defineSoloGame({})`) passes with
`playerMode: 'single'`, `challenge: null`, and exactly one run report from
`game.endRun()` on the default board.

Reading a failure: `no challenge or solo handle exported` means the config
does not `export const challenge = defineChallenge(...)` or
`export const game = defineSoloGame(...)`; `dist/beyondplay.json differs`
means the build is stale or the config changed after the build (rebuild);
`procedural content requires needsSeed=true` means `seed: true` is missing;
`expected exactly 1 challenge unit` means more than one `defineChallenge`
call ran.

## 5. `smoke:idle` (IDLE-OK)

Loads the built game top-level at 390 x 780 with no `bp_test` and no input,
and watches the page text for 12 s (`--grace <seconds>` to change). A replay
word ("again", "retry", "game over") inside the grace period fails it: the
feed autoplays cards, and a card that dies before the viewer decides to play
is a dead card.

## 6. `typecheck` (TYPECHECK-OK)

`tsc --noEmit -p games/<slug>` with the kit's dependencies in scope. Strict
TypeScript.

## The hosted check

`start_build` on the creator MCP unpacks your archive under the limits, keeps
the platform's own copies of the platform-owned files, runs the same build,
the manifest emitter, the bundle checks and the conformance runner, and
returns issues with the same codes and fixes. It does not yet run the browser
checks (render, seed, idle); your local run is the proof for those, and a
reviewer plays the game on a phone.

## Screenshots and bots

- Capture 390 x 780 portrait screenshots of the intro, two mid-run moments
  and the end card, driving the simulation with `__bpTest.tick` under
  `?bp_test=1`. Headless WebGL is slow:
  `chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] })`.
  Look at the images; the checks do not judge taste.
- Tune with headless bots that bundle `src/game.ts` with esbuild and play
  idle, sloppy, decent and strong policies over several seeds. Report run
  lengths, scores and death causes. Idle must survive 12 s; typical runs are
  30 to 90 s.

## Headless gotchas

- A failed request in the log is usually `favicon.ico` or the Google Fonts
  stylesheet on a machine without network; the render check forgives both.
- `postMessage` arrival jitters in headless; poll for the tail rather than
  sleeping a fixed time.
- Loaded top-level, `window.parent === window` and nothing is posted; that is
  why the render check embeds the game.
- Decoded MP3s run about 40 ms shorter than their metadata says; match audio
  durations within about 0.07 s.
