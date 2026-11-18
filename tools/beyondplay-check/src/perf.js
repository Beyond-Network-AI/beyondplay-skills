// The performance gate: the thresholds, the arithmetic over measured numbers
// and the issues they map to. Shared by the kit's performance smoke
// (scripts/smoke-perf.mjs) and the hosted check, which copies this file with
// the rest of the validator, so a local run and a hosted run judge the same
// numbers the same way.
//
// Nothing here touches a browser. The one page-side piece, drivenPlay, is a
// self-contained function the smokes pass into the page as source text.

import { ruleFor } from './rules.js';

/** The budgets. Frame time is a 30 fps floor; 60 fps is the target the contract states. */
export const PERF_LIMITS = {
  /** Time to first frame (bp_ready or the first canvas change), from the start of navigation. */
  firstFrameMs: 5000,
  /** 95th percentile frame time over the driven play window. */
  frameP95Ms: 33,
  /**
   * Animation frames land on multiples of the display refresh (16.7 ms), so a
   * frame of exactly two refreshes (33.3 ms) is the 30 fps floor itself and
   * passes; the gate fires from the next refresh multiple up.
   */
  frameSlackMs: 1,
  /** three.js scenes: draw calls per frame, the most seen during play. */
  drawCalls: 60,
  /** three.js scenes: triangles per frame, the most seen during play. */
  triangles: 300000,
};

/** How the smoke measures: a mid-range phone stand-in. */
export const PERF_SETUP = {
  viewport: { width: 390, height: 844 },
  /**
   * One device pixel per CSS pixel. Headless Chromium rasterises a 2D canvas in
   * software on the throttled CPU, where a phone uses its GPU; at a scale of 2
   * the smoke would measure the browser's pixel fill, not the game's work.
   */
  deviceScaleFactor: 1,
  cpuThrottle: 4,
  /** Seconds of driven play the frame times are taken over. */
  playSeconds: 10,
  /** The heap is read after this many seconds of play (informational). */
  heapSeconds: 60,
  /** Simulation steps per second when the driver does not say (driver.stepsPerSecond). */
  stepsPerSecond: 60,
};

export const PERF_CODES = ['GAME_SLOW_FIRST_FRAME', 'GAME_FRAME_TIME', 'GAME_FRAME_TIME_NOT_JUDGED', 'GAME_DRAW_CALLS', 'GAME_TRIANGLES', 'GAME_HEAP'];

const MB = 1024 * 1024;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/** The p-th percentile (0 to 100) by nearest rank; null for no values. */
export function percentile(values, p) {
  const v = (values ?? []).filter(finite).sort((a, b) => a - b);
  if (!v.length) return null;
  const rank = Math.ceil((p / 100) * v.length);
  return v[Math.min(v.length - 1, Math.max(0, rank - 1))];
}

/** Frame times (ms between animation frames) to the numbers the gate reads. */
export function frameStats(deltas) {
  const v = (deltas ?? []).filter((d) => finite(d) && d >= 0);
  if (!v.length) return { frames: 0, p50: null, p95: null, max: null };
  const round = (n) => Math.round(n * 10) / 10;
  return { frames: v.length, p50: round(percentile(v, 50)), p95: round(percentile(v, 95)), max: round(Math.max(...v)) };
}

/**
 * Measured numbers to issues. `m` carries any of:
 *   firstFrameMs, firstFrameBy ('bp_ready' | 'canvas'), frame: { frames, p50, p95, max },
 *   drawCalls, triangles (null when the game exposes no three.js numbers), heapBytes, heapAfterS.
 * A number that was not measured raises nothing. Listing-tier findings are
 * warnings; the heap is an info line until a threshold is set from data.
 */
