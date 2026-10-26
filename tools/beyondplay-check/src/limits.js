// Every numeric limit the validator enforces, with where it comes from. The
// hosted check (the creator MCP's start_build) enforces the same numbers;
// get_contract on the MCP serves them live.
export const MB = 1024 * 1024;

const DESIGN = 'the platform limits (get_contract on the creator MCP)';

/** The source archive a creator uploads (uncompressed here; the design caps the tar.gz at 50 MB, so an uncompressed pass is a compressed pass). */
export const GAME_SOURCE = { maxFiles: 1500, maxTotalBytes: 50 * MB, maxFileBytes: 10 * MB, docs: `${DESIGN} (source archive)` };

/** The published bundle (dist/), as the arcade's extractor enforces it. */
export const GAME_BUNDLE = { maxFiles: 500, maxTotalBytes: 100 * MB, maxFileBytes: 10 * MB, docs: `${DESIGN} (published bundle)` };

/** What a phone downloads before the first frame: index.html plus what it references synchronously. */
export const GAME_INITIAL_DOWNLOAD = { maxBytes: 20 * MB, docs: `${DESIGN} (initial download, phones)` };

/** The platform's target for the same set, gzipped: well under about 1 MB (confirmed 2026-10-24). */
export const GAME_BUNDLE_GZIP_TARGET = { maxBytes: 1 * MB, docs: 'beyondplay-skills skills/beyondplay-game/references/mobile-rules.md > Performance' };

export const DOCS = {
  contract: 'beyondplay-skills skills/beyondplay-game/references/contract.md',
  testHook: 'beyondplay-skills skills/beyondplay-game/references/contract.md > 6. The test hook',
  mobile: 'beyondplay-skills skills/beyondplay-game/references/mobile-rules.md',
  publishing: 'beyondplay-skills skills/beyondplay-game/references/submit.md',
  porting: 'beyondplay-skills skills/beyondplay-game/SKILL.md > Hard rules',
  playbookPublishing: 'beyondplay-skills skills/beyondplay-game/references/style.md > Store metadata',
  playbookAudio: 'beyondplay-skills skills/beyondplay-game/references/assets-and-audio.md',
  smoke: 'beyondplay-skills skills/beyondplay-game/references/smoke-ladder.md',
};
