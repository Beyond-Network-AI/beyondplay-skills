// Shared helpers for the kit's scripts: the repository root, the game folder
// behind an argument, and a child-process runner that fails loudly.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;

/** The game folder named by a path (`games/<slug>`, its `dist`, or a bare slug). */
export function resolveGame(arg, { usage } = {}) {
  if (!arg) {
    console.error(usage ?? 'usage: <script> games/<slug>');
    process.exit(2);
  }
  let abs = resolve(arg);
  if (!existsSync(abs) && SLUG_RE.test(arg)) abs = resolve(KIT_ROOT, 'games', arg);
  if (basename(abs) === 'dist') abs = dirname(abs);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    console.error(`${arg} is not a game folder`);
    process.exit(2);
  }
  return { gameDir: abs, dist: resolve(abs, 'dist'), slug: basename(abs) };
}

/** Run a command in the kit root; returns { status, stdout, stderr } without throwing. */
export function run(cmd, args, opts = {}) {
  const p = spawnSync(cmd, args, { cwd: KIT_ROOT, encoding: 'utf8', shell: process.platform === 'win32', ...opts });
  return { status: p.status ?? 1, stdout: p.stdout ?? '', stderr: p.stderr ?? '', error: p.error };
}

/** The `npx`-free way to run a package binary that the root install provides. */
export function bin(name) {
  return resolve(KIT_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
}
