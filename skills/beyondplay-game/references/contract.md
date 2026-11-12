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
| `src/beyondplay-kit.ts` | platform | `defineChallenge`, `defineSoloGame`, `declareUses`, `getMatch`, `onMatchResult`, `buildManifest`. |
| `src/beyondplay-platform.ts` | platform | `request`, `capabilities`, `can`, `onCapabilities`: the platform capabilities (section 9). Import it; do not edit it. |
| `src/haptics.ts` | platform | `haptic(kind)` helper. Import it; do not edit it (an edited copy is scanned as the game's own code). |
| `src/beyondplay-audio.ts` | platform | `loadSound`, `play`, `startMusic`, `setMuted`: sound effects and a music loop (section 5a). Import it; do not edit it. |
| `src/beyondplay-hud.tsx` | platform | `Hud`, `HudRow`, `Stat`, `Timer`, `Hearts`, `Meter`, `Callout`, `HudButton`, `Stick`, `EndCard`, `setHudTheme`: what shows over the play (section 5b). Import it; do not edit it. |
| `src/beyondplay-anim.ts` | platform | `loadClips`, `Animator`: clip packs for the shared bull kit and cross-faded animation states (section 5c). Import it; do not edit it. |
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
- `defineSoloGame({ challenge, uses })` returns `{ endRun(score), match }`.
  `endRun` forwards to `challenge.submit` when a challenge is passed, else to
  `gameOver` on the default board. Omit `challenge` (or pass `null`) for a
  game that is not duel-able; the manifest then says `playerMode: 'single'`.
  `uses` names the platform capabilities the game asks for (section 9); the
  manifest carries them as `uses`.
- `declareUses(names)`: the same declaration without `defineSoloGame`.
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

Set `maxValue` just above the best an honest run can reach, worked out from the game's own numbers
(run length, top speed, points per pickup), and change it whenever they change; the shipped games
use 8000 (ten baskets) and 4000 (a sixty second runner). A challenge with no bound on its winning
side is `GAME_SCORE_UNBOUNDED` (review tier): the server rejects a value past the bound, so a bug
that lets a score run free never reaches the board.

**A run always ends, and no score is free** (`GAME_RUN_NEVER_ENDS`, review tier). Two ways a game
breaks this, both seen in a shipped runner whose best run reached 109,000 for nothing:

- The content runs out. A course planned once to a fixed length ends somewhere, and past its end
  there is nothing to hit. End the run by the clock, or plan the content a chunk at a time ahead of
  the player, each chunk its own stream of the seed, so there is always more and both duelists
  still get the same course.
- The difficulty goes flat. In an endless game keep one thing rising for as long as a run can last
  (the speed, how little room an obstacle leaves) until nobody gets through.

Try the game with a driver that never misses: its run must still end.

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

## 5a. Sound, music and the asset library

A game should have sound: a small set of effects (tap, hit, pickup, win, lose) and one music loop.
Take them from the platform's asset library before making your own:

- On the creator MCP, `search_assets` finds ready, licensed parts (sound effects, music loops by
  mood, sprites, tiles, UI pieces, the bull kit) and `add_asset` gives, for one result, the file's
  address, where it goes in the game (`public/assets/library/<pack>/...`), how to use it and the
  exact line for `CREDITS.md`. Search first; draw, generate or record only when nothing fits.
- Small files (art, sound, music) are copied into the game. 3D kits are loaded from
  `assets.beyondplay.xyz` at run time and never copied, so the game stays inside the weight limits.
- Every file under `public/assets/library/` needs its line in `CREDITS.md`, tagged
  `[library: <id>]` (`GAME_LIBRARY_CREDIT_MISSING`, listing tier). Assets that are not from the
  library keep the existing rule: owned, CC0 or commercially licensed, and named in `CREDITS.md`.

Play audio through `src/beyondplay-audio.ts`, which keeps the rules for you:

```ts
import { loadSounds, play, startMusic, setMuted } from './beyondplay-audio';

// after the first frame
loadSounds({ coin: '/assets/library/sfx-core/coin/coin-01.ogg', hit: '/assets/library/sfx-core/hit/impact-01.ogg' });
startMusic('/assets/library/music-core/loop/arcade-level-1.ogg', { volume: 0.4 });

play('coin');            // on the event, in src/App.tsx, never in src/game.ts
setMuted(true);          // the game's mute control
```

Nothing sounds before the player's first touch (music waits for it); audio loads after the first
frame and never blocks play; the game goes quiet when its card scrolls away; the checks run silent
under `?bp_test=1`. Budgets: a sound set under 1 MB, a music loop under 1.5 MB. Sound is look and
feel only: the simulation never reads it.

## 5b. The HUD kit

Build everything that shows over the play from `src/beyondplay-hud.tsx`: it is sized for a thumb,
readable over a dark or a bright scene, clear of the notch and the home bar, and it adapts to a
large screen and a keyboard without any work in the game.

```tsx
import { Hud, HudRow, HudGroup, Stat, Timer, Hearts, Meter, Callout, HudButton, Stick, EndCard, setHudTheme } from './beyondplay-hud';

<Hud>
  <HudRow at="top"
    left={<><Stat value={score} large /><Hearts value={lives} max={4} /></>}
    center={<Timer seconds={left} />}
    right={<><HudButton icon={muted ? 'mute' : 'sound'} label="Sound" onPress={toggleMute} /><Stat icon="gem" value={gems} /></>}
    wide={<Meter value={xp} max={xpToNext} label="Level 1" />} />
  <Callout text={event} />
  <HudRow at="bottom"
    left={<Stick onMove={(x, y) => input.set(x, y)} keys="wasd" />}
    right={<HudGroup gap={12}>
      <HudButton icon="shield" label="Shield" size={52} cooldown={shieldCd} keyHint="E" onPress={shield} />
      <HudButton icon="dash" label="Dash" size={64} lit keyHint="Space" onPress={dash} />
    </HudGroup>} />
</Hud>
{over && <EndCard score={over.score} best={best} lines={['52 streak']} onPlayAgain={restart} onShare={canShare ? share : undefined} />}
```

The layout, on every screen:

- **Top row is status** (what the player has): the score top left, time top centre, sound top
  right. At most five pieces, and one line across the full width (`wide`) for a level or boss bar.
- **Bottom row is controls** (what the player does): movement under the left thumb, one 64 px
  action and at most one 52 px second action under the right. A one-thumb game needs no controls
  at all: the whole screen is the button.
- **The middle stays empty**, except a `Callout` of one or two words for a moment.
- **One lit element at a time** (`lit`, or `tone="lit"`): the thing that matters right now.
- Nothing in the kit starts, pauses or explains a game, and the game adds none of those.
- A control fires on touch-down and never moves the player itself: it records an input the
  engine reads at its next step.

On a desktop and in full screen (where the platform plays the game on a landscape stage):

- The HUD **grows with the stage**, from 1 at phone size to 1.5 at 720 px and taller, and stays
  in the corners; it never stretches across a wide screen and nothing is re-laid out by the game.
- **Keys replace thumbs.** A `HudButton` with `keyHint` shows its key cap while the player uses a
  keyboard, and a `Stick` with `keys` gives way to its keys, which fade after the first press. A
  touch brings the stick back. The game reads the keyboard itself and declares the keys.
- **The host owns the frame**: Full screen, Esc, the key hint line under the title, and the
  result card with Play again (`R`) on the desktop. A game draws no full-screen button, no title
  and no key instructions of its own.
- Keep the play itself inside the centre 4:3 of a wide stage, so nothing the player must see sits
  under the corners' HUD at any aspect from 9:19.5 to 21:9.

`setHudTheme({ lit: '#35e0c8' })` changes the kit's colours for one game (ink, lit, open, danger,
smoke, line, font); call it once before the first render. The file itself is platform-owned: an
edited copy is `GAME_TEMPLATE_FILE_MODIFIED`. A game that draws its own HUD is noted for the
reviewer (`GAME_HUD_NOT_KIT`, review tier). Ask the platform for a piece the kit lacks.

