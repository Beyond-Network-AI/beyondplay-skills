// Emit dist/beyondplay.json from the kit declaration in src/beyondplay.config.ts.
//   node scripts/emit-manifest.mjs games/<slug>
// RESILIENT: any failure falls back to a safe single-player manifest and never
// throws, but it shouts loudly so the fallback is unmissable (and the checks
// fail on the emitError it leaves behind).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const outPath = join(root, 'dist', 'beyondplay.json');

async function emit() {
  let manifest = { playerMode: 'single', challenge: null, defaultUnitId: null };
  try {
    const esbuild = await import('esbuild');
    const result = await esbuild.build({
      stdin: {
        contents: "import './src/beyondplay.config.ts';\nexport { buildManifest } from './src/beyondplay-kit.ts';",
        resolveDir: root,
        loader: 'ts',
        sourcefile: 'bp-manifest-entry.ts',
      },
      bundle: true,
      format: 'esm',
      platform: 'node',
      write: false,
      logLevel: 'silent',
    });
    const code = result.outputFiles[0].text;
    const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
    const built = mod.buildManifest();
    if (built && typeof built === 'object') manifest = built;
  } catch (err) {
    const reason = err && err.message ? String(err.message) : String(err);
    manifest.emitError = 'beyondplay.config.ts could not be built; this manifest is a single-player FALLBACK, not the declared config: ' + reason;
    console.error('\n[beyondplay] ================ MANIFEST EMIT FAILED ================');
    console.error('[beyondplay] ERROR: could not build src/beyondplay.config.ts:', reason);
    console.error('[beyondplay] dist/beyondplay.json was written as a single-player FALLBACK.');
    console.error('[beyondplay] Fix the config error above or the game will not be challenge-ready.');
    console.error('[beyondplay] ======================================================\n');
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[beyondplay] wrote ${outPath}: ${manifest.playerMode}${manifest.emitError ? ' (FALLBACK)' : ''}`);
}

await emit();
