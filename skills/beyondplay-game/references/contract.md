# Contract: config, manifest, SDK

Derived from `template/` in this kit (`index.html`, `src/main.tsx`,
`src/beyondplay-kit.ts`, `src/haptics.ts`, `vite.config.ts`), from
`scripts/emit-manifest.mjs`, `scripts/new-game.mjs` and
`scripts/conformance.mjs`. Where this file and the template disagree, the
template wins; re-read it.

## 1. What a game folder contains

After `npm run new-game -- <slug> "Display Name"`:

| Path | Owner | Notes |
|---|---|---|
| `index.html` | platform | Seed bootstrap and touch guard. Only `<title>` may change. |
| `src/main.tsx` | platform | `window.BeyondPlay` shell, parent auth listener, WebKit image hardening, React mount of `./App`. |
| `src/beyondplay-kit.ts` | platform | `defineChallenge`, `defineSoloGame`, `getMatch`, `onMatchResult`, `buildManifest`. |
| `src/haptics.ts` | platform | `haptic(kind)` helper. Import it; do not edit it. |
| `src/webkit-image-hardening.ts` | platform | Heals blank `drawImage` on WKWebView. Installed by `main.tsx`. |
| `src/index.css` | platform | Reset, dark background, no text selection, no tap highlight. |
| `tsconfig.json`, `vite.config.ts` | platform | Strict TypeScript; shared Vite settings. |
| `publish.config.json` | game | Listing text (section 8). |
| `CREDITS.md` | game | Every asset and track with author, source and licence. |
| `assets/icon-source.html`, `assets/banner-source.html` | game | Canvas sources for the icon and banner. |
| `src/beyondplay.config.ts` | game | The one config file. The scaffold declares a duel. |
| `src/App.tsx` | game | Mount, HUD, overlays. The scaffold's is the Tap Timing shell. |
| `src/game.ts` | game | Deterministic engine. The scaffold's is the Tap Timing engine. |
| `smoke.driver.mjs` | game | How the checks play the game. |
| `src/vite-env.d.ts` | game | Add `/// <reference types="vite/client" />` when importing images. |

`scripts/emit-manifest.mjs` is shared by every game; `npm run build` calls it
with the game directory after the Vite build.

## 2. `src/beyondplay.config.ts`

Import from `./beyondplay-kit` and export the handles. Edit only the `define*`
arguments. The conformance check imports this file, takes the first export
that has a `submit` function and a `__decl`, and asserts that its submission
lands on the declared board.

```ts
import { defineChallenge, defineSoloGame } from './beyondplay-kit';
export const challenge = defineChallenge({ /* fields below */ });
export const game = defineSoloGame({ challenge });
```

### `defineChallenge(decl)` fields

| Field | Type | Meaning | Default |
|---|---|---|---|
| `metricLabel` | string | What the number means on the card: "Score", "Time", "Strokes". | required |
| `lowerIsBetter` | boolean | `true` when the lowest value wins (time, strokes, moves). | `false` |
| `seed` | boolean | `true` when content varies per play. The platform mints a shared seed. | `false` |
| `modeLabel` | string | Label for a multi-mode game ("Speed Run"). | `metricLabel` |
| `instanceKind` | `'static' \| 'daily' \| 'random' \| 'rotating'` | How content rotates. | `'random'` when `seed` is true, else `'static'` |
| `minValue` | number | Lowest accepted value; the server rejects values outside the bounds. | none |
| `maxValue` | number | Highest accepted value. | none |
| `id` | string | Internal. The platform assigns one board per game; do not set. | `'highscores'` |

`defineChallengeBoard` is a deprecated alias of `defineChallenge`.

### Handles and helpers

- `challenge.submit(score)`: report a finished run. The kit calls
  `window.BeyondPlay.gameOver({ score, board, sortOrder })` with the declared
  direction. Call it exactly once per run.
- `challenge.progress(score)`: optional live score on the way up. It animates
  the native duel strip and is a no-op outside a duel.
- `defineSoloGame({ challenge })` returns `{ endRun(score), match }`.
  `endRun` forwards to `challenge.submit` when a challenge is passed, else to
  `gameOver` on the default board. Omit `challenge` (or pass `null`) for a
  game that is not duel-able; the manifest then says `playerMode: 'single'`.
- `getMatch()`: the shared duel instance or `null` for a normal play. Fields:
  `seed`, `challengeId`, `mode` (`'score_duel'` in v1), `opponentScore`,
  `opponentName`, `metricLabel`, `lowerIsBetter`.