## 5c. Character animation

A character that snaps from one pose to the next reads as cheap. Play the shared bull (the COBI kit,
`src/cobi-kit.ts`) through `src/beyondplay-anim.ts`, which blends every change of state:

```ts
import { Animator, loadClips } from './beyondplay-anim';

const clips = await loadClips('runner');           // a platform pack, or the address of a .glb of your own
const anim = new Animator(bull.root, clips, {
  run:   { clip: 'run' },
  jump:  { clip: 'run-jump', loop: false },        // holds its last pose until the game says it landed
  slide: { clip: 'run-slide', loop: false, then: 'run' },
  hit:   { clip: 'hit-react', loop: false, then: 'run' },
  down:  { clip: 'knockout', loop: false },
});
anim.play('run');
anim.play('jump');                                 // on the engine's event, in the shell
anim.setSpeed('run', speed / 8.5); anim.update(dt); // every frame, on the render clock
```

- Every change of state cross-fades (0.18 s unless the state says otherwise). A one-shot state
  (`loop: false`) holds its last pose, or moves on to its `then` state by itself.
- Clips play in place: the engine alone decides where the character is. Animation is look only:
  it runs on the render clock and the simulation never reads it.
- Give every character at least: a loop for moving, one for each thing the player does (jump,
  slide, attack), a reaction to being hit, an end for losing and one for winning.
- The packs are loaded from the asset host at run time, after the first frame, and are never
  copied into the game: `runner` (idle-neutral, run, run-jump, run-slide, hit-react, knockout,
  victory; 479 KB). Draw a stand-in until the character arrives; never hold the first frame for it.

## 5d. Genre starters

`npm run new-game -- <slug> "Name" --starter runner` lays a genre starter over the template: a
complete game of that genre that passes the ladder as scaffolded, with its engine
(`src/game.ts`), its scene (`src/scene.ts`), the shell, the check driver, a sound set and a music
loop from the asset library (credited in `CREDITS.md`), the HUD kit and the animated bull. Start
from the starter that is nearest your idea and change it; keep its shape.

- `runner`: three lanes, obstacles to dodge, jump or slide under, coins, sixty seconds or three
  hits. three.js, 15 draw calls, about 28,000 triangles with the bull.

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
| 95th percentile frame time over ten seconds of driven play | 33 ms (a 30 fps floor; 60 fps is the target) | `GAME_FRAME_TIME` (listing). A game that draws with WebGL is not judged on this where the check machine has no graphics card (`GAME_FRAME_TIME_NOT_JUDGED`, an info line): its budget is draw calls and triangles. |
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
