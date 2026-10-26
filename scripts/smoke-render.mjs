// Render smoke: the built game draws real pixels, plays the driver's run inside
// an embedding iframe (the platform shape), emits bp_game_over to the parent
// exactly once, and logs zero page errors. Prints RENDER-OK on success.
//
//   npm run smoke:render -- games/<slug>          (or games/<slug>/dist)
import { startServer } from './serve-dist.mjs';
import { launch, loadDriver, resolveGame, run } from './smoke-driver.mjs';

const { gameDir, dist, slug } = resolveGame(process.argv[2]);
const fail = (msg) => { console.error('RENDER-FAIL:', msg); process.exit(1); };
const driver = await loadDriver(gameDir);

const { port, close } = await startServer(dist);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 420, height: 720 } });

const pageErrors = [];
const notFounds = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) notFounds.push(`${r.status()} ${r.url()}`); });
page.on('requestfailed', (r) => notFounds.push(`${r.failure()?.errorText ?? 'failed'} ${r.url()}`));

const msgs = [];
await page.exposeFunction('__hostGotMessage', (data) => msgs.push(data));

// Embed the game in an iframe so the parent postMessage path is exercised.
await page.setContent(`
  <body style="margin:0">
    <iframe id="game" src="http://127.0.0.1:${port}/?bp_test=1&bp_seed=render-seed&bp_match=smoke"
            style="width:400px;height:700px;border:0"></iframe>
    <script>
      window.addEventListener('message', (e) => {
        if (e.data && (e.data.type === 'bp_game_over' || e.data.type === 'bp_progress' || e.data.type === 'bp_ready')) window.__hostGotMessage(e.data);
      });
    </script>
  </body>`);

const frame = page.frames().find((f) => f.url().includes('127.0.0.1'));
if (!frame) fail('game iframe not found');
await frame.waitForFunction(() => window.__bpTest !== undefined, undefined, { timeout: 20000 }).catch(() => fail('__bpTest hook never appeared (is it exposed under ?bp_test=1?)'));

// Let a few real frames draw, then check the canvas has non-blank pixels.
// The copy through a 2D canvas works for 2D and WebGL canvases alike.
await page.waitForTimeout(driver.settleMs ?? 800);
const minColors = driver.minColors ?? 3;
const pixels = await frame.evaluate((min) => {
  const c = document.querySelector('canvas');
  if (!c) return { ok: false, reason: 'no canvas' };
  if (!c.width || !c.height) return { ok: false, reason: 'zero-size canvas' };
  const copy = document.createElement('canvas'); copy.width = 200; copy.height = 350;
  const cctx = copy.getContext('2d'); cctx.drawImage(c, 0, 0, 200, 350);
  const data = cctx.getImageData(0, 0, 200, 350).data; const colors = new Set();
  for (let i = 0; i < data.length; i += 512) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  return { ok: colors.size >= min, reason: `distinct sampled colors: ${colors.size} (need ${min})`, w: c.width, h: c.height };
}, minColors);
if (!pixels.ok) fail(`canvas blank check failed (${pixels.reason})`);
console.log(`canvas OK: ${pixels.w}x${pixels.h}, ${pixels.reason}`);
if (!msgs.some((m) => m.type === 'bp_ready')) console.log('note: no bp_ready seen by the parent yet (the shell should call BeyondPlay.ready() after the first draw)');

// The driver's run to game over.
const result = await run(frame, driver.play, { seed: 'render-seed' });
if (!result || result.phase !== 'gameover') fail(`the run did not reach gameover (phase=${result && result.phase})${driver.generic ? ': an idle run does not finish this game; add games/' + slug + '/smoke.driver.mjs (copy template/smoke.driver.mjs)' : ''}`);
if (!driver.allowZero && !(result.score > 0)) fail('the run scored 0; the driver should play, not idle');
console.log(`run finished: score=${result.score} hash=${result.hash}`);

// bp_game_over must reach the parent exactly once, with the run's score.
let overs = [];
for (let i = 0; i < 30; i++) { await page.waitForTimeout(100); overs = msgs.filter((m) => m.type === 'bp_game_over'); if (overs.length) break; }
await page.waitForTimeout(300);
overs = msgs.filter((m) => m.type === 'bp_game_over');
if (overs.length !== 1) fail(`bp_game_over received ${overs.length} times (expected exactly 1)`);
if (overs[0].score !== result.score) fail(`bp_game_over score ${overs[0].score} != run score ${result.score}`);
console.log(`bp_game_over received by parent exactly once: score=${overs[0].score} board=${overs[0].board}`);

// Expected-benign failures outside the platform: the SDK's dev-proof probe,
// a favicon probe, the template's Google Fonts on a machine without network,
// and the resulting soft-fail of the score submit.
const benignUrl = (u) => u.includes('__accelerate_proof') || u.includes('favicon') || u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com');
const badResponses = notFounds.filter((line) => !benignUrl(line));
const benignCount = notFounds.length - badResponses.length;
const realErrors = pageErrors.filter(
  (e) => !e.includes('score submit failed') && !e.includes('fonts.g') &&
    !(e.startsWith('Failed to load resource') && benignCount > 0),
);
if (badResponses.length) fail(`unexpected non-2xx responses: ${badResponses.slice(0, 3).join(' | ')}`);
if (realErrors.length) fail(`page errors: ${realErrors.slice(0, 3).join(' | ')}`);

await browser.close();
close();
console.log('RENDER-OK');
