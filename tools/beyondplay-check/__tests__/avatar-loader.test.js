// The template's loadAvatar (template/src/beyondplay-avatar.ts) with a holder's own COBI bull: the platform answers it
// as a collection and its traits (never a token id); the avatar kit builds it as minted, and anything it cannot build
// (another collection, no traits left, a build that throws) shows the platform bull the answer also names.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  builds: [],
  fail: false,
  loaded: [],
}));

vi.mock('../../../template/src/avatar-kit.ts', () => ({
  AVATAR_FORMAT: 1,
  AvatarKit: {
    load: vi.fn(async () => ({
      build: vi.fn(async (spec) => {
        h.builds.push(spec);
        if (h.fail) throw new Error('no such bull');
        return { root: { name: 'kit-root' }, bones: new Map([['mixamorigHips', { name: 'hips' }]]), moveSet: 'bull', clips: async () => ({}) };
      }),
    })),
  },
}));
vi.mock('../../../template/src/beyondplay-characters.ts', () => ({
  loadCharacter: vi.fn(async (id) => {
    h.loaded.push(id);
    return { id, root: { name: id }, bones: {}, meta: { character: id } };
  }),
  clipsFor: vi.fn(async () => ({})),
  openLibrary: vi.fn(async () => ({ characters: new Map() })),
}));
vi.mock('../../../template/src/beyondplay-platform.ts', () => ({ onAvatarChange: vi.fn(), request: vi.fn() }));

const { isCollectible, loadAvatar } = await import('../../../template/src/beyondplay-avatar.ts');

const TRAITS = { Fur: 'Brown', Eyes: 'Heart', Horns: 'Gold Cap' };
const answer = (avatarKit) => ({ kit: 'bull', id: 'bull-01', look: { preset: 'bull-01' }, source: 'own', model: null, avatarKit });

beforeEach(() => {
  h.builds = [];
  h.fail = false;
  h.loaded = [];
});

describe('loadAvatar and a holder\'s own bull', () => {
  it('builds the bull as minted, from its traits, with the bull\'s moves', async () => {
    const loaded = await loadAvatar(answer({ collection: 'cobi', traits: TRAITS, wear: ['bag-01', 7] }));
    expect(h.builds).toEqual([{ collection: 'cobi', traits: TRAITS, wear: ['bag-01'] }]);
    expect(loaded.character.meta).toEqual({ avatarKit: true, collection: 'cobi' });
    expect(loaded.character.id).toBe('cobi/collectible');
    expect(loaded.moves).toBe('bull');
    expect(loaded.kitAvatar).toBeDefined();
    expect(h.loaded).toEqual([]);
  });

  it('drops empty or non-text traits, and shows the platform bull when none are left', async () => {
    await loadAvatar(answer({ collection: 'cobi', traits: { ...TRAITS, Mouth: '', Clothes: 3 } }));
    expect(h.builds[0].traits).toEqual(TRAITS);
    const loaded = await loadAvatar(answer({ collection: 'cobi', traits: { Mouth: '' } }));
    expect(h.builds).toHaveLength(1);
    expect(h.loaded).toEqual(['bull-01']);
    expect(loaded.kitAvatar).toBeUndefined();
  });

  it('shows the platform bull for a collection the avatar kit does not build, and when the build fails', async () => {
    await loadAvatar(answer({ collection: 'barbearians', traits: TRAITS }));
    expect(h.builds).toEqual([]);
    h.fail = true;
    await loadAvatar(answer({ collection: 'cobi', traits: TRAITS }));
    expect(h.loaded).toEqual(['bull-01', 'bull-01']);
  });

  it('still builds a platform look by body and look', async () => {
    const loaded = await loadAvatar(answer({ body: 'bull', look: 'bull-03' }));
    expect(h.builds).toEqual([{ body: 'bull', look: 'bull-03' }]);
    expect(loaded.character.meta).toEqual({ avatarKit: true, body: 'bull', look: 'bull-03' });
  });

  it('tells a collectible from a platform look', () => {
    expect(isCollectible({ collection: 'cobi', traits: TRAITS })).toBe(true);
    expect(isCollectible({ body: 'bull', look: 'bull-01' })).toBe(false);
    expect(isCollectible(undefined)).toBe(false);
  });
});
