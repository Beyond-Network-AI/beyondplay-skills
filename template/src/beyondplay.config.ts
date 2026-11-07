// The only file the platform reads to learn what this game is. The build emits
// dist/beyondplay.json from it. Keep it to the define* calls: no DOM, no game
// code, nothing that runs at import time beyond these declarations.
import { defineChallenge, defineSoloGame } from './beyondplay-kit';

export const challenge = defineChallenge({
  metricLabel: 'Score',     // what the number means on the card: "Score", "Time", "Strokes"
  lowerIsBetter: false,     // true for time, strokes, moves
  seed: true,               // true when content varies per play (then derive it from the seed)
  instanceKind: 'random',   // 'static' when every play is identical
  minValue: 0,
  maxValue: 1500,           // the server rejects values outside the bounds
});

// For a score-only game with no duel: `export const game = defineSoloGame({});`
// `uses` names the platform capabilities the game asks for through
// src/beyondplay-platform.ts (request('share') on the end card here).
// A game that shows the player's bulls declares the collection with the capability
// (docs/player-items.md): `uses: ['share', 'player.items:cobi']`.
export const game = defineSoloGame({ challenge, uses: ['share'] });

// Large screens and keys (docs/display.md). The defaults, portrait and
// ['touch', 'mouse'], fit a one-thumb phone game and need no line here. A game
// whose view adapts to a wide screen, or that also plays with keys, adds
// defineDisplay to the import above and declares it. Keep it commented until
// get_contract's Display section no longer says "Not yet": the hosted build
// uses the platform's own copy of the kit, which gains defineDisplay then.
// export const display = defineDisplay({
//   orientation: 'any',                       // 'portrait' (default) | 'landscape' | 'any'
//   input: ['touch', 'mouse', 'keyboard'],    // touch and mouse always; 'keyboard' when keys drive the game
//   keys: { move: 'arrows|wasd', jump: 'space' },
// });
