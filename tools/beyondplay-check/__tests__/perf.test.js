import { afterEach, describe, expect, it, vi } from 'vitest';
import { INSTEAD, PERF_CODES, PERF_LIMITS, PERF_SETUP, drivenPlay, frameStats, percentile, perfIssues, perfSummary } from '../src/perf.js';
import { ruleFor, tierOf } from '../src/rules.js';
import { createReport } from '../src/report.js';

const codes = (issues) => issues.map((i) => i.code);

describe('the performance rules', () => {
  it('lists every performance code in the rules table with a tier and an instead', () => {
    for (const code of PERF_CODES) {
      const rule = ruleFor(code);
      expect(rule, code).not.toBeNull();
      expect(rule.instead.length, code).toBeGreaterThan(20);
      expect(INSTEAD[code]).toBe(rule.instead);
    }
    for (const code of ['GAME_SLOW_FIRST_FRAME', 'GAME_FRAME_TIME', 'GAME_DRAW_CALLS', 'GAME_TRIANGLES']) expect(tierOf(code)).toBe('listing');
    expect(tierOf('GAME_HEAP')).toBe('review');
    for (const code of ['GAME_RENDER_SMOKE_FAILED', 'GAME_SEED_SMOKE_FAILED', 'GAME_IDLE_SMOKE_FAILED']) expect(tierOf(code)).toBe('listing');
  });

  it('states the budgets and the phone stand-in', () => {
    expect(PERF_LIMITS).toMatchObject({ firstFrameMs: 5000, frameP95Ms: 33, drawCalls: 60, triangles: 300000 });
    expect(PERF_SETUP).toMatchObject({ cpuThrottle: 4, playSeconds: 10, heapSeconds: 60 });
    expect(PERF_SETUP.viewport.height).toBeGreaterThan(PERF_SETUP.viewport.width);
  });

  it('carries the tier through a report', () => {
    const report = createReport({ kind: 'game', dir: '.' });
    for (const i of perfIssues({ firstFrameMs: 9000, frame: { frames: 600, p95: 70 }, drawCalls: 120, triangles: 400000, heapBytes: 80 * 1024 * 1024, heapAfterS: 60 })) report[i.severity](i.code, i.path, i.message, i.remediation);
    const r = report.finish();
    expect(r.ok).toBe(true);
    expect(r.counts).toEqual({ error: 0, warning: 4, info: 1 });
    expect(r.issues.find((i) => i.code === 'GAME_FRAME_TIME').tier).toBe('listing');
    expect(r.issues.find((i) => i.code === 'GAME_HEAP').tier).toBe('review');
  });
});

describe('the arithmetic', () => {
  it('takes percentiles by nearest rank and ignores what is not a number', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile([5, NaN, 1, undefined, 3], 100)).toBe(5);
    expect(percentile([], 95)).toBeNull();
  });

  it('summarises frame times', () => {
    const deltas = [...Array(95).fill(16.7), ...Array(5).fill(50)];
    expect(frameStats(deltas)).toEqual({ frames: 100, p50: 16.7, p95: 16.7, max: 50 });
    expect(frameStats([...Array(90).fill(16.7), ...Array(10).fill(50)]).p95).toBe(50);
    expect(frameStats([])).toEqual({ frames: 0, p50: null, p95: null, max: null });
  });
});

