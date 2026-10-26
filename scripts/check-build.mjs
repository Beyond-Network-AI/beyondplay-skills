// The game builds into a platform-shaped bundle. Prints BUILD-OK on success.
//   npm run check-build -- games/<slug>
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT, resolveGame, run } from './kit.mjs';

const { gameDir, dist, slug } = resolveGame(process.argv[2], { usage: 'usage: npm run check-build -- games/<slug>' });
const fail = (msg) => { console.error('BUILD-FAIL:', msg); process.exit(1); };

const logDir = join(KIT_ROOT, 'out');
mkdirSync(logDir, { recursive: true });
const log = join(logDir, `check-build-${slug}.log`);
const build = run(process.execPath, ['scripts/build.mjs', gameDir]);
writeFileSync(log, build.stdout + build.stderr);
if (build.status !== 0) fail(`the build failed (see ${log})`);

const index = join(dist, 'index.html');
if (!existsSync(index)) fail('dist/index.html is missing');
const html = readFileSync(index, 'utf8');
if (!html.includes('BeyondPlay')) fail('the BeyondPlay shell marker is missing from dist/index.html (index.html was edited or replaced)');
if (!html.includes('bp_seed')) fail('the bp_seed seed bootstrap is missing from dist/index.html (index.html was edited or replaced)');
const manifest = join(dist, 'beyondplay.json');
if (!existsSync(manifest) || statSync(manifest).size === 0) fail('dist/beyondplay.json is missing or empty');
if (readFileSync(manifest, 'utf8').includes('"emitError"')) fail(`the manifest is a fallback (emitError present; see ${log})`);

console.log('shell marker and seed bootstrap present, manifest emitted');
console.log('BUILD-OK');
