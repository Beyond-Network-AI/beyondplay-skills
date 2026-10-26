# Mobile and feed rules

Sources: the platform's feed-ready and haptics playbooks, the runtime
gotchas met by the published games, `scripts/smoke-idle.mjs` and
`template/src/webkit-image-hardening.ts` in this kit.

Games live or die on phones. Every rule below has broken a shipped game once.

## Touch

- Pointer events only: `pointerdown`, `pointermove`, `pointerup`,
  `pointercancel`, with `setPointerCapture(e.pointerId)` on down and
  `releasePointerCapture` on up. Never pair mouse and touch events.
- The template's touch guard sets `touch-action: none` and
  `overscroll-behavior: none` on `html, body`. Keep it: in-game swipes must
  never scroll the embedding feed.
- iOS WebKit has been seen to let mid-run swipes page the feed despite
  `touch-action`. A game played with vertical swipes adds a non-passive
  `touchmove` listener that calls `preventDefault()` (not `touchstart`, which
  would cost the end card its taps).
- Generous hit targets, one thumb, portrait first.
- Instant response: apply a flick on the next simulation step.

## Viewport and canvas

- Design to a fixed logical space (flick-hoops uses 400 x 640) and scale it
  uniformly to `window.innerWidth` x `window.innerHeight`, centred, with the
  backing store multiplied by `devicePixelRatio` capped at 2.
- Full-bleed: the canvas CSS size equals the window, and the background is
  painted out to the edges beyond the logical space, so no bars show. Check
  that the canvas bounds match the viewport within 2 px at 393 x 852 and at
  1100 x 800.
- Heights are `100%` or `100dvh`, never `100vh` (the iOS URL bar jumps).
- HUD placement respects `env(safe-area-inset-*)`, for example
  `top: max(14px, env(safe-area-inset-top))`.
- The template CSS disables text selection, tap highlights and zoom. Do not
  undo it.
- Text at phone size: minimum 12 px; the score is readable at arm's length.

## The feed contract

The feed is a swipe surface: when a card scrolls into view the player is
already playing.

1. Boot straight into a playable state. No title screen, no tap-to-start, no
   mode gate before the game exists. A short intro fly-in is fine when touch
   skips it and it runs on the same clock as the game.
2. No instruction text, ever: not "tap to", "swipe to", "hold to", "drag to",
   "flick to", "how to play", "instructions", not even a fading hint. The feed
   smoke fails on that regex in the DOM text. Wordless animated icon hints are
   allowed. If a mechanic needs explaining, redesign it.
3. Announce first paint once: call `window.BeyondPlay?.ready()` from inside
   the first `requestAnimationFrame` callback after the first real draw, not
   on `DOMContentLoaded`.
4. Preboot hold: the feed pre-boots neighbour cards below the fold. Paint the
   first frame at once but freeze the simulation until the iframe is in the
   top-level viewport. Use `IntersectionObserver` on
   `document.documentElement` with threshold `0.4`, and a 1.5 s fallback only
   when `window.self === window.top`. Test mode (`bp_test=1`) is exempt. Do
   not fire haptics or start music before the hold lifts.
5. Idle survival: an untouched run must still be playing after 12 s. A
   runner may still end on a real collision, but the first hazard sits far
   enough out that a viewer sees the game first.
6. Restart both ways: an in-page replay button on the end card and the
   parent's `bp_play_again` message both start a fresh run with score 0.
7. Swipe games report late: on `bp_game_over` the feed covers the game with
   its own overlay, which pages the feed on a vertical swipe. A game
   controlled by vertical swipes reports when its own end card has come in
   (about 1.1 s after the crash in BullRun) and sends the report at once on
   restart, page hide or unmount so no score is lost. Tap and drag games
   report at game over.
8. The game must also work when opened deliberately on its own page.

## Loading

- Keep the first-playable bundle small; stream heavy assets after `bp_ready`.
- Never show your own loading screen; the platform shows the poster and
  cross-fades on `bp_ready`.
- Feed smokes expect the running HUD within about 4 to 5 s of a plain load on
  a device with a GPU.

## Performance

- One canvas. No per-frame allocations in the hot loop, no layout thrash, no
  React state updates per frame (HUD updates at most 10 Hz). Stop stepping
  behind the end card.
- Target 60 fps on a mid-range iPhone. Bundle well under 1 MB gzipped
  (the scaffold: about 51 KB).
- 3D (three.js): at most 60 draw calls and 300k triangles with the character
  loaded. The 3D reference caps the pixel ratio at 1.5. Compile shaders and
  upload textures at load, not during play; build heavy scenes in slices so
  no boot task blocks for more than about a second; aim for a median of
  45 fps under 4x CPU throttle in headless Chromium where a GPU exists.
- Prefer Canvas 2D. Add a framework or a dependency only when truly needed.

## Determinism on the main thread

- Fixed timestep (1/120 s) consumed from an accumulator over
  `requestAnimationFrame`; clamp the frame delta (flick-hoops clamps at
  250 ms) so a backgrounded tab does not flush a whole run at once.
- Simulation time is a step counter. Cosmetic clocks (`renderT`) are separate
  and never feed back into the simulation.
- Any effect that keys off a wall-clock window can be dropped by a slow
  frame; key it off simulation steps.

## Audio on phones

- No `AudioContext` before a user gesture; unlock on the first `pointerdown`
  (or key). Decode clips at boot, start cues on the gesture.
- Phones reproduce little below about 150 Hz; judge weight above that band.
- Assets under 2 KB are inlined as `data:` URLs by the shared Vite config and
  the production CSP refuses `fetch()` of them; decode them in place.

## Known iOS and CSP traps

- WKWebView can decode an `<img>` as blank while reporting success;
  `main.tsx` installs `installWebKitImageHardening()`, which re-decodes on a
  blank probe. Do not remove the call.
- glTF textures loaded through blob URLs render grey on iPhone and under a
  strict CSP; register a `createImageBitmap`-based `EXT_texture_webp` loader
  plugin for any GLB with embedded textures.
- Draco decoding runs in a blob worker that strict CSPs block; pre-decode and
  use meshopt instead. Meshopt's wasm needs `'unsafe-eval'`, which the
  production CSP grants.
- Avoid `window.prompt` and other dialogs; they freeze automation.
- Local storage, when used at all, is for small conveniences only; the
  porting guidance names "localStorage abuse" as something to strip.

## Haptics

- Seven kinds only: `impact-light`, `impact-medium`, `impact-heavy`,
  `success`, `warning`, `error`, `selection`. Unknown kinds are ignored.
- Discrete player-caused moments only; never per frame, never inside the
  physics loop; buzz on the outcome, not on the tap.
- Call sites live in `App.tsx` event callbacks, not in `game.ts`, so the
  engine stays deterministic.
- The haptics smoke fails a run with no haptics, with malformed messages,
  with unknown kinds, or with more than 400 messages.
- Never gate gameplay on a haptic; plain iOS Safari has no vibration API.

## Open questions for the platform team

- Whether iOS WebKit pages the feed on mid-run swipes is unconfirmed by the
  platform; the `touchmove` guard is a game-side workaround.
- Swipes that start on the feed's own chrome (the rim beside the game, the
  action row under it) still page the feed; no game can prevent that.
- Landscape: no source states whether landscape phones must be playable;
  portrait is the surface the feed and the app use.
- Whether a game may use `localStorage` for a remembered preference (one
  shipped game remembers a character pick) is practice, not a written rule.
