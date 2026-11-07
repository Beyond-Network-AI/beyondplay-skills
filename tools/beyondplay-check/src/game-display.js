// The display declaration: `display` in dist/beyondplay.json, from defineDisplay() in
// src/beyondplay.config.ts. It says how a game wants to be shown and played on a big screen:
// orientation (portrait, landscape, any), input (touch, mouse, keyboard, gamepad) and keys
// (verb -> key spec). This file holds the key-spec grammar, normalizeDisplay() (what hosts,
// the smokes and the publisher trust) and the DISPLAY_* checks.
//
// Three implementations read the same rules and must agree: this one, the template's
// src/keys.ts (keysOf; the parity test bundles it) and the arcade's lib/games/display.ts
// (normalizeDisplay, keyHint). The publisher refuses a manifest that normalizeDisplay changes,
// so the normalizers must give the same result.
import { readFileSync } from 'node:fs';
import { textFiles } from './game-scan.js';
import { DOCS } from './limits.js';

export const ORIENTATIONS = ['portrait', 'landscape', 'any'];
export const INPUT_KINDS = ['touch', 'mouse', 'keyboard', 'gamepad'];
/** What a game is when it declares nothing. Frozen: copy it before changing anything. */
export const DEFAULT_DISPLAY = Object.freeze({ orientation: 'portrait', input: Object.freeze(['touch', 'mouse']), keys: Object.freeze({}) });

