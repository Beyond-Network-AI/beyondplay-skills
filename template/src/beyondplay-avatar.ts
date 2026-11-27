// The player's avatar, loaded and ready to play, for any kit the game declared (uses: ['player.avatar:<kit>'], one
// entry per kit). Platform-owned: import it, do not edit it.
//
//   const me = await loadPlayerAvatar();                  // the player's look in a kit the game supports
//   scene.add(me.character.root);
//   const clips = await me.clips(['idle', 'walk', 'run', 'wave']);
//   onPlayerAvatarChange((next) => swap(next));            // they saved another look and came back
//
// It asks the host for player.avatar (the avatar rule: their main avatar where the game supports its kit, else their
// pick in a supported kit, else the platform's pick: the pink Beyonder), loads that library character with its own
// move set (a dressed ape plays 'ape-kit', a bull 'bull', a bear its own), and falls back to the pink Beyonder when no
// host answers (a local run) or the answer is late. `lite: true` takes the character's lighter copy where the library
// has one, for a game that draws many at once.
//
// Avatar Everywhere: where the platform names the same look in the avatar kit (`avatar.avatarKit`, for the players it
// has switched to the new avatars), the player is built there instead (src/avatar-kit.ts: the shared skeleton, the
// whole look as they have it, an ape with its fur), and `kitAvatar` is that avatar (its attachment points, its other
// looks). The same `character.root`, `clips(names)` and moves; release it with `kitAvatar.release()` when done. Should
// the avatar kit fail to load, the library character below is shown as before.
//
// Other players: loadRoomAvatars() is everyone else in the live room the game is playing (each their own look, by the
// room's player id and seat), loadOpponentAvatar() a duel's opponent. Bots are not players: draw them your own way.
//
//   const others = await loadRoomAvatars({ lite: true });   // [] in a bot match, signed out, or outside a room
//   for (const p of others) seatAt(p.seat).add(p.loaded.character.root);
//
// NFT avatars: a holder who chose their own token (a COBI bull) is answered as its collection and traits
// (`avatar.avatarKit = { collection: 'cobi', traits }`), and built here exactly as minted by the collection's own kit,
// playing the bull's moves; `character.meta.collection` names it. A game built before the avatar kit, or one where the
// collectible fails to build, shows the platform's bull the answer also names (`avatar.id`).

import type * as THREE from 'three';

import { AvatarKit, type Avatar } from './avatar-kit';
import { clipsFor, loadCharacter, openLibrary, type LibraryCharacter } from './beyondplay-characters';
import { onAvatarChange, opponentAvatar, request, roomAvatars, type PlayerAvatar, type PlayerAvatarCollectible, type PlayerAvatarLook } from './beyondplay-platform';

/** The look every player has until they choose, and the one a game shows when no host answers. */
export const DEFAULT_AVATAR: PlayerAvatar = { kit: 'beyonder', id: 'beyonder-pink', look: { preset: 'pink' }, source: 'default', model: null };

export interface LoadedAvatar {
  /** The host's answer (or the default look). */
  avatar: PlayerAvatar;
  /** The character: add `character.root` to the scene. 1.6–1.9 m, feet at y = 0, faces +Z. */
  character: LibraryCharacter;
  /** The library move set it plays ('beyonder-pink', 'ape-kit', 'bull', 'bear-karate-panda'). */
  moves: string;
  /** Its named clips for the Animator (beyondplay-anim.ts): moves as they are, dances retargeted; unknown names left out. */
  clips(names: string[]): Promise<Record<string, THREE.AnimationClip>>;
  /** The avatar kit's avatar, when the platform named the look there (`avatar.avatarKit`): `point('rightHand')`,
   *  `wearLook(id)`, `release()`. Absent for a library character. */
  kitAvatar?: Avatar;
}

