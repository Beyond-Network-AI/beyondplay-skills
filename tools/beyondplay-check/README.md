# beyondplay-check

The local validator for BeyondPlay games. It is the
local companion of the hosted check the creator MCP runs on `start_build`: same
limits, same issue shape, same codes. The hosted result is the one that counts;
this one is the fast loop an agent runs before uploading.

It is static. It reads the folder, bundles and evaluates the config, hashes the
platform-owned files, scans the source, measures the build. It does not run the game: determinism, rendering, the
idle rule and performance are the browser checks' job (`scripts/smoke-*.mjs`). `src/perf.js` holds the
performance thresholds and maps measured numbers to issues (`GAME_SLOW_FIRST_FRAME`, `GAME_FRAME_TIME`,
`GAME_DRAW_CALLS`, `GAME_TRIANGLES`, `GAME_HEAP`) for the performance smoke and the hosted check alike.

## Run

```bash
npm install                                                   # at the kit root, once
npm run check -- game  games/<slug> [--json] [--fail-level warning] [--template <dir>]
npm test                                                      # vitest
```

Outside the kit: `node bin/beyondplay-check.mjs game <dir> --template <template dir>`
(or set `BEYONDPLAY_TEMPLATE`). Without a template the platform-owned files cannot be
compared and the run says so (`GAME_TEMPLATE_UNAVAILABLE`).

Exit codes: `0` pass, `1` issues at or above the fail level (`error` by default), `2`
usage or path error, `3` internal failure. `--json` prints one object:

```json
{
  "ok": true,
  "target": { "kind": "game", "dir": "/abs/games/my-game", "template": "/abs/template" },
  "counts": { "error": 0, "warning": 1, "info": 2 },
  "issues": [
    { "code": "GAME_TEMPLATE_FILE_DRIFT", "severity": "warning", "path": "src/index.css", "line": 1,
      "message": "...", "remediation": "...", "docs": "beyondplay-skills skills/beyondplay-game/references/contract.md" }
  ],
  "facts": { "uses": ["share"], "display": { "orientation": "portrait", "input": ["touch", "mouse"], "keys": {} } }
}
```

Issues are sorted error, warning, info, then by code, path and line. `ok` follows the
fail level, so `--fail-level warning` flips it when a warning is present.

## Severities

- **error**: the hosted check refuses it, or the game cannot behave like a platform game
  (a changed platform-owned file, no test hook, a wallet pattern, a limit exceeded).
- **warning**: the contract is silent or the finding needs a human eye (an external URL in a request context, drift in a template file the contract does not
  protect, missing audio credits, a missing icon).
- **info**: facts worth knowing (no build present, wall-clock reads, the initial-download
  estimate, a solo declaration, no banner).

## Codes

Game, errors: `GAME_CONFIG_MISSING`, `GAME_CONFIG_BUILD_FAILED`, `GAME_CONFIG_INVALID`,
`GAME_CONFIG_BOARD_MISMATCH`, `GAME_TEMPLATE_FILE_MISSING`, `GAME_TEMPLATE_FILE_MODIFIED`,
`GAME_SOURCE_TOO_MANY_FILES`, `GAME_SOURCE_TOO_LARGE`, `GAME_SOURCE_FILE_TOO_LARGE`,
`GAME_PUBLISH_CONFIG_INVALID`, `GAME_TEST_HOOK_MISSING`,
`GAME_TEST_HOOK_INCOMPLETE`, `GAME_GAME_OVER_MISSING`, `GAME_WALLET_GATING`,
`GAME_EXTERNAL_REQUEST`, `GAME_EXTERNAL_LINK`, `GAME_NAME_PROMPT`,
`GAME_BUNDLE_INDEX_MISSING`, `GAME_BUNDLE_SHELL_MISSING`, `GAME_BUNDLE_MANIFEST_MISSING`,
`GAME_BUNDLE_MANIFEST_INVALID`, `GAME_BUNDLE_MANIFEST_MISMATCH`, `GAME_BUNDLE_TOO_MANY_FILES`,
`GAME_BUNDLE_TOO_LARGE`, `GAME_BUNDLE_FILE_TOO_LARGE`, `GAME_INITIAL_DOWNLOAD_TOO_LARGE`.

