// Versions (template/src/beyondplay-avatar.ts): every player.avatar ask carries the avatar catalogue format the game's
// src/avatar-kit.ts reads (`format`, AVATAR_FORMAT), for the player's own avatar, the room and the duel's opponent, so
// the host never names a look in a newer format. A look the answer marks newer anyway is not built: the game shows the
// library character `id` names. A look in the game's own format, or with no format, is built as before.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ builds: [], loaded: [], asked: [], room: [], duel: [] }));

vi.mock('../../../template/src/avatar-kit.ts', () => ({
  AVATAR_FORMAT: 1,
  AvatarKit: {
    load: vi.fn(async () => ({
      build: vi.fn(async (spec) => {
        h.builds.push(spec);
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
vi.mock('../../../template/src/crowd-copy.ts', () => ({ crowdCopyOf: vi.fn(async () => null) }));
vi.mock('../../../template/src/beyondplay-platform.ts', () => ({
  onAvatarChange: vi.fn(),
  request: vi.fn(async (name, params) => {
    h.asked.push([name, params]);
    return null;
  }),
  roomAvatars: vi.fn(async (...args) => {
    h.room.push(args);
    return [];
  }),
  opponentAvatar: vi.fn(async (...args) => {
    h.duel.push(args);
    return null;
  }),
}));

const { loadAvatar, loadOpponentAvatar, loadPlayerAvatar, loadRoomAvatars } = await import('../../../template/src/beyondplay-avatar.ts');

const answer = (avatarKit) => ({ kit: 'ape', id: 'ape-07', look: { preset: 'ape-07' }, source: 'own', model: null, avatarKit });

beforeEach(() => {
  h.builds = [];
  h.loaded = [];
  h.asked = [];
  h.room = [];
  h.duel = [];
});

describe('the ask carries the format the game reads', () => {
  it('for the player, with and without a kit', async () => {
    await loadPlayerAvatar({ kit: 'ape', timeoutMs: 50 });
    await loadPlayerAvatar({ timeoutMs: 50 });
    expect(h.asked).toEqual([
      ['player.avatar', { kit: 'ape', format: 1 }],
      ['player.avatar', { format: 1 }],
    ]);
  });

  it('for the room and for the duel', async () => {
    await loadRoomAvatars({ roomId: 'r1', kit: 'ape' });
    await loadOpponentAvatar({ challengeId: 'c1' });
    expect(h.room).toEqual([['r1', 'ape', 1]]);
    expect(h.duel).toEqual([['c1', undefined, 1]]);
  });
});

describe('a look in a newer format', () => {
  it('is not built: the library character instead', async () => {
    const loaded = await loadAvatar(answer({ body: 'ape', look: 'ape-07', format: 2 }));
    expect(h.builds).toEqual([]);
    expect(h.loaded).toEqual(['ape-07']);
    expect(loaded.kitAvatar).toBeUndefined();
  });

  it('nor a collectible in a newer format', async () => {
    await loadAvatar({ ...answer({ collection: 'cobi', traits: { Fur: 'Brown' }, format: 3 }), kit: 'bull', id: 'bull-01' });
    expect(h.builds).toEqual([]);
    expect(h.loaded).toEqual(['bull-01']);
  });

  it('a look in its own format, or with none, is built', async () => {
    await loadAvatar(answer({ body: 'ape', look: 'ape-07', format: 1 }));
    await loadAvatar(answer({ body: 'ape', look: 'ape-02' }));
    expect(h.builds).toEqual([
      { body: 'ape', look: 'ape-07' },
      { body: 'ape', look: 'ape-02' },
    ]);
    expect(h.loaded).toEqual([]);
  });
});
