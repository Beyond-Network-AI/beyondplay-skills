# beyondplay-check

The local validator for BeyondPlay games. It is the
local companion of the hosted check the creator MCP runs on `start_build`: same
limits, same issue shape, same codes. The hosted result is the one that counts;
this one is the fast loop an agent runs before uploading.

It is static. It reads the folder, bundles and evaluates the config, hashes the
platform-owned files, scans the source, measures the build. It does not run the game: determinism, rendering and the
idle rule are the browser checks' job (`scripts/smoke-*.mjs`).

## Run

```bash
npm install                                                   # at the kit root, once
npm run check -- game  games/<slug> [--json] [--fail-level warning] [--template <dir>]
npm test                                                      # vitest, 16 tests
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
  ]
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
`GAME_BUNDLE_INDEX_MISSING`, `GAME_BUNDLE_SHELL_MISSING`, `GAME_BUNDLE_MANIFEST_MISSING`,
`GAME_BUNDLE_MANIFEST_INVALID`, `GAME_BUNDLE_MANIFEST_MISMATCH`, `GAME_BUNDLE_TOO_MANY_FILES`,
`GAME_BUNDLE_TOO_LARGE`, `GAME_BUNDLE_FILE_TOO_LARGE`, `GAME_INITIAL_DOWNLOAD_TOO_LARGE`.

Game, warnings: `GAME_TEMPLATE_FILE_DRIFT`, `GAME_TEMPLATE_UNAVAILABLE`,
`GAME_PUBLISH_CONFIG_MISSING`, `GAME_PUBLISH_SLUG_MISMATCH`, `GAME_ART_MISSING`,
`GAME_TEST_HOOK_UNGATED`, `GAME_EXTERNAL_REQUEST`,
`GAME_MOUSE_TOUCH_EVENTS`, `GAME_VIEWPORT_100VH`, `GAME_DIRECT_LEADERBOARD`,
`GAME_BUNDLE_OVER_TARGET`, `GAME_AUDIO_LICENCE_MISSING`, `GAME_SMOKE_DRIVER_MISSING`.

Game, info: `GAME_CONFIG_SOLO`, `GAME_EXTERNAL_URL`, `GAME_WALL_CLOCK`, `GAME_NO_BUILD`,
`GAME_INITIAL_DOWNLOAD`, `GAME_ART_BANNER_MISSING`.

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
