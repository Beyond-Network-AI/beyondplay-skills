// The Vite dev server for one game (http://localhost:5173).
//   npm run dev -- games/<slug>
import { bin, resolveGame, run } from './kit.mjs';

const { gameDir } = resolveGame(process.argv[2], { usage: 'usage: npm run dev -- games/<slug>' });
process.exit(run(bin('vite'), [gameDir, ...process.argv.slice(3)], { stdio: 'inherit' }).status);
