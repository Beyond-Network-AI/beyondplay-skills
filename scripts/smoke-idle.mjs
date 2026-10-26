// Idle smoke: a feed card that nobody touches must not reach game over.
//
// The feed autoplays cards as they scroll into view. If a game's loss condition
// can fire with zero input, the viewer meets a game-over screen before they
// have decided to play. Rule: an untouched run is still playing after GRACE
// seconds (default 12). A runner may still end on a real collision later, but
// the first hazard has to sit far enough out that a viewer gets a look first.
// Prints IDLE-OK on success.
//   npm run smoke:idle -- games/<slug> [--grace 12]
import { startServer } from './serve-dist.mjs';
import { launch, resolveGame } from './smoke-driver.mjs';

const args = process.argv.slice(2);
const gi = args.indexOf('--grace');
const GRACE = gi >= 0 ? Number(args[gi + 1]) : 12;
const graceValue = gi >= 0 ? args[gi + 1] : null;
const { dist, slug } = resolveGame(args.find((a) => !a.startsWith('--') && a !== graceValue));
const fail = (msg) => { console.error('IDLE-FAIL:', msg); process.exit(1); };
// A game-over card is the replay control; every game ships one.
const OVER = /\b(again|retry|play again|too many|game over)\b/i;

const { port, close } = await startServer(dist);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
try {
  await page.goto(`http://127.0.0.1:${port}/`, { timeout: 15000 });
  const t0 = Date.now();
  let dead = null;
  while (Date.now() - t0 < GRACE * 1000 && !dead) {
    await page.waitForTimeout(200);
    const text = await page.evaluate(() => document.body.innerText);
    if (OVER.test(text)) dead = { s: ((Date.now() - t0) / 1000).toFixed(1), text: text.replace(/\n+/g, ' | ').slice(0, 60) };
  }
  if (dead) fail(`${slug}: the untouched run ended after ${dead.s} s (${JSON.stringify(dead.text)})`);
  console.log(`${slug}: still playing after ${GRACE} s with no input`);
} catch (e) {
  fail(`${slug}: ${String(e).slice(0, 160)}`);
} finally {
  await browser.close();
  close();
}
console.log('IDLE-OK');
