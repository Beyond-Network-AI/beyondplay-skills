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
| `index.html` | platform | Seed bootstrap, capability bridge and touch guard. Only `<title>` may change. |
| `src/main.tsx` | platform | `window.BeyondPlay` shell, parent auth listener, WebKit image hardening, React mount of `./App`. |
| `src/beyondplay-kit.ts` | platform | `defineChallenge`, `defineSoloGame`, `declareUses`, `defineDisplay`, `DEFAULT_DISPLAY`, `getMatch`, `onMatchResult`, `buildManifest`. |
| `src/beyondplay-platform.ts` | platform | `request`, `capabilities`, `can`, `onCapabilities`: the platform capabilities (section 9). Import it; do not edit it. |
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
| `src/viewport.ts` | game | Starter helper: `readViewport`, `fitDesign` (one design space, or one per orientation), `watchViewport`, `useViewport`. The scaffold's shell uses it. Edit or delete it. |
| `src/keys.ts` | game | Starter helper: `bindKeys(display.keys, handlers)` and `keysOf(spec)`. Binds keys only; the host prints the key hints. Edit or delete it. |
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
// optional, when the view adapts to a wide screen or keys play the game (add defineDisplay
// to the import; see the hosted-build note under defineDisplay below):
// export const display = defineDisplay({ orientation: 'any', input: ['touch', 'mouse', 'keyboard'],
//                                        keys: { move: 'arrows|wasd', jump: 'space' } });
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
- `defineSoloGame({ challenge, uses })` returns `{ endRun(score), match }`.
  `endRun` forwards to `challenge.submit` when a challenge is passed, else to
  `gameOver` on the default board. Omit `challenge` (or pass `null`) for a
  game that is not duel-able; the manifest then says `playerMode: 'single'`.
  `uses` names the platform capabilities the game asks for (section 9); the
  manifest carries them as `uses`.
- `declareUses(names)`: the same declaration without `defineSoloGame`.
- `defineDisplay(decl)`: how the game is shown and played on a large screen.
  Every field is optional: `orientation` (`'portrait'`, the default; `'any'`
  when the view adapts to a wide screen too; `'landscape'` when it cannot
  play in portrait), `input` (default `['touch', 'mouse']`, which always
  stay; add `'keyboard'` when keys drive the game; `'gamepad'` is reserved)
  and `keys` (verb to key spec, `{ move: 'arrows|wasd', jump: 'space' }`; the
  grammar is in `docs/display.md`). It only records the declaration for
  `buildManifest()` and returns it with the defaults filled (`GameDisplay`),
  so the shell can `import { display } from './beyondplay.config'` and
  `bindKeys(display.keys, ...)` from `src/keys.ts`. Nothing touches `window`.
  A game that declares nothing gets `DEFAULT_DISPLAY`. The hosted build
  accepts it once `get_contract`'s Display section no longer says "Not yet";
  until then keep it commented, as the template does.
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
  "defaultUnitId": "highscores",
  "display": { "orientation": "portrait", "input": ["touch", "mouse"], "keys": {} }
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
`{ "playerMode": "single", "challenge": null, "defaultUnitId": null, "display": { ... } }`.

Every manifest carries `display`, after `defaultUnitId` and before `uses`
(key order: `playerMode`, `challenge`, `defaultUnitId`, `display`, `uses`),
with the defaults filled when the config declares nothing. A game declaring
`defineDisplay({ orientation: 'any', input: ['touch', 'mouse', 'keyboard'],
keys: { move: 'arrows|wasd', jump: 'space' } })` emits:

```json
"display": { "orientation": "any", "input": ["touch", "mouse", "keyboard"], "keys": { "move": "arrows|wasd", "jump": "space" } }
```

| `display` field | From |
|---|---|
| `orientation` | `decl.orientation`, else `'portrait'` |
| `input` | `decl.input` with duplicates removed, else `['touch', 'mouse']` |
| `keys` | `decl.keys` (a copy), else `{}` |

The kit fills defaults and nothing else: a bad value stays in the manifest so
the validator can name it (`DISPLAY_*`, `docs/display.md` section 8). Hosts
read it through `normalizeDisplay` (`tools/beyondplay-check/src/game-display.js`;
the semantics and vectors are in `docs/display.md` section 5), and the report
records the result as `facts.display`.

If the config fails to build, the emitter writes the solo manifest, with the
default `display`, plus an `emitError` string and prints a boxed
`MANIFEST EMIT FAILED` error.
`check-build`, `conformance` and the hosted check all fail on `emitError`.
Conformance also fails when `instanceKind` is `random` and `needsSeed` is
`false`, and when the file on disk differs from what the config declares.

