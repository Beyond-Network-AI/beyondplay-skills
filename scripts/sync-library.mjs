// Bring the games library's loaders into the template together, from one commit of a beyondplay-games checkout:
// src/cobi-kit.ts, src/beyondplay-characters.ts, src/avatar-kit.ts and src/crowd-copy.ts (scripts/sync-*.mjs, one each), then record
// that commit and each copy's hash in library.SOURCE.json (at the kit's root: not a template file, which every game
// would copy).
//   npm run sync-library -- <path to a beyondplay-games checkout>
//   npm run sync-library -- --check     # each copy matches its record, and all of them come from the recorded commit
//
// They depend on one another (avatar-kit.ts imports cobi-kit.ts and beyondplay-characters.ts, crowd-copy.ts imports
// cobi-kit.ts, and games load characters through beyondplay-characters.ts), so they move together: a copy of one taken from a newer commit than the others breaks
// games. On 23 November 2026 avatar-kit.ts had been synced alone while beyondplay-characters.ts stayed at 13 November's,
// whose lite characters (bull-01-lite, the bears' and the Beyonders' -lite) found no moves and stood in a T-pose.
// The check (and the kit's tests, tools/beyondplay-check/__tests__/library-copies.test.js) refuses a copy that is not
// the one this record names.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT_ROOT } from './kit.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SOURCE_REPO = 'Beyond-Network-AI/beyondplay-games';
export const LIBRARY_RECORD = join(KIT_ROOT, 'library.SOURCE.json');
/** Each loader: its sync script and its copy in template/src (the copy's own record is <copy>.SOURCE.json). */
export const LOADERS = [
  { script: 'sync-cobi-kit.mjs', copy: 'cobi-kit', from: 'library/characters/cobi.ts' },
  { script: 'sync-characters.mjs', copy: 'beyondplay-characters', from: 'library/characters/characters.ts' },
  { script: 'sync-avatar-kit.mjs', copy: 'avatar-kit', from: 'library/characters/avatar-kit.ts' },
  { script: 'sync-crowd-copy.mjs', copy: 'crowd-copy', from: 'library/characters/crowd-copy.ts' },
];

const run = (args) => spawnSync(process.execPath, args, { stdio: 'inherit' }).status === 0;
const record = (copy) => JSON.parse(readFileSync(join(KIT_ROOT, 'template', 'src', `${copy}.SOURCE.json`), 'utf8'));

function git(cwd, args) {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${(p.stderr || '').trim()}`);
  return p.stdout.trim();
}

function sync(gamesArg) {
  const games = resolve(gamesArg);
  if (!existsSync(join(games, 'library', 'characters'))) {
    console.error(`${games} has no library/characters; pass the root of a ${SOURCE_REPO} checkout`);
    process.exit(2);
  }
  // one commit for all of them: nothing uncommitted under library/characters
  if (git(games, ['status', '--porcelain', '--', 'library/characters'])) {
    console.error(`library/characters has uncommitted changes in ${games}: commit there (or check out a clean commit) and sync again`);
    process.exit(2);
  }
  const commit = git(games, ['rev-parse', 'HEAD']);
  for (const l of LOADERS) if (!run([join(HERE, l.script), games])) process.exit(1);
  const files = Object.fromEntries(LOADERS.map((l) => [`${l.copy}.ts`, { from: l.from, sha256: record(l.copy).sha256 }]));
  writeFileSync(LIBRARY_RECORD, `${JSON.stringify({ source: SOURCE_REPO, commit, files }, null, 2)}\n`);
  console.log(`synced the library's loaders from ${SOURCE_REPO} ${commit.slice(0, 12)}: ${LOADERS.map((l) => `src/${l.copy}.ts`).join(', ')}`);
}

/** The loaders that disagree with library.SOURCE.json (empty: all of them come from its commit). */
export function libraryProblems() {
  if (!existsSync(LIBRARY_RECORD)) return ['library.SOURCE.json is missing: run npm run sync-library -- <games checkout>'];
  const lib = JSON.parse(readFileSync(LIBRARY_RECORD, 'utf8'));
  const problems = [];
  for (const l of LOADERS) {
    const want = lib.files?.[`${l.copy}.ts`]?.sha256;
    const have = record(l.copy).sha256;
    if (want !== have) problems.push(`src/${l.copy}.ts is not the copy of ${SOURCE_REPO} ${String(lib.commit).slice(0, 12)} (synced alone?): run npm run sync-library -- <games checkout>`);
  }
  return problems;
}

function check() {
  let ok = true;
  for (const l of LOADERS) ok = run([join(HERE, l.script), '--check']) && ok;
  const problems = libraryProblems();
  for (const p of problems) console.error(`SYNC-FAIL: ${p}`);
  if (!ok || problems.length) process.exit(1);
  const lib = JSON.parse(readFileSync(LIBRARY_RECORD, 'utf8'));
  console.log(`SYNC-OK: the library's loaders all come from ${lib.source} ${lib.commit.slice(0, 12)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: npm run sync-library -- <path to a beyondplay-games checkout> | --check');
    process.exit(2);
  }
  if (arg === '--check') check();
  else sync(arg);
}
