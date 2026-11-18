// Performance smoke: the built game on a mid-range phone stand-in. Portrait
// phone viewport, the CPU throttled four times through the Chrome DevTools
// Protocol (Emulation.setCPUThrottlingRate), the game embedded in a same-origin
// parent page (the platform shape) and played through its smoke.driver.mjs in
// real time. Measures:
//
//   - time to first frame: bp_ready reaching the parent, or the first drawn
//     canvas, whichever comes first, from the start of the game's navigation;
//   - the 95th percentile frame time over ten seconds of driven play;
//   - draw calls and triangles, the most seen in one frame, when the test hook
//     exposes perf() (three.js games return renderer.info.render);
//   - the JavaScript heap after a minute of play (informational).
//
// The thresholds and the codes live in tools/beyondplay-check/src/perf.js, the
// same file the hosted check copies. Prints PERF-OK when nothing is over a
// budget, PERF-WARN with the findings otherwise (listing tier: the game may
// still publish unlisted). --strict makes PERF-WARN exit 1. --json prints the
// measurement as one BP_PERF: line as well.
//
//   npm run smoke:perf -- games/<slug> [--seconds 10] [--heap-seconds 60] [--strict] [--json]
import { startServer } from './serve-dist.mjs';
import { launch, loadDriver, resolveGame } from './smoke-driver.mjs';
import { PERF_LIMITS, PERF_SETUP, drivenPlay, frameStats, perfIssues, perfSummary } from '../tools/beyondplay-check/src/perf.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : fallback; };
const valued = new Set(['--seconds', '--heap-seconds']);
const positional = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
const { gameDir, dist, slug } = resolveGame(positional[0]);
const seconds = opt('--seconds', PERF_SETUP.playSeconds);
const heapSeconds = Math.max(seconds, opt('--heap-seconds', PERF_SETUP.heapSeconds));
const fail = (msg) => { console.error('PERF-FAIL:', msg); process.exit(1); };
const driver = await loadDriver(gameDir);
const stepsPerSecond = Number(driver.stepsPerSecond) > 0 ? Number(driver.stepsPerSecond) : PERF_SETUP.stepsPerSecond;

const { port, close } = await startServer(dist);
const origin = `http://127.0.0.1:${port}`;
const browser = await launch();
const { width, height } = PERF_SETUP.viewport;
const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: PERF_SETUP.deviceScaleFactor });
const page = await context.newPage();

// The parent page, served from the game's own origin so the game frame shares
// the page's renderer process: the CPU throttle applies to it.
const HOST = '/__bp_perf_host.html';
await page.route(`${origin}${HOST}`, (route) => route.fulfill({
  contentType: 'text/html',
  body: `<!doctype html><html><body style="margin:0;background:#000">
    <script>
      window.__bpSignals = { ready: null };
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'bp_ready' && window.__bpSignals.ready === null) window.__bpSignals.ready = performance.timeOrigin + performance.now();
      });
    </script>
    <iframe id="game" style="width:100vw;height:100vh;border:0;display:block"></iframe>
  </body></html>`,
}));

