# Display: how a game is shown and played on a large screen

A game can say how it wants to be laid out on a screen wider than a phone and
whether keys play it. It declares it once, in the config; the platform's hosts
read it and decide the rest. Most games declare nothing: a one-thumb portrait
game is already right everywhere.

## 1. What it is

`defineDisplay()` in `src/beyondplay.config.ts` declares three things, all
optional:

- `orientation`: `'portrait'` (the default), `'any'` (the view adapts to a wide
  screen too) or `'landscape'` (the game cannot play in portrait).
- `input`: the input kinds. `['touch', 'mouse']` is the default and always
  stays: pointer events make every game touch- and mouse-playable. Add
  `'keyboard'` when keys drive the game. `'gamepad'` is reserved.
- `keys`: verb to key spec, `{ move: 'arrows|wasd', jump: 'space' }`.

The kit records it, and `buildManifest()` writes it to `dist/beyondplay.json`
as `display`, defaults filled. Hosts read it to lay the game out: the shape of
the stage on a large screen, the input kinds a player can use, and the key
hint. The game declares; the host decides.

## 2. Declare it

```ts
// src/beyondplay.config.ts
import { defineChallenge, defineDisplay, defineSoloGame } from './beyondplay-kit';

export const challenge = defineChallenge({ metricLabel: 'Score', seed: true, instanceKind: 'random', minValue: 0, maxValue: 1500 });
export const game = defineSoloGame({ challenge, uses: ['share'] });
export const display = defineDisplay({
  orientation: 'any',                       // 'portrait' (default) | 'landscape' | 'any'
  input: ['touch', 'mouse', 'keyboard'],    // touch and mouse always; 'keyboard' when keys drive the game
  keys: { move: 'arrows|wasd', jump: 'space' },
});
```

The manifest then carries, after `defaultUnitId` and before `uses`:

```json
"display": { "orientation": "any", "input": ["touch", "mouse", "keyboard"], "keys": { "move": "arrows|wasd", "jump": "space" } }
```

A game that declares nothing gets `DEFAULT_DISPLAY`,
`{ "orientation": "portrait", "input": ["touch", "mouse"], "keys": {} }`, and
so does the emitter's fallback manifest. `defineDisplay` returns the
declaration with the defaults filled (`GameDisplay`), for the shell:
`import { display } from './beyondplay.config'`, then
`bindKeys(display.keys, ...)` (section 6). It touches nothing at import time.

The kit keeps what you declare as it is, apart from filling the defaults and
removing duplicate input kinds, so the validator can name a bad value.

Before you declare it, read section 9: the hosted build has to accept it.

## 3. The defaults and the `any` rule

- `portrait` when the logical space is portrait: letterboxed or painted out on
  a wide screen. Most games, and every game that declares nothing.
- `any` only when the view adapts: a camera or field of view per aspect, a HUD
  laid out per aspect. Prove it: the render smoke passes at 1280 x 720 as well
  as 390 x 844, and a screenshot at 1280 x 720 reads as a wide view laid out on
  purpose, never a stretched phone screen.
- `landscape` only for a game that cannot play in portrait. The validator
  warns (`DISPLAY_ORIENTATION_LANDSCAPE`): the phone feed letterboxes it.

The `any` rule: **one simulation, one view space per orientation.**
`fitDesign(v, { portrait: { w, h }, landscape: { w, h } })` from
`src/viewport.ts` picks the view space. The simulation never reads the
viewport, so a player on a phone and one on a large screen duel on the same
world. Fill every aspect between 9:19.5 and 21:9 edge to edge, painted to the
edges; letterbox beyond that. Anchor the HUD to the edges with
`env(safe-area-inset-*)`.

Keys are an addition, never a replacement: pointer events stay the input on
every device, and the game stays playable with one thumb in portrait.

## 4. Key specs (normative)

```
spec  := alt ( '|' alt )*            1 to 4 alternatives, "or"; at most 32 characters, lower case, no spaces
alt   := group | range | keys
group := 'arrows' | 'wasd'           arrows = ArrowUp/Down/Left/Right; wasd = w a s d
range := digit '-' digit             ascending, e.g. 1-3 = 1 2 3
keys  := key ( '/' key )*            1 to 4 keys that together do the verb, e.g. left/right
key   := space | enter | shift | up | down | left | right | [a-z] | [0-9]
```

- Esc and Tab are invalid: they belong to the host (Esc leaves fullscreen, Tab
  moves focus). So is every modifier but Shift.
- A verb is lower-case words with single spaces (`/^[a-z]+(?: [a-z]+)*$/`), at
  most 24 characters; at most 8 verbs. A key belongs to one verb only.
