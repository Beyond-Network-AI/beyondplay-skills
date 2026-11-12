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
  { code: 'GAME_TEMPLATE_FILE_MISSING', tier: 'publish', rule: 'The platform-owned files ship unchanged: index.html, src/main.tsx, src/beyondplay-kit.ts, src/cobi-kit.ts.' },
  { code: 'GAME_TEMPLATE_FILE_MODIFIED', tier: 'publish', rule: 'The platform-owned files ship unchanged; only <title> in index.html may change.', instead: 'Copy the file back from the template; the hosted build keeps the platform\'s copy anyway.' },
  { code: 'GAME_SOURCE_TOO_MANY_FILES', tier: 'publish', rule: 'At most 1,500 files in the source archive.' },
  { code: 'GAME_SOURCE_TOO_LARGE', tier: 'publish', rule: 'At most 50 MB of source.' },
  { code: 'GAME_SOURCE_FILE_TOO_LARGE', tier: 'publish', rule: 'At most 10 MB per file.' },
  { code: 'GAME_PUBLISH_CONFIG_INVALID', tier: 'publish', rule: 'publish.config.json is valid JSON with a slug and a name.' },
  // ── identity, network, money ─────────────────────────────────────────────
  { code: 'GAME_WALLET_GATING', tier: 'publish', rule: 'No wallet connection and no token or NFT gating in a game; the platform owns identity.', instead: 'Cosmetic use of owned items is fine when the platform hands them over: request(\'player.items\', { collection: \'cobi\' }) with uses: [\'player.items:cobi\'] declared; nothing is unlocked by holding an asset.' },
  { code: 'GAME_EXTERNAL_REQUEST', tier: 'publish', rule: 'No network calls beyond the platform\'s own hosts: no CDNs, fonts, APIs or analytics.', instead: 'Bundle the asset or data with the game.' },
  { code: 'GAME_EXTERNAL_LINK', tier: 'publish', rule: 'No links out of a game: no marketplaces, social sites or external pages.', instead: 'The game page around the game carries the platform\'s links; a game shows nothing that leaves it.' },
  { code: 'GAME_NAME_PROMPT', tier: 'publish', rule: 'A game never asks the player for a name, an email or any identity; the player is signed in to the platform.', instead: 'The shell knows the player: request(\'player.profile\') from src/beyondplay-platform.ts returns their display name and avatar when they allow it; scores post to their account through challenge.submit.' },
  { code: 'GAME_SHARE_BUTTON', tier: 'listing', rule: 'No share intents, social cards or clipboard writes of the game\'s own; a share control may only call request(\'share\'), which opens the platform\'s sheet with the game\'s card.', instead: 'request(\'share\', { score }) from src/beyondplay-platform.ts, with uses: [\'share\'] declared in the config; the platform shares the game page with its own card and rewards sharing itself.' },
  { code: 'GAME_CAPABILITY_UNKNOWN', tier: 'listing', rule: 'A game asks the platform only for the capabilities the contract lists (CAPABILITIES below); the host answers anything else as unsupported.', instead: 'Use a listed name; get_contract on the creator MCP serves the live table with what each returns.' },
  { code: 'GAME_CAPABILITY_UNDECLARED', tier: 'listing', rule: 'Every capability a game requests is declared in uses (defineSoloGame({ uses }) or declareUses), so the reviewer and the player see what the game asks for.', instead: 'Add the name to uses in src/beyondplay.config.ts.' },
  { code: 'GAME_DIRECT_LEADERBOARD', tier: 'listing', rule: 'The duel board is scored only through challenge.submit; reading a board for display is fine.' },
  // ── player items ─────────────────────────────────────────────────────────
  { code: 'GAME_ITEM_GATING', tier: 'review', rule: 'Items and traits change how a run looks and sounds (the model, a trail, a sound, a greeting, the name on the end card), never how it plays: no stats, lives, loadouts, unlocks, starts or multipliers from an item or a trait.', instead: 'Read items in src/App.tsx and pass only cosmetic choices to the renderer.' },
  { code: 'GAME_ITEM_IN_SIMULATION', tier: 'listing', rule: 'The simulation (src/game.ts) never sees an item: player.items and PlayerItem do not appear there, so a duel replays the same for both players.', instead: 'Request items in src/App.tsx and keep what they decide (the model, a trail, a sound) in the renderer.' },
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
  { code: 'GAME_PUBLISHED_WEIGHT_HEAVY', tier: 'review', rule: 'A published game between 25 and 50 MB is heavy for a phone on mobile data; the reviewer sees the size and the three largest files. It does not block listing.', instead: 'Compress models and textures to the kit\'s targets, load shared characters from the asset host instead of bundling them, drop unused realms, stream audio after the first frame.' },
  { code: 'GAME_PUBLISHED_WEIGHT_TOO_HEAVY', tier: 'listing', rule: 'A published game over 50 MB cannot be listed: too slow to open on a phone and too costly on mobile data in a swipe feed. It still publishes unlisted up to 100 MB.', instead: 'Compress models and textures to the kit\'s targets, load shared characters from the asset host instead of bundling them, drop unused realms, stream audio after the first frame.' },
  { code: 'GAME_BUNDLE_TOO_LARGE', tier: 'publish', rule: 'At most 100 MB published.' },
  { code: 'GAME_BUNDLE_TOO_MANY_FILES', tier: 'publish', rule: 'At most 500 files published.' },
  { code: 'GAME_BUNDLE_FILE_TOO_LARGE', tier: 'publish', rule: 'At most 10 MB per published file.' },
  // ── the browser checks (the kit's ladder; the hosted check when its image has a browser) ──
  { code: 'GAME_RENDER_SMOKE_FAILED', tier: 'listing', rule: 'The built game draws real pixels inside an embedding frame, the driver\'s run reaches game over with a score, bp_game_over reaches the parent exactly once, and the page logs no errors.', instead: 'Run npm run smoke:render -- games/<slug> in the kit and fix what it prints; teach smoke.driver.mjs to play the game when the run does not finish.' },
  { code: 'GAME_SEED_SMOKE_FAILED', tier: 'listing', rule: 'The same seed and the same scripted inputs give the same score and trajectory hash across two loads; a different seed gives a different run.', instead: 'Derive every procedural choice from getMatch()?.seed through a local PRNG and step the simulation by a fixed step counter; npm run smoke:seed -- games/<slug> shows the divergence.' },
  { code: 'GAME_IDLE_SMOKE_FAILED', tier: 'listing', rule: 'An untouched run is still playing after 12 seconds: the feed autoplays cards before a viewer decides to play.', instead: 'Put the first hazard far enough out that an idle run survives 12 seconds, or end a run only on a real input outcome.' },
  // ── performance (a mid-range phone stand-in: portrait, four times CPU throttling) ──
  { code: 'GAME_SLOW_FIRST_FRAME', tier: 'listing', rule: 'The first frame (bp_ready or the first drawn canvas) arrives within 5 seconds of navigation on a mid-range phone stand-in.', instead: 'Draw the first frame from code before loading anything heavy: load models, textures and audio after it, keep the first-frame bundle small, and call BeyondPlay.ready() right after the first real draw.' },
  { code: 'GAME_FRAME_TIME', tier: 'listing', rule: 'The 95th percentile frame time over ten seconds of driven play stays at or under 33 ms (a 30 fps floor; 60 fps is the target).', instead: 'Do less per frame: no allocations in the loop, fewer particles and post effects, cap the device pixel ratio at 2, simplify shaders, and step the simulation at a fixed rate apart from the draw.' },
  { code: 'GAME_FRAME_TIME_NOT_JUDGED', tier: 'review', rule: 'A game that draws with WebGL is not judged on frame time where the check machine has no graphics card: the number would measure software 3D, not the game. Its budget is draw calls and triangles.', instead: 'Stay inside the draw call and triangle budgets and try the game on a real phone; nothing to fix for this line.' },
  { code: 'GAME_DRAW_CALLS', tier: 'listing', rule: 'A three.js scene stays at or under 60 draw calls per frame with the character loaded (read from renderer.info through __bpTest.perf()).', instead: 'Merge static meshes, use instancing for repeated objects, share materials, and pack sprites into atlases.' },
  { code: 'GAME_TRIANGLES', tier: 'listing', rule: 'A three.js scene stays at or under 300,000 triangles per frame with the character loaded (read from renderer.info through __bpTest.perf()).', instead: 'Decimate models to the kit\'s targets, use lower levels of detail for distant objects, and cull what the camera cannot see.' },
  { code: 'GAME_HEAP', tier: 'review', rule: 'The JavaScript heap after a minute of play, reported for the reviewer; informational until a threshold is set from data.', instead: 'Release what a finished run used (geometries, textures, audio buffers) and avoid growing arrays across runs.' },
  { code: 'GAME_RUN_NEVER_ENDS', tier: 'review', rule: 'A run always ends and no score is free: content drawn from the seed does not run out, and the difficulty of an endless game keeps rising for as long as a run can last. A course planned once to a fixed length ends somewhere, and past its end the score climbs for nothing.', instead: 'End the run by the clock, or plan the content a chunk at a time ahead of the player (each chunk its own stream of the seed) and keep one thing rising (the speed, how little room an obstacle leaves) until nobody gets through. Try the game with a driver that never misses: its run must still end.' },
  { code: 'GAME_SCORE_UNBOUNDED', tier: 'review', rule: 'The challenge declares the bound on its winning side (maxValue, or minValue when the lowest value wins), set just past the best an honest run can reach; the server rejects a value beyond it.', instead: 'Work the bound out from the game\'s own numbers (run length, top speed, points per pickup) and change it whenever they change.' },
  { code: 'GAME_SAVE_CHANGES_A_DUEL', tier: 'review', rule: 'Saved progress is the player\'s own (unlocks, settings, a collection, how far they got) and holds no personal data. In a duel a run plays the same for both players whatever either has saved.', instead: 'Keep what a save unlocks to looks, sounds and solo play; in a duel (getMatch() answers a match) start both players from the same loadout. Save through src/beyondplay-save.ts and declare player.save.' },
  { code: 'GAME_HUD_NOT_KIT', tier: 'review', rule: 'What a game shows over the play (score, time, lives, buttons, the end card) is built from the HUD kit, src/beyondplay-hud.tsx, so it reads on a phone and on a large screen and every control is big enough for a thumb.', instead: 'Import Hud, HudRow, Stat, Timer, Hearts, Meter, HudButton, Stick and EndCard from ./beyondplay-hud; change its colours with setHudTheme().' },
  // ── assets and listing ───────────────────────────────────────────────────
  { code: 'GAME_LIBRARY_CREDIT_MISSING', tier: 'listing', rule: 'Every asset taken from the asset library (a file under public/assets/library/) has its line in CREDITS.md; add_asset provides the exact line.', instead: 'Add the line add_asset gave under "## Library assets" in CREDITS.md, or remove the file.' },
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
  { name: 'player.items', tier: 'open', since: '2026-11-06', phase: 2, params: '{ collection }', returns: 'PlayerItem[]: the player\'s items in the one collection the game declared ({ id, collection, tokenId, name, image, traits, model, borrowed, until?, quantity? }), or null when signed out, no wallet is linked, the player opted out or the game is not allowed to ask; [] when the wallet holds nothing in the collection.', note: 'Declare the collection as player.items:<slug> in uses (uses: [\'player.items:cobi\']); the host answers denied for a collection the manifest does not declare. Look and sound only: a trait may pick the model, a trail, a sound, a greeting or the name on the end card, never anything the simulation reads. The platform\'s default item per collection is served in capabilities[].default by get_contract, so every player gets one. Never a wallet address, a chain, a contract or a balance.', collections: 'One per game, named in the uses entry; the registry lists the slugs the platform offers (cobi first) and get_contract serves it with each collection\'s default item.' },
  { name: 'player.stats', tier: 'open', since: '2026-11-06', phase: 2, returns: '{ best, plays, lastPlayedAt } for this game, or null when signed out; what the leaderboard already shows.', note: 'For a beat-your-best line or a returning-player greeting; never fed into the simulation.' },
  { name: 'player.friends', tier: 'open', since: '2026-11-06', phase: 2, returns: '[{ displayName, avatar, best }] for friends who played this game, or null when signed out; what the leaderboard already shows.', note: 'For a ghost or a target on screen. No ids, no items, no lookup by player.' },
  { name: 'player.save', tier: 'open', since: '2026-11-12', phase: 3, params: '{ op: "get" } or { op: "set", data }', returns: '{ data, updatedAt } for a read (data is null when nothing is saved), { ok, updatedAt } for a write, or null when signed out.', note: 'One JSON value per player per game, at most 16 KB, private to that player. Use src/beyondplay-save.ts (loadSave, writeSave, flushSave), which also keeps a copy on the device for a signed-out player. A save is progress and looks; in a duel a run plays the same whatever is saved.' },
  { name: 'platform.season', tier: 'platform', since: null, phase: 3, returns: 'The current season and the player\'s standing.', note: 'Not yet offered.' },
];

