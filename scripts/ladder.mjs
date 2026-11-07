// The whole ladder in order, stopping at the first failure:
//   validator (PASS) -> build (BUILD-OK) -> render (RENDER-OK) -> seed (DETERMINISTIC)
//   -> conformance (CONFORMANT) -> idle (IDLE-OK) -> keys (KEYS-OK)
//   -> perf (PERF-OK or PERF-WARN) -> typecheck (TYPECHECK-OK)
// The render step plays once per viewport the game's display declares (portrait,
// landscape, or both for 'any'); the keys step proves each declared key moves the
// simulation, and passes at once for a game that declares no keyboard.
// The perf step reports its findings (listing tier: the game may still publish
// unlisted, approval waits) without stopping the ladder; --perf-strict makes a
// finding stop it. It plays the game for a minute, for the heap reading.
//   npm run ladder -- games/<slug> [--perf-strict]
import { resolveGame, run } from './kit.mjs';

const { gameDir, slug } = resolveGame(process.argv[2], { usage: 'usage: npm run ladder -- games/<slug>' });
const steps = [
  ['validator', ['tools/beyondplay-check/bin/beyondplay-check.mjs', 'game', gameDir]],
  ['build', ['scripts/check-build.mjs', gameDir]],
  ['render', ['scripts/smoke-render.mjs', gameDir]],
  ['seed', ['scripts/smoke-seed.mjs', gameDir]],
  ['conformance', ['scripts/conformance.mjs', gameDir]],
  ['idle', ['scripts/smoke-idle.mjs', gameDir]],
  ['keys', ['scripts/smoke-keys.mjs', gameDir]],
  ['perf', ['scripts/smoke-perf.mjs', gameDir, ...(process.argv.includes('--perf-strict') ? ['--strict'] : [])]],
  ['typecheck', ['scripts/typecheck.mjs', gameDir]],
];
const passed = [];
for (const [name, args] of steps) {
  console.log(`\n== ${name}: ${slug}`);
  const r = run(process.execPath, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nLADDER-FAIL: ${name} failed after ${passed.length ? passed.join(', ') : 'nothing'} passed`);
    process.exit(1);
  }
  passed.push(name);
}
console.log(`\nLADDER-OK: ${passed.join(', ')}`);
