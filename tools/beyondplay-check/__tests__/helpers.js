// Shared test helpers: temp dirs, a real game copied in, and tiny generated assets.
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '../../..');
export const TEMPLATE = join(REPO, 'template');
/** The kit's template is a complete game (Tap Timing) that passes the check as shipped. */
export const PASSING_GAME = TEMPLATE;
export const BIN = resolve(HERE, '../bin/beyondplay-check.mjs');

export const tmp = (prefix) => mkdtempSync(join(tmpdir(), prefix));

export function copyGame(dest) {
  cpSync(PASSING_GAME, dest, { recursive: true, filter: (src) => !/[\\/](node_modules|dist)([\\/]|$)/.test(src) });
  return dest;
}

export function write(abs, content) {
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

export const codes = (report) => report.issues.map((i) => i.code);
export const issue = (report, code) => report.issues.find((i) => i.code === code);

/** A valid 8-bit RGB PNG of the given size (black), generated without any image library. */
export function png(width, height) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const row = Buffer.alloc(1 + width * 3); // filter byte + pixels
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
