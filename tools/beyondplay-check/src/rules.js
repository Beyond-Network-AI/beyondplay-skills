// The rules, in one table, shared by the local validator, the hosted check and
// the creator MCP (get_contract, check_concept). Every issue code the checks
// emit maps to a rule here; every rule says what it enforces and when:
//
//   tier "publish": refused mechanically, at upload and at publish. No judgment.
//   tier "listing": allowed unlisted (the playground), refused at listing; the
//                   reviewer's approve button waits for them.
//   tier "review":  the reviewer's eye; the checks only point.
//
// `instead` names the platform's way to get the same outcome, so an agent can
// tell the creator what to do rather than what not to do.

export const TIERS = ['publish', 'listing', 'review'];

export const RULES = [
  // ── shape ────────────────────────────────────────────────────────────────
  { code: 'GAME_CONFIG_MISSING', tier: 'publish', rule: 'src/beyondplay.config.ts declares the game; the build emits beyondplay.json from it.', instead: 'Keep the template\'s config and edit only the define* arguments.' },
  { code: 'GAME_CONFIG_BUILD_FAILED', tier: 'publish', rule: 'The config must build and only call the kit\'s define* functions at import time.' },
  { code: 'GAME_CONFIG_INVALID', tier: 'publish', rule: 'The challenge declaration must be well formed (metricLabel, bounds, instanceKind).' },
  { code: 'GAME_CONFIG_BOARD_MISMATCH', tier: 'publish', rule: 'A run reports exactly once, on the declared board.' },
  { code: 'GAME_TEMPLATE_FILE_MISSING', tier: 'publish', rule: 'The platform-owned files ship unchanged: index.html, src/main.tsx, src/beyondplay-kit.ts.' },
  { code: 'GAME_TEMPLATE_FILE_MODIFIED', tier: 'publish', rule: 'The platform-owned files ship unchanged; only <title> in index.html may change.', instead: 'Copy the file back from the template; the hosted build keeps the platform\'s copy anyway.' },
  { code: 'GAME_SOURCE_TOO_MANY_FILES', tier: 'publish', rule: 'At most 1,500 files in the source archive.' },
  { code: 'GAME_SOURCE_TOO_LARGE', tier: 'publish', rule: 'At most 50 MB of source.' },
  { code: 'GAME_SOURCE_FILE_TOO_LARGE', tier: 'publish', rule: 'At most 10 MB per file.' },
  { code: 'GAME_PUBLISH_CONFIG_INVALID', tier: 'publish', rule: 'publish.config.json is valid JSON with a slug and a name.' },
  // ── identity, network, money ─────────────────────────────────────────────
  { code: 'GAME_WALLET_GATING', tier: 'publish', rule: 'No wallet connection and no token or NFT gating in a game; the platform owns identity.', instead: 'Cosmetic use of owned items is fine when the platform hands them over (request(\'player.items\'), a later phase); nothing is unlocked by holding an asset.' },
  { code: 'GAME_EXTERNAL_REQUEST', tier: 'publish', rule: 'No network calls beyond the platform\'s own hosts: no CDNs, fonts, APIs or analytics.', instead: 'Bundle the asset or data with the game.' },
  { code: 'GAME_EXTERNAL_LINK', tier: 'publish', rule: 'No links out of a game: no marketplaces, social sites or external pages.', instead: 'The game page around the game carries the platform\'s links; a game shows nothing that leaves it.' },
  { code: 'GAME_NAME_PROMPT', tier: 'publish', rule: 'A game never asks the player for a name, an email or any identity; the player is signed in to the platform.', instead: 'The shell knows the player: request(\'player.profile\') from src/beyondplay-platform.ts returns their display name and avatar when they allow it; scores post to their account through challenge.submit.' },
  { code: 'GAME_SHARE_BUTTON', tier: 'listing', rule: 'No share intents, social cards or clipboard writes of the game\'s own; a share control may only call request(\'share\'), which opens the platform\'s sheet with the game\'s card.', instead: 'request(\'share\', { score }) from src/beyondplay-platform.ts, with uses: [\'share\'] declared in the config; the platform shares the game page with its own card and rewards sharing itself.' },
  { code: 'GAME_CAPABILITY_UNKNOWN', tier: 'listing', rule: 'A game asks the platform only for the capabilities the contract lists (CAPABILITIES below); the host answers anything else as unsupported.', instead: 'Use a listed name; get_contract on the creator MCP serves the live table with what each returns.' },
  { code: 'GAME_CAPABILITY_UNDECLARED', tier: 'listing', rule: 'Every capability a game requests is declared in uses (defineSoloGame({ uses }) or declareUses), so the reviewer and the player see what the game asks for.', instead: 'Add the name to uses in src/beyondplay.config.ts.' },
  { code: 'GAME_DIRECT_LEADERBOARD', tier: 'listing', rule: 'The duel board is scored only through challenge.submit; reading a board for display is fine.' },
  // ── the feed ─────────────────────────────────────────────────────────────
  { code: 'GAME_START_GATE', tier: 'listing', rule: 'The feed card is already playing when it scrolls in: no title screen, no Play or Start button, no splash, no "created by" card, no picker before play.', instead: 'Boot straight into a run; put the restart on the end card and any picker behind a small settings control or after game over.' },
  { code: 'GAME_INSTRUCTION_TEXT', tier: 'listing', rule: 'No instruction text in the UI: "tap to", "swipe to", "hold to", "how to play".', instead: 'Teach by doing: the first seconds of a run show the one input.' },
  { code: 'GAME_WALL_CLOCK', tier: 'listing', rule: 'Simulation time is a step counter and run content comes from the seed; no wall clock or unseeded randomness in the simulation.', instead: 'Date.now and Math.random are fine for cosmetics only; a daily reward or daily course is the platform\'s to run.' },
  { code: 'GAME_TEST_HOOK_MISSING', tier: 'listing', rule: 'Under ?bp_test=1 the game exposes window.__bpTest with tick, state and reset, so the checks and reviewers can play it.' },
  { code: 'GAME_TEST_HOOK_INCOMPLETE', tier: 'listing', rule: 'The test hook needs tick(n), state() with phase, score and a per-step hash, and reset().' },
  { code: 'GAME_TEST_HOOK_UNGATED', tier: 'review', rule: 'The test hook exists only in test mode.' },
  { code: 'GAME_SMOKE_DRIVER_MISSING', tier: 'listing', rule: 'smoke.driver.mjs tells the checks how to play the game to game over.' },
  { code: 'GAME_GAME_OVER_MISSING', tier: 'publish', rule: 'A finished run is reported exactly once through challenge.submit(score) or game.endRun(score).' },
  { code: 'GAME_MOUSE_TOUCH_EVENTS', tier: 'listing', rule: 'Pointer events only on phones.' },
  { code: 'GAME_VIEWPORT_100VH', tier: 'listing', rule: 'No 100vh; the iOS URL bar makes it jump.', instead: 'Use 100% or 100dvh.' },
  // ── weight ───────────────────────────────────────────────────────────────
  { code: 'GAME_BUNDLE_OVER_TARGET', tier: 'listing', rule: 'The first-frame download stays well under 1 MB gzipped.', instead: 'Draw in code, load heavy assets after the first frame, compress models and textures.' },
  { code: 'GAME_INITIAL_DOWNLOAD_TOO_LARGE', tier: 'publish', rule: 'At most 20 MB before the first frame on a phone.' },
  { code: 'GAME_PUBLISHED_WEIGHT_HEAVY', tier: 'listing', rule: 'A published game over 25 MB is slow to open on a phone and the feed preloads neighbouring cards; the check names the three largest files.', instead: 'Compress models and textures to the kit\'s targets, drop unused characters and realms, stream audio after the first frame.' },
  { code: 'GAME_BUNDLE_TOO_LARGE', tier: 'publish', rule: 'At most 100 MB published.' },
  { code: 'GAME_BUNDLE_TOO_MANY_FILES', tier: 'publish', rule: 'At most 500 files published.' },
  { code: 'GAME_BUNDLE_FILE_TOO_LARGE', tier: 'publish', rule: 'At most 10 MB per published file.' },
  // ── assets and listing ───────────────────────────────────────────────────
  { code: 'GAME_AUDIO_LICENCE_MISSING', tier: 'listing', rule: 'Every asset and track is owned, CC0 or commercially licensed, and named in CREDITS.md; the creator attests to the list on submission.' },
  { code: 'GAME_ART_MISSING', tier: 'publish', rule: 'A 512 x 512 icon is required to publish; the banner (1920 x 1080) is optional.' },
  { code: 'GAME_THIRD_PARTY_BRAND', tier: 'review', rule: 'No third-party brands, characters or logos without a written agreement; fan games carry the agreed disclaimer.' },
  { code: 'GAME_PUBLISH_CONFIG_MISSING', tier: 'review', rule: 'publish.config.json carries the listing text.' },
  { code: 'GAME_PUBLISH_SLUG_MISMATCH', tier: 'review', rule: 'The folder name and the slug match.' },
  { code: 'GAME_DAILY_REWARD', tier: 'review', rule: 'Rewards, currencies and unlocks inside a game are cosmetic and local; no purchase or earnings language, nothing the platform cannot see.', instead: 'Seasons, rewards and tokens are the platform\'s; ask for them rather than building them in.' },
];