export interface LoadAvatarOptions {
  /** One kit the game declared ('bull'); without it, the avatar rule over every kit it declared. */
  kit?: string;
  /** The character's lighter copy where the library has one (crowds). */
  lite?: boolean;
  /** How long to wait for the host before showing the default look (ms). */
  timeoutMs?: number;
  /** The look to show when no host answers (DEFAULT_AVATAR when absent). */
  fallback?: PlayerAvatar;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** The host's player.avatar answer, or null when none comes in time. */
async function ask(opts: LoadAvatarOptions): Promise<PlayerAvatar | null> {
  const params = (opts.kit ? { kit: opts.kit } : {}) as { kit: string };
  const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), opts.timeoutMs ?? 1500));
  return Promise.race([request('player.avatar', params).catch(() => null), late]);
}

/** The id to load: the lighter copy when asked for and the library holds one. */
async function idFor(id: string, lite: boolean): Promise<string> {
  if (!lite) return id;
  const characters = (await openLibrary()).characters;
  const lighter = text(characters.get(id)?.meta.lite);
  return lighter && characters.has(lighter) ? lighter : id;
}

/** The avatar kit's catalogue, read once (and again after a failed read). */
let kit: Promise<AvatarKit> | null = null;
function avatarKit(): Promise<AvatarKit> {
  if (!kit) { kit = AvatarKit.load(); kit.catch(() => { kit = null; }); }
  return kit;
}

/** Whether an answer's avatar-kit look is a holder's own token (a collection and its traits), not a platform look. */
export function isCollectible(want: PlayerAvatar['avatarKit']): want is PlayerAvatarCollectible {
  return !!want && typeof (want as PlayerAvatarCollectible).collection === 'string';
}

/** The traits as the collection's kit takes them: string values only, none empty (null when nothing is left). */
function traitsOf(want: PlayerAvatarCollectible): Record<string, string> | null {
  const traits: Record<string, string> = {};
  for (const [k, v] of Object.entries(want.traits ?? {})) if (typeof v === 'string' && v) traits[k] = v;
  return Object.keys(traits).length ? traits : null;
}

/** An answer's look in the avatar kit, built (null when it names none, or the avatar kit fails). */
async function fromAvatarKit(avatar: PlayerAvatar): Promise<LoadedAvatar | null> {
  const want = avatar.avatarKit;
  if (!want) return null;
  try {
    const avatars = await avatarKit();
    let a: Avatar;
    let id: string;
    let meta: LibraryCharacter['meta'];
    if (isCollectible(want)) {
      // A holder's own token, as minted (only COBI bulls today: the avatar kit names the collections it builds).
      const traits = traitsOf(want);
      if (want.collection !== 'cobi' || !traits) return null;
      a = await avatars.build({ collection: 'cobi', traits, wear: want.wear?.filter((w) => typeof w === 'string') });
      id = `${want.collection}/collectible`;
      meta = { avatarKit: true, collection: want.collection };
    } else {
      const look = want as PlayerAvatarLook;
      a = await avatars.build({ body: look.body, look: look.look });
      id = `${look.body}/${look.look}`;
      meta = { avatarKit: true, body: look.body, look: look.look };
    }
    const bones: Record<string, THREE.Bone> = {};
    for (const [name, bone] of a.bones) bones[name.replace(/^mixamorig:?/, '')] = bone;
    const character: LibraryCharacter = { id, root: a.root, bones, meta };
    return { avatar, character, moves: a.moveSet, clips: (names) => a.clips(names), kitAvatar: a };
  } catch {
    return null;
  }
}

/** Loads an avatar answer: its look in the avatar kit when the answer names one, else its library character and the
 *  move set it plays. */
export async function loadAvatar(avatar: PlayerAvatar, opts: { lite?: boolean } = {}): Promise<LoadedAvatar> {
  const fromKit = await fromAvatarKit(avatar);
  if (fromKit) return fromKit;
  const character = await loadCharacter(await idFor(avatar.id, opts.lite ?? false));
  const moves = text(character.meta.movesFrom) ?? text(character.meta.liteOf) ?? text(avatar.model?.moves) ?? text(character.meta.character) ?? avatar.id;
  return { avatar, character, moves, clips: (names) => clipsFor({ id: moves, root: character.root }, names) };
}

/** The player's avatar, loaded (the default look when no host answers or its character fails to load). */
export async function loadPlayerAvatar(opts: LoadAvatarOptions = {}): Promise<LoadedAvatar> {
  const avatar = (await ask(opts)) ?? opts.fallback ?? DEFAULT_AVATAR;
  try {
    return await loadAvatar(avatar, opts);
  } catch {
    return loadAvatar(opts.fallback ?? DEFAULT_AVATAR, opts);
  }
}

