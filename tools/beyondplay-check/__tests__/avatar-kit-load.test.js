// The real avatar loader (template/src/avatar-kit.ts AvatarKit.load) reads the catalogue at its own format's address
// and refuses any other format: a catalogue with another `version`, none, or a string is rejected, so a game falls
// back (src/beyondplay-avatar.ts shows the library character) instead of drawing a look it does not know.
import { afterEach, describe, expect, it, vi } from 'vitest';

const { AVATAR_FORMAT, AVATARS_CATALOGUE, AvatarKit, avatarsCatalogue } = await import('../../../template/src/avatar-kit.ts');

const catalogue = (over = {}) => ({
  version: 1,
  base: 'https://assets.beyondplay.xyz/avatars/v1/',
  skeleton: 'cobi/v2',
  moves: 'bull',
  slots: [],
  zones: [],
  points: {},
  bodies: {},
  collections: {},
  ...over,
});

function serve(body) {
  const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AvatarKit.load and the catalogue format', () => {
  it('reads format 1 at avatars.v1.json', async () => {
    expect(AVATAR_FORMAT).toBe(1);
    expect(AVATARS_CATALOGUE).toBe('https://assets.beyondplay.xyz/library/manifests/avatars.v1.json');
    expect(avatarsCatalogue(2)).toBe('https://assets.beyondplay.xyz/library/manifests/avatars.v2.json');
    const fetch = serve(catalogue());
    const kit = await AvatarKit.load();
    expect(fetch).toHaveBeenCalledWith(AVATARS_CATALOGUE);
    expect(kit.catalogue.version).toBe(1);
  });

  it('refuses another format, a missing one and a string', async () => {
    for (const version of [2, 0, undefined, '1', null]) {
      serve(catalogue({ version }));
      await expect(AvatarKit.load()).rejects.toThrow(/this loader reads format 1/);
    }
  });

  it('refuses a body that is not a catalogue at all', async () => {
    serve(null);
    await expect(AvatarKit.load()).rejects.toThrow(/this loader reads format 1/);
  });

  it('rejects a failed read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    await expect(AvatarKit.load()).rejects.toThrow(/HTTP 404/);
  });
});
