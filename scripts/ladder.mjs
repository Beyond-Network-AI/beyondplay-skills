// The whole ladder in order, stopping at the first failure:
//   validator (PASS) -> build (BUILD-OK) -> render (RENDER-OK) -> seed (DETERMINISTIC)
//   -> conformance (CONFORMANT) -> idle (IDLE-OK) -> typecheck (TYPECHECK-OK)
//   npm run ladder -- games/<slug>
import { resolveGame, run } from './kit.mjs';

const { gameDir, slug } = resolveGame(process.argv[2], { usage: 'usage: npm run ladder -- games/<slug>' });
const steps = [
  ['validator', ['tools/beyondplay-check/bin/beyondplay-check.mjs', 'game', gameDir]],
  ['build', ['scripts/check-build.mjs', gameDir]],
  ['render', ['scripts/smoke-render.mjs', gameDir]],
  ['seed', ['scripts/smoke-seed.mjs', gameDir]],
  ['conformance', ['scripts/conformance.mjs', gameDir]],
  ['idle', ['scripts/smoke-idle.mjs', gameDir]],
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
