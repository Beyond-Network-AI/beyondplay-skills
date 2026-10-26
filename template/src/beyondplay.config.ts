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
export const game = defineSoloGame({ challenge });