const BY_CODE = new Map(RULES.map((r) => [r.code, r]));

/**
 * The capabilities a game may ask the platform for through
 * src/beyondplay-platform.ts (request(name, params)). The host answers; the
 * game never gates play on an answer and never feeds one into the seeded
 * simulation. A game runs inside the platform with no network of its own, so
 * what it is handed stays on the platform's screens; the listing discloses
 * what a game uses (the manifest's `uses`), and the platform can switch a
 * capability off for one game. Tiers: open (answered without asking the
 * player; everything offered today), platform (the platform runs it; the game
 * only reports), consent (reserved: only for something that would leave the
 * platform or identify the account, which nothing offered does). Later phases
 * add entries here without changing the door.
 */
export const CAPABILITIES = [
  { name: 'capabilities', tier: 'open', since: '2026-11-02', phase: 1, returns: 'string[]: the names this host offers.', note: 'Also on window.BeyondPlay.capabilities once the host has said hello.' },
  { name: 'host', tier: 'open', since: '2026-11-02', phase: 1, returns: '{ surface, locale, reducedMotion, authenticated, apiVersion }.', note: 'surface is feed, page, app, telegram, desktop or unknown.' },
  { name: 'player.profile', tier: 'open', since: '2026-11-02', phase: 1, returns: '{ displayName, handle, avatar } or null when the player is signed out.', note: 'Never an email, a wallet or an id. For a greeting or a name on the end card; scores still post through challenge.submit.' },
  { name: 'share', tier: 'open', since: '2026-11-02', phase: 1, params: '{ score?, text? }', returns: '{ outcome: "shared" | "copied" }; rejects with cancelled when the player dismisses the sheet.', note: 'The host opens its own share sheet with the game page and the score card; the game shows no card and writes no clipboard of its own.' },
  { name: 'player.items', tier: 'open', since: null, phase: 2, returns: 'Cosmetic items the player owns, as item ids and images from the platform\'s inventory, for a skin or a trail; nothing unlocks play and no wallet is read.', note: 'Not yet offered; the host answers unsupported.' },
  { name: 'player.stats', tier: 'open', since: null, phase: 2, returns: 'The player\'s best score and plays in this game, for a beat-your-best or a returning-player greeting.', note: 'Not yet offered.' },
  { name: 'player.friends', tier: 'open', since: null, phase: 2, returns: 'Display names and best scores of friends who played this game, for a ghost or a target; what the leaderboard already shows.', note: 'Not yet offered.' },
  { name: 'platform.season', tier: 'platform', since: null, phase: 3, returns: 'The current season and the player\'s standing.', note: 'Not yet offered.' },
];

