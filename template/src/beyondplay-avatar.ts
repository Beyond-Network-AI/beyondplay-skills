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

import type * as THREE from 'three';

import { clipsFor, loadCharacter, openLibrary, type LibraryCharacter } from './beyondplay-characters';
import { onAvatarChange, request, type PlayerAvatar } from './beyondplay-platform';

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

/** Loads an avatar answer: its library character and the move set it plays. */
export async function loadAvatar(avatar: PlayerAvatar, opts: { lite?: boolean } = {}): Promise<LoadedAvatar> {
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