/** The two key groups, as KeyboardEvent.key values (letters lower case). */
export const KEY_GROUPS = { arrows: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], wasd: ['w', 'a', 's', 'd'] };
/** The named keys, as KeyboardEvent.key values. Esc and Tab are the host's; Shift is the only modifier. */
export const NAMED_KEYS = { space: ' ', enter: 'Enter', shift: 'Shift', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
/** A verb: lower-case words with single spaces ('jump', 'pick card'), at most MAX_VERB_CHARS long. */
export const VERB_RE = /^[a-z]+(?: [a-z]+)*$/;
export const MAX_VERB_CHARS = 24;
export const MAX_VERBS = 8;
export const MAX_SPEC_CHARS = 32;
const MAX_ALTS = 4;
const MAX_KEYS_PER_ALT = 4;

const RANGE = /^([0-9])-([0-9])$/;
const SINGLE_KEY = /^[a-z0-9]$/;
const RESERVED = { esc: 'Esc', escape: 'Esc', tab: 'Tab' };
const MODIFIERS = new Set(['ctrl', 'control', 'alt', 'altgr', 'option', 'meta', 'cmd', 'command', 'super', 'win', 'os', 'fn', 'capslock']);
const GRAMMAR = "A spec is 1 to 4 alternatives joined by '|' (or), at most 32 characters, lower case, no spaces. An alternative is arrows, wasd, a digit range (1-3) or 1 to 4 keys joined by '/' (left/right); a key is space, enter, shift, up, down, left, right, a-z or 0-9. Esc and Tab are the host's.";

const CONFIG_REL = 'src/beyondplay.config.ts';
const KEYS_HELPER = 'src/keys.ts';
const COMMENT_LINE = /^\s*(?:\/\/|\/?\*|<!--|#)/;
/** A keyboard listener the source binds itself, or the template helper's bindKeys(). */
export const KEY_HANDLER = /addEventListener\(\s*['"]key(?:down|up)['"]|\bon[kK]ey(?:[dD]own|[uU]p)\s*=|\bbindKeys\s*\(/;

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isVerb = (v) => typeof v === 'string' && v.length <= MAX_VERB_CHARS && VERB_RE.test(v);
const show = (v) => (v === undefined ? 'missing' : typeof v === 'string' ? `'${v}'` : JSON.stringify(v));
const keyName = (k) => (k === ' ' ? 'Space' : k);

function keyOf(token) {
  if (own(NAMED_KEYS, token)) return NAMED_KEYS[token];
  return SINGLE_KEY.test(token) ? token : null;
}

/** The grammar (C3), with the reason a spec breaks it: { value: { alts, keys } } or { error }. */
function parse(spec) {
  if (typeof spec !== 'string') return { error: `is not a string (${spec === null ? 'null' : typeof spec})` };
  if (spec.length === 0) return { error: 'is empty' };
  if (spec.length > MAX_SPEC_CHARS) return { error: `is ${spec.length} characters; the limit is ${MAX_SPEC_CHARS}` };
  if (/\s/.test(spec)) return { error: 'has a space in it (write space for the space bar)' };
  if (spec !== spec.toLowerCase()) return { error: 'is not lower case (space, enter, shift, a-z)' };
  const parts = spec.split('|');
  if (parts.length > MAX_ALTS) return { error: `has ${parts.length} alternatives; at most ${MAX_ALTS}` };
  const alts = [];
  const keys = [];
  const add = (k) => { if (!keys.includes(k)) keys.push(k); };
  for (const part of parts) {
    if (!part) return { error: "has an empty alternative (a stray '|')" };
    if (own(KEY_GROUPS, part)) {
      alts.push({ kind: 'group', tokens: [part] });
      KEY_GROUPS[part].forEach(add);
      continue;
    }
    const range = RANGE.exec(part);
    if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      if (lo >= hi) return { error: `has the range ${part}, which does not ascend (low digit first: 1-3)` };
      alts.push({ kind: 'range', tokens: [range[1], range[2]] });
      for (let d = lo; d <= hi; d += 1) add(String(d));
      continue;
    }
    if (part.includes('-')) return { error: `has '${part}', which is not a range (two digits, low first: 1-3)` };
    const tokens = part.split('/');
    if (tokens.length > MAX_KEYS_PER_ALT) return { error: `joins ${tokens.length} keys in '${part}'; at most ${MAX_KEYS_PER_ALT}` };
    const altKeys = [];
    for (const token of tokens) {
      if (!token) return { error: `has an empty key in '${part}' (a stray '/')` };
      if (own(RESERVED, token)) return { error: `names '${token}', which is reserved: ${RESERVED[token]} is the host's (Esc leaves fullscreen, Tab moves focus)` };
      if (MODIFIERS.has(token)) return { error: `names the modifier '${token}'; shift is the only modifier a game binds` };
      if (own(KEY_GROUPS, token)) return { error: `puts the group '${token}' inside '/'; a group is an alternative of its own ('${token}|space')` };
      const k = keyOf(token);
      if (k === null) return { error: `names '${token}', which is not a key (space, enter, shift, up, down, left, right, a-z, 0-9)` };
      altKeys.push(k);
    }
    alts.push({ kind: 'keys', tokens });
    altKeys.forEach(add);
  }
  return { value: { alts, keys } };
}

/**
 * A key spec per the grammar: { alts: [{ kind: 'group'|'range'|'keys', tokens }], keys }, or null.
 * tokens are as written (['arrows'], ['1', '3'], ['left', 'right']); keys are the KeyboardEvent.key
 * values it binds, letters lower case, deduped, in order.
 */
export function parseKeySpec(spec) {
  return parse(spec).value ?? null;
}

/** Why a key spec breaks the grammar (a phrase after the spec: "is empty"), or null when it is valid. */
export function keySpecError(spec) {
  return parse(spec).error ?? null;
}

function normalizeInput(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_DISPLAY.input];
  const kept = [];
  for (const kind of raw) if (INPUT_KINDS.includes(kind) && !kept.includes(kind)) kept.push(kind);
  const missing = ['touch', 'mouse'].filter((kind) => !kept.includes(kind));
  return [...missing, ...kept];
}

function normalizeKeys(raw) {
  const keys = {};
  if (!isPlainObject(raw)) return keys;
  const taken = new Set();
  let kept = 0;
  for (const verb of Object.keys(raw)) {
    if (kept >= MAX_VERBS) break;
    const spec = raw[verb];
    if (typeof spec !== 'string' || !isVerb(verb)) continue;
    const parsed = parseKeySpec(spec);
    // A key belongs to one verb: a later verb that reuses a kept verb's key is dropped.
    if (!parsed || parsed.keys.some((k) => taken.has(k))) continue;
    for (const k of parsed.keys) taken.add(k);
    keys[verb] = spec;
    kept += 1;
  }
  return keys;
}

const freshDefault = () => ({ orientation: DEFAULT_DISPLAY.orientation, input: [...DEFAULT_DISPLAY.input], keys: {} });

/**
 * The display a host can trust: total (any input, never throws), a fresh object, idempotent.
 * orientation: kept when known, else 'portrait'. input: the known kinds, deduped, in order, with
 * 'touch' and 'mouse' put first when missing; not a list, or empty, gives the default. keys: only
 * with 'keyboard'; an entry is kept when its verb and spec are valid and none of its keys belongs to
 * an earlier kept entry; at most MAX_VERBS.
 */
export function normalizeDisplay(raw) {
  if (!isPlainObject(raw)) return freshDefault();
  try {
    const input = normalizeInput(raw.input);
    return {
      orientation: ORIENTATIONS.includes(raw.orientation) ? raw.orientation : 'portrait',
      input,
      keys: input.includes('keyboard') ? normalizeKeys(raw.keys) : {},
    };
  } catch {
    return freshDefault(); // a getter or proxy that throws reads as nothing declared
  }
}

/** The config line that calls defineDisplay, for the declaration issues. */
function declarationLine(files) {
  const config = files.find((f) => f.rel === CONFIG_REL);
  if (!config) return undefined;
  try {
    const lines = readFileSync(config.abs, 'utf8').split('\n');
    const i = lines.findIndex((l) => !COMMENT_LINE.test(l) && /\bdefineDisplay\s*\(/.test(l));
    return i < 0 ? undefined : i + 1;
  } catch {
    return undefined;
  }
}

/** The first keyboard listener in each source file (src/keys.ts, the helper itself, excluded). */
function keyHandlers(files, templateOwned) {
  const hits = [];
  for (const f of textFiles(files, templateOwned)) {
    if (f.rel === KEYS_HELPER) continue;
    let text;
    try { text = readFileSync(f.abs, 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    const i = lines.findIndex((l) => !COMMENT_LINE.test(l) && KEY_HANDLER.test(l));
    if (i >= 0) hits.push({ rel: f.rel, line: i + 1 });
  }
  return hits;
}

/**
 * The DISPLAY_* checks, on the manifest the config produced. Skipped when there is no manifest (the
 * config did not build, or the hosted check evaluates it itself) or it has no `display` (an older kit,
 * which the template check already reports as modified).
 */
export function checkDisplay(manifest, files, templateOwned, report) {
  if (!manifest || manifest.display === undefined) return;
  const raw = manifest.display;
  const d = isPlainObject(raw) ? raw : {};
  const line = declarationLine(files);
  const extra = () => (line ? { line, docs: DOCS.display } : { docs: DOCS.display });
  const error = (code, message, fix) => report.error(code, CONFIG_REL, message, fix, extra());
  const warning = (code, message, fix) => report.warning(code, CONFIG_REL, message, fix, extra());
  const prefix = isPlainObject(raw) ? 'display' : `display is ${show(raw)}, not an object, so display`;

  // Orientation.
  if (!ORIENTATIONS.includes(d.orientation)) {
    error('DISPLAY_ORIENTATION_INVALID', `${prefix}.orientation is ${show(d.orientation)}; it must be 'portrait', 'landscape' or 'any'.`, "Omit orientation for a portrait game (the default); declare 'any' when the view adapts to a wide screen too.");
  } else if (d.orientation === 'landscape') {
    warning('DISPLAY_ORIENTATION_LANDSCAPE', "orientation is 'landscape': the game cannot play in portrait, so the phone feed letterboxes it.", "Declare 'any' when the view can adapt (one simulation, a view space per orientation); keep 'landscape' only when portrait truly cannot play.");
  }

  // Input.
  const input = d.input;
  if (!Array.isArray(input) || input.length === 0) {
    error('DISPLAY_INPUT_UNKNOWN', `${prefix}.input is ${Array.isArray(input) ? 'empty' : show(input)}; it must list the input kinds, such as ['touch', 'mouse', 'keyboard'].`, "Omit input for touch and mouse (the default), or list ['touch', 'mouse', 'keyboard'] when keys drive the game.");
  } else {
    const unknown = input.filter((kind) => !INPUT_KINDS.includes(kind));
    if (unknown.length) {
      error('DISPLAY_INPUT_UNKNOWN', `display.input has ${unknown.map(show).join(', ')}; the kinds are 'touch', 'mouse', 'keyboard' and 'gamepad'.`, 'Remove the unknown entries.');
    }
    const missing = ['touch', 'mouse'].filter((kind) => !input.includes(kind));
    if (missing.length) {
      error('DISPLAY_INPUT_NO_POINTER', `display.input lacks ${missing.map(show).join(' and ')}; every game plays with pointer events, on a phone and with a mouse.`, "List 'touch' and 'mouse' first: input: ['touch', 'mouse', 'keyboard']. Keys are an addition, never a replacement for touch.");
    }
  }
  const keyboard = Array.isArray(input) && input.includes('keyboard');

  // Keys.
  const keys = d.keys;
  if (!isPlainObject(keys)) {
    error('DISPLAY_KEYS_INVALID', `${prefix}.keys is ${show(keys)}; it must be an object of verb -> key spec, such as { jump: 'space' }.`, 'Omit keys when the game has none; otherwise map each verb to its keys.');
    return checkHandlers(keyboard, files, templateOwned, report, extra);
  }
  const verbs = Object.keys(keys);
  if (verbs.length > MAX_VERBS) {
    error('DISPLAY_KEYS_INVALID', `display.keys has ${verbs.length} verbs; at most ${MAX_VERBS}.`, 'Keep the verbs a player needs; the host prints one hint line per verb.');
  }
  const owner = new Map(); // key -> the verb that binds it
  const clashes = new Set();
  for (const verb of verbs) {
    if (!isVerb(verb)) {
      error('DISPLAY_KEYS_INVALID', `display.keys has the verb ${show(verb)}; a verb is lower-case words with single spaces, at most ${MAX_VERB_CHARS} characters.`, "Name what the key does, as the hint reads it: 'jump', 'pick card' (shown as \"Space to jump\").");
    }
    const parsed = parse(keys[verb]);
    if (parsed.error) {
      error('DISPLAY_KEYS_INVALID', `The key spec ${show(keys[verb])} for '${verb}' ${parsed.error}.`, GRAMMAR);
      continue;
    }
    for (const k of parsed.value.keys) {
      const first = owner.get(k);
      if (first === undefined) { owner.set(k, verb); continue; }
      const pair = `${first}\n${verb}`;
      if (clashes.has(pair)) continue;
      clashes.add(pair);
      error('DISPLAY_KEYS_INVALID', `The key ${keyName(k)} is in both '${first}' and '${verb}'; a key belongs to one verb.`, `Give '${verb}' keys of its own, or fold it into '${first}'.`);
    }
  }
  if (verbs.length && !keyboard) {
    error('DISPLAY_KEYS_WITHOUT_KEYBOARD', `display.keys names ${verbs.length} verb${verbs.length === 1 ? '' : 's'} but input does not list 'keyboard', so the host shows no keys.`, "Add 'keyboard': input: ['touch', 'mouse', 'keyboard']; or drop keys when the game does not play with them.");
  }
  if (keyboard && !verbs.length) {
    warning('DISPLAY_KEYBOARD_NO_KEYS', "input lists 'keyboard' but keys is empty, so the host has no key hint to show.", "Declare each verb's keys: keys: { move: 'arrows|wasd', jump: 'space' }.");
  }
  return checkHandlers(keyboard, files, templateOwned, report, extra);
}

function checkHandlers(keyboard, files, templateOwned, report, extra) {
  const hits = keyHandlers(files, templateOwned);
  if (keyboard && !hits.length) {
    report.warning('DISPLAY_KEYBOARD_NO_HANDLER', CONFIG_REL, "input lists 'keyboard' but no key handler was found in the source (addEventListener('keydown' or 'keyup'), onkeydown, onKeyDown, bindKeys(); src/keys.ts alone binds nothing).", "Bind the declared keys, for example bindKeys(display.keys, { jump: (down) => ... }) from src/keys.ts; or drop 'keyboard' and keys.", extra());
  }
  if (!keyboard && hits.length) {
    const more = hits.length > 1 ? ` (and in ${hits.length - 1} more file${hits.length === 2 ? '' : 's'})` : '';
    report.info('DISPLAY_KEYBOARD_UNDECLARED', hits[0].rel, `A key handler is bound here${more}, but defineDisplay does not list 'keyboard', so the host shows no keys for this game.`, "If keys drive the game, declare them: defineDisplay({ input: ['touch', 'mouse', 'keyboard'], keys: { jump: 'space' } }). Fine as is when the handler is incidental (an audio unlock, a debug key).", { line: hits[0].line, docs: DOCS.display });
  }
}