describe('perfIssues', () => {
  const ok = { firstFrameMs: 600, firstFrameBy: 'bp_ready', frame: { frames: 560, p50: 16.7, p95: 16.8, max: 40 }, drawCalls: 30, triangles: 120000 };

  it('raises nothing for numbers inside every budget, and nothing for numbers not measured', () => {
    expect(perfIssues(ok)).toEqual([]);
    expect(perfIssues({})).toEqual([]);
    expect(perfIssues({ ...ok, drawCalls: null, triangles: null })).toEqual([]);
  });

  it('fires each listing finding just over its budget, never at it', () => {
    expect(codes(perfIssues({ ...ok, firstFrameMs: 5000 }))).toEqual([]);
    expect(codes(perfIssues({ ...ok, firstFrameMs: 5001 }))).toEqual(['GAME_SLOW_FIRST_FRAME']);
    expect(codes(perfIssues({ ...ok, drawCalls: 60 }))).toEqual([]);
    expect(codes(perfIssues({ ...ok, drawCalls: 61 }))).toEqual(['GAME_DRAW_CALLS']);
    expect(codes(perfIssues({ ...ok, triangles: 300000 }))).toEqual([]);
    expect(codes(perfIssues({ ...ok, triangles: 300001 }))).toEqual(['GAME_TRIANGLES']);
    for (const i of perfIssues({ ...ok, firstFrameMs: 9000, drawCalls: 99, triangles: 1e6 })) expect(i).toMatchObject({ severity: 'warning', path: 'dist' });
  });

  it('lets a frame of exactly two display refreshes pass as the 30 fps floor, and fires on the next one up', () => {
    expect(codes(perfIssues({ ...ok, frame: { frames: 500, p95: 33.3 } }))).toEqual([]);
    expect(codes(perfIssues({ ...ok, frame: { frames: 500, p95: 50 } }))).toEqual(['GAME_FRAME_TIME']);
    expect(perfIssues({ ...ok, frame: { frames: 500, p95: 50 } })[0].message).toContain('50 ms over 500 frames');
  });

  it('flags a game that never shows a first frame', () => {
    const [i] = perfIssues({ firstFrameMs: null, firstFrameMissing: 15000 });
    expect(i).toMatchObject({ code: 'GAME_SLOW_FIRST_FRAME', severity: 'warning' });
    expect(i.message).toContain('15.0 s');
  });

  it('reports the heap as an info line with its size', () => {
    const [i] = perfIssues({ heapBytes: 12.5 * 1024 * 1024, heapAfterS: 60 });
    expect(i).toMatchObject({ code: 'GAME_HEAP', severity: 'info' });
    expect(i.message).toBe('JavaScript heap 12.5 MB after 60 s of play.');
  });

  it('summarises the numbers on one line, naming what was not measured', () => {
    const line = perfSummary({ ...ok, drawCalls: null, triangles: null, heapBytes: null });
    expect(line).toContain('first frame 600 ms (bp_ready)');
    expect(line).toContain('frame p95 16.8 ms over 560 frames');
    expect(line).toContain('draw calls not exposed');
    expect(line).toContain('heap not measured');
  });
});

describe('drivenPlay', () => {
  afterEach(() => vi.unstubAllGlobals());
  // A fake hook and a fake animation clock: 10 ms frames.
  function setup({ perf } = {}) {
    let now = 0;
    const queue = [];
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (cb) => queue.push(cb));
    const log = [];
    const hook = {
      step: 0,
      tick(n) { this.step += n; log.push(['tick', n]); },
      tapAtStep(s) { log.push(['tap', s, this.step]); },
      state() { return { phase: this.step >= 30 ? 'gameover' : 'playing', score: 1, hash: this.step }; },
      reset() { this.step = 0; log.push(['reset']); },
      ...(perf ? { perf } : {}),
    };
    const pump = async () => { while (queue.length) { now += 10; queue.shift()(now); } };
    return { hook, log, pump };
  }
  const play = `function play(t) { t.tapAtStep(5); t.tick(10); t.tapAtStep(20); t.tick(20); return t.state(); }`;

  it('records the run, resets, and replays the same inputs after the same ticks in real time', async () => {
    const { hook, log, pump } = setup();
    const p = drivenPlay(hook, { play, playIsSource: false, seconds: 0.2, totalSeconds: 0.2, stepsPerSecond: 200 });
    await pump();
    const r = await p;
    expect(r.recordedTicks).toBe(30);
    expect(r.error).toBeUndefined();
    const afterReset = log.slice(log.findIndex((e) => e[0] === 'reset'));
    const taps = afterReset.filter((e) => e[0] === 'tap');
    expect(taps[0]).toEqual(['tap', 5, 0]);
    expect(taps[1]).toEqual(['tap', 20, 10]);
    expect(r.replays).toBeGreaterThanOrEqual(2);
    expect(r.deltas.every((d) => d === 10)).toBe(true);
    expect(r.drawCalls).toBeNull();
  });

  it('keeps the most draw calls and triangles the hook reports in one frame', async () => {
    let i = 0;
    const { hook, pump } = setup({ perf: () => ({ calls: [12, 48, 20][i % 3], triangles: [1000, 5000, 3000][i++ % 3] }) });
    const p = drivenPlay(hook, { play, playIsSource: false, seconds: 0.1, totalSeconds: 0.1, stepsPerSecond: 100 });
    await pump();
    expect(await p).toMatchObject({ drawCalls: 48, triangles: 5000 });
  });

  it('returns the driver error instead of throwing', async () => {
    const { hook } = setup();
    const r = await drivenPlay(hook, { play: 'function play() { throw new Error("boom") }', playIsSource: false, seconds: 1, stepsPerSecond: 60 });
    expect(r.error).toContain('boom');
  });
});
