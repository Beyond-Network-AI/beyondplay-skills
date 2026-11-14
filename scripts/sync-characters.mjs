// Copy the characters-and-moves loader from a beyondplay-games checkout into the template as the
// platform-owned src/beyondplay-characters.ts, and record where it came from.
//   npm run sync-characters -- <path to a beyondplay-games checkout>
//   npm run sync-characters -- --check     # the copy still matches template/src/beyondplay-characters.SOURCE.json
//
// The games repository (Beyond-Network-AI/beyondplay-games, library/characters/characters.ts)
// is the one copy of the loader; this script brings it over byte for byte under a
// short header, and writes template/src/beyondplay-characters.SOURCE.json with the source path,
// the last commit that touched the file, the file's SHA-256 and that commit's date
// (not the wall clock, so a sync of the same commit writes the same files). The
// validator compares a game's copy with the template's, so nobody edits the copy.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { KIT_ROOT } from './kit.mjs';

const SOURCE_REPO = 'Beyond-Network-AI/beyondplay-games';
const SOURCE_REL = 'library/characters/characters.ts';
const COPY = join(KIT_ROOT, 'template', 'src', 'beyondplay-characters.ts');
const RECORD = join(KIT_ROOT, 'template', 'src', 'beyondplay-characters.SOURCE.json');
const MARKER = '// ---- synced copy: everything below is the games repository\'s file, byte for byte ----';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function git(cwd, args) {
  const p = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (p.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${(p.stderr || '').trim()}`);
  return p.stdout;
}

function header(commit, hash) {
  return [
    '// PLATFORM-OWNED. Do not edit: the validator refuses a game whose copy differs from the template\'s,',
    '// and the hosted build keeps the platform\'s copy anyway.',
    `// Synced from ${SOURCE_REPO} ${SOURCE_REL} by scripts/sync-characters.mjs.`,
    `//   commit  ${commit}`,
    `//   sha256  ${hash}  (of the source file; template/src/beyondplay-characters.SOURCE.json records the same)`,
    '// To change the loader: edit it in the games repository, commit there, then run',
    '//   npm run sync-characters -- <path to that checkout>',
    MARKER,
    '',
  ].join('\n');
}

/** Split the template copy into its header and the verbatim body; null when the marker is missing. */
function splitCopy(text) {
  const i = text.indexOf(`${MARKER}\n`);
  if (i < 0) return null;
  return { head: text.slice(0, i), body: text.slice(i + MARKER.length + 1) };
}

function check() {
  if (!existsSync(COPY) || !existsSync(RECORD)) {
    console.error(`SYNC-FAIL: ${COPY} or ${RECORD} is missing; run npm run sync-characters -- <games checkout>`);
    process.exit(1);
  }
  const record = JSON.parse(readFileSync(RECORD, 'utf8'));
  const parts = splitCopy(readFileSync(COPY, 'utf8'));
  if (!parts) {
    console.error('SYNC-FAIL: template/src/beyondplay-characters.ts has lost its sync header');
    process.exit(1);
  }
  const have = sha256(Buffer.from(parts.body, 'utf8'));
  const problems = [];
  if (have !== record.sha256) problems.push(`the copy's body hashes to ${have}, the record says ${record.sha256} (edited by hand, or the record is stale)`);
  if (!parts.head.includes(`//   commit  ${record.commit}\n`)) problems.push(`the header names a commit other than the record's ${record.commit}`);
  if (!parts.head.includes(`//   sha256  ${record.sha256}  `)) problems.push('the header names a sha256 other than the record\'s');
  if (problems.length) {
    for (const p of problems) console.error(`SYNC-FAIL: ${p}`);
    process.exit(1);
  }
  console.log(`SYNC-OK: template/src/beyondplay-characters.ts matches ${record.source} at ${record.commit.slice(0, 12)} (${record.sha256.slice(0, 12)}, ${record.syncedAt})`);
}

function sync(gamesArg) {
  const games = resolve(gamesArg);
  const source = join(games, SOURCE_REL);
  if (!existsSync(source)) {
    console.error(`${source} does not exist; pass the root of a ${SOURCE_REPO} checkout`);
    process.exit(2);
  }
  const bytes = readFileSync(source);
  const hash = sha256(bytes);
  const [commit, committedAt] = git(games, ['log', '-1', '--format=%H%n%cI', '--', SOURCE_REL]).trim().split('\n');
  if (!commit || !committedAt) throw new Error(`${SOURCE_REL} has no commit in ${games}`);
  const dirty = git(games, ['status', '--porcelain', '--', SOURCE_REL]).trim() !== '';
  if (dirty) {
    console.warn(`warning: ${SOURCE_REL} has uncommitted changes in ${games}; the copy carries them but the record names`);
    console.warn(`         commit ${commit.slice(0, 12)}, which does not. Commit there and sync again before the kit is released.`);
  }
  const text = Buffer.concat([Buffer.from(header(commit, hash), 'utf8'), bytes]);
  writeFileSync(COPY, text);
  writeFileSync(RECORD, `${JSON.stringify({ source: `${SOURCE_REPO} ${SOURCE_REL}`, commit, sha256: hash, syncedAt: committedAt }, null, 2)}\n`);
  console.log(`synced template/src/beyondplay-characters.ts from ${source}`);
  console.log(`  commit ${commit} (${committedAt})${dirty ? ' + uncommitted changes' : ''}`);
  console.log(`  sha256 ${hash}, ${bytes.length} bytes`);
  console.log('  record template/src/beyondplay-characters.SOURCE.json');
}

const arg = process.argv[2];
if (arg === '--check') check();
else if (arg) sync(arg);
else {
  console.error('usage: npm run sync-characters -- <path to a beyondplay-games checkout> | --check');
  process.exit(2);
}
