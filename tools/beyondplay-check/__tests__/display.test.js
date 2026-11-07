// The display declaration: the key-spec grammar, normalizeDisplay and checkDisplay against the
// normative vectors (docs/display.md), plus parity with the template's src/keys.ts and a look at
// src/viewport.ts.
import { join } from 'node:path';
import { build } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY, KEY_GROUPS, KEY_HANDLER, MAX_VERBS, NAMED_KEYS, checkDisplay, keySpecError, normalizeDisplay, parseKeySpec } from '../src/game-display.js';
import { createReport } from '../src/report.js';
import { TEMPLATE, codes, issue } from './helpers.js';

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const KB = ['touch', 'mouse', 'keyboard'];

/** Valid specs with the keys they bind: the grammar's vectors, then every spec the published keyboard games declare. */
const VALID = [
  ['arrows|wasd', [...ARROWS, 'w', 'a', 's', 'd']],
  ['left/right|a/d', ['ArrowLeft', 'ArrowRight', 'a', 'd']],
  ['up|w|space', ['ArrowUp', 'w', ' ']],
  ['1-3', ['1', '2', '3']],
  ['shift|k', ['Shift', 'k']],
  ['space|down', [' ', 'ArrowDown']],
  ['up|w', ['ArrowUp', 'w']],
  ['down|s', ['ArrowDown', 's']],
  ['space', [' ']],
  ['space|j', [' ', 'j']],
  ['left/right', ['ArrowLeft', 'ArrowRight']],
  ['space|up', [' ', 'ArrowUp']],
  ['enter', ['Enter']],
  ['arrows|up', ARROWS],
  ['0-9', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']],
  ['left/right/up/down|a/d/w/s|space', ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', ' ']],
];

/** Invalid specs: the grammar's list, then more of each kind. */
const INVALID = [
  'esc', 'tab', 'Space', 'space ', 'arrows|', '3-1', 'a-z', 'ctrl', '', 'left//right', 'a/b/c/d/e',
  'left/right/up/down|shift/enter/space/a|1-9', // 42 characters, otherwise well formed
  'a|b|c|d|e', '1-1', 'arrows/space', 'escape', 'alt', 'meta', 'f1', 'pageup', '|space', 'space||up', '1-3/4', 'w a', 'ArrowUp',
];

describe('parseKeySpec (the grammar)', () => {
  it.each(VALID)('%j binds %j', (spec, keys) => {
    expect(parseKeySpec(spec)?.keys).toEqual(keys);
    expect(keySpecError(spec)).toBeNull();
  });

  it.each(INVALID.map((s) => [s]))('%j is invalid', (spec) => {
    expect(parseKeySpec(spec)).toBeNull();
    expect(typeof keySpecError(spec)).toBe('string');
  });

  it('rejects what is not a string', () => {
    for (const v of [undefined, null, 42, ['space'], { jump: 'space' }]) expect(parseKeySpec(v)).toBeNull();
  });

  it('returns { alts, keys } with the tokens as written', () => {
    expect(parseKeySpec('left/right|a/d|1-3|arrows')).toEqual({
      alts: [
        { kind: 'keys', tokens: ['left', 'right'] },
        { kind: 'keys', tokens: ['a', 'd'] },
        { kind: 'range', tokens: ['1', '3'] },
        { kind: 'group', tokens: ['arrows'] },
      ],
      keys: ['ArrowLeft', 'ArrowRight', 'a', 'd', '1', '2', '3', 'ArrowUp', 'ArrowDown'],
    });
  });

  it('says why: Esc and Tab are reserved, modifiers other than Shift are refused, case and length are named', () => {
    expect(keySpecError('esc')).toMatch(/reserved/);
    expect(keySpecError('space|tab')).toMatch(/reserved/);
    expect(keySpecError('ctrl')).toMatch(/modifier/);
    expect(keySpecError('Space')).toMatch(/lower case/);
    expect(keySpecError('space ')).toMatch(/space/);
    expect(keySpecError('3-1')).toMatch(/ascend/);
    expect(keySpecError('a/b/c/d/e')).toMatch(/at most 4/);
    expect(keySpecError(INVALID[11])).toMatch(/42 characters; the limit is 32/);
  });

  it('exports the key tables the template helper mirrors', () => {
    expect(KEY_GROUPS).toEqual({ arrows: ARROWS, wasd: ['w', 'a', 's', 'd'] });
    expect(NAMED_KEYS).toEqual({ space: ' ', enter: 'Enter', shift: 'Shift', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' });
  });
});

describe('normalizeDisplay', () => {
  const def = { orientation: 'portrait', input: ['touch', 'mouse'], keys: {} };

  it.each([
    ['undefined', undefined, def],
    ["{ orientation: 'wide' }", { orientation: 'wide' }, def],
    ["{ input: ['keyboard'] }", { input: ['keyboard'] }, { ...def, input: KB }],
    ['keys without keyboard', { input: ['touch', 'mouse'], keys: { jump: 'space' } }, def],
    ['a bad verb and a reserved key', { input: KB, keys: { jump: 'space', Bad: 'x', fire: 'esc' } }, { ...def, input: KB, keys: { jump: 'space' } }],
    ['a key in two verbs (the later one is dropped)', { input: KB, keys: { jump: 'space', fire: 'space|f' } }, { ...def, input: KB, keys: { jump: 'space' } }],
  ])('%s', (_name, raw, want) => {
    expect(normalizeDisplay(raw)).toEqual(want);
  });

  it('gives the default for anything that is not an object', () => {
    for (const v of [null, 'any', 42, [], ['keyboard']]) expect(normalizeDisplay(v)).toEqual(def);
  });

  it('keeps known orientations and input kinds, dedupes, and puts touch and mouse first when missing', () => {
    expect(normalizeDisplay({ orientation: 'any' }).orientation).toBe('any');
    expect(normalizeDisplay({ orientation: 'landscape' }).orientation).toBe('landscape');
    expect(normalizeDisplay({ input: ['mouse', 'keyboard', 'keyboard'] }).input).toEqual(KB);
    expect(normalizeDisplay({ input: ['keyboard', 'mouse'] }).input).toEqual(['touch', 'keyboard', 'mouse']);
    expect(normalizeDisplay({ input: ['keyboard', 'touch', 'mouse', 'gamepad'] }).input).toEqual(['keyboard', 'touch', 'mouse', 'gamepad']);
    expect(normalizeDisplay({ input: ['joystick'] }).input).toEqual(['touch', 'mouse']);
    expect(normalizeDisplay({ input: [] }).input).toEqual(['touch', 'mouse']);
    expect(normalizeDisplay({ input: 'keyboard' }).input).toEqual(['touch', 'mouse']);
  });

  it(`keeps at most ${MAX_VERBS} valid verbs, in order, and drops non-string specs and long verbs`, () => {
    const keys = Object.fromEntries('abcdefghij'.split('').map((c, i) => [`verb ${c}`, String(i)]));
    const out = normalizeDisplay({ input: KB, keys: { ...keys } });
    expect(Object.keys(out.keys)).toEqual(Object.keys(keys).slice(0, MAX_VERBS));
    expect(normalizeDisplay({ input: KB, keys: { jump: 42, ['a'.repeat(25)]: 'space', go: 'enter' } }).keys).toEqual({ go: 'enter' });
    expect(normalizeDisplay({ input: KB, keys: ['space'] }).keys).toEqual({});
  });

  it('returns a fresh object, is idempotent, and never throws', () => {
    const a = normalizeDisplay(undefined);
    a.input.push('keyboard');
    a.keys.jump = 'space';
    expect(DEFAULT_DISPLAY).toEqual(def);
    expect(normalizeDisplay(undefined)).toEqual(def);
    for (const raw of [undefined, { input: KB, keys: { move: 'arrows|wasd', jump: 'space', fire: 'space|f' } }, { orientation: 'any', input: ['keyboard', 'mouse'] }]) {
      const once = normalizeDisplay(raw);
      expect(normalizeDisplay(once)).toEqual(once);
    }
    const hostile = { get input() { throw new Error('boom'); } };
    expect(normalizeDisplay(hostile)).toEqual(def);
  });
});

/** Declarations of the shapes keyboard games take (from the games that declare keys), as the kit fills them. */
const GAMES = {
  'hold to tuck': { input: KB, keys: { tuck: 'space|down' } },
  'boss fight with weapons': { orientation: 'any', input: KB, keys: { move: 'left/right|a/d', jump: 'up|w', roll: 'down|s', fire: 'space', 'switch weapon': '1-3' } },
  'three-lane runner': { orientation: 'any', input: KB, keys: { move: 'left/right|a/d', jump: 'up|w|space', slide: 'down|s' } },
  'swipe to sort': { input: KB, keys: { sort: 'left/right' } },
  'drop to stack': { input: KB, keys: { drop: 'space|down' } },
  'one key': { input: KB, keys: { mine: 'space' } },
  'fighter': { orientation: 'any', input: KB, keys: { move: 'left/right|a/d', jab: 'space|j', uppercut: 'up|w', 'low kick': 'down|s', guard: 'shift|k' } },
  'climber': { input: KB, keys: { move: 'left/right', jump: 'space|up' } },
  'steer': { input: KB, keys: { steer: 'left/right' } },
  'eight-way stick': { input: KB, keys: { move: 'arrows|wasd' } },
  'hold to jump': { input: KB, keys: { jump: 'space|up' } },
  'steer with letters too': { input: KB, keys: { steer: 'left/right|a/d' } },
  'arena with cards': { orientation: 'any', input: KB, keys: { move: 'arrows|wasd', 'pick card': '1-3' } },
};
const filled = (decl) => ({ orientation: decl.orientation ?? 'portrait', input: decl.input ?? ['touch', 'mouse'], keys: decl.keys ?? {} });

/** checkDisplay on a manifest, with no source files (so the handler scan finds nothing). */
const run = (display, files = []) => {
  const report = createReport({ kind: 'game', dir: '.' });
  checkDisplay(display === undefined ? {} : { display }, files, new Set(), report);
  return report.finish();
};

describe('checkDisplay', () => {
  it.each(Object.entries(GAMES))('%s: no declaration error, and normalizeDisplay keeps it as is', (_slug, decl) => {
    const display = filled(decl);
    const r = run(display);
    expect(r.counts.error).toBe(0);
    expect(normalizeDisplay(display)).toEqual(display);
  });

  it('is silent for the defaults, a missing manifest and an older kit without display', () => {
    expect(run(filled({})).issues).toEqual([]);
    expect(run(undefined).issues).toEqual([]);
    const report = createReport({});
    checkDisplay(null, [], new Set(), report);
    expect(report.finish().issues).toEqual([]);
  });

  it('names each bad field with its code, severity and the config path', () => {
    let r = run(filled({ orientation: 'wide' }));
    expect(issue(r, 'DISPLAY_ORIENTATION_INVALID')).toMatchObject({ severity: 'error', path: 'src/beyondplay.config.ts' });
    expect(issue(r, 'DISPLAY_ORIENTATION_INVALID').message).toMatch(/'wide'/);

    r = run(filled({ orientation: 'landscape' }));
    expect(issue(r, 'DISPLAY_ORIENTATION_LANDSCAPE')).toMatchObject({ severity: 'warning' });
    expect(r.ok).toBe(true);

    r = run(filled({ input: ['touch', 'mouse', 'joystick'] }));
    expect(issue(r, 'DISPLAY_INPUT_UNKNOWN').message).toMatch(/'joystick'/);
    expect(codes(r)).not.toContain('DISPLAY_INPUT_NO_POINTER');

    r = run({ orientation: 'portrait', input: [], keys: {} });
    expect(codes(r)).toEqual(['DISPLAY_INPUT_UNKNOWN']);

    r = run({ orientation: 'portrait', input: 'keyboard', keys: {} });
    expect(codes(r)).toEqual(['DISPLAY_INPUT_UNKNOWN']);

    r = run(filled({ input: ['mouse', 'keyboard'], keys: { jump: 'space' } }));
    expect(issue(r, 'DISPLAY_INPUT_NO_POINTER')).toMatchObject({ severity: 'error' });
    expect(issue(r, 'DISPLAY_INPUT_NO_POINTER').message).toMatch(/'touch'/);
  });

  it('checks keys: shape, verbs, specs, the verb limit, a key in two verbs, and keyboard', () => {
    const keysIssues = (decl) => run(filled(decl)).issues.filter((i) => i.code === 'DISPLAY_KEYS_INVALID').map((i) => i.message);
    expect(keysIssues({ input: KB, keys: { jump: 'esc' } })[0]).toMatch(/reserved/);
    expect(keysIssues({ input: KB, keys: { Jump: 'space' } })[0]).toMatch(/verb 'Jump'/);
    expect(keysIssues({ input: KB, keys: { jump: 'space', fire: 'space|f' } })[0]).toMatch(/Space is in both 'jump' and 'fire'/);
    expect(keysIssues({ input: KB, keys: { move: 'arrows', jump: 'up' } })[0]).toMatch(/ArrowUp is in both 'move' and 'jump'/);
    const nine = Object.fromEntries('abcdefghi'.split('').map((c, i) => [`verb ${c}`, String(i)]));
    expect(keysIssues({ input: KB, keys: nine })[0]).toMatch(/9 verbs; at most 8/);
    expect(keysIssues({ input: KB, keys: { move: 'arrows|wasd', jump: 'space' } })).toEqual([]);
    expect(codes(run({ orientation: 'portrait', input: KB, keys: ['space'] }))).toContain('DISPLAY_KEYS_INVALID');

    let r = run(filled({ keys: { jump: 'space' } }));
    expect(issue(r, 'DISPLAY_KEYS_WITHOUT_KEYBOARD')).toMatchObject({ severity: 'error' });

    r = run(filled({ input: KB }));
    expect(issue(r, 'DISPLAY_KEYBOARD_NO_KEYS')).toMatchObject({ severity: 'warning' });
    expect(issue(r, 'DISPLAY_KEYBOARD_NO_HANDLER')).toMatchObject({ severity: 'warning' });
    expect(r.ok).toBe(true);
  });

  it('reports a display that is not an object on every field', () => {
    const r = run(null);
    expect(codes(r)).toEqual(['DISPLAY_INPUT_UNKNOWN', 'DISPLAY_KEYS_INVALID', 'DISPLAY_ORIENTATION_INVALID']);
    expect(issue(r, 'DISPLAY_ORIENTATION_INVALID').message).toMatch(/not an object/);
  });

  it('recognises key handlers on code lines only', () => {
    for (const line of ["window.addEventListener('keydown', onKey);", 'document.addEventListener("keyup", up)', 'window.onkeydown = (e) => {};', '<div onKeyDown={handle}>', 'const off = bindKeys(display.keys, { jump });']) {
      expect(KEY_HANDLER.test(line), line).toBe(true);
    }
    for (const line of ["window.addEventListener('pointerdown', go);", 'const keydown = 1;', "addEventListener('keypress', f)"]) {
      expect(KEY_HANDLER.test(line), line).toBe(false);
    }
  });
});

/** Bundle a template helper with esbuild and evaluate it (react is stubbed; only the pure parts are called). */
async function loadTemplateModule(rel) {
  const result = await build({ entryPoints: [join(TEMPLATE, rel)], bundle: true, write: false, format: 'cjs', platform: 'neutral', external: ['react'], logLevel: 'silent' });
  const module = { exports: {} };
  const react = { useState: () => [undefined, () => {}], useEffect: () => {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, (id) => (id === 'react' ? react : undefined));
  return module.exports;
}

describe('template src/keys.ts', () => {
  let keys;
  beforeAll(async () => { keys = await loadTemplateModule('src/keys.ts'); });

  it.each([...VALID.map(([s]) => [s]), ...INVALID.map((s) => [s])])('keysOf(%j) matches parseKeySpec', (spec) => {
    expect(keys.keysOf(spec)).toEqual(parseKeySpec(spec)?.keys ?? null);
  });

  it('keysOf rejects what is not a string, as parseKeySpec does', () => {
    for (const v of [undefined, null, 42]) expect(keys.keysOf(v)).toBeNull();
  });

  /** A window stand-in that records listeners, and key events with only the fields bindKeys reads. */
  const fakeTarget = () => {
    const listeners = {};
    return {
      listeners,
      addEventListener: (type, fn) => { (listeners[type] ??= new Set()).add(fn); },
      removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
      fire: (type, ev = {}) => { for (const fn of listeners[type] ?? []) fn(ev); return ev; },
    };
  };
  const key = (k, extra = {}) => ({ key: k, repeat: false, ctrlKey: false, metaKey: false, altKey: false, prevented: false, preventDefault() { this.prevented = true; }, ...extra });

  it('bindKeys calls the verb on down and up, once per press, and prevents the default on every keydown', () => {
    const t = fakeTarget();
    const calls = [];
    const on = { move: (down, e) => calls.push(['move', down, e?.key]), jump: (down) => calls.push(['jump', down]) };
    const unbind = keys.bindKeys({ move: 'left/right|a/d', jump: 'up|w|space', fire: 'f' }, on, t);

    const down = t.fire('keydown', key('ArrowLeft'));
    expect(down.prevented).toBe(true);
    const repeat = t.fire('keydown', key('ArrowLeft', { repeat: true }));
    const again = t.fire('keydown', key('ArrowLeft'));
    expect([repeat.prevented, again.prevented]).toEqual([true, true]);
    t.fire('keyup', key('ArrowLeft'));
    t.fire('keydown', key('D'));
    t.fire('keyup', key('d'));
    t.fire('keydown', key(' '));
    t.fire('keyup', key(' '));
    expect(calls).toEqual([['move', true, 'ArrowLeft'], ['move', false, 'ArrowLeft'], ['move', true, 'D'], ['move', false, 'd'], ['jump', true], ['jump', false]]);

    calls.length = 0;
    const chord = t.fire('keydown', key('a', { ctrlKey: true }));
    const unbound = t.fire('keydown', key('f'));
    const other = t.fire('keydown', key('Escape'));
    expect(calls).toEqual([]);
    expect([chord.prevented, unbound.prevented, other.prevented]).toEqual([false, false, false]);

    t.fire('keydown', key('ArrowRight'));
    t.fire('keydown', key('w'));
    t.fire('blur');
    expect(calls).toEqual([['move', true, 'ArrowRight'], ['jump', true], ['move', false, undefined], ['jump', false]]);
    t.fire('keyup', key('ArrowRight'));
    expect(calls).toHaveLength(4);

    unbind();
    expect([...t.listeners.keydown, ...t.listeners.keyup, ...t.listeners.blur]).toEqual([]);
  });

  it('bindKeys releases a press by its physical key, even when Shift changed the key while it was held', () => {
    const t = fakeTarget();
    const calls = [];
    keys.bindKeys({ 'pick card': '1-3' }, { 'pick card': (down, e) => calls.push([down, e?.key]) }, t);
    t.fire('keydown', key('1', { code: 'Digit1' }));
    t.fire('keyup', key('!', { code: 'Digit1' }));
    t.fire('keydown', key('1', { code: 'Digit1' }));
    t.fire('keyup', key('1', { code: 'Digit1' }));
    expect(calls).toEqual([[true, '1'], [false, '!'], [true, '1'], [false, '1']]);
  });

  it('bindKeys leaves keys typed into a text field alone, but not a focused button', () => {
    const t = fakeTarget();
    const calls = [];
    keys.bindKeys({ jump: 'space', fire: 'f' }, { jump: (down) => calls.push(['jump', down]), fire: (down) => calls.push(['fire', down]) }, t);
    const typed = [{ tagName: 'INPUT' }, { tagName: 'textarea' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]
      .map((target) => t.fire('keydown', key('f', { target })));
    expect(typed.map((e) => e.prevented)).toEqual([false, false, false, false]);
    expect(calls).toEqual([]);
    const onButton = t.fire('keydown', key(' ', { target: { tagName: 'BUTTON' } }));
    expect(onButton.prevented).toBe(true);
    expect(calls).toEqual([['jump', true]]);
  });

  it('bindKeys gives a key to the first verb that lists it and has a handler', () => {
    const t = fakeTarget();
    const calls = [];
    keys.bindKeys({ jump: 'space', fire: 'space|f' }, { fire: (down) => calls.push(['fire', down]) }, t);
    t.fire('keydown', key(' '));
    expect(calls).toEqual([['fire', true]]);
  });
});

describe('template src/viewport.ts', () => {
  let viewport;
  beforeAll(async () => { viewport = await loadTemplateModule('src/viewport.ts'); });

  it('fitDesign letterboxes the design space with the pixels the template used before', () => {
    const W = 390;
    const H = 844;
    for (const [w, h, dpr] of [[390, 844, 3], [400, 700, 1], [1280, 720, 2], [1512, 860, 1.5], [333, 777, 2]]) {
      const v = { w, h, dpr: Math.min(dpr, 2), orientation: w >= h ? 'landscape' : 'portrait' };
      const fit = viewport.fitDesign(v, { w: W, h: H });
      const scale = Math.min(w / W, h / H) * v.dpr;
      expect(fit).toEqual({ design: { w: W, h: H }, scale, offX: (Math.round(w * v.dpr) - W * scale) / 2, offY: (Math.round(h * v.dpr) - H * scale) / 2 });
    }
  });

  it('fitDesign picks the design space for the orientation when there is one per orientation', () => {
    const designs = { portrait: { w: 390, h: 844 }, landscape: { w: 1280, h: 720 } };
    expect(viewport.fitDesign({ w: 1280, h: 720, dpr: 1, orientation: 'landscape' }, designs)).toEqual({ design: designs.landscape, scale: 1, offX: 0, offY: 0 });
    expect(viewport.fitDesign({ w: 390, h: 844, dpr: 2, orientation: 'portrait' }, designs)).toEqual({ design: designs.portrait, scale: 2, offX: 0, offY: 0 });
  });
});
