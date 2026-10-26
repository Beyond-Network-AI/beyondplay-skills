// Challenge conformance: bundle the game's actual beyondplay.config.ts with the
// kit, run it with a stub window.BeyondPlay that records which board each
// submission lands on, and compare with the declared manifest and with the
// built dist/beyondplay.json. The hosted check runs the same rules. Prints
// CONFORMANT on success.
//   npm run conformance -- games/<slug>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { resolveGame } from './kit.mjs';

const { gameDir } = resolveGame(process.argv[2], { usage: 'usage: npm run conformance -- games/<slug>' });
const fail = (msg) => { console.error('CONFORMANCE-FAIL:', msg); process.exit(1); };

const esbuild = await import('esbuild');
const entry =
  "export * from './src/beyondplay.config.ts';\n" +
  "export { buildManifest as __bpBuildManifest } from './src/beyondplay-kit.ts';\n";

const result = await esbuild.build({
  stdin: { contents: entry, resolveDir: gameDir, loader: 'ts', sourcefile: 'bp-conformance-entry.ts' },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  logLevel: 'silent',
});
const code = result.outputFiles[0].text;

const boards = [];
const fakeWindow = {
  BeyondPlay: { gameOver: (o) => { if (o && typeof o.board === 'string') boards.push(o.board); }, progress() {}, ready() {}, on() {}, match: null },
  BeyondPlayMatch: null,
  location: { search: '' },
  addEventListener() {},
  removeEventListener() {},
};
const require = createRequire(gameDir + '/');
const sandbox = { module: { exports: {} }, exports: {}, window: fakeWindow, console, require, process };
sandbox.globalThis = sandbox;
sandbox.module.exports = sandbox.exports;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'bp-conformance-bundle.cjs' });

const exports = sandbox.module.exports || {};
const isChallenge = (v) => v && typeof v.submit === 'function' && v.__decl;
let handle = null;
for (const v of Object.values(exports)) {
  if (isChallenge(v)) { handle = v; break; }
}
const isSolo = (v) => v && typeof v.endRun === 'function' && !isChallenge(v);
const solo = handle ? null : Object.values(exports).find(isSolo) ?? null;
if (!handle && !solo) fail('no challenge or solo handle exported from beyondplay.config.ts (export defineChallenge() or defineSoloGame())');

const manifest = exports.__bpBuildManifest();
const checkDist = () => {
  let distManifest;
  try {
    distManifest = JSON.parse(readFileSync(join(gameDir, 'dist', 'beyondplay.json'), 'utf-8'));
  } catch (e) {
    fail(`dist/beyondplay.json unreadable; build first (${e.message})`);
  }
  if (distManifest.emitError) fail(`dist manifest is a fallback: ${distManifest.emitError}`);
  if (JSON.stringify(distManifest) !== JSON.stringify(manifest)) fail('dist/beyondplay.json differs from the config declaration (rebuild)');
};

if (solo) {
  if (!manifest || manifest.playerMode !== 'single' || manifest.challenge !== null) fail(`solo game but manifest is not single/null: ${JSON.stringify(manifest)}`);
  solo.endRun(1234);
  if (boards.length !== 1) fail(`endRun(1234) posted to ${boards.length} boards (${JSON.stringify(boards)}); expected exactly one`);
  checkDist();
  console.log(`solo game: board='${boards[0]}' (no duel unit)`);
  console.log('CONFORMANT');
  process.exit(0);
}

handle.submit(1234);
if (!manifest || manifest.playerMode !== 'duel') fail(`manifest playerMode is not duel: ${JSON.stringify(manifest)}`);
if (!Array.isArray(manifest.challenge) || manifest.challenge.length !== 1) fail(`expected exactly 1 challenge unit, got ${manifest.challenge?.length}`);
const unit = manifest.challenge[0];
const declared = unit.boardId;

if (boards.length === 0) fail('submit(1234) posted to no board (not scored)');
if (new Set(boards).size !== 1 || boards[0] !== declared) fail(`observed boards ${JSON.stringify(boards)} != declared '${declared}'`);
if (unit.instanceKind === 'random' && !unit.needsSeed) fail('procedural content (instanceKind random) requires needsSeed=true');

checkDist();

console.log(`declared board='${declared}' observed=${JSON.stringify(boards)} needsSeed=${unit.needsSeed} sortOrder=${unit.sortOrder}`);
console.log('CONFORMANT');
