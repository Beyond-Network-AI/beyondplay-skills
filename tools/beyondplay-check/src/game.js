// `beyondplay-check game <dir>`: a game folder against the platform contract.
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkSizeLimits, walk } from './files.js';
import { checkBundle } from './game-bundle.js';
import { checkConfig } from './game-config.js';
import { checkDisplay, normalizeDisplay } from './game-display.js';
import { checkArt, checkAudioLicence, checkCapabilities, checkPublishConfig, checkSmokeDriver, scanSource } from './game-scan.js';
import { checkTemplate, resolveTemplateDir } from './game-template.js';
import { GAME_SOURCE } from './limits.js';
import { createReport } from './report.js';

export async function checkGame(dirArg, opts = {}) {
  const dir = resolve(dirArg);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw Object.assign(new Error(`not a directory: ${dir}`), { usage: true });
  const templateDir = resolveTemplateDir(dir, opts.template);
  const report = createReport({ kind: 'game', dir, template: templateDir });

  const files = walk(dir); // node_modules, dist and .git excluded: the source archive a creator would upload
  checkSizeLimits(report, files, GAME_SOURCE, { files: 'GAME_SOURCE_TOO_MANY_FILES', total: 'GAME_SOURCE_TOO_LARGE', file: 'GAME_SOURCE_FILE_TOO_LARGE' }, 'the game source');
  const templateOwned = checkTemplate(dir, templateDir, report);
  // opts.skipConfig: the hosted check evaluates the config in its own build and has no esbuild.
  const manifest = opts.skipConfig ? null : await checkConfig(dir, report);
  checkPublishConfig(dir, report);
  checkArt(dir, report);
  checkSmokeDriver(dir, report);
  scanSource(dir, files, templateOwned, report);
  checkCapabilities(files, templateOwned, manifest, report);
  checkDisplay(manifest, files, templateOwned, report);
  // The display the hosts will read, like `uses`; the hosted check (no manifest) leaves it to the build.
  if (manifest) report.fact('display', normalizeDisplay(manifest.display));
  checkAudioLicence(dir, files, report);
  if (!opts.skipConfig) checkBundle(dir, manifest, report);
  return report.finish(opts.failLevel);
}
