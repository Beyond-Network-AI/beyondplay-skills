// dist/: the built bundle, when one exists. Mirrors scripts/check-build.mjs and
// conformance.mjs (shell markers, manifest, manifest == declaration) and the
// design's bundle and initial-download budgets.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { gzipSync } from 'node:zlib';
import { checkSizeLimits, fmtBytes, walk } from './files.js';
import { DOCS, GAME_BUNDLE, GAME_BUNDLE_GZIP_TARGET, GAME_INITIAL_DOWNLOAD } from './limits.js';

const SYNC_REFS = [
  /<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi,
  /<link\b[^>]*\srel\s*=\s*["'](?:stylesheet|modulepreload)["'][^>]*\shref\s*=\s*["']([^"']+)["']/gi,
  /<link\b[^>]*\shref\s*=\s*["']([^"']+)["'][^>]*\srel\s*=\s*["'](?:stylesheet|modulepreload)["']/gi,
];

export function checkBundle(gameDir, configManifest, report) {
  const dist = join(gameDir, 'dist');
  if (!existsSync(dist) || !statSync(dist).isDirectory()) {
    report.info('GAME_NO_BUILD', 'dist', 'No dist/ build found; bundle, manifest and initial-download checks were skipped.', 'Build first (npm run build -- games/<slug>) and run the check again.', { docs: DOCS.smoke });
    return;
  }
  const files = walk(dist, new Set(['.DS_Store']));
  checkSizeLimits(report, files.map((f) => ({ ...f, rel: posix.join('dist', f.rel) })), GAME_BUNDLE, { files: 'GAME_BUNDLE_TOO_MANY_FILES', total: 'GAME_BUNDLE_TOO_LARGE', file: 'GAME_BUNDLE_FILE_TOO_LARGE' }, 'dist/');

  const indexAbs = join(dist, 'index.html');
  if (!existsSync(indexAbs)) {
    report.error('GAME_BUNDLE_INDEX_MISSING', 'dist/index.html', 'dist/index.html is missing.', 'Run the Vite build; the game root must hold the template index.html.', { docs: DOCS.smoke });
  } else {
    const html = readFileSync(indexAbs, 'utf8');
    for (const [marker, what] of [['BeyondPlay', 'the window.BeyondPlay shell marker'], ['bp_seed', 'the seed bootstrap']]) {
      if (!html.includes(marker)) report.error('GAME_BUNDLE_SHELL_MISSING', 'dist/index.html', `dist/index.html lacks ${what} ("${marker}"); the template index.html was not used.`, 'Restore template/index.html in the game root and rebuild.', { docs: DOCS.smoke });
    }
    let bytes = Buffer.byteLength(html);
    let gzipped = gzipSync(Buffer.from(html)).length;
    const refs = [];
    for (const re of SYNC_REFS) {
      for (const m of html.matchAll(re)) {
        const ref = m[1];
        if (/^(?:https?:)?\/\//.test(ref) || ref.startsWith('data:')) continue;
        const rel = ref.replace(/^\.?\//, '').split('?')[0];
        const abs = join(dist, rel);
        if (!refs.includes(rel) && existsSync(abs)) { refs.push(rel); bytes += statSync(abs).size; gzipped += gzipSync(readFileSync(abs)).length; }
      }
    }
    const summary = `${fmtBytes(bytes)} (${fmtBytes(gzipped)} gzipped) before the first frame (index.html + ${refs.length} synchronous asset${refs.length === 1 ? '' : 's'}: ${refs.join(', ') || 'none'})`;
    if (gzipped > GAME_BUNDLE_GZIP_TARGET.maxBytes) {
      report.warning('GAME_BUNDLE_OVER_TARGET', 'dist/index.html', `The first-frame set is ${fmtBytes(gzipped)} gzipped; the repository's target is well under ${fmtBytes(GAME_BUNDLE_GZIP_TARGET.maxBytes)}.`, 'Code-split, defer big assets until after the first frame, drop unused dependencies; the reference game ships about 57 KB.', { docs: GAME_BUNDLE_GZIP_TARGET.docs });
    }
    if (bytes > GAME_INITIAL_DOWNLOAD.maxBytes) {
      report.error('GAME_INITIAL_DOWNLOAD_TOO_LARGE', 'dist/index.html', `Initial download is ${summary}; the phone budget is ${fmtBytes(GAME_INITIAL_DOWNLOAD.maxBytes)}.`, 'Code-split, lazy-load big assets after the first frame, and compress textures/audio.', { docs: GAME_INITIAL_DOWNLOAD.docs });
    } else {
      report.info('GAME_INITIAL_DOWNLOAD', 'dist/index.html', `Initial download estimate: ${summary}. Assets the code loads at runtime are not counted.`, `Keep it well under ${fmtBytes(GAME_INITIAL_DOWNLOAD.maxBytes)} (the target is well under 1 MB gzipped).`, { docs: GAME_INITIAL_DOWNLOAD.docs });
    }
  }

  const manifestAbs = join(dist, 'beyondplay.json');
  if (!existsSync(manifestAbs)) {
    report.error('GAME_BUNDLE_MANIFEST_MISSING', 'dist/beyondplay.json', 'dist/beyondplay.json is missing; the build did not run the manifest emitter.', 'Run node scripts/emit-manifest.mjs <game dir> after vite build (npm run build -- games/<slug> does both).', { docs: DOCS.smoke });
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestAbs, 'utf8'));
  } catch (err) {
    report.error('GAME_BUNDLE_MANIFEST_INVALID', 'dist/beyondplay.json', `dist/beyondplay.json is not valid JSON: ${err.message}`, 'Rebuild; never hand-edit the manifest.', { docs: DOCS.smoke });
    return;
  }
  if (manifest.emitError) {
    report.error('GAME_BUNDLE_MANIFEST_INVALID', 'dist/beyondplay.json', `The manifest is a single-player FALLBACK: ${String(manifest.emitError).slice(0, 200)}`, 'Fix src/beyondplay.config.ts so it builds, then rebuild.', { docs: DOCS.smoke });
  } else if (!('playerMode' in manifest) || !('challenge' in manifest)) {
    report.error('GAME_BUNDLE_MANIFEST_INVALID', 'dist/beyondplay.json', 'The manifest lacks playerMode/challenge; it was not written by the emitter.', 'Rebuild; never hand-edit the manifest.', { docs: DOCS.smoke });
  } else if (configManifest && JSON.stringify(manifest) !== JSON.stringify(configManifest)) {
    report.error('GAME_BUNDLE_MANIFEST_MISMATCH', 'dist/beyondplay.json', 'dist/beyondplay.json differs from what src/beyondplay.config.ts declares (stale build or hand edit).', 'Rebuild so the manifest matches the declaration.', { docs: DOCS.smoke });
  }
}