- `onMatchResult(cb)`: subscribes to `bp_match_result` messages; `cb`
  receives `{ outcome: 'win' | 'loss' | 'draw' | 'pending', yourScore,
  opponentScore }`. Optional; the native strip shows the result regardless.
  Returns an unsubscribe function.

### Worked declarations

Highest score wins on a procedural course (flick-hoops, coil):

```ts
defineChallenge({ metricLabel: 'Score', lowerIsBetter: false, seed: true,
                  instanceKind: 'random', minValue: 0, maxValue: 8000 });
```

Lowest time wins on a fixed course:

```ts
defineChallenge({ metricLabel: 'Time', lowerIsBetter: true, seed: false,
                  instanceKind: 'static', minValue: 1, maxValue: 600 });
```

Set `maxValue` above any honest run but below what a cheat would post; the
shipped games use 8000 (ten baskets), 100000 (endless climb) and 200000
(long runner).

## 3. `dist/beyondplay.json`

`node scripts/emit-manifest.mjs games/<slug>` bundles
`src/beyondplay.config.ts` with esbuild, runs it in Node, and writes the
result of `buildManifest()`. `npm run build -- games/<slug>` runs it after
`vite build`.

Duel game:

```json
{
  "playerMode": "duel",
  "challenge": [{
    "id": "highscores",
    "boardId": "highscores",
    "mode": "score_duel",
    "modeLabel": "Score",
    "metricLabel": "Score",
    "valueFormat": "INTEGER",
    "sortOrder": "higher-wins",
    "aggregation": "best",
    "instanceKind": "random",
    "needsSeed": true,
    "fairnessTier": "bounded",
    "minValue": 0,
    "maxValue": 8000
  }],
  "defaultUnitId": "highscores"
}
```

Derivation:

| Manifest field | From |
|---|---|
| `id`, `boardId`, `defaultUnitId` | `decl.id`, else `'highscores'` |
| `sortOrder` | `'lower-wins'` when `lowerIsBetter`, else `'higher-wins'` |
| `instanceKind` | `decl.instanceKind`, else `'random'` when `seed`, else `'static'` |
| `needsSeed` | `true` when `seed` is true or `instanceKind` is not `'static'` |
| `fairnessTier` | `'bounded'` when `minValue` or `maxValue` is a number, else `'deterministic'` |
| `minValue`, `maxValue` | copied when numbers |
| `valueFormat`, `aggregation`, `mode` | fixed: `INTEGER`, `best`, `score_duel` |

Solo game with no challenge:
`{ "playerMode": "single", "challenge": null, "defaultUnitId": null }`.

If the config fails to build, the emitter writes the solo manifest with an
`emitError` string and prints a boxed `MANIFEST EMIT FAILED` error.
`check-build`, `conformance` and the hosted check all fail on `emitError`.
Conformance also fails when `instanceKind` is `random` and `needsSeed` is
`false`, and when the file on disk differs from what the config declares.

## 4. The runtime SDK: `window.BeyondPlay`

Installed by `src/main.tsx` before the game mounts.

| Member | Effect |
|---|---|
| `match` | `window.BeyondPlayMatch` or `null`. |
| `ready()` | Posts `{ type: 'bp_ready' }`. Call once, after the first real draw. |
| `gameOver({ score, board?, sortOrder? })` | Posts `{ type: 'bp_game_over', score, board }`, then writes the leaderboard (the published shell does this through the platform's data SDK; the kit's local copy only posts `bp_score_submitted`). Non-finite scores are ignored. |
| `progress({ score, board? })` | Posts `{ type: 'bp_progress', score, board }`. |
| `haptic(kind)` | Posts `{ type: 'bp_haptic', kind }`. Kinds: `impact-light`, `impact-medium`, `impact-heavy`, `success`, `warning`, `error`, `selection`. |
| `on('play_again', cb)` | Runs `cb` when the parent posts `{ type: 'bp_play_again' }`. |

Every post goes to `window.ReactNativeWebView.postMessage` (the app) and to
`window.parent.postMessage(message, '*')` (the feed). Outside an embedding
parent nothing is posted, which is why the smokes embed the game in an
iframe.

Messages the game receives from the parent:

