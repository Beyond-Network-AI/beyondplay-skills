// Static source scan: the test hook, the game-over call, external hosts, wallet
// or NFT gating, and the mobile rules that a regex can see. Third-party brands
// are the reviewer's call; no list of names lives here.
// Template-owned files are skipped here (they are checked by hash instead).
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ext } from './files.js';
import { DOCS } from './limits.js';
import { CAPABILITY_NAMES } from './rules.js';

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
/** A link or navigation out of the game (publish tier): an href, window.open or location change to a host that is not the platform's. */
const LINK_CONTEXT = /\bhref\s*[:=]|window\.open\s*\(|location\.(?:href|assign|replace)\s*[=(]|\btarget\s*[:=]\s*['"]_blank['"]/i;
/** Identity prompts: the player is signed in to the platform; a game never asks. */
const NAME_PROMPT = /\bwindow\.prompt\s*\(|(?<![.\w])prompt\s*\(|enter (?:your |a |the )?(?:name|nickname|username|email)|\byour name\b|\bplayer name\b|\bnickname\b|type=["']email["']/i;
/** Share buttons and intents: the platform's share lives around the game, not in it. */
const SHARE_INTENT = /(?:twitter|x)\.com\/intent|navigator\.share\s*\(|navigator\.clipboard\.writeText|\bshare (?:on|to) (?:x|twitter)\b/i;
/** A share control of the game's own; fine in a file that routes it through request('share'). */
const SHARE_LABEL = />\s*share\s*<|(?<!request\(\s*)['"]share['"]\s*[,)]/i;
const SHARE_REQUEST = /\brequest\s*\(\s*['"]share['"]/;
/** A platform capability request: request('share'), request("player.profile", ...). */
const CAPABILITY_CALL = /\brequest\s*\(\s*['"]([a-z][a-z0-9.]*)['"]/g;
/** A gate before play: a Play or Start button, a splash, a "created by" card, a skip control. */
const START_GATE = />\s*(?:play|start|tap to (?:play|start)|begin|let'?s go)\s*<|\bcreated by\b|>\s*skip\b|['"](?:title|splash|menu|intro)['"]\s*[:=]|phase\s*===?\s*['"](?:title|menu|splash|intro)['"]/i;
const INSTRUCTION_TEXT = /\b(?:tap|swipe|hold|drag|flick) to \w+|how to play|\binstructions?\b/i;
const DAILY_REWARD = /daily (?:bonus|reward|gift|login|streak)|login bonus|once (?:per|a) day/i;
const WALL_CLOCK = /\b(?:Date\.now|performance\.now)\s*\(/g;
const GAME_OVER = /\.submit\s*\(|\.endRun\s*\(|BeyondPlay\??\.gameOver\s*\(/;
const LEADERBOARD = /\.leaderboard\s*\(/;
/** The simulation file the contract names; items never reach it (GAME_ITEM_IN_SIMULATION). */
const SIMULATION_FILE = 'src/game.ts';
const ITEM_IN_SIMULATION = /player\.items|PlayerItem/;
/** The one capability whose `uses` entry names a collection: 'player.items:cobi'. */
const COLLECTION_CAPABILITY = 'player.items';
const COLLECTION_SLUG = /^[a-z0-9][a-z0-9-]*$/;

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

  // Items change how a run looks and sounds, never how it plays: the string player.items (or
  // PlayerItem) in the simulation file is the listing-tier pointer (contract.md > 9. Player items).
  const simulation = sources.find((s) => s.rel === SIMULATION_FILE);
  if (simulation) {
    const at = simulation.text.split('\n').findIndex((line) => ITEM_IN_SIMULATION.test(line));
    if (at >= 0) {
      report.error('GAME_ITEM_IN_SIMULATION', simulation.rel, `player.items (or PlayerItem) appears in ${SIMULATION_FILE}; the simulation never sees an item, so a duel replays the same for both players.`, 'Request items in src/App.tsx and keep what they decide (the model, a trail, a sound, the name on the end card) in the renderer; nothing the simulation reads comes from an item or a trait.', { line: at + 1, docs: DOCS.playerItems });
    }
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
        const link = LINK_CONTEXT.test(line) && !COMMENT_LINE.test(line);
        once(`url:${host}:${link ? 'link' : request}`, () => {
          if (link) report.error('GAME_EXTERNAL_LINK', s.rel, `Links out of the game to ${host} (${m[0]}); a game shows nothing that leaves it.`, 'Remove the link. The game page around the game carries the platform\'s links; marketplaces and social sites are never linked from inside a game.', { line: no, docs: DOCS.porting });
          else if (request) report.error('GAME_EXTERNAL_REQUEST', s.rel, `Loads from or talks to ${host} (${m[0]}); games may only call beyondplay.xyz hosts.`, 'Bundle the asset or data with the game, or drop the call; external calls fail under the platform CSP and are stripped when porting.', { line: no, docs: DOCS.porting });
          else report.info('GAME_EXTERNAL_URL', s.rel, `Mentions an external URL (${m[0]}); make sure nothing is fetched from it at runtime.`, 'Fine in a comment or credit line; otherwise bundle the resource.', { line: no, docs: DOCS.porting });
        });
      }
      for (const re of WALLET) {
        if (re.test(line)) once(`wallet:${re.source}`, () => report.error('GAME_WALLET_GATING', s.rel, `Wallet or token-gating pattern ${re.source.replace(/\\b/g, '')} found; games never connect wallets or gate on NFTs, the platform owns identity.`, 'Remove the wallet code; the platform owns identity and the kit reports scores.', { line: no, docs: DOCS.porting }));
      }
      if (!COMMENT_LINE.test(line)) {
        if (NAME_PROMPT.test(line)) once('nameprompt', () => report.error('GAME_NAME_PROMPT', s.rel, 'Asks the player for a name or other identity; the player is signed in to the platform and a game never asks.', 'Remove the prompt or field. Scores post to the signed-in account through challenge.submit; the shell knows who is playing.', { line: no, docs: DOCS.contract }));
        if (SHARE_INTENT.test(line) || (SHARE_LABEL.test(line) && !SHARE_REQUEST.test(s.text))) once('share', () => report.warning('GAME_SHARE_BUTTON', s.rel, 'A share intent, social card or clipboard write of the game\'s own; the platform shares the game with its own card.', 'Replace it with request(\'share\', { score }) from src/beyondplay-platform.ts and declare uses: [\'share\']; the host opens the platform\'s sheet.', { line: no, docs: DOCS.capabilities }));
        if (START_GATE.test(line)) once('startgate', () => report.warning('GAME_START_GATE', s.rel, 'A Play or Start control, splash or "created by" card: the feed card must already be playing when it scrolls in.', 'Boot straight into a run; put restart on the end card and any picker behind a small settings control or after game over.', { line: no, docs: DOCS.mobile }));
        if (INSTRUCTION_TEXT.test(line)) once('instructions', () => report.warning('GAME_INSTRUCTION_TEXT', s.rel, 'Instruction text ("tap to", "how to play") in the UI.', 'Remove it; the first seconds of a run teach the one input.', { line: no, docs: DOCS.mobile }));
        if (DAILY_REWARD.test(line)) once('daily', () => report.info('GAME_DAILY_REWARD', s.rel, 'A daily reward or login bonus inside the game; it reads the wall clock and the platform cannot see it.', 'Keep rewards cosmetic and local, or ask the platform for a daily challenge; never purchase or earnings language.', { line: no, docs: DOCS.contract }));
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

/**
 * Library assets. A file under public/assets/library/ came from the asset library
 * (add_asset), which also gives its CREDITS.md line, tagged "[library: <id>]" where
 * the id is the file's path under that folder without its extension. A file with no
 * such line is a listing finding: the credit is how the licence travels with the game.
 */
export function checkLibraryCredits(gameDir, files, report) {
  const PREFIX = 'public/assets/library/';
  const lib = files.filter((f) => f.rel.startsWith(PREFIX));
  if (!lib.length) return;
  const credits = files.find((f) => /^credits\.md$/i.test(f.rel));
  const text = credits ? readFileSync(credits.abs, 'utf8') : '';
  const missing = lib.filter((f) => !text.includes(`[library: ${f.rel.slice(PREFIX.length).replace(/\.[a-z0-9]+$/i, '')}]`));
  if (!missing.length) return;
  const names = missing.slice(0, 3).map((f) => f.rel).join(', ');
  report.warning('GAME_LIBRARY_CREDIT_MISSING', missing[0].rel, `${missing.length} library asset${missing.length === 1 ? ' has' : 's have'} no line in CREDITS.md: ${names}${missing.length > 3 ? ', ...' : ''}.`, 'Add the credits line add_asset gave for each (under "## Library assets" in CREDITS.md), or remove the file.', { docs: DOCS.playbookAudio });
}

/**
 * The HUD kit: a game that draws its own score, buttons and end card is noted for the reviewer.
 * A game that imports the kit anywhere in src/ passes; the check never blocks a build.
 */
export function checkHud(files, report) {
  const sources = files.filter((f) => /^src\/.+\.(tsx?|jsx?)$/.test(f.rel) && f.rel !== 'src/beyondplay-hud.tsx');
  if (!sources.length) return;
  const uses = sources.some((f) => /from\s+['"]\.{1,2}\/(?:[\w-]+\/)*beyondplay-hud['"]/.test(readFileSync(f.abs, 'utf8')));
  if (uses) return;
  report.warning('GAME_HUD_NOT_KIT', 'src/App.tsx', 'The game does not use the HUD kit (src/beyondplay-hud.tsx) for what it shows over the play.', 'Build the score, the timer, lives, buttons and the end card from ./beyondplay-hud (Hud, HudRow, Stat, Timer, Hearts, Meter, HudButton, Stick, EndCard); setHudTheme() changes its colours.');
}

/** A `uses` entry split into the capability and, for player.items, its collection ('player.items:cobi'). */
export function parseUse(entry) {
  const i = entry.indexOf(':');
  if (i < 0) return { name: entry, collection: null };
  return { name: entry.slice(0, i), collection: entry.slice(i + 1) };
}

/**
 * The platform capabilities the game asks for (request('name') calls outside
 * the template-owned files): each must be one the contract lists and, when the
 * manifest is known, one the config declares in `uses`. The names are recorded
 * as the report fact `uses` so the hosted check and the reviewer see them;
 * where the config declares a collection for a requested capability
 * ('player.items:cobi'), the fact keeps the declared entry, so the reviewer
 * sees which collection the game asks for. A request('player.items') is
 * declared by any 'player.items:<slug>' entry; a bare 'player.items' declares
 * no collection and is GAME_CAPABILITY_UNDECLARED. Whether a slug names a
 * collection the platform offers cannot be checked locally (the registry lives
 * on the platform; get_contract serves it, and the host answers denied for one
 * the manifest does not declare), so only the slug's shape is checked here.
 */
export function checkCapabilities(files, templateOwned, manifest, report) {
  const found = new Map();
  for (const f of textFiles(files, templateOwned)) {
    const text = readFileSync(f.abs, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (COMMENT_LINE.test(line)) return;
      for (const m of line.matchAll(CAPABILITY_CALL)) {
        if (!found.has(m[1])) found.set(m[1], { rel: f.rel, line: i + 1 });
      }
    });
  }
  const names = [...found.keys()].sort();
  // A manifest without `uses` declared nothing; no manifest at all (the hosted check) leaves the declaration to the build.
  const declared = manifest ? (Array.isArray(manifest.uses) ? manifest.uses.filter((u) => typeof u === 'string') : []) : null;
  /** The collection entries the config declares, by capability ('player.items' -> ['player.items:cobi']). */
  const collections = new Map();
  for (const entry of declared ?? []) {
    const { name, collection } = parseUse(entry);
    if (collection === null || name !== COLLECTION_CAPABILITY) continue;
    if (!collections.has(name)) collections.set(name, []);
    collections.get(name).push(entry);
  }
  report.fact('uses', names.map((name) => (collections.has(name) ? collections.get(name) : [name])).flat());
  for (const name of names) {
    const at = found.get(name);
    if (!CAPABILITY_NAMES.includes(name)) {
      report.error('GAME_CAPABILITY_UNKNOWN', at.rel, `request('${name}') asks for a capability the contract does not list; the host answers it as unsupported.`, `Use one of: ${CAPABILITY_NAMES.join(', ')}. get_contract on the creator MCP serves the table with what each returns.`, { line: at.line, docs: DOCS.capabilities });
    } else if (declared && name === COLLECTION_CAPABILITY && !collections.has(name)) {
      // A bare 'player.items' in uses names no collection; the host answers denied for one the manifest does not declare.
      report.error('GAME_CAPABILITY_UNDECLARED', at.rel, `request('${name}') is used but ${declared.includes(name) ? `a bare '${name}' in uses names no collection` : 'uses carries no player.items:<collection> entry'}; declare the collection: uses: ['player.items:cobi'].`, `Declare the collection in src/beyondplay.config.ts (defineSoloGame({ challenge, uses: ['player.items:cobi'] })) and request('player.items', { collection: 'cobi' }) in src/App.tsx.`, { line: at.line, docs: DOCS.playerItems });
    } else if (declared && name !== COLLECTION_CAPABILITY && !declared.includes(name)) {
      report.error('GAME_CAPABILITY_UNDECLARED', at.rel, `request('${name}') is used but the config does not declare it.`, `Add '${name}' to uses in src/beyondplay.config.ts: defineSoloGame({ challenge, uses: ['${name}'] }).`, { line: at.line, docs: DOCS.capabilities });
    }
  }
  if (declared) {
    for (const entry of declared) {
      const { name, collection } = parseUse(entry);
      if (!CAPABILITY_NAMES.includes(name)) report.warning('GAME_CAPABILITY_UNKNOWN', 'src/beyondplay.config.ts', `uses declares '${entry}', which the contract does not list.`, `Declare only: ${CAPABILITY_NAMES.join(', ')} (player.items with its collection: player.items:cobi).`, { docs: DOCS.capabilities });
      else if (collection !== null && name !== COLLECTION_CAPABILITY) report.warning('GAME_CAPABILITY_UNKNOWN', 'src/beyondplay.config.ts', `uses declares '${entry}'; only player.items takes a collection after the colon.`, `Declare '${name}' on its own.`, { docs: DOCS.capabilities });
      else if (collection !== null && !COLLECTION_SLUG.test(collection)) report.warning('GAME_CAPABILITY_UNKNOWN', 'src/beyondplay.config.ts', `uses declares '${entry}'; a collection slug is lowercase letters, digits and hyphens ('cobi').`, `Declare the slug as the platform lists it: get_contract on the creator MCP serves the collections offered to games.`, { docs: DOCS.playerItems });
    }
  }
  return names;
}