Game, warnings: `GAME_TEMPLATE_FILE_DRIFT`, `GAME_TEMPLATE_UNAVAILABLE`,
`GAME_PUBLISH_CONFIG_MISSING`, `GAME_PUBLISH_SLUG_MISMATCH`, `GAME_ART_MISSING`,
`GAME_TEST_HOOK_UNGATED`, `GAME_SHARE_BUTTON`, `GAME_START_GATE`, `GAME_INSTRUCTION_TEXT`,
`GAME_CAPABILITY_UNKNOWN`, `GAME_CAPABILITY_UNDECLARED`, `GAME_ITEM_IN_SIMULATION` (listing-tier errors locally),
`GAME_MOUSE_TOUCH_EVENTS`, `GAME_VIEWPORT_100VH`, `GAME_DIRECT_LEADERBOARD`,
`GAME_BUNDLE_OVER_TARGET`, `GAME_AUDIO_LICENCE_MISSING`, `GAME_SMOKE_DRIVER_MISSING`.

Game, info: `GAME_CONFIG_SOLO`, `GAME_EXTERNAL_URL`, `GAME_WALL_CLOCK`, `GAME_DAILY_REWARD`,
`GAME_NO_BUILD`, `GAME_INITIAL_DOWNLOAD`, `GAME_ART_BANNER_MISSING`.

`player.items` is declared with its collection (`uses: ['player.items:cobi']`); a bare
`player.items` is `GAME_CAPABILITY_UNDECLARED`, `player.items` or `PlayerItem` in
`src/game.ts` is `GAME_ITEM_IN_SIMULATION`, and `GAME_ITEM_GATING` (review tier, no
local check) is the reviewer's rule: items change how a run looks and sounds, never how
it plays. Whether a collection slug is one the platform offers is not checked locally.

Display (`defineDisplay` in the config, read from the manifest it produces; skipped when the
config does not build and under the hosted `skipConfig`), errors: `DISPLAY_ORIENTATION_INVALID`,
`DISPLAY_INPUT_UNKNOWN`, `DISPLAY_KEYS_INVALID`, `DISPLAY_KEYS_WITHOUT_KEYBOARD` (publish tier),
`DISPLAY_INPUT_NO_POINTER` (listing tier). Warnings: `DISPLAY_ORIENTATION_LANDSCAPE`,
`DISPLAY_KEYBOARD_NO_KEYS`, `DISPLAY_KEYBOARD_NO_HANDLER`. Info: `DISPLAY_KEYBOARD_UNDECLARED` (all
three review tier). The report records the normalized display as the fact `display`, beside `uses`.
`src/game-display.js` also holds the key-spec grammar (`parseKeySpec`) and `normalizeDisplay()`,
which the smokes use and every host applies; the template's `src/keys.ts` reads the same grammar,
and a test bundles it and compares the two. `docs/display.md` at the kit root is the recipe.

Every issue also carries a `tier` from `src/rules.js`, the one table the local
validator, the hosted check and the creator MCP share: `publish` (refused at upload and
publish), `listing` (allowed unlisted, refused at listing; the reviewer's approve waits),
`review` (the reviewer's eye). `src/rules.js` also holds the concept rules behind the
MCP's `check_concept`.

CLI: `CLI_USAGE`, `CLI_PATH_NOT_FOUND`, `CLI_INTERNAL_ERROR`.

Every limit lives in `src/limits.js`; the hosted check enforces the same numbers and
`get_contract` on the creator MCP serves them live.

## Rules the docs do not settle

These are warnings, not errors, until the platform team decides: drift in template files
the contract does not name, and `.leaderboard()` reads for display. Third-party brands and
fan disclaimers are the reviewer's call; the validator keeps no list of names.

## Not yet

Running the browser checks from here (`--smoke`), `--fix` to re-copy the platform-owned
files, and an npm publish so an agent without this kit can install it.