export const CAPABILITY_NAMES = CAPABILITIES.map((c) => c.name);
/** The capabilities a host answers today (phases 1 and 2). */
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
  { id: 'items', match: /\bowned bulls?\b|\bplayer'?s bulls?\b|\btheir bulls?\b|\bnft traits?\b|\btraits?[- ]based\b|\bcosmetic\b|\bskin from\b|\bplayer items\b|\bowned items\b/i, allowed: 'conditional', code: 'GAME_ITEM_GATING', verdict: 'Items and traits change how a run looks and sounds (the model, a trail, a sound, a greeting, the name on the end card), never how it plays: no stats, lives, loadouts, unlocks, starts or multipliers from an item or a trait.', instead: 'Declare the collection (uses: [\'player.items:cobi\']), request(\'player.items\', { collection: \'cobi\' }) in src/App.tsx, fall back to the collection\'s default item when the answer is null or empty, and pass only cosmetic choices to the renderer.' },
  { id: 'wallet', match: /\bwallet\b|\bnft\b|\btoken[- ]?gat/i, allowed: 'conditional', code: 'GAME_WALLET_GATING', verdict: 'No wallet connection and nothing unlocked by holding an asset; cosmetic use of items the platform hands over is fine.', instead: 'The platform owns identity and wallets; ask for the player\'s items with request(\'player.items\', { collection: \'cobi\' }) from src/beyondplay-platform.ts and declare uses: [\'player.items:cobi\']; the game never sees a wallet, a chain, a contract or a balance.' },
  { id: 'crypto_rewards', match: /\$bull\b|\btoken rewards?\b|\bearn (?:tokens|crypto|money)\b|\bpayout\b|\bcash ?out\b|\bbuy\b.*\b(?:gems|coins)\b|\bin-app purchase\b|\biap\b/i, allowed: false, code: 'GAME_DAILY_REWARD', verdict: 'No earnings, purchase or token language inside a game.', instead: 'Seasons, prizes and tokens are run by the platform; the game reports a score.' },
  { id: 'daily_reward', match: /\bdaily (?:reward|bonus|gift|login|streak)\b|\blogin bonus\b|\bonce (?:per|a) day\b/i, allowed: 'conditional', code: 'GAME_WALL_CLOCK', verdict: 'A daily reward inside a game depends on the wall clock, which the simulation may not read, and the platform cannot see it.', instead: 'Keep rewards cosmetic and local, or ask the platform for a daily challenge.' },
  { id: 'daily_course', match: /\bdaily (?:challenge|run|course|puzzle|level|gate)\b/i, allowed: 'conditional', code: 'GAME_WALL_CLOCK', verdict: 'A daily course is fine when it is derived from the match seed the platform hands over, not from the date inside the game.', instead: 'Derive content from getMatch()?.seed; the platform decides what is daily.' },
  { id: 'instructions', match: /\b(?:tutorial|instructions?|how to play|onboarding screen|hint text)\b/i, allowed: false, code: 'GAME_INSTRUCTION_TEXT', verdict: 'No instruction text and no tutorial screens.', instead: 'The first seconds of the run teach the one input.' },
  { id: 'ads', match: /\badvert|\bads\b|\bad network\b|\bsponsor/i, allowed: false, code: 'GAME_EXTERNAL_REQUEST', verdict: 'No ads or third-party networks in a game.' },
  { id: 'cdn_assets', match: /\bcdn\b|\bgoogle fonts?\b|\bload(?:ed|ing)? from (?:a )?(?:url|server|cloud|s3|bucket)\b|\bremote assets?\b/i, allowed: false, code: 'GAME_EXTERNAL_REQUEST', verdict: 'Everything the game needs ships in its own bundle; the one exception: assets the platform serves from assets.beyondplay.xyz (the bull kit) are fine.', instead: 'Bundle assets; the platform serves the game from its own host, and the bull kit from assets.beyondplay.xyz through player.items.' },
  { id: 'multiplayer', match: /\b(?:real[- ]?time )?multiplayer\b|\bco-?op\b|\bpvp\b|\bversus\b|\bchat\b|\bvoice\b/i, allowed: 'conditional', code: 'GAME_DIRECT_LEADERBOARD', verdict: 'Live multiplayer and chat are not available to games; duels are asynchronous, same seed, best score.', instead: 'Declare a challenge; the platform runs the duel.' },
  { id: 'heavy_3d', match: /\b3d\b|\bthree\.?js\b|\bglb\b|\bgltf\b|\bmodels?\b|\btextures?\b/i, allowed: 'conditional', code: 'GAME_BUNDLE_OVER_TARGET', verdict: '3D is fine inside the budgets: well under 1 MB gzipped before the first frame, at most 20 MB total, 60 draw calls and 300k triangles with the character loaded.', instead: 'Draw in code where you can; compress and lazy-load models after the first frame.' },
  { id: 'audio', match: /\bmusic\b|\bsoundtrack\b|\bsong\b|\bsfx\b|\bsound effects?\b/i, allowed: 'conditional', code: 'GAME_AUDIO_LICENCE_MISSING', verdict: 'Audio is fine when it is owned, CC0 or commercially licensed and named in CREDITS.md, and it unlocks on a gesture.', instead: 'The asset library first (search_assets: a core sound set and music loops by mood, credits written for you); your own or CC0 tracks named in CREDITS.md otherwise. Play it through src/beyondplay-audio.ts.' },
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
      'No network beyond the platform, no links out, no wallet, no identity prompts; share, the player\'s profile and the player\'s items come through request() from src/beyondplay-platform.ts, declared in uses (items with their collection: player.items:cobi). Items change how a run looks and sounds, never how it plays.',
      'A 512 x 512 icon; every asset and track credited in CREDITS.md.',
    ],
  };
}