export const CAPABILITY_NAMES = CAPABILITIES.map((c) => c.name);
/** The capabilities a host answers today (phase 1). */
export const OFFERED_CAPABILITIES = CAPABILITIES.filter((c) => c.since).map((c) => c.name);
export const capabilityFor = (name) => CAPABILITIES.find((c) => c.name === name) ?? null;
export const ruleFor = (code) => BY_CODE.get(code) ?? null;
export const tierOf = (code) => BY_CODE.get(code)?.tier ?? 'publish';

/**
 * Feature-level rules for check_concept: what a creator asks for, in words, and
 * the verdict before anything is built. Each entry matches the creator's
 * description or the features the agent lists; `allowed` is true, false or
 * 'conditional'; `code` ties it to the rule the checks enforce later.
 */
export const CONCEPT_RULES = [
  { id: 'title_screen', match: /\b(?:title|splash|intro|start|landing) ?(?:screen|page|card|menu)\b|\bplay button\b|\btap to start\b|\bmain menu\b|\bcreated by\b/i, allowed: false, code: 'GAME_START_GATE', verdict: 'No title screen, splash or Play button: the feed card is already playing when it scrolls in.', instead: 'Boot straight into a run; restart lives on the end card.' },
  { id: 'character_picker', match: /\b(?:character|bull|hero|avatar|skin|outfit|wardrobe) ?(?:select(?:or|ion)?|picker|chooser|roster)\b|\b(?:choose|pick|select) (?:your|a) (?:character|bull|hero|avatar|skin)\b|\bwardrobe\b/i, allowed: 'conditional', code: 'GAME_START_GATE', verdict: 'A picker is fine after game over or behind a small settings control, never before the first run.', instead: 'Start with a default; let the player change it on the end card.' },
  { id: 'name_entry', match: /\b(?:enter|type|ask(?:s|ing)? for|input) (?:your |their |a |the )?(?:name|nickname|username|email)\b|\bplayer name\b|\bname entry\b|\bleaderboard name\b/i, allowed: false, code: 'GAME_NAME_PROMPT', verdict: 'A game never asks for a name or any identity; the player is signed in.', instead: 'Scores post to the signed-in account through challenge.submit; request(\'player.profile\') gives the display name and avatar for a greeting or the end card.' },
  { id: 'share', match: /\bshare\b|\btweet\b|\bpost (?:to|on) x\b|\btwitter\b|\bsocial (?:card|post|button)\b|\bclipboard\b/i, allowed: 'conditional', code: 'GAME_SHARE_BUTTON', verdict: 'A share control is fine when it only calls request(\'share\'): the platform opens its own sheet with the game\'s card. No share intents, X cards or clipboard writes of the game\'s own.', instead: 'request(\'share\', { score }) from src/beyondplay-platform.ts with uses: [\'share\'] declared; rewards for sharing are the platform\'s.' },
  { id: 'external_link', match: /\bopensea\b|\bmarketplace link\b|\blink (?:out|to) (?:a |the )?(?:website|site|page|store|marketplace|discord|telegram)\b|\bexternal link\b|\bopen (?:in )?(?:a )?(?:browser|new tab)\b/i, allowed: false, code: 'GAME_EXTERNAL_LINK', verdict: 'No links out of a game, including marketplaces and social sites.', instead: 'Links belong on the game page around the game.' },
  { id: 'wallet', match: /\bwallet\b|\bnft\b|\btoken[- ]?gat/i, allowed: 'conditional', code: 'GAME_WALLET_GATING', verdict: 'No wallet connection and nothing unlocked by holding an asset; cosmetic use of items the platform hands over is fine.', instead: 'The platform owns identity and wallets; ask for the player\'s items through the shell when that lands.' },
  { id: 'crypto_rewards', match: /\$bull\b|\btoken rewards?\b|\bearn (?:tokens|crypto|money)\b|\bpayout\b|\bcash ?out\b|\bbuy\b.*\b(?:gems|coins)\b|\bin-app purchase\b|\biap\b/i, allowed: false, code: 'GAME_DAILY_REWARD', verdict: 'No earnings, purchase or token language inside a game.', instead: 'Seasons, prizes and tokens are run by the platform; the game reports a score.' },
  { id: 'daily_reward', match: /\bdaily (?:reward|bonus|gift|login|streak)\b|\blogin bonus\b|\bonce (?:per|a) day\b/i, allowed: 'conditional', code: 'GAME_WALL_CLOCK', verdict: 'A daily reward inside a game depends on the wall clock, which the simulation may not read, and the platform cannot see it.', instead: 'Keep rewards cosmetic and local, or ask the platform for a daily challenge.' },
  { id: 'daily_course', match: /\bdaily (?:challenge|run|course|puzzle|level|gate)\b/i, allowed: 'conditional', code: 'GAME_WALL_CLOCK', verdict: 'A daily course is fine when it is derived from the match seed the platform hands over, not from the date inside the game.', instead: 'Derive content from getMatch()?.seed; the platform decides what is daily.' },
  { id: 'instructions', match: /\b(?:tutorial|instructions?|how to play|onboarding screen|hint text)\b/i, allowed: false, code: 'GAME_INSTRUCTION_TEXT', verdict: 'No instruction text and no tutorial screens.', instead: 'The first seconds of the run teach the one input.' },
  { id: 'ads', match: /\badvert|\bads\b|\bad network\b|\bsponsor/i, allowed: false, code: 'GAME_EXTERNAL_REQUEST', verdict: 'No ads or third-party networks in a game.' },
  { id: 'cdn_assets', match: /\bcdn\b|\bgoogle fonts?\b|\bload(?:ed|ing)? from (?:a )?(?:url|server|cloud|s3|bucket)\b|\bremote assets?\b/i, allowed: false, code: 'GAME_EXTERNAL_REQUEST', verdict: 'Everything the game needs ships in its own bundle.', instead: 'Bundle assets; the platform serves the game from its own host.' },
  { id: 'multiplayer', match: /\b(?:real[- ]?time )?multiplayer\b|\bco-?op\b|\bpvp\b|\bversus\b|\bchat\b|\bvoice\b/i, allowed: 'conditional', code: 'GAME_DIRECT_LEADERBOARD', verdict: 'Live multiplayer and chat are not available to games; duels are asynchronous, same seed, best score.', instead: 'Declare a challenge; the platform runs the duel.' },
  { id: 'heavy_3d', match: /\b3d\b|\bthree\.?js\b|\bglb\b|\bgltf\b|\bmodels?\b|\btextures?\b/i, allowed: 'conditional', code: 'GAME_BUNDLE_OVER_TARGET', verdict: '3D is fine inside the budgets: well under 1 MB gzipped before the first frame, at most 20 MB total, 60 draw calls and 300k triangles with the character loaded.', instead: 'Draw in code where you can; compress and lazy-load models after the first frame.' },
  { id: 'audio', match: /\bmusic\b|\bsoundtrack\b|\bsong\b|\bsfx\b|\bsound effects?\b/i, allowed: 'conditional', code: 'GAME_AUDIO_LICENCE_MISSING', verdict: 'Audio is fine when it is owned, CC0 or commercially licensed and named in CREDITS.md, and it unlocks on a gesture.', instead: 'Procedural sound first; CC0 tracks named in CREDITS.md otherwise.' },
  { id: 'brands', match: /\bpokemon\b|\bmario\b|\bdisney\b|\bmarvel\b|\bfortnite\b|\bminecraft\b|\blicensed\b|\bbrand(?:ed|s)?\b|\bip\b/i, allowed: 'conditional', code: 'GAME_THIRD_PARTY_BRAND', verdict: 'No third-party brands, characters or logos without a written agreement; the platform\'s own characters are free to use.', instead: 'Use the platform\'s characters or your own.' },
];