- Matching is on `KeyboardEvent.key`, letters case-insensitive.

`parseKeySpec(spec)` (`tools/beyondplay-check/src/game-display.js`) returns
`{ alts: [{ kind: 'group' | 'range' | 'keys', tokens }], keys }` or `null`.
`tokens` are as written (`['arrows']`, `['1', '3']`, `['left', 'right']`);
`keys` are the `KeyboardEvent.key` values it binds, letters lower case,
deduped, in order. Every implementation returns this shape.

| Spec | Keys |
|---|---|
| `arrows\|wasd` | ArrowUp ArrowDown ArrowLeft ArrowRight w a s d |
| `left/right\|a/d` | ArrowLeft ArrowRight a d |
| `up\|w\|space` | ArrowUp w ' ' |
| `1-3` | 1 2 3 |
| `shift\|k` | Shift k |

Invalid: `esc`, `tab`, `Space`, `space ` (trailing space), `arrows|`, `3-1`,
`a-z`, `ctrl`, `''`, `left//right`, `a/b/c/d/e`, and any spec over 32
characters.

## 5. How hosts read it (normative)

### Normalizing: `normalizeDisplay(raw)`

Everything that reads a manifest (the hosts, the smokes) goes through
`normalizeDisplay` (`tools/beyondplay-check/src/game-display.js`). It never
throws, returns a fresh object and is idempotent:

- A non-object gives `DEFAULT_DISPLAY` (a fresh copy).
- `orientation`: kept when it is `portrait`, `landscape` or `any`, else
  `'portrait'`.
- `input`: the known kinds, deduped, in order; `'touch'` and `'mouse'` are put
  first when missing. Not a list, or empty, gives the default.
- `keys`: an entry is kept when its verb and spec are valid and none of its
  keys belongs to an earlier kept entry; the first 8. Without `'keyboard'` in
  `input`, `keys` is `{}`.

| Input | Output |
|---|---|
| `undefined` | the default |
| `{ orientation: 'wide' }` | the default |
| `{ input: ['keyboard'] }` | input `['touch', 'mouse', 'keyboard']` |
| `{ input: ['touch', 'mouse'], keys: { jump: 'space' } }` | keys `{}` |
| `{ input: ['touch', 'mouse', 'keyboard'], keys: { jump: 'space', Bad: 'x', fire: 'esc' } }` | keys `{ jump: 'space' }` |
| `{ input: ['touch', 'mouse', 'keyboard'], keys: { jump: 'space', fire: 'space\|f' } }` | keys `{ jump: 'space' }` |

A declaration the validator passes normalizes to itself.

### The key hint (the host renders it, never the game)

A game never prints its key hints: no instruction text in a game. The host
renders them from `display.keys`:

- Labels: `arrows` "Arrow keys", `wasd` "WASD", `space` "Space", `enter`
  "Enter", `shift` "Shift", `up` `down` `left` `right` "↑" "↓" "←" "→", a
  letter upper case, a digit as is, a range `a-b` as "a–b" (en dash).
- A `keys` alternative joins its labels with one space ("← →", "A D"), never a
  slash.
- Alternatives: one is "X", two "X or Y", three or more "X, Y or Z".
- A line is "<alternatives> to <verb>", the verb in lower case as declared;
  lines join with " · ".
- No `keyboard` in `input`, or no keys: the hint is empty.

| Keys | Hint |
|---|---|
| `{ move: 'arrows\|wasd', jump: 'space' }` | Arrow keys or WASD to move · Space to jump |
| `{ move: 'left/right\|a/d', jump: 'up\|w\|space', slide: 'down\|s' }` | ← → or A D to move · ↑, W or Space to jump · ↓ or S to slide |
| `{ 'pick card': '1-3' }` | 1–3 to pick card |
| `{ guard: 'shift\|k' }` | Shift or K to guard |

Name each verb as the hint reads it: `jump`, `pick card`.

## 6. Binding keys: `src/keys.ts`

A starter file in the template: game-owned, edit it or delete it.

```ts
// src/App.tsx
import { display } from './beyondplay.config';
import { bindKeys } from './keys';

const unbind = bindKeys(display.keys, {
  move: (down, e) => { /* true: a key went down; false: it came up, or the window lost focus */ },
  jump: (down) => { if (down) g.jump(); },
});
// on unmount: unbind();
```

A key goes to the first verb that lists it and has a handler. Auto-repeat and
Ctrl, Meta or Alt chords are ignored, a bound key's default action is
prevented, and losing focus releases every held key. Apply a key like a tap:
on the next simulation step, from the shell, never from `src/game.ts`.
`keysOf(spec)` reads the grammar of section 4; a test bundles it and compares
it with the validator's `parseKeySpec`.

