// The template's other-players loaders (template/src/beyondplay-avatar.ts loadRoomAvatars, loadOpponentAvatar) with
// `crowd: true`: each loaded look is handed to src/crowd-copy.ts crowdCopyOf and carries the copy as `loaded.crowd`;
// a look the copy refuses (null) or that fails to copy stays whole and is still listed; without `crowd` nothing is
// copied.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  copied: [],
  copy: 'ok',
  players: [],
  opponent: null,
}));

vi.mock('../../../template/src/avatar-kit.ts', () => ({ AvatarKit: { load: vi.fn(async () => { throw new Error('no avatar kit in this test'); }) } }));
vi.mock('../../../template/src/beyondplay-characters.ts', () => ({
  loadCharacter: vi.fn(async (id) => ({ id, root: { name: `root:${id}` }, bones: {}, meta: { character: id } })),
  clipsFor: vi.fn(async () => ({})),
  openLibrary: vi.fn(async () => ({ characters: new Map() })),
}));
vi.mock('../../../template/src/beyondplay-platform.ts', () => ({
  onAvatarChange: vi.fn(),
  request: vi.fn(),
  roomAvatars: vi.fn(async () => h.players),
  opponentAvatar: vi.fn(async () => h.opponent),
}));
vi.mock('../../../template/src/crowd-copy.ts', () => ({
  crowdCopyOf: vi.fn(async (root) => {
    h.copied.push(root.name);
    if (h.copy === 'refuse') return null;
    if (h.copy === 'throw') throw new Error('no 2D canvas');
    return { mesh: { name: `copy:${root.name}` }, release: vi.fn() };
  }),
}));

const { loadRoomAvatars, loadOpponentAvatar } = await import('../../../template/src/beyondplay-avatar.ts');

const look = (id) => ({ kit: 'bull', id, look: { preset: id }, source: 'own', model: null });
const player = (playerId, seat, id, you = false) => ({ playerId, seat, you, avatar: look(id) });

beforeEach(() => {
  h.copied = [];
  h.copy = 'ok';
  h.players = [player('p0', 0, 'bull-01', true), player('p1', 1, 'bull-02'), player('p2', 2, 'bull-03')];
  h.opponent = look('bull-04');
});

describe('loadRoomAvatars with crowd', () => {
  it('copies every other player, each carrying its copy', async () => {
    const others = await loadRoomAvatars({ roomId: 'r1', crowd: true });
    expect(others.map((p) => p.playerId)).toEqual(['p1', 'p2']);
    expect(h.copied).toEqual(['root:bull-02', 'root:bull-03']);
    expect(others.map((p) => p.loaded.crowd?.mesh.name)).toEqual(['copy:root:bull-02', 'copy:root:bull-03']);
  });

  it('copies nothing without crowd', async () => {
    const others = await loadRoomAvatars({ roomId: 'r1' });
    expect(others).toHaveLength(2);
    expect(h.copied).toEqual([]);
    expect(others.every((p) => p.loaded.crowd === undefined)).toBe(true);
  });

  it('keeps a look whole, and listed, when the copy refuses it or fails', async () => {
    h.copy = 'refuse';
    const refused = await loadRoomAvatars({ roomId: 'r1', crowd: true });
    expect(refused.map((p) => [p.playerId, p.loaded.crowd])).toEqual([['p1', undefined], ['p2', undefined]]);
    h.copy = 'throw';
    const failed = await loadRoomAvatars({ roomId: 'r1', crowd: true });
    expect(failed.map((p) => [p.playerId, p.loaded.crowd])).toEqual([['p1', undefined], ['p2', undefined]]);
  });

  it('copies this player too only when listed with withYou, and only up to max', async () => {
    await loadRoomAvatars({ roomId: 'r1', crowd: true, withYou: true, max: 2 });
    expect(h.copied).toEqual(['root:bull-01', 'root:bull-02']);
  });
});

describe('loadOpponentAvatar with crowd', () => {
  it('copies the opponent', async () => {
    const opp = await loadOpponentAvatar({ challengeId: 'c1', crowd: true });
    expect(h.copied).toEqual(['root:bull-04']);
    expect(opp?.crowd?.mesh.name).toBe('copy:root:bull-04');
  });
});
