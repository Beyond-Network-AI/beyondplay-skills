// Keyboard binding for the verbs the game declares with defineDisplay in src/beyondplay.config.ts.
// Game-owned helper: edit it or delete it. It binds keys and nothing else. The host prints the key
// hints from the manifest, never the game (no instruction text in a game). Esc and Tab are the
// host's (Esc leaves fullscreen, Tab moves focus), so no spec can name them. Keys never replace touch:
// pointer events stay the game's input on every device. Keys typed into a text field (an input, a
// textarea, a select, an editable element) are the field's, so bindKeys leaves them alone. A focused
// button is not a field: a button clicked with the mouse keeps the focus, and the next Space must
// still jump rather than click it again.
//
//   import { display } from './beyondplay.config';
//   const unbind = bindKeys(display.keys, { jump: (down) => { if (down) g.jump(); } });
//
// Key spec grammar (the validator's DISPLAY_KEYS_INVALID reads the same):
//   spec := alt ('|' alt)*   1 to 4 alternatives, "or"; at most 32 characters, lower case, no spaces
//   alt  := 'arrows' | 'wasd' | digit '-' digit (ascending: 1-3) | key ('/' key)* (1 to 4 keys: left/right)
//   key  := space | enter | shift | up | down | left | right | a-z | 0-9

/** Spec names of single keys, as KeyboardEvent.key values. */
const NAMED: Readonly<Record<string, string>> = {
  space: ' ',
  enter: 'Enter',
  shift: 'Shift',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};
/** The two key groups, as KeyboardEvent.key values. */
const GROUPS: Readonly<Record<string, readonly string[]>> = {
  arrows: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
  wasd: ['w', 'a', 's', 'd'],
};
const MAX_SPEC_CHARS = 32;
const MAX_ALTS = 4;
const MAX_KEYS_PER_ALT = 4;

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function keyOf(token: string): string | null {
  if (own(NAMED, token)) return NAMED[token];
  return /^[a-z0-9]$/.test(token) ? token : null;
}

/** The KeyboardEvent.key values a spec binds (letters lower case), deduped, in order; null when the spec breaks the grammar. */
export function keysOf(spec: string): string[] | null {
  if (typeof spec !== 'string' || spec.length === 0 || spec.length > MAX_SPEC_CHARS) return null;
  const alts = spec.split('|');
  if (alts.length > MAX_ALTS) return null;
  const out: string[] = [];
  const add = (k: string) => {
    if (!out.includes(k)) out.push(k);
  };
  for (const alt of alts) {
    if (own(GROUPS, alt)) {
      GROUPS[alt].forEach(add);
      continue;
    }
    const range = /^([0-9])-([0-9])$/.exec(alt);
    if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      if (lo >= hi) return null;
      for (let d = lo; d <= hi; d++) add(String(d));
      continue;
    }
    const tokens = alt.split('/');
    if (tokens.length > MAX_KEYS_PER_ALT) return null;
    for (const token of tokens) {
      const k = keyOf(token);
      if (k === null) return null;
      add(k);
    }
  }
  return out;
}

/** A verb's handler: down is true when one of its keys goes down and false when it comes up. When the
 *  window loses focus every held key is released with (false) and no event: stop whatever the verb holds. */
export type KeyHandler = (down: boolean, e?: KeyboardEvent) => void;

/** Whether keys typed now belong to a text field: an input, a textarea, a select or an editable element. */
function isTextField(target: EventTarget | null): boolean {
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!el || typeof el !== 'object') return false;
  if (el.isContentEditable === true) return true;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Bind the declared keys (display.keys) to verb handlers. A key goes to the first verb that lists it and
 *  has a handler. Every keydown of a bound key has its default action prevented, auto-repeats included, so
 *  holding an arrow or Space never scrolls the page around the game; the handler hears the first keydown
 *  of a press and its keyup, never the auto-repeats. A press is tracked by its physical key (e.code), so
 *  it is released even when the key's value changes while it is held (Shift turns '1' into '!'). Ctrl,
 *  Meta and Alt chords, and keys typed into a text field, are left alone. Returns the function that
 *  unbinds everything. */
export function bindKeys(keys: Record<string, string>, on: Record<string, KeyHandler>, target: Window = window): () => void {
  const verbOf = new Map<string, string>();
  for (const [verb, spec] of Object.entries(keys ?? {})) {
    if (typeof on[verb] !== 'function') continue;
    for (const k of keysOf(spec) ?? []) if (!verbOf.has(k)) verbOf.set(k, verb);
  }
  const held = new Map<string, string>(); // physical key -> verb, while the key is down
  const keyOfEvent = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  const pressOf = (e: KeyboardEvent) => e.code || keyOfEvent(e); // e.code is empty on some synthetic events

  const onDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target)) return;
    const verb = verbOf.get(keyOfEvent(e));
    if (verb === undefined) return;
    e.preventDefault();
    const press = pressOf(e);
    if (e.repeat || held.has(press)) return;
    held.set(press, verb);
    on[verb]?.(true, e);
  };
  const onUp = (e: KeyboardEvent) => {
    const press = pressOf(e);
    const verb = held.get(press);
    if (verb === undefined) return;
    held.delete(press);
    on[verb]?.(false, e);
  };
  const onBlur = () => {
    const verbs = [...held.values()];
    held.clear();
    for (const verb of verbs) on[verb]?.(false);
  };

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onDown);
    target.removeEventListener('keyup', onUp);
    target.removeEventListener('blur', onBlur);
  };
}