Under `?bp_test=1` the keys must reach the simulation the same way the
pointer does, so `smoke:keys` can prove them (section 8).

## 7. Viewport helpers: `src/viewport.ts`

Also a game-owned starter file, used by the template's shell.

- `readViewport()`: `{ w, h, dpr, orientation }`, the pixel ratio capped at 2,
  `landscape` when `w >= h`.
- `fitDesign(v, designs)`: fits one design space (`{ w, h }`), or one per
  orientation (`{ portrait, landscape }`), letterboxed and centred; returns
  the design, the scale and the offsets in backing-store pixels
  (`ctx.setTransform(scale, 0, 0, scale, offX, offY)`).
- `watchViewport(cb)`: calls back now and on every resize and orientation
  change; returns the function that stops watching.
- `useViewport()`: the same as React state, for a HUD laid out per aspect.

Only the view uses them.

## 8. The checks

The validator (`npm run check -- game games/<slug>`), on the manifest the
config produces; the report records the normalized display as
`facts.display`:

| Code | Severity | Tier | Fires when |
|---|---|---|---|
| `DISPLAY_ORIENTATION_INVALID` | error | publish | orientation is not portrait, landscape or any |
| `DISPLAY_INPUT_UNKNOWN` | error | publish | `input` is not a list, is empty, or names an unknown kind |
| `DISPLAY_KEYS_INVALID` | error | publish | `keys` is not an object, or has a bad verb, a bad or reserved spec, more than 8 verbs, or a key in two verbs |
| `DISPLAY_KEYS_WITHOUT_KEYBOARD` | error | publish | keys declared, `keyboard` not in `input` |
| `DISPLAY_INPUT_NO_POINTER` | error | listing | `input` lacks `touch` or `mouse` |
| `DISPLAY_ORIENTATION_LANDSCAPE` | warning | review | orientation `landscape` |
| `DISPLAY_KEYBOARD_NO_KEYS` | warning | review | `keyboard` declared, `keys` empty |
| `DISPLAY_KEYBOARD_NO_HANDLER` | warning | review | `keyboard` declared, no key handler in the source (`src/keys.ts` itself does not count) |
| `DISPLAY_KEYBOARD_UNDECLARED` | info | review | a key handler exists, `keyboard` not declared |

The smokes:

- `npm run smoke:render -- games/<slug>` plays the game once per declared
  viewport: portrait 390 x 844, landscape 1280 x 720, `any` both, portrait
  first. It ends `RENDER-OK (portrait, landscape)`.
- `npm run smoke:keys -- games/<slug>` proves the declared keys. A game
  without `keyboard` passes at once (`KEYS-OK: no keyboard declared`).
  Otherwise it opens the game top-level at the stage viewport (1280 x 720, or
  390 x 844 for a portrait game) under `?bp_test=1`, and for each verb plays
  the same run from `reset()` twice without the key and once with it held for
  30 steps: the two plain runs must match and the keyed run must differ. The
  driver's optional `keys` section tunes it:

  ```js
  // smoke.driver.mjs
  export default {
    play(t) { /* ... */ },
    keys: {
      setup(t) { /* in the page, after reset(): reach the state where keys act */ },
      settle: 30,   // steps between setup and the press
      ticks: 30,    // steps the key is held
      verbs: {
        'pick card': { skip: 'cards are only live between waves' },   // a skip needs a reason
        jump: { press: 'ArrowUp', ticks: 10 },                        // a Playwright key name
      },
    },
  };
  ```

  `press` defaults to the spec's first key (`left/right|a/d` presses
  ArrowLeft, `space` Space, `arrows` ArrowRight, `wasd` D, `1-3` 1). A verb
  the simulation ignores is a finding to fix, not a skip.
- The ladder runs both: render, then keys after idle.

If the game declares `any`, look at screenshots at 1280 x 720 too, not only
the portrait ones.

## 9. Hosted builds

`start_build` keeps the platform's own copy of `src/beyondplay-kit.ts`, and
that copy can trail this kit's. The hosted build accepts `defineDisplay` once
`get_contract`'s Display section no longer says "Not yet". Until then leave
the declaration commented, as the template does: a config that imports
`defineDisplay` fails the hosted build ("No matching export"), while the local
ladder passes. A game that declares nothing needs no change either way.

## 10. Later

Host to game `bp_pause` and `bp_resume` messages (pause while a host menu is
open) are not part of the kit yet; nothing sends or handles them. Optional
when they come: the host also hides the frame.
