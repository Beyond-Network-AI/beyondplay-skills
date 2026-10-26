// How the platform's checks play this game. Both functions run INSIDE the page
// with `t = window.__bpTest`; they must be self-contained (no imports, no
// closures over this file). The render smoke calls play() once and expects a
// finished run with a score above zero; the seed smoke runs script() against
// two seeds and expects identical hashes for the same seed. If your game
// cannot be played from the hook, these checks cannot pass.
export default {
  // A competent run: tap when the marker is at the centre of the zone.
  play(t) {
    for (let guard = 0; guard < 40; guard++) {
      const s = t.state();
      if (s.phase !== 'playing') break;
      const [zoneStart, zoneWidth, speed10] = s.plan[s.round];
      const centre = (zoneStart + zoneWidth / 2) / 1000;
      const speed = speed10 / 10;
      let target = null;
      for (let k = 0; k < speed; k++) {
        const rs = Math.ceil(((centre + k) * s.roundSteps) / speed);
        if (rs > s.roundStep && rs < s.roundSteps) { target = rs; break; }
      }
      if (target === null) { t.tick(s.roundSteps - s.roundStep + 1); continue; }
      t.tapAtStep(s.step + (target - s.roundStep));
      t.tick(target - s.roundStep + 1);
    }
    t.tick(10);
    return t.state();
  },
  // A fixed input schedule, the same for every seed: tap 60 steps into each round.
  script(t) {
    for (let round = 0; round < 10; round++) {
      const s = t.state();
      if (s.phase !== 'playing') break;
      t.tapAtStep(s.step + 60);
      t.tick(61);
    }
    t.tick(10);
    return t.state();
  },
};
