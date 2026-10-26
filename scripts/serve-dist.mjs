// Tiny static server for a built game's dist/ (used by the smoke scripts).
// Exports startServer(distDir) -> { port, close } and runs standalone:
//   node scripts/serve-dist.mjs games/<slug>/dist [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export function startServer(distDir, port = 0) {
  const root = resolve(distDir);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let path = decodeURIComponent(url.pathname);
      if (path === '/' || path === '') path = '/index.html';
      const file = join(root, path);
      if (!file.startsWith(root)) { res.statusCode = 403; res.end(); return; }
      const body = await readFile(file);
      res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  return new Promise((resolveP) => {
    server.listen(port, '127.0.0.1', () => {
      resolveP({ port: server.address().port, close: () => server.close() });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) { console.error('usage: node scripts/serve-dist.mjs games/<slug>/dist [port]'); process.exit(2); }
  const { port } = await startServer(process.argv[2], Number(process.argv[3] ?? 0));
  console.log(`serving on http://127.0.0.1:${port}`);
}
