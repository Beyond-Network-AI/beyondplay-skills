// src/beyondplay.config.ts: the one file a game edits. We bundle it with the
// kit (exactly as scripts/emit-manifest.mjs and scripts/conformance.mjs
// do), evaluate it against a stub window.BeyondPlay, and check the declaration
// and the manifest it produces.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';
import { DOCS } from './limits.js';

export const CONFIG_REL = 'src/beyondplay.config.ts';
const KIT_REL = 'src/beyondplay-kit.ts';
const INSTANCE_KINDS = ['static', 'daily', 'random', 'rotating'];

const ENTRY = "export * from './src/beyondplay.config.ts';\nexport { buildManifest as __bpBuildManifest } from './src/beyondplay-kit.ts';\n";

const firstLine = (err) => String(err && err.message ? err.message : err).split('\n')[0].slice(0, 300);

/** Returns the manifest the config declares (as emit-manifest would write it), or null when it could not be built. */
export async function checkConfig(gameDir, report) {
  if (!existsSync(join(gameDir, CONFIG_REL))) {
    report.error('GAME_CONFIG_MISSING', CONFIG_REL, `${CONFIG_REL} is missing; it is the only config file a game has and the build emits beyondplay.json from it.`, 'Create it from the template: export `challenge = defineChallenge({ metricLabel, lowerIsBetter, seed, minValue, maxValue })` and `game = defineSoloGame({ challenge })`.', { docs: DOCS.contract });
    return null;
  }
  if (!existsSync(join(gameDir, KIT_REL))) return null; // the template check already reported it

  let code;
  try {
    const { build } = await import('esbuild');
    const result = await build({ stdin: { contents: ENTRY, resolveDir: gameDir, loader: 'ts', sourcefile: 'bp-check-entry.ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent' });
    code = result.outputFiles[0].text;
  } catch (err) {
    report.error('GAME_CONFIG_BUILD_FAILED', CONFIG_REL, `${CONFIG_REL} does not build: ${firstLine(err)}`, 'Fix the error; the build would otherwise emit a single-player FALLBACK manifest and the game would not be challenge-ready.', { docs: DOCS.contract });
    return null;
  }

  const boards = [];
  const fakeWindow = {
    BeyondPlay: { gameOver: (o) => boards.push(o && o.board), progress() {}, ready() {}, on() {}, haptic() {}, match: null },
    BeyondPlayMatch: null,
    location: { search: '' },
    addEventListener() {},
    removeEventListener() {},
  };
  const quiet = { log() {}, warn() {}, error() {}, debug() {}, info() {} };
  const sandbox = { module: { exports: {} }, exports: {}, window: fakeWindow, console: quiet, require: createRequire(gameDir + '/'), process: { env: {} } };
  sandbox.exports = sandbox.module.exports;
  sandbox.globalThis = sandbox;
  try {
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'bp-check-bundle.cjs', timeout: 5000 });
  } catch (err) {
    report.error('GAME_CONFIG_BUILD_FAILED', CONFIG_REL, `${CONFIG_REL} throws when evaluated: ${firstLine(err)}`, 'The config must only call the kit\'s define* functions at import time; move game code and DOM access out of it.', { docs: DOCS.contract });
    return null;
  }

  const exported = sandbox.module.exports || {};
  let manifest;
  try {
    manifest = exported.__bpBuildManifest();
  } catch (err) {
    report.error('GAME_CONFIG_BUILD_FAILED', CONFIG_REL, `buildManifest() threw: ${firstLine(err)}`, 'Restore src/beyondplay-kit.ts from the template.', { docs: DOCS.contract });
    return null;
  }
  const isChallenge = (v) => v && typeof v.submit === 'function' && v.__decl;
  const handle = Object.values(exported).find(isChallenge);
  if (!handle) {
    const solo = Object.values(exported).find((v) => v && typeof v.endRun === 'function' && !isChallenge(v));
    if (manifest && manifest.playerMode === 'single' && solo) {
      // Solo, score-only games are allowed (founder decision 2026-10-24); one run report on the default board.
      solo.endRun(1234);
      if (boards.length !== 1) {
        report.error('GAME_CONFIG_BOARD_MISMATCH', CONFIG_REL, `game.endRun(1234) posted to ${boards.length} boards (${JSON.stringify(boards)}); a solo game reports one run on the default board.`, 'Do not wrap endRun(); restore src/beyondplay-kit.ts from the template.', { docs: DOCS.smoke });
      } else {
        report.info('GAME_CONFIG_SOLO', CONFIG_REL, 'Solo declaration (defineSoloGame without a challenge): the game publishes score-only, with no duel.', 'Allowed. To make it duel-able later, export `challenge = defineChallenge({ metricLabel, ... })` and pass it to defineSoloGame.', { docs: DOCS.contract });
      }
    } else if (manifest && manifest.playerMode === 'single') {
      report.error('GAME_CONFIG_INVALID', CONFIG_REL, 'Neither a challenge handle nor a solo game handle is exported.', 'Export `game = defineSoloGame({})` for a score-only game, or `challenge = defineChallenge({...})` for a duel-able one.', { docs: DOCS.contract });
    } else {
      report.error('GAME_CONFIG_INVALID', CONFIG_REL, 'defineChallenge() was called but its handle is not exported.', 'Export it: `export const challenge = defineChallenge({...})` so the game (and the conformance check) can reach submit().', { docs: DOCS.contract });
    }
    return manifest;
  }

  const d = handle.__decl;
  const bad = (what, fix) => report.error('GAME_CONFIG_INVALID', CONFIG_REL, `defineChallenge: ${what}.`, fix, { docs: DOCS.contract });
  if (typeof d.metricLabel !== 'string' || !d.metricLabel.trim()) bad('metricLabel must be a non-empty string ("Score", "Time", "Strokes")', 'Set metricLabel to what the number means on the card.');
  if (d.lowerIsBetter !== undefined && typeof d.lowerIsBetter !== 'boolean') bad('lowerIsBetter must be a boolean', 'true when the lowest value wins (time, strokes), false or omitted otherwise.');
  if (d.seed !== undefined && typeof d.seed !== 'boolean') bad('seed must be a boolean', 'true when content varies per play so both duelists get the same seed.');
  if (d.instanceKind !== undefined && !INSTANCE_KINDS.includes(d.instanceKind)) bad(`instanceKind must be one of ${INSTANCE_KINDS.join(', ')}`, 'Omit it (defaults to random when seed is true, else static) or pick a listed kind.');
  for (const k of ['minValue', 'maxValue']) {
    if (d[k] !== undefined && !Number.isFinite(d[k])) bad(`${k} must be a finite number`, 'Set sane score bounds or omit them.');
  }
  if (Number.isFinite(d.minValue) && Number.isFinite(d.maxValue) && d.minValue > d.maxValue) bad('minValue is greater than maxValue', 'Swap or fix the bounds.');

  const unit = Array.isArray(manifest && manifest.challenge) ? manifest.challenge[0] : null;
  if (!unit || manifest.playerMode !== 'duel') {
    bad(`the manifest is not a duel declaration (${JSON.stringify(manifest)})`, 'Restore src/beyondplay-kit.ts from the template; the kit maps defineChallenge() to one challenge unit.');
    return manifest;
  }
  if (unit.instanceKind === 'random' && !unit.needsSeed) bad('procedural content (instanceKind random) requires seed: true so both duelists share the course', 'Set seed: true and derive the run from getMatch()?.seed.');
  handle.submit(1234);
  if (boards.length !== 1 || boards[0] !== unit.boardId) {
    report.error('GAME_CONFIG_BOARD_MISMATCH', CONFIG_REL, `submit() scored boards ${JSON.stringify(boards)} but the manifest declares '${unit.boardId}'.`, 'Do not wrap or re-implement submit(); restore src/beyondplay-kit.ts from the template.', { docs: DOCS.smoke });
  }
  return manifest;
}
