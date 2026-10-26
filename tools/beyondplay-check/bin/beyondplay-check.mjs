#!/usr/bin/env node
// beyondplay-check: validate a BeyondPlay game folder.
//
//   beyondplay-check game  <dir> [--json] [--fail-level error|warning] [--template <dir>]
//
// Exit codes: 0 nothing at or above the fail level; 1 issues found; 2 usage or path error; 3 internal failure.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkGame } from '../src/game.js';
import { formatText } from '../src/report.js';

const HELP = `beyondplay-check: validate a BeyondPlay game folder.

Usage:
  beyondplay-check game  <dir> [options]   check a game folder against the platform contract

Options:
  --json                 print one JSON object: { ok, target, counts, issues }
  --fail-level <level>   error (default) or warning: warnings then fail the run too
  --template <dir>       the template/ folder to compare platform-owned files against
                         (default: a template/ above the game, or this repo's)
  -h, --help             this text
  --version              the tool version

Exit codes: 0 pass, 1 issues at or above the fail level, 2 usage or path error, 3 internal failure.
`;

function parseArgs(argv) {
  const opts = { json: false, failLevel: 'error', template: undefined, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? a.split(/=(.*)/s) : [a, undefined];
    const next = () => (inline !== undefined ? inline : argv[++i]);
    if (flag === '--json') opts.json = true;
    else if (flag === '--fail-level') opts.failLevel = next();
    else if (flag === '--template') opts.template = next();
    else if (flag === '-h' || flag === '--help') opts.help = true;
    else if (flag === '--version') opts.version = true;
    else if (flag.startsWith('-')) throw usage(`unknown option ${flag}`);
    else opts.positional.push(a);
  }
  if (opts.failLevel !== 'error' && opts.failLevel !== 'warning') throw usage(`--fail-level must be error or warning, got ${opts.failLevel}`);
  return opts;
}

const usage = (message) => Object.assign(new Error(message), { usage: true });

function emit(report, json) {
  process.stdout.write(json ? JSON.stringify(report, null, 2) + '\n' : formatText(report));
}

function failure(kind, dir, code, message, json, exitCode) {
  const report = { ok: false, target: { kind: kind ?? 'unknown', dir: dir ?? '' }, counts: { error: 1, warning: 0, info: 0 }, issues: [{ code, severity: 'error', path: '.', message, remediation: 'Run beyondplay-check --help for usage.' }] };
  if (json) emit(report, true);
  else process.stderr.write(`beyondplay-check: ${message}\n`);
  return exitCode;
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    return failure(undefined, undefined, 'CLI_USAGE', err.message, argv.includes('--json'), 2);
  }
  if (opts.help) { process.stdout.write(HELP); return 0; }
  if (opts.version) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${pkg.name} ${pkg.version}\n`);
    return 0;
  }
  const [kind, dir, extra] = opts.positional;
  if (!kind || !dir || extra || kind !== 'game') {
    return failure(kind, dir, 'CLI_USAGE', `expected: beyondplay-check game <dir>, got "${argv.join(' ')}"`, opts.json, 2);
  }
  let report;
  try {
    report = await checkGame(dir, opts);
  } catch (err) {
    if (err && err.usage) return failure(kind, dir, 'CLI_PATH_NOT_FOUND', err.message, opts.json, 2);
    return failure(kind, dir, 'CLI_INTERNAL_ERROR', `${err && err.stack ? err.stack : err}`, opts.json, 3);
  }
  emit(report, opts.json);
  return report.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { process.stderr.write(`beyondplay-check: ${err && err.stack ? err.stack : err}\n`); process.exitCode = 3; });
}

export { main };
