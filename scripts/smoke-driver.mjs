// Shared by the generic smokes: find the game folder behind a dist path and
// load its driver, games/<slug>/smoke.driver.mjs. The driver exports
// { play, script?, minColors?, settleMs?, allowZero? }; play and script run
// inside the page as self-contained functions (or a source string to evaluate)
// with t = window.__bpTest, and return t.state().
//
// Without a driver the smokes fall back to an idle run: tick until the game
// ends on its own. Runners and dodgers finish that way; a game that waits for
// input does not, and the smoke says so.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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
