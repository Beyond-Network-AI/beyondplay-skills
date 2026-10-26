// Small file helpers shared by the checks.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const DEFAULT_IGNORE = new Set(['node_modules', 'dist', '.git', '.DS_Store']);

export const toPosix = (p) => p.split(sep).join('/');

/** Every regular file under `root` (symlinks skipped), as { abs, rel, size }, sorted by rel. */
export function walk(root, ignore = DEFAULT_IGNORE) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ignore.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) visit(abs);
      else if (entry.isFile()) out.push({ abs, rel: toPosix(relative(root, abs)), size: statSync(abs).size });
    }
  };
  visit(root);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export const readText = (abs) => readFileSync(abs, 'utf8');

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export const ext = (rel) => {
  const i = rel.lastIndexOf('.');
  return i < 0 ? '' : rel.slice(i + 1).toLowerCase();
};

export const isPowerOfTwo = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/** Apply the three archive limits (count, total, per file) with the given issue codes. */
export function checkSizeLimits(report, files, limits, codes, what) {
  const total = files.reduce((n, f) => n + f.size, 0);
  if (files.length > limits.maxFiles) {
    report.error(codes.files, '.', `${what} has ${files.length} files; the limit is ${limits.maxFiles}.`, `Remove generated or unused files (build output, raw takes, docs) until the ${what} is under ${limits.maxFiles} files.`, { docs: limits.docs });
  }
  if (total > limits.maxTotalBytes) {
    report.error(codes.total, '.', `${what} is ${fmtBytes(total)}; the limit is ${fmtBytes(limits.maxTotalBytes)}.`, `Shrink or drop the largest files (list: the ${codes.file} issues, or sort by size).`, { docs: limits.docs });
  }
  for (const f of files) {
    if (f.size > limits.maxFileBytes) {
      report.error(codes.file, f.rel, `${fmtBytes(f.size)} is over the ${fmtBytes(limits.maxFileBytes)} per-file limit.`, 'Compress it (webp/meshopt/audio bitrate) or split it; the hosted upload refuses it as is.', { docs: limits.docs });
    }
  }
  return { total, count: files.length };
}