| Type | Meaning |
|---|---|
| `bp_play_again` | Restart in place. |
| `bp_match_result` | `{ result: MatchResult }` once a duel resolves. |
| `accelerate:auth` | Auth proof from an allowed parent origin (the platform's origins and their subdomains); handled by `main.tsx`, never by the game. |

Messages the game sends: `bp_ready`, `bp_game_over`, `bp_progress`,
`bp_haptic`, `bp_score_submitted` (after the leaderboard write).

### URL parameters read by the shell

| Parameter | Effect |
|---|---|
| `bp_seed` | The duel seed. With `bp_match`, builds `window.BeyondPlayMatch`. Also seeds `Math.random` and `crypto.getRandomValues` through the bootstrap in `index.html`. |
| `bp_match` | The challenge id. |
| `bp_mode` | Match mode; defaults to `score_duel`. |
| `bp_opp_score`, `bp_opp`, `bp_metric`, `bp_lower` | Opponent score and name, metric label, `1` when lower wins. |
| `bp_test` | `1` enables the test hook (section 6). Smokes load `/?bp_test=1&bp_seed=<seed>&bp_match=smoke`. |

The seed bootstrap is a safety net that the platform injects before every
published bundle; the template keeps a byte-identical copy. Do not rely on the
seeded `Math.random` for gameplay: derive a local PRNG from
`getMatch()?.seed`, salted with a game-specific string, so a restart
re-derives the same course (the global stream would have advanced).

## 5. The haptics helper

`import { haptic } from './haptics'` and call `haptic('success')` on discrete
player-caused moments from `App.tsx` event callbacks, never from `game.ts`
and never per frame. The shell owns routing, the user preference and the
throttle (at least 50 ms spacing plus a per-second burst cap); a dropped
haptic is correct behaviour. Never call `navigator.vibrate` or a Telegram
haptics API directly.

## 6. The test hook

Required when `?bp_test=1` is present:

```ts
window.__bpTest = {
  tick(n: number): void;                  // n fixed steps, synchronous
  <verb>AtStep(step: number, ...): void;  // schedule an input at an exact sim step
  state(): { phase: string; score: number; hash: number; plan?: unknown };
  reset(): void;
  perf?(): { calls: number; triangles: number };   // 3D games
  plan?(): unknown;                                 // when state() does not carry it
};
```

`state()` must include a trajectory or state hash folded per step. In test
mode the rAF loop draws but does not step. The seed check runs the same
scripted schedule twice and compares `hash`, `score` and `plan`. Reference
implementation: `template/src/App.tsx` and `template/src/game.ts`.

## 7. Build configuration

`vite.config.ts` (each game carries the template's copy):

- `base: './'` (overridable with `VITE_BASE`), so the bundle serves from any path.
- `resolve.dedupe: ['react', 'react-dom']`: one React copy.
- `build.assetsInlineLimit: 2048`: assets under 2 KB become `data:` URLs. The
  production CSP refuses `fetch()` of a `data:` URL, so decode such assets in
  place (`atob`) or keep them above 2 KB.
- `build.chunkSizeWarningLimit: 2000`.
- Dev server on port 5173 with `host: true`.

`tsconfig.json`: ES2020, strict, `jsx: react-jsx`, `include: ["src"]`. Check
with `npm run typecheck -- games/<slug>`.

Dependencies: the template relies on `react` and `react-dom`. The kit's root
`package.json` also declares `three`, `@react-three/fiber`,
`@react-three/drei`, `matter-js`, `howler`, `zzfx`, `framer-motion`,
`lucide-react`, `clsx` and `tailwind-merge`, which is exactly the set the
hosted build installs. Import only those; a package the hosted build does not
have fails the build there even when it builds locally, and every addition
grows every player's download.

Production CSP: `default-src 'self'; script-src 'self'
'unsafe-inline' 'unsafe-eval' blob:; worker-src 'self' blob:; style-src
'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data:
https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src
'self' blob: https:; media-src 'self' blob: https:`. This CSP permits
outbound HTTPS, so the no-external-calls rule is a policy rule that reviewers
check in the network log, not something the CSP enforces.

## 8. `publish.config.json`

```json
{
  "slug": "flick-hoops",
  "name": "Flick Hoops",
  "tagline": "Flick. Swish. Repeat.",
  "description": "Ten balls, one hoop, pure touch. ... same course for both players in a duel.",
  "tags": ["arcade", "sports", "basketball"],
  "ageRating": "9+",
  "visibility": "unlisted"
}
```

The file is the listing text. `slug` must match `^[a-z0-9][a-z0-9-]{2,40}$`
and equal the folder name; `name` is required; `tagline`, `description` and
`tags` are what the submit step passes to `set_metadata`; `ageRating`
defaults to `9+`; `visibility` stays `unlisted` (listing is the reviewer's
decision through `submit_for_review`). The owner is the signed-in creator.

## Open questions for the platform team

- Accepted `ageRating` values are not documented beyond the `9+` default.
- `instanceKind` values `daily` and `rotating` exist in the type but no
  published game uses them; their platform behaviour is not documented here.
- Whether the parent's `bp_match_result` is sent to unlisted games is not
  stated.