// In the game frame: the epoch of navigation start, and the first frame the
// canvas holds more than one colour (sampled at 16 x 16 each animation frame
// until found).
await page.addInitScript(() => {
  if (window === window.top) return;
  window.__bpFirstCanvas = null;
  const probe = () => {
    const c = document.querySelector('canvas');
    if (c && c.width && c.height) {
      try {
        const s = document.createElement('canvas'); s.width = 16; s.height = 16;
        const x = s.getContext('2d'); x.drawImage(c, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data; const seen = new Set();
        for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3]}`);
        if (seen.size > 1) { window.__bpFirstCanvas = performance.timeOrigin + performance.now(); return; }
      } catch { /* a tainted or lost canvas: keep looking */ }
    }
    requestAnimationFrame(probe);
  };
  requestAnimationFrame(probe);
});

const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: PERF_SETUP.cpuThrottle });
await cdp.send('Performance.enable').catch(() => undefined);

await page.goto(`${origin}${HOST}`);
await page.evaluate((src) => { document.getElementById('game').src = src; }, `${origin}/?bp_test=1&bp_seed=perf-seed&bp_match=smoke`);
const frame = await (async () => {
  for (let i = 0; i < 100; i++) {
    const f = page.frames().find((x) => x !== page.mainFrame() && x.url().startsWith(origin));
    if (f) return f;
    await page.waitForTimeout(50);
  }
  return null;
})();
if (!frame) fail('the game frame never loaded');

// Time to first frame.
const waitMs = PERF_LIMITS.firstFrameMs * 3;
const t0 = Date.now();
let first = null;
while (Date.now() - t0 < waitMs) {
  first = await frame.evaluate(() => ({ origin: performance.timeOrigin, canvas: window.__bpFirstCanvas })).catch(() => null);
  const ready = await page.evaluate(() => window.__bpSignals.ready);
  if (first && (first.canvas !== null || ready !== null)) { first.ready = ready; break; }
  await page.waitForTimeout(50);
}
const firstAt = first ? [first.ready, first.canvas].filter((n) => typeof n === 'number') : [];
const firstFrameMs = firstAt.length ? Math.max(0, Math.min(...firstAt) - first.origin) : null;
const firstFrameBy = firstFrameMs === null ? null : (first.ready !== null && first.ready <= (first.canvas ?? Infinity) ? 'bp_ready' : 'canvas');

await frame.waitForFunction(() => window.__bpTest !== undefined, undefined, { timeout: 20000 }).catch(() => fail('__bpTest hook never appeared (is it exposed under ?bp_test=1?)'));

// Driven play: frame times over the first window, play continues to the heap reading.
const played = await frame.evaluate(
  ([src, ctx]) => {
    const f = (0, eval)(`(${src})`);
    return f(window.__bpTest, ctx);
  },
  [drivenPlay.toString(), {
    play: typeof driver.play === 'string' ? driver.play : driver.play.toString(),
    playIsSource: typeof driver.play === 'string',
    seconds,
    totalSeconds: heapSeconds,
    stepsPerSecond,
  }],
);
if (played.error) fail(played.error);

let heapBytes = null;
try {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
  const { metrics } = await cdp.send('Performance.getMetrics');
  heapBytes = metrics.find((x) => x.name === 'JSHeapUsedSize')?.value ?? null;
} catch { /* the heap stays unmeasured */ }

await browser.close();
close();

const measured = {
  firstFrameMs: firstFrameMs === null ? null : Math.round(firstFrameMs),
  firstFrameBy,
  ...(firstFrameMs === null ? { firstFrameMissing: waitMs } : {}),
  frame: frameStats(played.deltas),
  drawCalls: played.drawCalls,
  triangles: played.triangles,
  softwareGl: played.softwareGl === true,
  glRenderer: played.glRenderer ?? null,
  heapBytes,
  heapAfterS: heapSeconds,
  cpuThrottle: PERF_SETUP.cpuThrottle,
  viewport: `${width}x${height}`,
  stepsPerSecond,
  replays: played.replays,
};
console.log(`${slug}: ${perfSummary(measured)}`);
console.log(`(viewport ${measured.viewport}, CPU throttled ${measured.cpuThrottle}x, ${stepsPerSecond} steps/s, the driver's run played ${played.replays} time${played.replays === 1 ? '' : 's'})`);
if (args.includes('--json')) console.log(`BP_PERF:${JSON.stringify(measured)}`);

const findings = perfIssues(measured);
for (const i of findings) console.log(`${i.severity.toUpperCase()} ${i.code}: ${i.message}\n  Instead: ${i.remediation}`);
const over = findings.filter((i) => i.severity !== 'info');
if (over.length) {
  console.log(`PERF-WARN: ${over.map((i) => i.code).join(', ')}`);
  process.exit(args.includes('--strict') ? 1 : 0);
}
console.log('PERF-OK');
