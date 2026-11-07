import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkGame } from '../src/game.js';
import { checkConfig } from '../src/game-config.js';
import { DEFAULT_DISPLAY } from '../src/game-display.js';
import { createReport } from '../src/report.js';
import { MB } from '../src/limits.js';
import { TEMPLATE, codes, copyGame, issue, tmp, write } from './helpers.js';

const append = (abs, text) => writeFileSync(abs, readFileSync(abs, 'utf8') + '\n' + text + '\n');

/** Add `export const display = defineDisplay(<decl>)` to the copied game's config (decl is TypeScript source). */
function declareDisplay(dir, decl) {
  const cfg = join(dir, 'src/beyondplay.config.ts');
  const before = readFileSync(cfg, 'utf8');
  const src = before.replace("import { defineChallenge, defineSoloGame } from './beyondplay-kit';", "import { defineChallenge, defineDisplay, defineSoloGame } from './beyondplay-kit';");
  if (src === before) throw new Error('the copied config no longer has the import this test rewrites');
  writeFileSync(cfg, `${src}\nexport const display = defineDisplay(${decl});\n`);
}

/** A minimal built dist/ (index.html with the shell markers) carrying the given manifest. */
function writeDist(dir, manifest) {
  const dist = join(dir, 'dist');
  write(join(dist, 'assets/index-abc.js'), 'console.log(1)');
  write(join(dist, 'index.html'), '<!doctype html><html><head><script>/* BeyondPlay bp_seed */</script></head><body><script type="module" src="./assets/index-abc.js"></script></body></html>');
  write(join(dist, 'beyondplay.json'), JSON.stringify(manifest));
}

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

  it('treats the viewport and keyboard helpers as starter files: a game may edit or delete them', async () => {
    rmSync(join(dir, 'src/keys.ts'));
    writeFileSync(join(dir, 'src/viewport.ts'), readFileSync(join(dir, 'src/viewport.ts'), 'utf8') + '\nexport const EDITED = true;\n');
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(r.issues.filter((i) => i.path === 'src/keys.ts' || i.path === 'src/viewport.ts')).toEqual([]);
    expect(r.ok).toBe(true);
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

  it('reports external requests as errors, and lets --fail-level warning fail a listing-tier warning', async () => {
    append(join(dir, 'src/App.tsx'), "fetch('https://example.com/scores.json');");
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_EXTERNAL_REQUEST')).toMatchObject({ severity: 'error', path: 'src/App.tsx' });
    expect(r.ok).toBe(false);
    const warn = copyGame(tmp('bpcheck-warn-'));
    append(join(warn, 'src/App.tsx'), "const hint = 'Tap to jump';");
    expect((await checkGame(warn, { template: TEMPLATE })).ok).toBe(true);
    expect((await checkGame(warn, { template: TEMPLATE, failLevel: 'warning' })).ok).toBe(false);
    rmSync(warn, { recursive: true, force: true });
  });

  it('reports links out, identity prompts and share buttons, each with its tier', async () => {
    append(join(dir, 'src/App.tsx'), "const a = <a href=\"https://opensea.io/item/ethereum/0x1\" target=\"_blank\">Open on OpenSea</a>;");
    append(join(dir, 'src/App.tsx'), "const name = window.prompt('Enter your name');");
    append(join(dir, 'src/App.tsx'), "const share = () => window.open('https://x.com/intent/tweet?text=hi');");
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_EXTERNAL_LINK')).toMatchObject({ severity: 'error', tier: 'publish', path: 'src/App.tsx' });
    expect(issue(r, 'GAME_NAME_PROMPT')).toMatchObject({ severity: 'error', tier: 'publish' });
    expect(issue(r, 'GAME_SHARE_BUTTON')).toMatchObject({ severity: 'warning', tier: 'listing' });
    expect(r.ok).toBe(false);
  });

  it('flags a start gate and instruction text as listing-tier warnings, and an external request as an error', async () => {
    append(join(dir, 'src/App.tsx'), "const gate = <button onClick={start}>Play</button>; const hint = 'Tap to jump';");
    append(join(dir, 'src/App.tsx'), "const img = new Image(); img.src = 'https://cdn.example.com/bull.png';");
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_START_GATE')).toMatchObject({ severity: 'warning', tier: 'listing' });
    expect(issue(r, 'GAME_INSTRUCTION_TEXT')).toMatchObject({ severity: 'warning', tier: 'listing' });
    expect(issue(r, 'GAME_EXTERNAL_REQUEST')).toMatchObject({ severity: 'error', tier: 'publish' });
  });

  it('skipConfig leaves the config and the bundle to the hosted build', async () => {
    const r = await checkGame(dir, { template: TEMPLATE, skipConfig: true });
    expect(r.ok).toBe(true);
    expect(codes(r)).not.toContain('GAME_NO_BUILD');
    expect(r.issues.every((i) => typeof i.tier === 'string')).toBe(true);
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

    write(join(dist, 'models/arena.glb'), Buffer.alloc(26 * MB, 1));
    r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_PUBLISHED_WEIGHT_HEAVY')).toMatchObject({ severity: 'warning', tier: 'review', path: 'dist' });
    expect(issue(r, 'GAME_PUBLISHED_WEIGHT_HEAVY').message).toContain('dist/models/arena.glb');
    expect(codes(r)).not.toContain('GAME_PUBLISHED_WEIGHT_TOO_HEAVY');
    write(join(dist, 'models/arena-2.glb'), Buffer.alloc(9 * MB, 1));
    write(join(dist, 'models/arena-3.glb'), Buffer.alloc(9 * MB, 1));
    write(join(dist, 'models/arena-4.glb'), Buffer.alloc(9 * MB, 1));
    r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_PUBLISHED_WEIGHT_TOO_HEAVY')).toMatchObject({ severity: 'warning', tier: 'listing', path: 'dist' });
    expect(codes(r)).not.toContain('GAME_PUBLISHED_WEIGHT_HEAVY');
    rmSync(join(dist, 'models'), { recursive: true, force: true });

    write(join(dist, 'beyondplay.json'), JSON.stringify({ ...manifest, defaultUnitId: 'other' }));
    r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_BUNDLE_MANIFEST_MISMATCH')).toMatchObject({ severity: 'error', path: 'dist/beyondplay.json' });

    write(join(dist, 'beyondplay.json'), JSON.stringify({ playerMode: 'single', challenge: null, emitError: 'boom' }));
    write(join(dist, 'index.html'), '<!doctype html><html></html>');
    r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_BUNDLE_MANIFEST_INVALID').message).toMatch(/FALLBACK/);
    expect(codes(r).filter((c) => c === 'GAME_BUNDLE_SHELL_MISSING')).toHaveLength(2);
  });
  it('records the capabilities a game requests, and the template declares share and uses it through request()', async () => {
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(r.facts.uses).toEqual(['share']);
    expect(codes(r)).not.toContain('GAME_SHARE_BUTTON');
    expect(codes(r)).not.toContain('GAME_CAPABILITY_UNDECLARED');
    expect(r.ok).toBe(true);
  });

  it('flags an undeclared or unknown capability as a listing finding, and a share intent of the game\'s own beside request()', async () => {
    append(join(dir, 'src/App.tsx'), "const who = await request('player.profile'); const t = await request('player.wallet');");
    append(join(dir, 'src/App.tsx'), "const tweet = () => window.open('https://x.com/intent/tweet?text=hi');");
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(r.facts.uses).toEqual(['player.profile', 'player.wallet', 'share']);
    expect(issue(r, 'GAME_CAPABILITY_UNDECLARED')).toMatchObject({ severity: 'error', tier: 'listing', path: 'src/App.tsx' });
    expect(issue(r, 'GAME_CAPABILITY_UNDECLARED').message).toContain("request('player.profile')");
    expect(issue(r, 'GAME_CAPABILITY_UNKNOWN')).toMatchObject({ severity: 'error', tier: 'listing' });
    expect(issue(r, 'GAME_SHARE_BUTTON')).toMatchObject({ severity: 'warning', tier: 'listing' });
  });

  it('a config without uses still passes when the game requests nothing; skipConfig checks only the names', async () => {
    writeFileSync(join(dir, 'src/beyondplay.config.ts'), "import { defineSoloGame } from './beyondplay-kit';\nexport const game = defineSoloGame({});\n");
    const r = await checkGame(dir, { template: TEMPLATE, skipConfig: true });
    expect(codes(r)).not.toContain('GAME_CAPABILITY_UNDECLARED');
    expect(r.facts.uses).toEqual(['share']);
    const full = await checkGame(dir, { template: TEMPLATE });
    expect(issue(full, 'GAME_CAPABILITY_UNDECLARED')).toMatchObject({ path: 'src/App.tsx' });
  });

  const ITEMS_REQUEST = "const items = await request('player.items', { collection: 'cobi' }).catch(() => null);";
  const configWithUses = (uses) => `import { defineChallenge, defineSoloGame } from './beyondplay-kit';\nexport const challenge = defineChallenge({ metricLabel: 'Score', seed: true, minValue: 0, maxValue: 1500 });\nexport const game = defineSoloGame({ challenge, uses: ${uses} });\n`;

  it('a declared collection satisfies request(\'player.items\'), and the fact keeps the declared entry', async () => {
    writeFileSync(join(dir, 'src/beyondplay.config.ts'), configWithUses("['share', 'player.items:cobi']"));
    append(join(dir, 'src/App.tsx'), ITEMS_REQUEST);
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(codes(r)).not.toContain('GAME_CAPABILITY_UNDECLARED');
    expect(codes(r)).not.toContain('GAME_CAPABILITY_UNKNOWN');
    expect(codes(r)).not.toContain('GAME_ITEM_IN_SIMULATION');
    expect(r.facts.uses).toEqual(['player.items:cobi', 'share']);
    expect(r.ok).toBe(true);
  });

  it('a bare player.items in uses declares no collection', async () => {
    writeFileSync(join(dir, 'src/beyondplay.config.ts'), configWithUses("['share', 'player.items']"));
    append(join(dir, 'src/App.tsx'), ITEMS_REQUEST);
    const r = await checkGame(dir, { template: TEMPLATE });
    const i = issue(r, 'GAME_CAPABILITY_UNDECLARED');
    expect(i).toMatchObject({ severity: 'error', tier: 'listing', path: 'src/App.tsx' });
    expect(i.message).toContain("declare the collection: uses: ['player.items:cobi']");
    expect(r.facts.uses).toEqual(['player.items', 'share']);
    expect(r.ok).toBe(false);
    // No player.items entry at all says the same.
    writeFileSync(join(dir, 'src/beyondplay.config.ts'), configWithUses("['share']"));
    const none = await checkGame(dir, { template: TEMPLATE });
    expect(issue(none, 'GAME_CAPABILITY_UNDECLARED').message).toContain("declare the collection: uses: ['player.items:cobi']");
  });

  it('a collection slug is checked for shape only; a colon on another capability is unknown', async () => {
    writeFileSync(join(dir, 'src/beyondplay.config.ts'), configWithUses("['share', 'player.items:Not A Slug', 'player.profile:cobi']"));
    append(join(dir, 'src/App.tsx'), ITEMS_REQUEST);
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(codes(r)).not.toContain('GAME_CAPABILITY_UNDECLARED');
    const unknown = r.issues.filter((i) => i.code === 'GAME_CAPABILITY_UNKNOWN');
    expect(unknown.map((i) => i.message)).toEqual(expect.arrayContaining([expect.stringContaining('player.profile:cobi'), expect.stringContaining('Not A Slug')]));
    expect(unknown).toHaveLength(2);
    expect(r.facts.uses).toEqual(['player.items:Not A Slug', 'share']);
  });

  it('without a manifest (the hosted check) a player.items request is recorded and left to the build', async () => {
    append(join(dir, 'src/App.tsx'), ITEMS_REQUEST);
    const r = await checkGame(dir, { template: TEMPLATE, skipConfig: true });
    expect(codes(r)).not.toContain('GAME_CAPABILITY_UNDECLARED');
    expect(r.facts.uses).toEqual(['player.items', 'share']);
  });

  it('player.items or PlayerItem in src/game.ts is a listing-tier error naming the line', async () => {
    writeFileSync(join(dir, 'src/beyondplay.config.ts'), configWithUses("['share', 'player.items:cobi']"));
    append(join(dir, 'src/App.tsx'), ITEMS_REQUEST);
    const game = join(dir, 'src/game.ts');
    const before = readFileSync(game, 'utf8').split('\n').length;
    append(game, "export function speedFor(item: { traits: Record<string, string> }) { return item.traits.Fur === 'Gold' ? 2 : 1; } // from player.items");
    const r = await checkGame(dir, { template: TEMPLATE });
    const i = issue(r, 'GAME_ITEM_IN_SIMULATION');
    expect(i).toMatchObject({ severity: 'error', tier: 'listing', path: 'src/game.ts', line: before + 1 });
    expect(i.message).toContain('src/game.ts');
    expect(r.ok).toBe(false);
    writeFileSync(game, readFileSync(game, 'utf8').replace('// from player.items', '// typed as PlayerItem'));
    expect(issue(await checkGame(dir, { template: TEMPLATE }), 'GAME_ITEM_IN_SIMULATION')).toMatchObject({ line: before + 1 });
  });
});