export function perfIssues(m = {}, limits = PERF_LIMITS) {
  const out = [];
  const add = (severity, code, message, remediation) => out.push({ code, severity, path: 'dist', message, remediation });
  if (finite(m.firstFrameMs) && m.firstFrameMs > limits.firstFrameMs) {
    add('warning', 'GAME_SLOW_FIRST_FRAME', `The first frame took ${fmtS(m.firstFrameMs)} on a mid-range phone stand-in (four times CPU throttling); the budget is ${fmtS(limits.firstFrameMs)}.`, INSTEAD.GAME_SLOW_FIRST_FRAME);
  }
  if (m.firstFrameMs === null && m.firstFrameMissing) {
    add('warning', 'GAME_SLOW_FIRST_FRAME', `No first frame within ${fmtS(m.firstFrameMissing)}: neither bp_ready nor a drawn canvas.`, INSTEAD.GAME_SLOW_FIRST_FRAME);
  }
  const p95 = m.frame?.p95;
  if (m.softwareGl) {
    // A WebGL game on a machine with no graphics card: the frame time measures the machine's
    // software 3D, not the game. It is reported and never judged; draw calls and triangles are
    // the budget a 3D game is held to.
    if (finite(p95)) add('info', 'GAME_FRAME_TIME_NOT_JUDGED', `The game draws with WebGL and the check machine has no graphics card, so the frame time (${p95} ms at the 95th percentile) measures software 3D, not the game, and is not judged.`, INSTEAD.GAME_FRAME_TIME_NOT_JUDGED);
  } else if (finite(p95) && p95 > limits.frameP95Ms + (limits.frameSlackMs ?? 0)) {
    add('warning', 'GAME_FRAME_TIME', `The 95th percentile frame time was ${p95} ms over ${m.frame.frames} frames of driven play (four times CPU throttling); the floor is ${limits.frameP95Ms} ms (30 fps), the target 16.7 ms (60 fps).`, INSTEAD.GAME_FRAME_TIME);
  }
  if (finite(m.drawCalls) && m.drawCalls > limits.drawCalls) {
    add('warning', 'GAME_DRAW_CALLS', `Up to ${m.drawCalls} draw calls per frame during play; the budget is ${limits.drawCalls}.`, INSTEAD.GAME_DRAW_CALLS);
  }
  if (finite(m.triangles) && m.triangles > limits.triangles) {
    add('warning', 'GAME_TRIANGLES', `Up to ${m.triangles.toLocaleString('en-US')} triangles per frame during play; the budget is ${limits.triangles.toLocaleString('en-US')}.`, INSTEAD.GAME_TRIANGLES);
  }
  if (finite(m.heapBytes)) {
    add('info', 'GAME_HEAP', `JavaScript heap ${(m.heapBytes / MB).toFixed(1)} MB after ${m.heapAfterS ?? PERF_SETUP.heapSeconds} s of play.`, INSTEAD.GAME_HEAP);
  }
  return out;
}

/** One line for a log or a ladder: the numbers, with "not measured" where a number is missing. */
export function perfSummary(m = {}) {
  const parts = [
    `first frame ${finite(m.firstFrameMs) ? `${Math.round(m.firstFrameMs)} ms${m.firstFrameBy ? ` (${m.firstFrameBy})` : ''}` : 'not seen'}`,
    `frame p95 ${finite(m.frame?.p95) ? `${m.frame.p95} ms over ${m.frame.frames} frames` : 'not measured'}`,
    `draw calls ${finite(m.drawCalls) ? m.drawCalls : 'not exposed'}`,
    `triangles ${finite(m.triangles) ? m.triangles : 'not exposed'}`,
    `heap ${finite(m.heapBytes) ? `${(m.heapBytes / MB).toFixed(1)} MB after ${m.heapAfterS} s` : 'not measured'}`,
  ];
  return parts.join(', ');
}

const fmtS = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** The platform's way to the same outcome, per code, from the rules table. */
export const INSTEAD = Object.fromEntries(PERF_CODES.map((code) => [code, ruleFor(code)?.instead ?? '']));

