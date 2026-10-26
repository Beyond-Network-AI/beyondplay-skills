// Static source scan: the test hook, the game-over call, external hosts, wallet
// or NFT gating, and the mobile rules that a regex can see. Third-party brands
// are the reviewer's call; no list of names lives here.
// Template-owned files are skipped here (they are checked by hash instead).
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ext } from './files.js';
import { DOCS } from './limits.js';

const TEXT_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'html', 'css', 'svelte', 'vue']);
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const AUDIO_EXT = new Set(['mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac', 'opus']);

/** Hosts a game may talk to: the platform's own, the dev loopbacks, the template's fonts, and XML namespaces. */
const ALLOWED_HOST = /^(?:(?:[a-z0-9-]+\.)*beyondplay\.xyz|(?:[a-z0-9-]+\.)*acc\.fun|localhost|127\.0\.0\.1|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.w3\.org|schema\.org)$/i;
const URL_RE = /\b(?:https?|wss?):\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)(?::\d+)?/gi;
const REQUEST_CONTEXT = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|import|open|load)\s*\(|\bnew\s+(?:Audio|Image|Worker|WebSocket)\b|\b(?:src|href|url|uri|endpoint|rpc|api|baseurl)\b\s*[:=]|url\(/i;
const COMMENT_LINE = /^\s*(?:\/\/|\/?\*|<!--|#)/;

/** Wallet connection and token gating; the platform owns identity, games never ask for a wallet. */
const WALLET = [
  /window\.ethereum\b/, /\beth_requestAccounts\b/, /\bwallet_switchEthereumChain\b/, /\bpersonal_sign\b/, /\beth_signTypedData/,
  /connect\s+(?:your\s+|a\s+)?wallet/i, /walletconnect/i, /web3modal/i, /\bwagmi\b/, /rainbowkit/i, /\bwindow\.solana\b/, /@solana\/wallet-adapter/,
  /\b(?:ownerOf|tokenOfOwnerByIndex|isApprovedForAll)\s*\(/, /\bbalanceOf\s*\(/,
];

const MOUSE_TOUCH = /\bon(?:Mouse(?:Down|Move|Up)|Touch(?:Start|End))\b|addEventListener\(\s*['"](?:mousedown|mousemove|mouseup|touchstart|touchend)['"]/;
const WALL_CLOCK = /\b(?:Date\.now|performance\.now)\s*\(/g;
const GAME_OVER = /\.submit\s*\(|\.endRun\s*\(|BeyondPlay\??\.gameOver\s*\(/;
const LEADERBOARD = /\.leaderboard\s*\(/;

export function textFiles(files, templateOwned) {
  return files.filter((f) => TEXT_EXT.has(ext(f.rel)) && !templateOwned.has(f.rel) && f.size <= MAX_TEXT_BYTES && !f.rel.includes('/vendor/') && !f.rel.startsWith('vendor/'));
}

export function scanSource(gameDir, files, templateOwned, report) {
  const sources = textFiles(files, templateOwned).map((f) => ({ ...f, text: readFileSync(f.abs, 'utf8') }));
  const all = sources.map((s) => s.text).join('\n');

  // The test hook the smoke ladder drives (contract.md > 6. The test hook): window.__bpTest with tick/state/reset under ?bp_test=1.
  const hookFiles = sources.filter((s) => /__bpTest\s*=/.test(s.text));
  if (!hookFiles.length) {
    report.error('GAME_TEST_HOOK_MISSING', 'src', 'No `window.__bpTest = {...}` assignment found; the smokes (render, seed) wait for it and drive the game through it.', 'Under `?bp_test=1` expose `window.__bpTest = { tick(n), state(), reset(), <your input verb>AtStep(step, ...) }` and make the rAF loop draw but not step in test mode.', { docs: DOCS.testHook });
  } else {
    const hookText = hookFiles.map((s) => s.text).join('\n');
    const missing = ['tick', 'state', 'reset'].filter((m) => !new RegExp(`\\b${m}\\s*[:(]`).test(hookText));
    if (missing.length) {
      report.error('GAME_TEST_HOOK_INCOMPLETE', hookFiles[0].rel, `__bpTest is defined but ${missing.join(', ')} ${missing.length === 1 ? 'was' : 'were'} not found on it.`, 'The hook needs tick(n) (advance n fixed steps), state() (with phase, score and a per-step hash) and reset().', { docs: DOCS.testHook });
    }
    if (!/bp_test/.test(all)) {
      report.warning('GAME_TEST_HOOK_UNGATED', hookFiles[0].rel, '__bpTest is set but nothing reads the `bp_test` URL parameter; the hook should only exist in test mode.', 'Gate it on `new URLSearchParams(location.search).get("bp_test") === "1"`, where the rAF loop also stops stepping.', { docs: DOCS.testHook });
    }
  }

  // The game-over contract: one finished-run report through the kit.
  if (!GAME_OVER.test(all)) {
    report.error('GAME_GAME_OVER_MISSING', 'src', 'No challenge.submit(score), game.endRun(score) or window.BeyondPlay?.gameOver() call found: the run is never reported.', 'Call challenge.submit(finalScore) exactly once when the run ends.', { docs: DOCS.contract });
  }

  for (const s of sources) {
    const lines = s.text.split('\n');
    const seen = new Set();
    const once = (key, fn) => { if (!seen.has(key)) { seen.add(key); fn(); } };
    let clockHits = 0;
    let clockLine = 0;
    lines.forEach((line, idx) => {
      const no = idx + 1;
      for (const m of line.matchAll(URL_RE)) {
        const host = m[1];
        if (ALLOWED_HOST.test(host)) continue;
        const request = REQUEST_CONTEXT.test(line) && !COMMENT_LINE.test(line);
        once(`url:${host}:${request}`, () => {
          if (request) report.warning('GAME_EXTERNAL_REQUEST', s.rel, `Loads from or talks to ${host} (${m[0]}); games may only call beyondplay.xyz hosts.`, 'Bundle the asset or data with the game, or drop the call; external calls fail under the platform CSP and are stripped when porting.', { line: no, docs: DOCS.porting });
          else report.info('GAME_EXTERNAL_URL', s.rel, `Mentions an external URL (${m[0]}); make sure nothing is fetched from it at runtime.`, 'Fine in a comment or credit line; otherwise bundle the resource.', { line: no, docs: DOCS.porting });
        });
      }
      for (const re of WALLET) {
        if (re.test(line)) once(`wallet:${re.source}`, () => report.error('GAME_WALLET_GATING', s.rel, `Wallet or token-gating pattern ${re.source.replace(/\\b/g, '')} found; games never connect wallets or gate on NFTs, the platform owns identity.`, 'Remove the wallet code; the platform owns identity and the kit reports scores.', { line: no, docs: DOCS.porting }));
      }
      if (MOUSE_TOUCH.test(line)) once('mousetouch', () => report.warning('GAME_MOUSE_TOUCH_EVENTS', s.rel, 'Mouse or touch event handlers found; mobile input must use pointer events only.', 'Use pointerdown/move/up/cancel with setPointerCapture (a non-passive touchmove guard that only cancels scrolling is fine).', { line: no, docs: DOCS.mobile }));
      if (/\b100vh\b/.test(line)) once('100vh', () => report.warning('GAME_VIEWPORT_100VH', s.rel, '100vh found; on iOS the URL bar makes it jump.', 'Use 100% or 100dvh heights and letterbox the canvas to window.innerWidth/innerHeight.', { line: no, docs: DOCS.mobile }));
      if (LEADERBOARD.test(line)) once('leaderboard', () => report.warning('GAME_DIRECT_LEADERBOARD', s.rel, 'Calls .leaderboard() directly; the duel board is scored only through challenge.submit().', 'Reading a board for display is fine; never submit the duel score yourself.', { line: no, docs: DOCS.contract }));
      const clocks = line.match(WALL_CLOCK);
      if (clocks) { clockHits += clocks.length; clockLine ||= no; }
    });
    if (clockHits) {
      report.info('GAME_WALL_CLOCK', s.rel, `${clockHits} wall-clock read${clockHits === 1 ? '' : 's'} (Date.now / performance.now); simulation time must be a step counter and run content must come from the seed.`, 'Keep these to cosmetic timing (render, audio, UI); the seed smoke fails if gameplay depends on them.', { line: clockLine, docs: DOCS.contract });
    }
  }
}

/** publish.config.json: the listing text the submit step passes to set_metadata. */
export function checkPublishConfig(gameDir, report) {
  const rel = 'publish.config.json';
  const abs = join(gameDir, rel);
  if (!existsSync(abs)) {
    report.warning('GAME_PUBLISH_CONFIG_MISSING', rel, 'publish.config.json is missing; the submit step reads the listing (name, tagline, description, tags, ageRating) from it.', 'Create it with slug, name, tagline, description, tags, ageRating and visibility ("unlisted" first); npm run new-game writes one.', { docs: DOCS.publishing });
    return null;
  }
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    report.error('GAME_PUBLISH_CONFIG_INVALID', rel, `publish.config.json is not valid JSON: ${err.message}`, 'Fix the JSON.', { docs: DOCS.publishing });
    return null;
  }
  for (const k of ['slug', 'name']) {
    if (!cfg[k]) report.error('GAME_PUBLISH_CONFIG_INVALID', rel, `publish.config.json is missing "${k}"; the listing needs it.`, `Set "${k}".`, { docs: DOCS.publishing });
  }
  if (cfg.visibility !== undefined && !['listed', 'unlisted'].includes(cfg.visibility)) {
    report.error('GAME_PUBLISH_CONFIG_INVALID', rel, `visibility is "${cfg.visibility}"; only "unlisted" or "listed" are accepted.`, 'Publish unlisted first; listing goes through submit_for_review.', { docs: DOCS.publishing });
  }
  if (cfg.slug && cfg.slug !== basename(gameDir)) {
    report.warning('GAME_PUBLISH_SLUG_MISMATCH', rel, `slug "${cfg.slug}" differs from the folder name "${basename(gameDir)}".`, 'Keep the folder and the slug the same; the live URL is https://<slug>.beyondplay.xyz.', { docs: DOCS.publishing });
  }
  return cfg;
}

/** The checks play the game through games/<slug>/smoke.driver.mjs; without it they can only run idle. */
export function checkSmokeDriver(gameDir, report) {
  if (existsSync(join(gameDir, 'smoke.driver.mjs'))) return;
  report.warning('GAME_SMOKE_DRIVER_MISSING', 'smoke.driver.mjs', 'No smoke.driver.mjs: the render and seed checks can only play an idle run, which most games never finish.', 'Copy template/smoke.driver.mjs and make play() reach game over with a score through your __bpTest verb; script() is a fixed input schedule for the seed check.', { docs: DOCS.smoke });
}

/** publish_unlisted refuses a project with no icon; the banner is optional. */
export function checkArt(gameDir, report) {
  const has = (names) => names.some((n) => existsSync(join(gameDir, 'assets', n)));
  if (!has(['icon.png', 'icon.jpg', 'icon.jpeg'])) {
    report.warning('GAME_ART_MISSING', 'assets/icon.png', 'assets/icon.png is missing; publishing refuses a game with no 512 x 512 icon (no logo on cards and share surfaces).', 'Draw it in assets/icon-source.html, then: npm run render-icon -- games/<slug>. The submit step uploads it with set_icon.', { docs: DOCS.publishing });
  }
  if (!has(['banner.jpg', 'banner.jpeg', 'banner.png'])) {
    report.info('GAME_ART_BANNER_MISSING', 'assets/banner.jpg', 'No assets/banner.jpg (1920 x 1080); the game page and link previews fall back to the icon.', 'Optional: draw it in assets/banner-source.html, then: npm run render-banner -- games/<slug>.', { docs: DOCS.publishing });
  }
}

/**
 * Audio licence note. The rule (creator terms, 2026-10-24): every track is owned, CC0
 * or commercially licensed, and named in a CREDITS.md with source and licence; the
 * creator attests to the list. A validator can only see that the note exists, not that
 * the licence is real, so this is a WARNING for the reviewer's eye.
 */
export function checkAudioLicence(gameDir, files, report) {
  const audio = files.filter((f) => AUDIO_EXT.has(ext(f.rel)));
  if (!audio.length) return;
  const NOTE = /^(?:credits|licen[cs]e|notice|attribution)s?(?:[.\-_]|$)|licen[cs]e/i;
  if (files.some((f) => NOTE.test(basename(f.rel)))) return;
  report.warning('GAME_AUDIO_LICENCE_MISSING', audio[0].rel, `${audio.length} audio file${audio.length === 1 ? '' : 's'} shipped but no CREDITS.md (or LICENCE note) found in the game folder.`, 'Add a CREDITS.md naming each track: title, author, source and licence. The licence must allow commercial games (CC0 is the default; the creator attests to the list on submission).', { docs: DOCS.playbookAudio });
}
