// The template's copies of the games library's loaders (src/cobi-kit.ts, src/beyondplay-characters.ts,
// src/avatar-kit.ts) come from one commit of beyondplay-games, synced together by `npm run sync-library`: they depend
// on one another, and a copy synced alone (23 November 2026: avatar-kit.ts without the characters loader) left lite
// characters without their moves in every new game. library.SOURCE.json (the kit's root) records the commit.
import { describe, expect, it } from 'vitest';
import { LIBRARY_RECORD, LOADERS, libraryProblems } from '../../../scripts/sync-library.mjs';
import { readFileSync } from 'node:fs';

describe('the library loaders in the template', () => {
  it('all come from the one games commit library.SOURCE.json records', () => {
    expect(libraryProblems()).toEqual([]);
    const lib = JSON.parse(readFileSync(LIBRARY_RECORD, 'utf8'));
    expect(lib.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(Object.keys(lib.files).sort()).toEqual(LOADERS.map((l) => `${l.copy}.ts`).sort());
  });
});
