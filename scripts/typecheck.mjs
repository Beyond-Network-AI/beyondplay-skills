// Strict TypeScript over one game, with the kit's dependencies in scope.
//   npm run typecheck -- games/<slug>
import { bin, resolveGame, run } from './kit.mjs';

const { gameDir } = resolveGame(process.argv[2], { usage: 'usage: npm run typecheck -- games/<slug>' });
const r = run(bin('tsc'), ['--noEmit', '-p', gameDir], { stdio: 'inherit' });
if (r.status === 0) console.log('TYPECHECK-OK');
process.exit(r.status);
