// BeyondPlay platform capabilities: what a game may ask the host for. Ships with
// every game built from this template; the validator compares it with the
// template's copy, so leave it as it is and import from it.
//
// One door: request(name, params) returns a promise the host answers. The host
// (the feed, the game page, the app) decides what it offers; read
// capabilities() or can(name) before showing a control that depends on an
// answer, and treat a rejection as normal (the player said no, is signed out,
// or this host does not offer it). Never gate play on an answer, and never feed
// an answer into the seeded simulation.
//
// Declare what the game uses in src/beyondplay.config.ts:
//   defineSoloGame({ challenge, uses: ['share', 'player.profile'] })
//
// Phase 1 capabilities (the contract lists them; get_contract on the creator MCP
// serves the live table):
//   capabilities     the names this host offers
//   host             surface, locale, reducedMotion, authenticated, apiVersion
//   player.profile   { displayName, handle, avatar } or null when signed out
//   share            the host opens its share sheet with the game page and the score
//
// Phase 2 capabilities (open tier, answered without asking the player):
//   player.items     the player's items in one declared collection (PlayerItem[]), null when
//                    signed out, no wallet, opted out or not allowed, [] when they hold nothing;
//                    declare the collection: uses: ['player.items:cobi']
//   player.stats     { best, plays, lastPlayedAt } for this game, or null
//   player.friends   [{ displayName, avatar, best }] for friends who played this game, or null
//
// The one rule for items: they change how a run looks and sounds, never how it
// plays. A trait may pick the model, a trail, a sound, a greeting, the name on
// the end card; nothing the simulation reads comes from an item or a trait.
// Read items in src/App.tsx, never in src/game.ts.

export type CapabilityName = 'capabilities' | 'host' | 'player.profile' | 'share' | 'player.items' | 'player.stats' | 'player.friends';

export interface HostInfo {
  surface: 'feed' | 'page' | 'app' | 'telegram' | 'desktop' | 'unknown';
  locale: string;
  reducedMotion: boolean;
  authenticated: boolean;
  apiVersion: number;
}

export interface PlayerProfile {
  /** What to call the player on screen. */
  displayName: string | null;
  /** The public handle, when the player has one. */
  handle: string | null;
  /** An image URL for the player's avatar, when they have one. */
  avatar: string | null;
}

export interface ShareParams {
  /** The score to put on the card; the host formats it. */
  score?: number;
  /** One short line of the game's own (under 120 characters); the host may trim it. */
  text?: string;
}

export interface ShareResult {
  outcome: 'shared' | 'copied';
}

/** A rigged character assembled at runtime from a platform-served kit (src/cobi-kit.ts loads it). */
export interface KitModel {
  kind: 'kit';
  /** The kit this item is built with ('cobi/v2'); the loader refuses a base of another kit. */
  kit: string;
  /** The kit's base URL on the platform's asset host (the phone tier for games). */
  base: string;
  /** A GLB of animation clips that play on the kit's skeleton. */
  clips: string;
  /** The clip names in `clips` ('idle', 'walk', 'run', 'jump'). */
  clipNames: string[];
  /** The skeleton the kit and the clips share ('mixamo-65'). */
  skeleton: string;
  /** Height in metres when built. */
  height: number;
  /** The direction the model faces ('+z'). */
  facing: string;
  /** The y of the feet when built (0: feet on the ground). */
  feetAt: number;
}

/** A finished model file the platform serves for this item. */
export interface BakedModel {
  kind: 'baked';
  url: string;
}

export type ItemModel = KitModel | BakedModel;

/** One item the player holds in the collection the game declared. Look and sound only. */
export interface PlayerItem {
  /** '<collection>:<tokenId>'. */
  id: string;
  /** The collection slug the game declared ('cobi'). */
  collection: string;
  tokenId: string;
  /** The item's display name ('Cobi #5759'), for the end card or a greeting. */
  name: string;
  /** An image of the item on the platform's asset host; the avatar path for 2D games. */
  image: string;
  /** Trait type to value, as the collection publishes them ({ Fur: 'Gold', Horns: 'Fire' }). */
  traits: Record<string, string>;
  /** How to show the item in 3D, when the collection ships a model. */
  model?: ItemModel;
  /** True when the platform lent the item to the player; it looks the same. */
  borrowed: boolean;
  /** When a borrowed item goes back (ISO 8601). */
  until?: string;
  /** How many the player holds, for an ERC-1155 collection. */
  quantity?: number;
}

export interface PlayerItemsParams {
  /** The collection slug, the one declared in uses as 'player.items:<collection>'. */
  collection: string;
}

/** The player's record in this game: what the leaderboard already shows. */
export interface PlayerStats {
  best: number | null;
  plays: number;
  lastPlayedAt: string | null;
}

/** A friend who played this game; no id, no items, no lookup by player. */
export interface PlayerFriend {
  displayName: string | null;
  avatar: string | null;
  best: number | null;
}

export interface CapabilityParams {
  capabilities: undefined;
  host: undefined;
  'player.profile': undefined;
  share: ShareParams;
  'player.items': PlayerItemsParams;
  'player.stats': undefined;
  'player.friends': undefined;
}

export interface CapabilityResults {
  capabilities: string[];
  host: HostInfo;
  'player.profile': PlayerProfile | null;
  share: ShareResult;
  /** null when signed out, no wallet linked, the player opted out or the game is not allowed to ask; [] when the wallet holds nothing in the collection. */
  'player.items': PlayerItem[] | null;
  'player.stats': PlayerStats | null;
  'player.friends': PlayerFriend[] | null;
}

/** Why a request was not answered with a result. */
export type CapabilityErrorCode = 'denied' | 'cancelled' | 'unsupported' | 'unavailable';

export interface CapabilityError extends Error {
  code: CapabilityErrorCode;
  /** A finer reason when the host gives one: signed_out, timeout, no_host, ... */
  reason?: string;
}

function bridge(): any {
  return typeof window !== 'undefined' ? (window as any).BeyondPlay : undefined;
}

function unavailable(reason: string): CapabilityError {
  const err = new Error('no BeyondPlay host answers here') as CapabilityError;
  err.code = 'unavailable';
  err.reason = reason;
  return err;
}

/** Ask the host for one capability. Rejects with a CapabilityError (read err.code). */
export function request<N extends CapabilityName>(name: N, params?: CapabilityParams[N]): Promise<CapabilityResults[N]> {
  const api = bridge();
  if (!api || typeof api.request !== 'function') return Promise.reject(unavailable('no_bridge'));
  return api.request(name, params) as Promise<CapabilityResults[N]>;
}

/** The capability names this host offers (empty until the host has said hello). */
export function capabilities(): string[] {
  const api = bridge();
  return api && Array.isArray(api.capabilities) ? api.capabilities.slice() : [];
}

/** True when the host offers the capability right now. */
export function can(name: CapabilityName | string): boolean {
  return capabilities().indexOf(name) >= 0;
}

/** Called with the capability list as soon as the host has said hello, and again if it changes.
 *  Returns an unsubscribe function. */
export function onCapabilities(cb: (names: string[]) => void): () => void {
  const api = bridge();
  if (!api || typeof api.onCapabilities !== 'function') return () => {};
  return api.onCapabilities(cb) as () => void;
}

/** True when the error is a CapabilityError with the given code. */
export function isCapabilityError(err: unknown, code?: CapabilityErrorCode): err is CapabilityError {
  const e = err as CapabilityError | null;
  if (!e || typeof e !== 'object' || typeof e.code !== 'string') return false;
  return code ? e.code === code : true;
}
