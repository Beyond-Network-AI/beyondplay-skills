// Keys smoke: every verb a game declares in display.keys (defineDisplay in
// src/beyondplay.config.ts, read from dist/beyondplay.json) really moves the
// simulation when its key is pressed. Prints KEYS-OK or KEYS-FAIL.
//
//   npm run smoke:keys -- games/<slug>          (or games/<slug>/dist)
//
// The game opens top-level (not in an iframe) so the document has focus, at
// the stage viewport (landscape 1280x720 unless the game is portrait, then
// 390x844), under ?bp_test=1. For each verb, in order, the same run is played
// twice without the key and once with it held for `ticks` steps; the two plain
// runs must match (reset() reproduces the run) and the keyed run must differ.
// Runs compare state().hash (or the whole state when there is no hash).
//
// The driver's optional `keys` section (games/<slug>/smoke.driver.mjs) tunes it:
//   keys: {
//     setup(t) { ... },     // in the page after reset(), e.g. start the round
//     settle: 30,           // steps between setup and the press
//     ticks: 30,            // steps the key is held
//     verbs: { 'pick card': { skip: 'cards are only live between waves' },
//              jump: { press: 'ArrowUp', ticks: 10, setup(t) { ... } } },
//   }
// press is a Playwright key name (default: the spec's first key); a skip needs
// a reason. A verb the simulation ignores is a finding, not a skip.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './serve-dist.mjs';
import { launch, loadDriverKeys, playwrightKey, readDisplay, resolveGame, run, stageViewport, unexpectedFailures } from './smoke-driver.mjs';

const { gameDir, dist } = resolveGame(process.argv[2]);
const fail = (msg) => { console.error('KEYS-FAIL:', msg); process.exit(1); };
if (!existsSync(join(dist, 'beyondplay.json'))) fail(`${join(dist, 'beyondplay.json')} not found: build the game first`);

const display = readDisplay(dist);
if (!display.input.includes('keyboard')) {
  console.log('KEYS-OK: no keyboard declared');
  process.exit(0);
}
const verbs = Object.keys(display.keys);
if (!verbs.length) fail("display.input lists 'keyboard' but display.keys is empty: declare each verb's keys (defineDisplay)");

const keys = (await loadDriverKeys(gameDir)) ?? {};
const tuned = keys.verbs ?? {};
for (const verb of Object.keys(tuned)) {
  if (!verbs.includes(verb)) fail(`smoke.driver.mjs keys.verbs names '${verb}', which display.keys does not declare (${verbs.join(', ')})`);
}

const vp = stageViewport(display);
const { port, close } = await startServer(dist);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
const pageErrors = [];
const notFounds = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) notFounds.push(`${r.status()} ${r.url()}`); });
page.on('requestfailed', (r) => notFounds.push(`${r.failure()?.errorText ?? 'failed'} ${r.url()}`));

await page.goto(`http://127.0.0.1:${port}/?bp_test=1&bp_seed=keys-seed&bp_match=smoke`);
await page.waitForFunction(() => window.__bpTest !== undefined, undefined, { timeout: 20000 }).catch(() => fail('__bpTest hook never appeared (is it exposed under ?bp_test=1?)'));
const hasReset = await page.evaluate(() => typeof window.__bpTest.reset === 'function' && typeof window.__bpTest.tick === 'function');
if (!hasReset) fail('__bpTest needs reset() and tick(n) to replay a run with and without a key');
console.log(`${vp.name} ${vp.width}x${vp.height}: ${verbs.length} declared verb${verbs.length === 1 ? '' : 's'} (${verbs.map((v) => `${v}: '${display.keys[v]}'`).join(', ')})`);

const tick = (n) => page.evaluate((k) => window.__bpTest.tick(k), n);

/** One run from reset(): setup, settle, then the key held for `ticks` steps (or not), then 2 more steps. */
async function once(withKey, { press, ticks, settle, setup }) {
  await page.evaluate(() => window.__bpTest.reset());
  if (setup) await run(page, setup);
  await tick(settle);
  if (withKey) await page.keyboard.down(press);
  await tick(ticks);
  if (withKey) await page.keyboard.up(press);
  await tick(2);
  return page.evaluate(() => {
    const s = window.__bpTest.state();
    return s && s.hash !== undefined && s.hash !== null ? String(s.hash) : JSON.stringify(s);
  });
}

const proven = [];
const skipped = [];
for (const verb of verbs) {
  const spec = display.keys[verb];
  const v = tuned[verb] ?? {};
  if ('skip' in v) {
    if (typeof v.skip !== 'string' || !v.skip.trim()) fail(`the skip for '${verb}' needs a reason (keys.verbs['${verb}'].skip: 'why the smoke cannot press it')`);
    console.log(`${verb}: skipped (${v.skip})`);
    skipped.push(`${verb} (${v.skip})`);
    continue;
  }
  const press = v.press ?? playwrightKey(spec);
  if (!press) fail(`no key to press for '${verb}' (declared '${spec}')`);
  const opts = { press, ticks: v.ticks ?? keys.ticks ?? 30, settle: keys.settle ?? 30, setup: v.setup ?? keys.setup };
  const plain = await once(false, opts);
  const again = await once(false, opts);
  if (plain !== again) fail(`reset() does not reproduce the run (two plain runs for '${verb}' ended at ${plain} and ${again})`);
  const keyed = await once(true, opts);
  if (keyed === plain) fail(`pressing ${press} for '${verb}' (declared '${spec}') changed nothing in ${opts.ticks} steps`);
  console.log(`${verb}: ${press} held ${opts.ticks} steps moved the run (${plain} -> ${keyed})`);
  proven.push(verb);
}

const { badResponses, realErrors } = unexpectedFailures(pageErrors, notFounds);
if (badResponses.length) fail(`unexpected non-2xx responses: ${badResponses.slice(0, 3).join(' | ')}`);
if (realErrors.length) fail(`page errors: ${realErrors.slice(0, 3).join(' | ')}`);

await browser.close();
close();
console.log(`KEYS-OK: proven ${proven.join(', ') || 'none'}${skipped.length ? `; skipped ${skipped.join(', ')}` : ''}`);
