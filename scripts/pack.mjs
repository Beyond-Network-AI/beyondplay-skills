// Pack a game for upload to the creator MCP: one tar.gz of the folder with the
// files the hosted build reads (src/, public/, smoke.driver.mjs, CREDITS.md,
// publish.config.json) and nothing else. Prints the archive path and size.
//   npm run pack -- games/<slug>
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT, resolveGame, run } from './kit.mjs';

const { gameDir, slug } = resolveGame(process.argv[2], { usage: 'usage: npm run pack -- games/<slug>' });
const fail = (msg) => { console.error('PACK-FAIL:', msg); process.exit(1); };

const wanted = ['src', 'public', 'smoke.driver.mjs', 'CREDITS.md', 'publish.config.json'];
const present = wanted.filter((f) => existsSync(join(gameDir, f)));
if (!present.includes('src')) fail('the game has no src/ folder');
if (!present.includes('smoke.driver.mjs')) console.warn('note: no smoke.driver.mjs; the hosted checks cannot play the game');
if (!present.includes('CREDITS.md')) console.warn('note: no CREDITS.md; every asset and track must be credited before review');

const outDir = join(KIT_ROOT, 'out');
mkdirSync(outDir, { recursive: true });
const archive = join(outDir, `${slug}.tar.gz`);
const tar = run('tar', ['czf', archive, '-C', gameDir, ...present]);
if (tar.status !== 0) fail(`tar failed: ${tar.stderr || tar.error?.message || 'unknown error'}`);
const bytes = statSync(archive).size;
if (bytes > 50 * 1024 * 1024) fail(`${archive} is ${(bytes / 1048576).toFixed(1)} MB; the hosted limit is 50 MB`);
console.log(`packed ${present.join(', ')}`);
console.log(`${archive} (${(bytes / 1024).toFixed(1)} KB)`);
console.log('PACK-OK');