/** Called with the player's new avatar, loaded, when they save another look while the game runs (in `kit` when
 *  given). Returns an unsubscribe function. Older hosts never call it. */
export function onPlayerAvatarChange(cb: (next: LoadedAvatar) => void, opts: { kit?: string; lite?: boolean } = {}): () => void {
  return onAvatarChange((avatar, params) => {
    if (!avatar || (opts.kit && params?.kit && params.kit !== opts.kit)) return;
    void loadAvatar(avatar, opts).then(cb).catch(() => undefined);
  });
}

/** Another player in the live room, loaded: the room's player id and seat (as `match.live.players` has them). */
export interface LoadedRoomPlayer {
  playerId: string;
  seat: number;
  /** This player (listed only with `withYou`). */
  you: boolean;
  loaded: LoadedAvatar;
}

export interface LoadOthersOptions {
  /** One kit the game declared; without it, the avatar rule over every kit it declared (each player's own look). */
  kit?: string;
  /** The characters' lighter copies where the library has them, for many players at once. */
  lite?: boolean;
  /** How long to wait for the host (ms); after it, nothing (draw the seats your own way). */
  timeoutMs?: number;
}

/** The running play's match, as the host gave it (null outside a host). */
function currentMatch(): { challengeId?: unknown; live?: { roomId?: unknown } | null } | null {
  return typeof window === 'undefined' ? null : ((window as any).BeyondPlay?.match ?? null);
}

/** The host's answer, or null when none comes in time. */
function inTime<T>(asked: Promise<T | null>, timeoutMs = 4000): Promise<T | null> {
  const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([asked.catch(() => null), late]);
}

/** One answer loaded, or the default look when its own fails to load (null when even that fails). */
async function loadOrDefault(avatar: PlayerAvatar, opts: { lite?: boolean }): Promise<LoadedAvatar | null> {
  try {
    return await loadAvatar(avatar, opts);
  } catch {
    return loadAvatar(DEFAULT_AVATAR, opts).catch(() => null);
  }
}

/** Everyone else in the live room the game is playing (`match.live.roomId`), loaded, in seat order: each the look they
 *  chose, as their own game shows it (in a creator's game a holder's own token arrives as the platform's bull). Empty in
 *  a bot match, outside a room, signed out, from a host that predates it, or when it does not answer in time. Bots are
 *  never in it. `withYou` lists this player too (`you: true`); `roomId` names the room yourself. */
export async function loadRoomAvatars(opts: LoadOthersOptions & { withYou?: boolean; roomId?: string } = {}): Promise<LoadedRoomPlayer[]> {
  const roomId = opts.roomId ?? text(currentMatch()?.live?.roomId);
  if (!roomId) return [];
  const players = await inTime(roomAvatars(roomId, opts.kit), opts.timeoutMs);
  if (!players) return [];
  const loaded = await Promise.all(
    players
      .filter((p) => opts.withYou || !p.you)
      .map(async (p) => {
        const avatar = await loadOrDefault(p.avatar, opts);
        return avatar ? { playerId: p.playerId, seat: p.seat, you: p.you, loaded: avatar } : null;
      }),
  );
  return loaded.filter((p): p is LoadedRoomPlayer => p !== null);
}

/** A duel's opponent (`match.challengeId`), loaded: the look they chose, always a platform look. Null outside a duel,
 *  before anyone else is in it, when either player blocked the other, signed out, from a host that predates it, or when
 *  it does not answer in time. `challengeId` names the duel yourself. */
export async function loadOpponentAvatar(opts: LoadOthersOptions & { challengeId?: string } = {}): Promise<LoadedAvatar | null> {
  const challengeId = opts.challengeId ?? text(currentMatch()?.challengeId);
  if (!challengeId) return null;
  const avatar = await inTime(opponentAvatar(challengeId, opts.kit), opts.timeoutMs);
  return avatar ? loadOrDefault(avatar, opts) : null;
}