/**
 * check_concept: match the creator's description and feature list against the
 * concept rules. Returns the verdicts that fired (allowed false or conditional
 * first), the fine ones, and the rules every game must meet regardless.
 */
export function checkConcept({ description = '', features = [] } = {}) {
  const inputs = [description, ...features.map(String)];
  const fired = [];
  for (const r of CONCEPT_RULES) {
    const hits = inputs.filter((text) => r.match.test(text));
    if (!hits.length) continue;
    const rule = ruleFor(r.code);
    fired.push({ feature: r.id, allowed: r.allowed, verdict: r.verdict, ...(r.instead ? { instead: r.instead } : {}), code: r.code, tier: rule?.tier ?? 'listing', matched: hits.map((h) => h.slice(0, 80)) });
  }
  const order = { false: 0, conditional: 1, true: 2 };
  fired.sort((a, b) => order[String(a.allowed)] - order[String(b.allowed)]);
  return {
    verdicts: fired,
    blocking: fired.filter((f) => f.allowed === false).map((f) => f.feature),
    always: [
      'Portrait, one thumb, 30 to 90 second runs, one score, instant restart.',
      'Boots straight into play; an untouched run is still playing at 12 seconds.',
      'Same seed plus same inputs reproduce the same run (duels).',
      'One challenge.submit(score) or game.endRun(score) per run; the test hook under ?bp_test=1; a smoke.driver.mjs.',
      'No network beyond the platform, no links out, no wallet, no identity prompts; share and the player\'s profile come through request() from src/beyondplay-platform.ts, declared in uses.',
      'A 512 x 512 icon; every asset and track credited in CREDITS.md.',
    ],
  };
}
