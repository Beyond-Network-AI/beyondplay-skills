// How the platform's checks play this game. Both functions run INSIDE the page
// with `t = window.__bpTest`; they must be self-contained (no imports, no
// closures over this file). The render smoke calls play() once and expects a
// finished run with a score above zero; the seed smoke runs script() against
// two seeds and expects identical hashes for the same seed.
export default {
  // The engine steps at 1/120 s; the performance smoke replays the run at this rate.
  stepsPerSecond: 120,
  // A competent run: read the next row, pick a lane that is not a wall, jump a
  // low bar and slide under a gate at the right distance for the current speed.
  play(t) {
    for (let guard = 0; guard < 6000; guard++) {
      const s = t.state();
      if (s.phase !== 'playing') break;
      const row = s.plan.find((r) => r[0] > s.z); // the next row still ahead; it stays the target until crossed
      if (row) {
        const cell = (lane) => row[2 + lane];
        const metres = (row[0] - s.z) / 100;
        const speed = s.speed / 100;
        if (cell(s.lane) === 3) {
          const target = [-1, 0, 1].filter((l) => cell(l) !== 3).sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane))[0];
          if (target < s.lane) t.leftAtStep(s.step + 1); else t.rightAtStep(s.step + 1);
          t.tick(2);
          continue;
        }
        if (cell(s.lane) === 1 && s.y === 0 && metres < 0.3 * speed) t.jumpAtStep(s.step + 1);
        if (cell(s.lane) === 2 && s.sliding === 0 && s.y === 0 && metres < 0.35 * speed) t.slideAtStep(s.step + 1);
      }
      t.tick(2);
    }
    return t.state();
  },
  // A fixed input schedule, the same for every seed: a jump and a lane change
  // every second until the run ends (three hits, or the full sixty seconds).
  script(t) {
    for (let i = 0; i < 70; i++) {
      const s = t.state();
      if (s.phase !== 'playing') break;
      t.jumpAtStep(s.step + 30);
      if (i % 2 === 0) t.rightAtStep(s.step + 60); else t.leftAtStep(s.step + 60);
      t.tick(120);
    }
    return t.state();
  },
};
