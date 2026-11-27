// The only file the platform reads to learn what this game is. The build emits
// dist/beyondplay.json from it. Keep it to the define* calls: no DOM, no game
// code, nothing that runs at import time beyond these declarations.
import { defineChallenge, defineDisplay, defineSoloGame } from './beyondplay-kit';

export const challenge = defineChallenge({
  metricLabel: 'Score',     // metres run plus ten a coin
  lowerIsBetter: false,
  seed: true,               // the course is drawn from the match seed
  instanceKind: 'random',
  minValue: 0,
  // Just above the best an honest run can reach: 660 m in sixty seconds plus ten a coin is about
  // 2,800. Change it whenever the speed, the run length or the scoring changes; the server rejects
  // values outside the bounds, so a bug that lets a score run free cannot reach the board.
  maxValue: 4000,
});

// `uses` names the platform capabilities the game asks for through
// src/beyondplay-platform.ts: request('share') on the end card, and the player's
// avatar in every avatar kit, so they run as whatever look they chose
// (src/scene.ts loads it with loadPlayerAvatar).
export const game = defineSoloGame({
  challenge,
  uses: ['share', 'player.avatar:beyonder', 'player.avatar:ape', 'player.avatar:bull', 'player.avatar:bear'],
});

// Phone and desktop (docs/display.md): a swipe or a tap on a phone, the keys
// below on a desktop (src/App.tsx binds them). The camera follows the screen's
// shape, so the view adapts to a wide screen too.
export const display = defineDisplay({
  orientation: 'any',
  input: ['touch', 'mouse', 'keyboard'],
  keys: { move: 'left/right|a/d', jump: 'up|w|space', slide: 'down|s' },
});
