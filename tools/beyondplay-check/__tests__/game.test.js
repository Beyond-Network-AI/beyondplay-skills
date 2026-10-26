import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkGame } from '../src/game.js';
import { checkConfig } from '../src/game-config.js';
import { createReport } from '../src/report.js';
import { MB } from '../src/limits.js';
import { TEMPLATE, codes, copyGame, issue, tmp, write } from './helpers.js';

const append = (abs, text) => writeFileSync(abs, readFileSync(abs, 'utf8') + '\n' + text + '\n');

describe('beyondplay-check game', () => {
  let dir;
  beforeEach(() => { dir = copyGame(tmp('bpcheck-game-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('passes a real game copied into a temp dir', async () => {
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(r.ok).toBe(true);
    expect(r.counts.error).toBe(0);
    expect(r.target).toEqual({ kind: 'game', dir, template: TEMPLATE });
    expect(codes(r)).toContain('GAME_NO_BUILD');
    expect(codes(r)).not.toContain('GAME_TEMPLATE_FILE_MODIFIED');
  });

  it('reports a modified platform-owned file as an error, with the first differing line', async () => {
    append(join(dir, 'src/main.tsx'), 'console.log("tweak");');
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(r.ok).toBe(false);
    const i = issue(r, 'GAME_TEMPLATE_FILE_MODIFIED');
    expect(i).toMatchObject({ severity: 'error', path: 'src/main.tsx' });
    expect(typeof i.line).toBe('number');
    expect(i.remediation).toMatch(/template\/src\/main\.tsx/);
  });

  it('lets index.html change only its <title>', async () => {
    const idx = join(dir, 'index.html');
    writeFileSync(idx, readFileSync(idx, 'utf8').replace(/<title>[^<]*<\/title>/, '<title>Renamed Game</title>'));
    let r = await checkGame(dir, { template: TEMPLATE });
    expect(codes(r)).not.toContain('GAME_TEMPLATE_FILE_MODIFIED');
    writeFileSync(idx, readFileSync(idx, 'utf8').replace('<link rel="icon"', '<link rel="shortcut icon"'));
    r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_TEMPLATE_FILE_MODIFIED')).toMatchObject({ path: 'index.html', severity: 'error' });
  });

  it('accepts a solo, score-only declaration and verifies its one run report', async () => {
    writeFileSync(join(dir, 'src/beyondplay.config.ts'), "import { defineSoloGame } from './beyondplay-kit';\nexport const game = defineSoloGame({});\n");
    const report = createReport({ kind: 'game', dir });
    const manifest = await checkConfig(dir, report);
    const r = report.finish();
    expect(manifest).toMatchObject({ playerMode: 'single', challenge: null });
    expect(r.counts.error).toBe(0);
    expect(codes(r)).toContain('GAME_CONFIG_SOLO');
  });

  it('reports an oversized file against the 10 MB per-file limit', async () => {
    write(join(dir, 'assets/huge.bin'), Buffer.alloc(10 * MB + 1));
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_SOURCE_FILE_TOO_LARGE')).toMatchObject({ severity: 'error', path: 'assets/huge.bin' });
  });

  it('reports a wallet-gating pattern as an error', async () => {
    append(join(dir, 'src/App.tsx'), "const eth = (window as any).ethereum; if (eth) eth.request({ method: 'eth_requestAccounts' });");
    const r = await checkGame(dir, { template: TEMPLATE });
    const i = issue(r, 'GAME_WALLET_GATING');
    expect(i).toMatchObject({ severity: 'error', path: 'src/App.tsx' });
    expect(i.line).toBeGreaterThan(0);
    expect(r.ok).toBe(false);
  });

  it('reports external requests as warnings and lets --fail-level warning fail them', async () => {
    append(join(dir, 'src/App.tsx'), "fetch('https://example.com/scores.json');");
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_EXTERNAL_REQUEST')).toMatchObject({ severity: 'warning', path: 'src/App.tsx' });
    expect(r.counts.error).toBe(0);
    expect(r.ok).toBe(true);
    const strict = await checkGame(dir, { template: TEMPLATE, failLevel: 'warning' });
    expect(strict.ok).toBe(false);
  });

  it('reports a missing config and a missing test hook', async () => {
    rmSync(join(dir, 'src/beyondplay.config.ts'));
    for (const f of ['src/App.tsx', 'src/game.ts']) {
      const abs = join(dir, f);
      if (existsSync(abs)) writeFileSync(abs, readFileSync(abs, 'utf8').replaceAll('__bpTest', '__nope'));
    }
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_CONFIG_MISSING')).toMatchObject({ severity: 'error', path: 'src/beyondplay.config.ts' });
    expect(issue(r, 'GAME_TEST_HOOK_MISSING')).toMatchObject({ severity: 'error' });
  });

  it('rejects a config whose declaration is wrong', async () => {
    const cfg = join(dir, 'src/beyondplay.config.ts');
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace(/metricLabel:\s*'[^']*'/, 'metricLabel: 42 as any'));
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_CONFIG_INVALID').message).toMatch(/metricLabel/);
  });

  it('checks dist/ when a build exists: manifest, shell markers, initial download', async () => {
    const probe = createReport({});
    const manifest = await checkConfig(dir, probe);
    expect(manifest.playerMode).toBe('duel');
    const dist = join(dir, 'dist');
    write(join(dist, 'assets/index-abc.js'), 'console.log(1)');
    write(join(dist, 'assets/index-abc.css'), 'body{}');
    write(join(dist, 'index.html'), '<!doctype html><html><head><script>/* BeyondPlay bp_seed */</script><link rel="stylesheet" href="./assets/index-abc.css"></head><body><script type="module" src="./assets/index-abc.js"></script></body></html>');
    write(join(dist, 'beyondplay.json'), JSON.stringify(manifest));
    let r = await checkGame(dir, { template: TEMPLATE });
    expect(codes(r).filter((c) => c.startsWith('GAME_BUNDLE'))).toEqual([]);
    expect(issue(r, 'GAME_INITIAL_DOWNLOAD').message).toMatch(/2 synchronous assets/);

    write(join(dist, 'beyondplay.json'), JSON.stringify({ ...manifest, defaultUnitId: 'other' }));
    r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_BUNDLE_MANIFEST_MISMATCH')).toMatchObject({ severity: 'error', path: 'dist/beyondplay.json' });

    write(join(dist, 'beyondplay.json'), JSON.stringify({ playerMode: 'single', challenge: null, emitError: 'boom' }));
    write(join(dist, 'index.html'), '<!doctype html><html></html>');
    r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_BUNDLE_MANIFEST_INVALID').message).toMatch(/FALLBACK/);
    expect(codes(r).filter((c) => c === 'GAME_BUNDLE_SHELL_MISSING')).toHaveLength(2);
  });
});
