// The only file the platform reads to learn what this game is. The build emits
// dist/beyondplay.json from it. Keep it to the define* calls: no DOM, no game
// code, nothing that runs at import time beyond these declarations.
import { defineChallenge, defineSoloGame } from './beyondplay-kit';

export const challenge = defineChallenge({
  metricLabel: 'Score',     // metres run plus ten a coin
  lowerIsBetter: false,
  seed: true,               // the course is drawn from the match seed
  instanceKind: 'random',
  minValue: 0,
  maxValue: 4000,           // the server rejects values outside the bounds
});

// `uses` names the platform capabilities the game asks for through
// src/beyondplay-platform.ts (request('share') on the end card here).
export const game = defineSoloGame({ challenge, uses: ['share'] });
