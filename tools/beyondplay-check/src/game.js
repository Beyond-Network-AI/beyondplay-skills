// `beyondplay-check game <dir>`: a game folder against the platform contract.
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkSizeLimits, walk } from './files.js';
import { checkBundle } from './game-bundle.js';
import { checkConfig } from './game-config.js';
import { checkArt, checkAudioLicence, checkPublishConfig, checkSmokeDriver, scanSource } from './game-scan.js';
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
  const manifest = await checkConfig(dir, report);
  checkPublishConfig(dir, report);
  checkArt(dir, report);
  checkSmokeDriver(dir, report);
  scanSource(dir, files, templateOwned, report);
  checkAudioLicence(dir, files, report);
  checkBundle(dir, manifest, report);
  return report.finish(opts.failLevel);
}
