import { describe, expect, it } from 'vitest';
import { CAPABILITIES, CAPABILITY_NAMES, OFFERED_CAPABILITIES, RULES, checkConcept, ruleFor, tierOf } from '../src/rules.js';

describe('the rules table', () => {
  it('gives every code a tier and names the capability path in the alternatives', () => {
    for (const r of RULES) expect(['publish', 'listing', 'review']).toContain(r.tier);
    expect(tierOf('GAME_CAPABILITY_UNKNOWN')).toBe('listing');
    expect(tierOf('GAME_CAPABILITY_UNDECLARED')).toBe('listing');
    expect(ruleFor('GAME_SHARE_BUTTON').instead).toContain("request('share'");
    expect(ruleFor('GAME_NAME_PROMPT').instead).toContain("request('player.profile')");
  });

  it('lists the capabilities with a tier and a phase; only the ones with a since date are offered', () => {
    expect(CAPABILITY_NAMES).toEqual(expect.arrayContaining(['capabilities', 'host', 'player.profile', 'share']));
    expect(OFFERED_CAPABILITIES).toEqual(['capabilities', 'host', 'player.profile', 'share']);
    for (const c of CAPABILITIES) {
      expect(['open', 'consent', 'platform']).toContain(c.tier);
      expect(typeof c.returns).toBe('string');
      expect([1, 2, 3]).toContain(c.phase);
    }
  });
});

describe('checkConcept', () => {
  it('treats a share as conditional (through request) and a name entry as blocked', () => {
    const r = checkConcept({ description: 'Share your score on X; enter your name for the board.' });
    const by = Object.fromEntries(r.verdicts.map((v) => [v.feature, v]));
    expect(by.share).toMatchObject({ allowed: 'conditional', code: 'GAME_SHARE_BUTTON', tier: 'listing' });
    expect(by.share.instead).toContain("request('share'");
    expect(by.name_entry).toMatchObject({ allowed: false, code: 'GAME_NAME_PROMPT' });
    expect(r.blocking).toEqual(['name_entry']);
    expect(r.always.some((line) => line.includes('request()'))).toBe(true);
  });
});