describe('beyondplay-check game: the display declaration', () => {
  let dir;
  beforeEach(() => { dir = copyGame(tmp('bpcheck-display-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const displayCodes = (r) => codes(r).filter((c) => c.startsWith('DISPLAY_'));

  it('the template declares nothing: its manifest carries the default display before uses, and the report records it', async () => {
    const manifest = await checkConfig(dir, createReport({ kind: 'game', dir }));
    expect(manifest.display).toEqual(DEFAULT_DISPLAY);
    expect(Object.keys(manifest)).toEqual(['playerMode', 'challenge', 'defaultUnitId', 'display', 'uses']);
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(r.ok).toBe(true);
    expect(displayCodes(r)).toEqual([]);
    expect(r.facts.display).toEqual(DEFAULT_DISPLAY);
  });

  it('skipConfig (the hosted check) records no display fact and runs no display check', async () => {
    declareDisplay(dir, "{ orientation: 'wide' as any }");
    const r = await checkGame(dir, { template: TEMPLATE, skipConfig: true });
    expect(r.facts).not.toHaveProperty('display');
    expect(displayCodes(r)).toEqual([]);
  });

  it('carries a declared display verbatim, with the defaults filled and input deduped, and records it normalized', async () => {
    declareDisplay(dir, "{ orientation: 'any', input: ['touch', 'mouse', 'keyboard', 'keyboard'], keys: { move: 'arrows|wasd', jump: 'space' } }");
    const manifest = await checkConfig(dir, createReport({}));
    const want = { orientation: 'any', input: ['touch', 'mouse', 'keyboard'], keys: { move: 'arrows|wasd', jump: 'space' } };
    expect(manifest.display).toEqual(want);
    append(join(dir, 'src/App.tsx'), "window.addEventListener('keydown', (e) => { if (e.key === ' ') console.log('jump'); });");
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(displayCodes(r)).toEqual([]);
    expect(r.facts.display).toEqual(want);
  });

  it('reports keys without keyboard as a publish-tier error on the defineDisplay line', async () => {
    declareDisplay(dir, "{ keys: { jump: 'space' } }");
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(r.ok).toBe(false);
    const i = issue(r, 'DISPLAY_KEYS_WITHOUT_KEYBOARD');
    expect(i).toMatchObject({ severity: 'error', tier: 'publish', path: 'src/beyondplay.config.ts' });
    const lines = readFileSync(join(dir, 'src/beyondplay.config.ts'), 'utf8').split('\n');
    expect(lines[i.line - 1]).toMatch(/^export const display = defineDisplay\(/);
    expect(r.facts.display).toEqual(DEFAULT_DISPLAY);
  });

  it('reports an unknown orientation', async () => {
    declareDisplay(dir, "{ orientation: 'wide' as any }");
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'DISPLAY_ORIENTATION_INVALID')).toMatchObject({ severity: 'error', tier: 'publish', path: 'src/beyondplay.config.ts' });
    expect(r.ok).toBe(false);
  });

  it('reports a reserved key (Esc is the host\'s)', async () => {
    declareDisplay(dir, "{ input: ['touch', 'mouse', 'keyboard'], keys: { jump: 'esc' } }");
    const r = await checkGame(dir, { template: TEMPLATE });
    const i = issue(r, 'DISPLAY_KEYS_INVALID');
    expect(i).toMatchObject({ severity: 'error', tier: 'publish' });
    expect(i.message).toMatch(/reserved/);
  });

  it('reports keyboard-only input as a listing-tier error: touch and mouse always stay', async () => {
    declareDisplay(dir, "{ input: ['keyboard'] }");
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'DISPLAY_INPUT_NO_POINTER')).toMatchObject({ severity: 'error', tier: 'listing' });
    expect(r.ok).toBe(false);
  });

  it('warns when keyboard is declared but no handler binds keys (src/keys.ts alone does not count)', async () => {
    declareDisplay(dir, "{ input: ['touch', 'mouse', 'keyboard'], keys: { jump: 'space' } }");
    copyFileSync(join(TEMPLATE, 'src/keys.ts'), join(dir, 'src/keys.ts'));
    let r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'DISPLAY_KEYBOARD_NO_HANDLER')).toMatchObject({ severity: 'warning', tier: 'review', path: 'src/beyondplay.config.ts' });
    expect(r.ok).toBe(true);
    expect(r.counts.error).toBe(0);

    append(join(dir, 'src/App.tsx'), "// const off = bindKeys(display.keys, { jump: (down) => {} });");
    r = await checkGame(dir, { template: TEMPLATE });
    expect(codes(r)).toContain('DISPLAY_KEYBOARD_NO_HANDLER');

    append(join(dir, 'src/App.tsx'), "export const off = bindKeys(display.keys, { jump: (down) => {} });");
    r = await checkGame(dir, { template: TEMPLATE });
    expect(displayCodes(r)).toEqual([]);
  });

  it('notes a key handler when keyboard is not declared, at its file and line', async () => {
    const app = join(dir, 'src/App.tsx');
    append(app, "window.addEventListener('keydown', (e) => { if (e.key === ' ') console.log('jump'); });");
    const line = readFileSync(app, 'utf8').split('\n').findIndex((l) => l.includes("addEventListener('keydown'")) + 1;
    const r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'DISPLAY_KEYBOARD_UNDECLARED')).toMatchObject({ severity: 'info', tier: 'review', path: 'src/App.tsx', line });
    expect(r.ok).toBe(true);
  });

  it('reports a built manifest without display as a mismatch with the config', async () => {
    const manifest = await checkConfig(dir, createReport({}));
    const { display, ...withoutDisplay } = manifest;
    expect(display).toEqual(DEFAULT_DISPLAY);
    writeDist(dir, withoutDisplay);
    let r = await checkGame(dir, { template: TEMPLATE });
    expect(issue(r, 'GAME_BUNDLE_MANIFEST_MISMATCH')).toMatchObject({ severity: 'error', path: 'dist/beyondplay.json' });

    writeDist(dir, manifest);
    r = await checkGame(dir, { template: TEMPLATE });
    expect(codes(r)).not.toContain('GAME_BUNDLE_MANIFEST_MISMATCH');
  });
});