A config that declares `uses` adds `"uses": ["share"]` to either shape; a
config that declares nothing omits the field.

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
| `request(name, params)`, `capabilities`, `can(name)`, `onCapabilities(cb)`, `apiVersion` | The capability bridge, installed by `index.html` before the shell (section 9). Use `src/beyondplay-platform.ts` rather than these directly. |

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

`perf()` is optional and game-owned, so it needs no change to a
platform-owned file. A three.js game returns the last drawn frame's numbers
from its own renderer, which it already holds in `App.tsx`:

```ts
// with @react-three/fiber, inside the Canvas: const gl = useThree((s) => s.gl)
perf: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
```

`renderer.info` resets at the start of each render by default, so read it
between frames, as the hook does when the smoke calls it. A game that draws
in several passes per frame (a post effect, a second scene) sets
`renderer.info.autoReset = false` and calls `renderer.info.reset()` at the
top of its frame. A 2D game leaves `perf` out.

## 6a. Performance

Measured by `npm run smoke:perf` and, when its build image has a browser, by
the hosted check, on a mid-range phone stand-in: a 390 x 844 portrait
viewport at one device pixel per CSS pixel, the CPU throttled four times
through the Chrome DevTools Protocol, the game embedded in a parent page and
played through `smoke.driver.mjs` in real time (the recorded run replayed at
the driver's `stepsPerSecond`, default 60).

| Measure | Budget | Code (tier) |
|---|---|---|
| Time to first frame: `bp_ready` at the parent or the first drawn canvas, from navigation | 5 s | `GAME_SLOW_FIRST_FRAME` (listing) |
| 95th percentile frame time over ten seconds of driven play | 33 ms (a 30 fps floor; 60 fps is the target) | `GAME_FRAME_TIME` (listing) |
| Draw calls per frame, the most seen, from `__bpTest.perf()` | 60 | `GAME_DRAW_CALLS` (listing) |
| Triangles per frame, the most seen, from `__bpTest.perf()` | 300,000 | `GAME_TRIANGLES` (listing) |
| JavaScript heap after a minute of play | informational | `GAME_HEAP` (review, info) |

Listing tier: the game may publish unlisted with a finding; the reviewer's
approve waits until the submission check carries none. Draw calls and
triangles are judged only for a game whose hook exposes `perf()`. The
numbers, the thresholds and each finding's fix live in
`tools/beyondplay-check/src/perf.js`; the hosted check copies that file.

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

## 9. Capabilities: what a game may ask the platform

One door, `request(name, params)` from `src/beyondplay-platform.ts`, returns a
promise the host answers. The host (the feed, the game page, the app) decides
what it offers; `capabilities()` and `can(name)` say what, once the host has
said hello, and `onCapabilities(cb)` fires when that list arrives. A rejected
promise is normal: `err.code` is `denied` (the player said no or is signed
out), `cancelled` (the player dismissed a sheet), `unsupported` (this host
does not offer it) or `unavailable` (no host, or no answer within ten
seconds); `err.reason` may say more (`signed_out`, `timeout`, `no_host`).

Three rules: never gate play on an answer; never feed an answer into the
seeded simulation (a duel must replay the same for both players); show a
control that depends on a capability only when `can(name)` is true.

Declare what the game uses in the config, so the reviewer and the player can
see it and the validator can check it:

```ts
export const game = defineSoloGame({ challenge, uses: ['share', 'player.profile'] });
```

`GAME_CAPABILITY_UNDECLARED` (listing) fires for a `request()` the config
does not declare; `GAME_CAPABILITY_UNKNOWN` (listing) for a name the table
does not list.

| Name | Tier | Params | Returns |
|---|---|---|---|
| `capabilities` | open | | `string[]`, the names this host offers. |
| `host` | open | | `{ surface, locale, reducedMotion, authenticated, apiVersion }`; `surface` is `feed`, `page`, `app`, `telegram`, `desktop` or `unknown`. |
| `player.profile` | open | | `{ displayName, handle, avatar }`, or `null` when signed out. Never an email, a wallet or an id. |
| `share` | open | `{ score?, text? }` | `{ outcome: 'shared' \| 'copied' }`. The host opens its own share sheet with the game page and the score card; rejects with `cancelled` when the player dismisses it. |
| `player.items` | open | `{ collection }` | `PlayerItem[]`, the player's items in the one collection the game declared; `null` when signed out, no wallet is linked, the player opted out or the game is not allowed to ask; `[]` when the wallet holds nothing in it. Declared as `player.items:<collection>` in `uses`. See Player items below. |
| `player.stats` | open | | `{ best, plays, lastPlayedAt }` for this game, or `null` when signed out; what the leaderboard already shows. |
| `player.friends` | open | | `[{ displayName, avatar, best }]` for friends who played this game, or `null` when signed out. No ids, no items, no lookup by player. |

Tiers: `open` is answered without asking the player, which covers
everything offered (phase one and, since 6 November 2026, phase two:
`player.items`, `player.stats`, `player.friends`); `platform`
(`platform.season`) is run by the platform, the game only reports; `consent`
is reserved for something that would leave the platform or identify the
account, which nothing offered does. A game runs inside the platform with no
network of its own, so what it is handed stays on the platform's screens; the
listing discloses what a game uses, and the platform can switch a capability
off for one game. Names not yet offered answer `unsupported`. `get_contract`
on the creator MCP serves the live table.

### Player items

The platform hands a game the items a player holds in one collection, as
items: never a wallet address, a chain, a contract or a balance. The shape,
from `src/beyondplay-platform.ts` (`PlayerItem`, `ItemModel`):

```ts
interface PlayerItem {
  id: string;                        // 'cobi:5759'
  collection: string;                // 'cobi'
  tokenId: string;                   // '5759'
  name: string;                      // 'Cobi #5759'
  image: string;                     // on assets.beyondplay.xyz
  traits: Record<string, string>;    // { Fur: 'Gold', Horns: 'Fire', ... }
  model?: { kind: 'kit'; kit; base; clips; clipNames; skeleton; height; facing; feetAt }
        | { kind: 'baked'; url: string };
  borrowed: boolean;                 // lent by the platform; looks the same
  until?: string;                    // when a borrowed item goes back
  quantity?: number;                 // ERC-1155 collections
}
```

The declaration names the collection with the capability, and the request
names the same slug, in `src/App.tsx`, never in `src/game.ts`:

```ts
export const game = defineSoloGame({ challenge, uses: ['share', 'player.items:cobi'] });

const items = await request('player.items', { collection: 'cobi' }).catch(() => null);
```

Three rules on top of the three above:

1. Items change how a run looks and sounds, never how it plays. A trait may
   pick the model, a trail, a sound, a greeting, the name on the end card; no
   stats, lives, loadouts, unlocks, starts or multipliers from an item or a
   trait, and nothing the simulation reads (`GAME_ITEM_GATING`, review tier;
   `GAME_ITEM_IN_SIMULATION`, listing tier, when `player.items` or
   `PlayerItem` appears in `src/game.ts`).
2. Every player gets a bull. The answer is `null` for most plays; the game
   falls back to the collection's default item silently. The default is
   served by `get_contract` as `capabilities[].default` for the collection.
   No copy about linking a wallet, and nothing that invites buying, linking
   or renting, anywhere in a game.
3. One declared collection. A bare `'player.items'` in `uses` declares none
   (`GAME_CAPABILITY_UNDECLARED`); the host answers `denied` for a collection
   the manifest does not declare. A game cannot read holdings across
   collections.

Borrowed items carry `borrowed: true` and `until`; nothing else changes and no
payment is visible to a game. A kit model is assembled by
`src/cobi-kit.ts` (platform-owned, ships with the template):
`CobiKit.load(item.model.base, { tokens: false, kit: item.model.kit })`, then
`kit.build(item.traits)`, clips from `item.model.clips` through an
`AnimationMixer`, `release()` on game over. A 2D game uses `item.image` as an
avatar. The recipe: `docs/player-items.md` in the kit.

CSP: a game that declares any `player.*` capability is served with an
enumerated policy and can only reach the platform's hosts
(`*.beyondplay.xyz`, including `assets.beyondplay.xyz`); no chain RPC and no
third-party host, whatever the source says.

The starter game shows the pattern: a Share control on the end card, rendered
only when `can('share')`, calling `request('share', { score })` and ignoring
the rejection.

```ts
import { can, onCapabilities, request } from './beyondplay-platform';

onCapabilities(() => setCanShare(can('share')));
request('share', { score }).catch(() => { /* dismissed, or not offered here */ });

const who = await request('player.profile').catch(() => null);
if (who?.displayName) greet(who.displayName);
```

## Open questions for the platform team

- Accepted `ageRating` values are not documented beyond the `9+` default.
- `instanceKind` values `daily` and `rotating` exist in the type but no
  published game uses them; their platform behaviour is not documented here.
- Whether the parent's `bp_match_result` is sent to unlisted games is not
  stated.
