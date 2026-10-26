// Platform-owned files: a game must carry the template's copies unchanged.
// The platform contract names index.html (only <title> may change),
// src/main.tsx and src/beyondplay-kit.ts. The other files the template ships
// (vite.config.ts, tsconfig.json, src/haptics.ts, src/index.css,
// src/webkit-image-hardening.ts) are not protected by the contract, so a
// difference there is a warning (drift), not an error.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, walk } from './files.js';
import { DOCS } from './limits.js';

export const CONTRACT_FILES = ['index.html', 'src/main.tsx', 'src/beyondplay-kit.ts'];
/** Starter files the template ships for the game to replace; never compared. */
export const STARTER_FILES = new Set(['src/App.tsx', 'src/game.ts', 'src/beyondplay.config.ts', 'smoke.driver.mjs']);

const TITLE = /<title>[^<]*<\/title>/;
const normalise = (rel, buf) => (rel === 'index.html' ? Buffer.from(buf.toString('utf8').replace(TITLE, '<title></title>')) : buf);

/** Find the template to compare against: --template, $BEYONDPLAY_TEMPLATE, a `template/` in an ancestor of the game, or this repo's. */
export function resolveTemplateDir(gameDir, explicit) {
  const candidates = [];
  if (explicit) candidates.push(resolve(explicit));
  if (process.env.BEYONDPLAY_TEMPLATE) candidates.push(resolve(process.env.BEYONDPLAY_TEMPLATE));
  let dir = resolve(gameDir);
  for (let i = 0; i < 6; i += 1) {
    candidates.push(join(dir, 'template'));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  candidates.push(resolve(here, '../../../template'), resolve(here, '../../../skills/beyondplay-game/template'));
  return candidates.find((c) => existsSync(join(c, 'src', 'main.tsx')) && existsSync(join(c, 'index.html'))) ?? null;
}

/** The first line where the game's copy departs from the template's, with a short excerpt. */
function firstDifference(want, have) {
  const a = want.split('\n');
  const b = have.split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] === b[i]) continue;
    const text = b[i] === undefined ? `(missing) template has: ${a[i].trim()}` : b[i].trim() || '(blank line)';
    return { line: i + 1, text: text.length > 90 ? `${text.slice(0, 87)}...` : text };
  }
  return { line: n, text: '(line endings or trailing whitespace)' };
}

/**
 * Compare the game's copies of the template files with the template by content hash.
 * Returns the set of template-owned paths (relative), so the source scan can skip them.
 */
export function checkTemplate(gameDir, templateDir, report) {
  const owned = new Set(CONTRACT_FILES);
  if (!templateDir) {
    report.warning('GAME_TEMPLATE_UNAVAILABLE', '.', 'No template/ folder found to compare the platform-owned files against.', 'Run inside the kit, or pass --template <dir> (or set BEYONDPLAY_TEMPLATE).', { docs: DOCS.contract });
    for (const rel of CONTRACT_FILES) {
      if (!existsSync(join(gameDir, rel))) report.error('GAME_TEMPLATE_FILE_MISSING', rel, `${rel} is missing; it is platform-owned and every game ships it.`, `Copy it from template/${rel}.`, { docs: DOCS.contract });
    }
    return owned;
  }
  const templateFiles = walk(templateDir).filter((f) => !f.rel.startsWith('scripts/') && !STARTER_FILES.has(f.rel));
  for (const t of templateFiles) {
    owned.add(t.rel);
    const contract = CONTRACT_FILES.includes(t.rel);
    const gameAbs = join(gameDir, t.rel);
    if (!existsSync(gameAbs)) {
      if (contract) report.error('GAME_TEMPLATE_FILE_MISSING', t.rel, `${t.rel} is missing; it is platform-owned and every game ships it.`, `Copy it from template/${t.rel}.`, { docs: DOCS.contract });
      else report.warning('GAME_TEMPLATE_FILE_DRIFT', t.rel, `${t.rel} is missing; the template ships it.`, `Copy it from template/${t.rel} unless the game replaced it on purpose.`, { docs: DOCS.contract });
      continue;
    }
    const wantBuf = normalise(t.rel, readFileSync(t.abs));
    const haveBuf = normalise(t.rel, readFileSync(gameAbs));
    const want = sha256(wantBuf);
    const have = sha256(haveBuf);
    if (want === have) continue;
    const diff = firstDifference(wantBuf.toString('utf8'), haveBuf.toString('utf8'));
    const where = `sha256 ${have.slice(0, 12)} vs ${want.slice(0, 12)}; first difference at line ${diff.line}: ${diff.text}`;
    if (contract) {
      const only = t.rel === 'index.html' ? ' beyond <title>' : '';
      report.error('GAME_TEMPLATE_FILE_MODIFIED', t.rel, `${t.rel} differs from template/${t.rel}${only} (${where}): either edited, or an older template copy.`, `Copy template/${t.rel} over it${t.rel === 'index.html' ? ' and change only <title>' : ''}; platform-owned files must match so the game behaves like a platform-published one.`, { line: diff.line, docs: DOCS.contract });
    } else {
      report.warning('GAME_TEMPLATE_FILE_DRIFT', t.rel, `${t.rel} differs from template/${t.rel} (${where}).`, 'Fine if the game changed it on purpose (colours, build options); otherwise re-copy it from the template.', { line: diff.line, docs: DOCS.contract });
    }
  }
  return owned;
}
