import { describe, expect, it } from 'vitest';
import { CAPABILITIES, CAPABILITY_NAMES, OFFERED_CAPABILITIES, RULES, capabilityFor, checkConcept, ruleFor, tierOf } from '../src/rules.js';

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
    expect(OFFERED_CAPABILITIES).toEqual(['capabilities', 'host', 'player.profile', 'share', 'player.items', 'player.stats', 'player.friends', 'player.save', 'store']);
    for (const c of CAPABILITIES) {
      expect(['open', 'consent', 'platform']).toContain(c.tier);
      expect(typeof c.returns).toBe('string');
      expect([1, 2, 3, 4]).toContain(c.phase);
    }
  });

  it('offers the phase two capabilities on the open tier, and player.items names its collection and its default', () => {
    for (const name of ['player.items', 'player.stats', 'player.friends']) {
      expect(capabilityFor(name)).toMatchObject({ tier: 'open', since: '2026-11-06', phase: 2 });
    }
    const items = capabilityFor('player.items');
    expect(items.params).toBe('{ collection }');
    expect(items.returns).toMatch(/PlayerItem\[\]/);
    expect(items.returns).toMatch(/null/);
    expect(items.note).toContain("uses: ['player.items:cobi']");
    expect(items.note).toContain('capabilities[].default');
    expect(items.note).toMatch(/look and sound/i);
    expect(typeof items.collections).toBe('string');
    expect(capabilityFor('player.stats').returns).toContain('{ best, plays, lastPlayedAt }');
    expect(capabilityFor('player.friends').returns).toContain('{ displayName, avatar, best }');
  });

  it('adds the item rules: gating for the reviewer, the simulation pointer at listing', () => {
    expect(tierOf('GAME_ITEM_GATING')).toBe('review');
    expect(ruleFor('GAME_ITEM_GATING').rule).toBe('Items and traits change how a run looks and sounds (the model, a trail, a sound, a greeting, the name on the end card), never how it plays: no stats, lives, loadouts, unlocks, starts or multipliers from an item or a trait.');
    expect(ruleFor('GAME_ITEM_GATING').instead).toBe('Read items in src/App.tsx and pass only cosmetic choices to the renderer.');
    expect(tierOf('GAME_ITEM_IN_SIMULATION')).toBe('listing');
    expect(ruleFor('GAME_ITEM_IN_SIMULATION').rule).toContain('src/game.ts');
    expect(ruleFor('GAME_WALLET_GATING').instead).toContain("request('player.items', { collection: 'cobi' })");
    expect(ruleFor('GAME_WALLET_GATING').instead).toContain("uses: ['player.items:cobi']");
  });
});

describe('the store', () => {
  it('is one open capability with two operations, and says who confirms a purchase', () => {
    const store = capabilityFor('store');
    expect(store).toMatchObject({ tier: 'open', since: '2026-11-12', phase: 4, params: '{ op: "items" } or { op: "buy", item, wait? }' });
    // A player takes longer in the sheet than one request may: the helper keeps asking while it is open.
    expect(store.returns).toContain('"pending"');
    expect(store.returns).toContain('always buy through it');
    expect(store.note).toContain('defineStore');
    expect(store.note).toContain('never sees a balance');
    expect(store.note).toContain('cannot confirm a purchase');
  });

  it('holds a game to the store rules: the scans at listing, the judgement calls with the reviewer', () => {
    for (const code of ['GAME_STORE_ITEMS_INVALID', 'GAME_STORE_IN_SIMULATION', 'GAME_OWN_PAYMENT']) expect(tierOf(code)).toBe('listing');
    for (const code of ['GAME_STORE_RANDOM', 'GAME_STORE_GATES_PLAY', 'GAME_STORE_ITEM_MISLEADING']) expect(tierOf(code)).toBe('review');
    expect(ruleFor('GAME_OWN_PAYMENT').instead).toContain('buy(id)');
  });

  it('answers a concept: a cosmetic shop is fine through the platform, loot boxes and selling gems are not', () => {
    for (const text of ['a skin shop', 'an in-game store for trails', 'skins for sale', 'sell skins', 'in-app purchases', 'IAP', 'monetization', 'spend B-Bucks', 'buy a skin', 'buying new outfits']) {
      const r = checkConcept({ description: text });
      expect(r.verdicts.find((v) => v.feature === 'store'), text).toMatchObject({ allowed: 'conditional', code: 'GAME_OWN_PAYMENT', tier: 'listing' });
      expect(r.blocking, text).toEqual([]);
    }
    const shop = checkConcept({ description: 'a skin shop' }).verdicts.find((v) => v.feature === 'store');
    expect(shop.instead).toContain('defineStore');
    expect(shop.verdict).toContain('fully playable without buying');
    for (const text of ['open a loot box', 'gacha pulls', 'a mystery crate', 'lucky spin']) {
      expect(checkConcept({ description: text }).blocking, text).toContain('loot_box');
    }
    for (const text of ['buy gems with B-Bucks', 'sell coins', 'purchase more currency']) {
      expect(checkConcept({ description: text }).blocking, text).toContain('crypto_rewards');
    }
    // Storing something is not a store.
    expect(checkConcept({ description: 'store the best score and restore it later' }).verdicts.some((v) => v.feature === 'store')).toBe(false);
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

  it('treats owned items and traits as conditional on look and sound only, and points a wallet at player.items', () => {
    const r = checkConcept({ description: "The player's bull runs the course; trait-based perks give Gold bulls a head start.", features: ['connect wallet to prove NFT ownership'] });
    const by = Object.fromEntries(r.verdicts.map((v) => [v.feature, v]));
    expect(by.items).toMatchObject({ allowed: 'conditional', code: 'GAME_ITEM_GATING', tier: 'review' });
    expect(by.items.verdict).toContain('never how it plays');
    expect(by.items.instead).toContain("uses: ['player.items:cobi']");
    expect(by.items.instead).toContain("request('player.items', { collection: 'cobi' })");
    expect(by.wallet).toMatchObject({ allowed: 'conditional', code: 'GAME_WALLET_GATING' });
    expect(by.wallet.instead).toContain("request('player.items', { collection })".replace('{ collection }', "{ collection: 'cobi' }"));
    expect(by.wallet.instead).toContain("uses: ['player.items:cobi']");
    expect(r.blocking).toEqual([]);
    for (const text of ['owned bulls', 'their bull', 'NFT traits', 'cosmetic skins', 'a skin from the kit', 'player items', 'owned items']) {
      expect(checkConcept({ description: text }).verdicts.some((v) => v.feature === 'items')).toBe(true);
    }
  });

  it('keeps CDN assets blocked but names the platform asset host as the exception', () => {
    const r = checkConcept({ description: 'Load the bull model from a CDN.' });
    const cdn = r.verdicts.find((v) => v.feature === 'cdn_assets');
    expect(cdn).toMatchObject({ allowed: false, code: 'GAME_EXTERNAL_REQUEST' });
    expect(cdn.verdict).toContain('assets the platform serves from assets.beyondplay.xyz (the bull kit) are fine');
    expect(r.blocking).toContain('cdn_assets');
  });
});
