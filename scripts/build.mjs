// Build a game: Vite build, then the manifest.
//   npm run build -- games/<slug>
import { bin, resolveGame, run } from './kit.mjs';

const { gameDir } = resolveGame(process.argv[2], { usage: 'usage: npm run build -- games/<slug>' });
const vite = run(bin('vite'), ['build', gameDir], { stdio: 'inherit' });
if (vite.status !== 0) process.exit(vite.status);
const emit = run(process.execPath, ['scripts/emit-manifest.mjs', gameDir], { stdio: 'inherit' });
process.exit(emit.status);
