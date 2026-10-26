import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BIN, TEMPLATE, copyGame, tmp } from './helpers.js';

const run = (...args) => {
  const p = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
  return { status: p.status, stdout: p.stdout, stderr: p.stderr, json: () => JSON.parse(p.stdout) };
};
const UPPER_SNAKE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

describe('beyondplay-check CLI', () => {
  let root;
  let passing;
  let failing;
  let warning;
  beforeAll(() => {
    root = tmp('bpcheck-cli-');
    passing = copyGame(join(root, 'passing'));
    failing = copyGame(join(root, 'failing'));
    writeFileSync(join(failing, 'src/main.tsx'), readFileSync(join(failing, 'src/main.tsx'), 'utf8') + '\n// edited\n');
    warning = copyGame(join(root, 'warning'));
    writeFileSync(join(warning, 'src/App.tsx'), readFileSync(join(warning, 'src/App.tsx'), 'utf8') + "\nfetch('https://example.com/a.json');\n");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('--json prints exactly { ok, target, counts, issues } and exits 0 on a pass', () => {
    const r = run('game', passing, '--json', '--template', TEMPLATE);
    expect(r.status).toBe(0);
    const out = r.json();
    expect(Object.keys(out)).toEqual(['ok', 'target', 'counts', 'issues']);
    expect(out.ok).toBe(true);
    expect(out.target).toMatchObject({ kind: 'game', dir: passing });
    expect(Object.keys(out.counts)).toEqual(['error', 'warning', 'info']);
    expect(out.counts.error).toBe(0);
    for (const i of out.issues) {
      expect(i.code).toMatch(UPPER_SNAKE);
      expect(['error', 'warning', 'info']).toContain(i.severity);
      expect(typeof i.path).toBe('string');
      expect(typeof i.message).toBe('string');
      expect(typeof i.remediation).toBe('string');
      if ('line' in i) expect(Number.isInteger(i.line)).toBe(true);
      if ('docs' in i) expect(typeof i.docs).toBe('string');
    }
    expect(out.issues.length).toBe(out.counts.error + out.counts.warning + out.counts.info);
  });

  it('exits 1 when errors are found, with ok: false', () => {
    const r = run('game', failing, '--json', '--template', TEMPLATE);
    expect(r.status).toBe(1);
    const out = r.json();
    expect(out.ok).toBe(false);
    expect(out.counts.error).toBeGreaterThan(0);
    expect(out.issues[0].severity).toBe('error'); // sorted by severity
  });

  it('--fail-level warning makes warnings fail', () => {
    expect(run('game', warning, '--json', '--template', TEMPLATE).status).toBe(0);
    const strict = run('game', warning, '--json', '--template', TEMPLATE, '--fail-level', 'warning');
    expect(strict.status).toBe(1);
    expect(strict.json().ok).toBe(false);
    expect(run('game', warning, '--json', '--template=' + TEMPLATE, '--fail-level=warning').status).toBe(1);
  });

  it('exits 2 on usage and path errors', () => {
    expect(run().status).toBe(2);
    expect(run('bogus', passing).status).toBe(2);
    expect(run('game').status).toBe(2);
    expect(run('game', passing, '--fail-level', 'loud').status).toBe(2);
    const missing = run('game', join(root, 'does-not-exist'), '--json');
    expect(missing.status).toBe(2);
    expect(missing.json()).toMatchObject({ ok: false, issues: [{ code: 'CLI_PATH_NOT_FOUND', severity: 'error' }] });
  });

  it('prints a readable report grouped by severity without --json', () => {
    const r = run('game', failing, '--template', TEMPLATE);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^beyondplay-check game /);
    expect(r.stdout).toMatch(/\nERRORS \(\d+\)\n  GAME_TEMPLATE_FILE_MODIFIED  src\/main\.tsx/);
    expect(r.stdout).toMatch(/\nFAIL: \d+ errors?, \d+ warnings?, \d+ info\n$/);
    const ok = run('game', passing, '--template', TEMPLATE);
    expect(ok.stdout).toMatch(/\nPASS: 0 errors/);
  });

  it('--help and --version exit 0', () => {
    expect(run('--help').status).toBe(0);
    expect(run('--help').stdout).toMatch(/Usage:/);
    expect(run('--version').stdout).toMatch(/^beyondplay-check \d+\.\d+\.\d+/);
  });
});
