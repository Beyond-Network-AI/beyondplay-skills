// Shared by the generic smokes: find the game folder behind a dist path and
// load its driver, games/<slug>/smoke.driver.mjs. The driver exports
// { play, script?, minColors?, settleMs?, allowZero?, keys? }; play and script run
// inside the page as self-contained functions (or a source string to evaluate)
// with t = window.__bpTest, and return t.state().
//
// Without a driver the smokes fall back to an idle run: tick until the game
// ends on its own. Runners and dodgers finish that way; a game that waits for
// input does not, and the smoke says so.
//
// The display helpers read what the game declares with defineDisplay
// (dist/beyondplay.json > display): the viewports the render smoke plays at,
// and the keys smoke-keys.mjs presses. A driver may also export a `keys`
// section for smoke-keys.mjs (see loadDriverKeys).
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NAMED_KEYS, normalizeDisplay, parseKeySpec } from '../tools/beyondplay-check/src/game-display.js';
import { resolveGame as resolveKitGame } from './kit.mjs';

export const resolveGame = (arg) => resolveKitGame(arg, { usage: 'usage: node scripts/<smoke>.mjs games/<slug>' });

const IDLE = {
  play(t) {
    for (let i = 0; i < 600 && t.state().phase !== 'gameover'; i++) t.tick(60);
    return t.state();
  },
};

export async function loadDriver(gameDir) {
  const file = resolve(gameDir, 'smoke.driver.mjs');
  if (!existsSync(file)) {
    console.log(`no smoke.driver.mjs in ${gameDir}: playing an idle run (add a driver so the checks can play your game)`);
    return { ...IDLE, generic: true };
  }
  const mod = await import(pathToFileURL(file).href);
  const d = mod.default ?? mod;
  if (typeof d.play !== 'function' && typeof d.play !== 'string') throw new Error(`${file} must export default { play }`);
  return d;
}

/**
 * The driver's optional `keys` section for smoke-keys.mjs, or null. It needs no `play`:
 *   keys: { setup?(t), settle?, ticks?, verbs?: { [verb]: { press?, ticks?, setup?(t), skip? } } }
 * setup runs in the page like play; press is a Playwright key name; skip needs a reason.
 */
export async function loadDriverKeys(gameDir) {
  const file = resolve(gameDir, 'smoke.driver.mjs');
  if (!existsSync(file)) return null;
  const mod = await import(pathToFileURL(file).href);
  return mod.default?.keys ?? null;
}

/** The game's display (dist/beyondplay.json), normalized; the defaults when the file or the key is missing. */
export function readDisplay(dist) {
  try {
    return normalizeDisplay(JSON.parse(readFileSync(join(dist, 'beyondplay.json'), 'utf8')).display);
  } catch {
    return normalizeDisplay(undefined);
  }
}

/** The smoke viewports, CSS pixels: a phone held upright and a laptop screen. */
export const VIEWPORTS = Object.freeze({
  portrait: Object.freeze({ name: 'portrait', width: 390, height: 844 }),
  landscape: Object.freeze({ name: 'landscape', width: 1280, height: 720 }),
});

/** The viewports a declared orientation is checked at: portrait, landscape, or both for 'any' (portrait first). */
export function viewportsFor(display) {
  const o = display?.orientation;
  const names = o === 'any' ? ['portrait', 'landscape'] : o === 'landscape' ? ['landscape'] : ['portrait'];
  return names.map((n) => ({ ...VIEWPORTS[n] }));
}

/** The viewport a single page plays at: landscape unless the game is portrait only. */
export function stageViewport(display) {
  return { ...(display?.orientation === 'portrait' ? VIEWPORTS.portrait : VIEWPORTS.landscape) };
}

const PLAYWRIGHT_NAMES = { ' ': 'Space' };
const GROUP_KEY = { arrows: 'ArrowRight', wasd: 'd' };

/**
 * The Playwright key that stands for a key spec: its first alternative's first key ('left/right|a/d' ->
 * 'ArrowLeft', 'space' -> 'Space', 'arrows' -> 'ArrowRight', 'wasd' -> 'd', '1-3' -> '1'). Null when the spec
 * breaks the grammar.
 */
export function playwrightKey(spec) {
  const parsed = parseKeySpec(spec);
  if (!parsed) return null;
  const [alt] = parsed.alts;
  if (alt.kind === 'group') return GROUP_KEY[alt.tokens[0]];
  if (alt.kind === 'range') return alt.tokens[0];
  const token = alt.tokens[0];
  const key = Object.prototype.hasOwnProperty.call(NAMED_KEYS, token) ? NAMED_KEYS[token] : token;
  return PLAYWRIGHT_NAMES[key] ?? key;
}

/**
 * Expected-benign failures outside the platform: the SDK's dev-proof probe, a favicon probe, Google Fonts on a
 * machine without network, and the resulting soft-fail of the score submit. Given the page's error messages and
 * its failed requests ("<status or error> <url>"), returns what is left to fail on.
 */
export const benignUrl = (u) => u.includes('__accelerate_proof') || u.includes('favicon') || u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com');
export function unexpectedFailures(pageErrors, notFounds) {
  const badResponses = notFounds.filter((line) => !benignUrl(line));
  const benignCount = notFounds.length - badResponses.length;
  const realErrors = pageErrors.filter(
    (e) => !e.includes('score submit failed') && !e.includes('fonts.g') &&
      !(e.startsWith('Failed to load resource') && benignCount > 0),
  );
  return { badResponses, realErrors };
}

/** Playwright's Chromium (`npm run browser` installs it), or the browser CHROME_PATH names. */
export const launch = () => chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

/** Run a driver function (or source string) inside the frame, as fn(window.__bpTest, ctx). */
export function run(frame, fn, ctx) {
  if (typeof fn === 'string') return frame.evaluate(fn);
  return frame.evaluate(([src, c]) => {
    let f;
    try { f = (0, eval)(`(${src})`); }                       // function expression or arrow
    catch { f = Object.values((0, eval)(`({${src}})`))[0]; } // method shorthand: play(t) { ... }
    return f(window.__bpTest, c);
  }, [fn.toString(), ctx ?? null]);
}
