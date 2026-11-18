// The only file the platform reads to learn what this game is. The build emits
// dist/beyondplay.json from it. Keep it to the define* calls: no DOM, no game
// code, nothing that runs at import time beyond these declarations.
import { defineChallenge, defineDisplay, defineSoloGame } from './beyondplay-kit';

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

// Phone and desktop (docs/display.md). Every listed game plays on both: one thumb
// on a phone, keys on a desktop. A phone-only game publishes unlisted but is not
// listed (DISPLAY_PHONE_ONLY). This one is portrait, so a desktop shows it in a
// phone-shaped box, and Space or Enter taps. A game whose view adapts to a wide
// screen declares orientation: 'any' (src/viewport.ts); bind each verb's keys
// with bindKeys from src/keys.ts, and npm run smoke:keys proves them.
export const display = defineDisplay({
  input: ['touch', 'mouse', 'keyboard'],   // touch and mouse always; 'keyboard' for the desktop
  keys: { tap: 'space|enter' },            // verb -> keys, as the host's key hint reads them
});
