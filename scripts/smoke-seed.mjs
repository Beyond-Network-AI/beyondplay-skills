// Seed-determinism smoke (duel fairness): the same seed and the same scripted
// inputs produce the identical score and trajectory hash across two separate
// browser loads; a different seed produces a different run. Prints
// DETERMINISTIC on success.
//
//   npm run smoke:seed -- games/<slug>          (or games/<slug>/dist)
//
// Uses the driver's script() (a fixed input schedule) when it has one, else
// play(). Compares state().hash and state().score, and state().plan when the
// hook exposes one.
import { startServer } from './serve-dist.mjs';
import { launch, loadDriver, resolveGame, run } from './smoke-driver.mjs';

const { gameDir, dist } = resolveGame(process.argv[2]);
const fail = (msg) => { console.error('SEED-FAIL:', msg); process.exit(1); };
const driver = await loadDriver(gameDir);
const script = driver.script ?? driver.play;

const { port, close } = await startServer(dist);
const browser = await launch();

async function playRun(seed) {
  const page = await browser.newPage({ viewport: { width: 420, height: 720 } });
  await page.goto(`http://127.0.0.1:${port}/?bp_test=1&bp_seed=${seed}&bp_match=smoke`);
  await page.waitForFunction(() => window.__bpTest !== undefined, undefined, { timeout: 20000 }).catch(() => fail('__bpTest hook never appeared'));
  const out = await run(page, script, { seed });
  await page.close();
  if (!out || out.phase !== 'gameover') fail(`run(seed=${seed}) did not finish: phase=${out && out.phase}`);
  if (out.hash === undefined) fail('state() has no hash; fold a trajectory hash every step and expose it');
  return { score: out.score, hash: String(out.hash), plan: out.plan === undefined ? null : JSON.stringify(out.plan) };
}

const a1 = await playRun('duel-seed-A');
const a2 = await playRun('duel-seed-A');
const b = await playRun('duel-seed-B');

console.log(`seed A run 1: score=${a1.score} hash=${a1.hash}`);
console.log(`seed A run 2: score=${a2.score} hash=${a2.hash}`);
console.log(`seed B run 1: score=${b.score} hash=${b.hash}`);

if (a1.hash !== a2.hash || a1.score !== a2.score) fail('same seed + same inputs diverged');
if (a1.plan !== null && a1.plan !== a2.plan) fail('same seed produced different courses');
if (a1.plan !== null && a1.plan === b.plan) fail('different seeds produced the identical course');
if (a1.hash === b.hash) fail('different seeds produced the identical trajectory hash');

await browser.close();
close();
console.log('DETERMINISTIC');