/**
 * Page-side, passed into the page as source text: play the game through its
 * driver in real time for the measurement window. The driver's play() steps
 * the engine synchronously, so it runs once against a recording proxy of the
 * hook (every tick and every <verb>AtStep call, in order); the engine is
 * reset, and the recorded run is replayed at ctx.stepsPerSecond, with the same
 * inputs issued after the same number of ticks, from requestAnimationFrame.
 * The game's own loop draws every frame (test mode draws but never steps), so
 * the frame times are the game's real render cost. When the recorded run ends
 * before the window does, it is replayed again from a reset.
 *
 * ctx: { play: string (driver.play source), playIsSource: boolean,
 *        seconds (the window frame times are taken over), totalSeconds (how
 *        long play goes on, for the heap reading after it), stepsPerSecond }
 * Returns { deltas, drawCalls, triangles, replays, recordedTicks, error? }.
 */
export function drivenPlay(t, ctx) {
  const schedule = [];
  let ticks = 0;
  const rec = new Proxy(t, {
    get(target, key) {
      const v = target[key];
      if (typeof v !== 'function') return v;
      if (key === 'tick') return (n) => { ticks += n; return v.call(target, n); };
      if (typeof key === 'string' && /AtStep$/.test(key)) return (...args) => { schedule.push({ key, args, at: ticks }); return v.apply(target, args); };
      return (...args) => v.apply(target, args);
    },
  });
  try {
    if (ctx.playIsSource) {
      window.__bpTest = rec;
      try { (0, eval)(ctx.play); } finally { window.__bpTest = t; }
    } else {
      let f;
      try { f = (0, eval)(`(${ctx.play})`); } catch { f = Object.values((0, eval)(`({${ctx.play}})`))[0]; }
      f(rec, ctx.driverCtx ?? null);
    }
  } catch (e) {
    return Promise.resolve({ deltas: [], drawCalls: null, triangles: null, replays: 0, recordedTicks: ticks, error: `the driver threw while recording: ${String(e).slice(0, 200)}` });
  }
  const total = Math.max(1, ticks);
  const perf = typeof t.perf === 'function' ? () => { try { return t.perf(); } catch { return null; } } : null;
  // Does the game draw with WebGL (a canvas that refuses a 2D context already has another), and
  // is WebGL drawn in software here (a check machine with no graphics card)? Read after play.
  const glOf = () => {
    let webgl = false; let renderer = 'none';
    try { webgl = [...document.querySelectorAll('canvas')].some((c) => { try { return c.getContext('2d') === null; } catch { return true; } }); } catch { /* no canvas */ }
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      if (gl) renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    } catch { /* no WebGL at all */ }
    return { webgl, glRenderer: renderer.slice(0, 120), softwareGl: webgl && /swiftshader|llvmpipe|software|basic render|none/i.test(renderer) };
  };
  return new Promise((resolve) => {
    t.reset();
    let done = 0; let next = 0; let replays = 1;
    const deltas = []; let drawCalls = null; let triangles = null;
    const start = performance.now(); let last = start; let carry = 0;
    const frame = (now) => {
      const dt = now - last; last = now;
      if (now - start <= ctx.seconds * 1000) deltas.push(dt);
      carry += (dt / 1000) * ctx.stepsPerSecond;
      let n = Math.floor(carry); carry -= n;
      while (n > 0) {
        while (next < schedule.length && schedule[next].at <= done) { const s = schedule[next++]; t[s.key](...s.args); }
        const until = next < schedule.length ? Math.min(n, schedule[next].at - done) : n;
        const step = Math.max(1, until);
        t.tick(step); done += step; n -= step;
        if (done >= total) { t.reset(); done = 0; next = 0; replays += 1; }
      }
      if (perf) {
        const p = perf();
        if (p && Number.isFinite(p.calls)) drawCalls = Math.max(drawCalls ?? 0, p.calls);
        if (p && Number.isFinite(p.triangles)) triangles = Math.max(triangles ?? 0, p.triangles);
      }
      if (now - start < Math.max(ctx.seconds, ctx.totalSeconds ?? 0) * 1000) requestAnimationFrame(frame);
      else resolve({ deltas: deltas.slice(1), drawCalls, triangles, replays, recordedTicks: ticks, ...glOf() });
    };
    requestAnimationFrame(frame);
  });
}
