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
// Phase 3:
//   player.save      the player's saved progress in this game: one JSON value of at most 16 KB,
//                    private to that player, null when signed out. Use src/beyondplay-save.ts
//                    (loadSave, writeSave), which also keeps a copy on the device; declare it:
//                    uses: ['player.save']
//   player.avatar    the player's avatar in one declared kit: { kit, id, look, source, model }, the
//                    same look in every game (the player chooses it in the app), answered signed
//                    out too with the platform's pick; declare the kit: uses: ['player.avatar:ape']
//
// Phase 4:
//   store            the game's own items for B-Bucks (cosmetics only): what is on sale, what this
//                    player owns, and the platform's purchase sheet. Use src/beyondplay-store.ts
//                    (storeItems, owns, buy); declare the items with its defineStore in the
//                    config, which declares the store for you.
//
// The one rule for items: they change how a run looks and sounds, never how it
// plays. A trait may pick the model, a trail, a sound, a greeting, the name on
// the end card; nothing the simulation reads comes from an item or a trait.
// Read items in src/App.tsx, never in src/game.ts.

export type CapabilityName = 'capabilities' | 'host' | 'player.profile' | 'share' | 'player.items' | 'player.stats' | 'player.friends' | 'player.save' | 'player.avatar' | 'store';

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
  /** null only on the collection's default item (no token), as get_contract serves it. */
  tokenId: string | null;
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

/** The player's saved progress in this game: the value the game last wrote and when (null and null when nothing is saved). */
export interface PlayerSave {
  data: unknown | null;
  updatedAt: string | null;
}
/** Read the save, or write a new value (JSON, at most 16 KB). */
export type PlayerSaveParams = { op: 'get' } | { op: 'set'; data: unknown };
/** The answer to a write. */
export type PlayerSaveWrite = { ok: true; updatedAt: string } | { ok: false; reason: 'too_large' | 'invalid' | 'unavailable'; limit?: number };

/** One item of the game's store, as the platform answers it. Look and sound only. */
export interface StoreItem {
  /** The id the game gave the item in defineStore. */
  id: string;
  name: string;
  blurb: string | null;
  /** The item's picture, served from the game. */
  image: string | null;
  /** The price in B-Bucks. */
  price: number;
  /** False while the item waits for review, was withdrawn, or the store is not open for this game. */
  onSale: boolean;
  /** True when this player owns it, on every device. Always false signed out. */
  owned: boolean;
}
/** List the game's items, or ask the platform to sell one (it opens its own sheet). With `wait`,
 *  the host answers { outcome: 'pending' } while its sheet is still open and the caller asks
 *  again; src/beyondplay-store.ts does this, so buy through it. */
export type StoreParams = { op: 'items' } | { op: 'buy'; item: string; wait?: boolean };
/** The answer to a buy that ended with the player owning the item. */
export interface StoreBuyResult {
  outcome: 'bought' | 'owned';
}

export interface PlayerAvatarParams {
  /** The kit, the one declared in uses as 'player.avatar:<kit>' ('ape'). */
  kit: string;
}

/** The player's avatar: one look, the same in every game. Look only: never how a run plays. */
export interface PlayerAvatar {
  kit: string;
  /** The library character to show ('ape-07'); src/beyondplay-characters.ts loadCharacter(id) loads it with its moves. */
  id: string;
  look: { preset: string };
  /** own: the player chose it; default: the platform picked it for this player or device. */
  source: 'own' | 'default';
  /** One baked file on the asset host, or null when the catalogue does not hold it yet (load the library character by id). */
  model: {
    kind: 'baked';
    url: string;
    skeleton: string | null;
    height: number | null;
    facing: string | null;
    feetAt: number | null;
    /** The library move set it plays. */
    moves: string | null;
  } | null;
  /** The same look in the avatar kit (src/avatar-kit.ts), where the avatar kit has it; loadPlayerAvatar builds it then.
   *  A platform look is `{ body, look }` (`build({ body, look })`). A holder's own token (a COBI bull they chose as their
   *  avatar) is `{ collection, traits }` (`build({ collection, traits, wear })`), built exactly as minted; `id`, `look`
   *  and `model` then name the platform's bull for a game that cannot build it. Absent otherwise. */
  avatarKit?: PlayerAvatarLook | PlayerAvatarCollectible;
}

/** A platform look in the avatar kit: the body and the whole look it wears. */
export interface PlayerAvatarLook { body: string; look: string }

/** A holder's own token in the avatar kit: its collection ('cobi') and its traits as minted (trait type to value), with
 *  the collection's wearables the platform says they own (`wear`, none yet). Never a token id or a wallet. */
export interface PlayerAvatarCollectible { collection: string; traits: Record<string, string>; wear?: string[] }

export interface CapabilityParams {
  capabilities: undefined;
  host: undefined;
  'player.profile': undefined;
  share: ShareParams;
  'player.items': PlayerItemsParams;
  'player.stats': undefined;
  'player.friends': undefined;
  'player.save': PlayerSaveParams;
  'player.avatar': PlayerAvatarParams;
  store: StoreParams;
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
  /** A PlayerSave for a read, a PlayerSaveWrite for a write, null when signed out. */
  'player.save': PlayerSave | PlayerSaveWrite | null;
  /** The player's avatar in the declared kit; never null from a host that offers it (signed out: the platform's pick). */
  'player.avatar': PlayerAvatar;
  /** StoreItem[] for items; a StoreBuyResult for a buy (it rejects with cancelled when the player closes the sheet), or { outcome: 'pending' } to a buy with `wait` while the sheet is open. */
  store: StoreItem[] | StoreBuyResult | { outcome: 'pending' };
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

/** Called with the player's new look when it changes while the game runs (they saved another avatar in the locker
 *  and came back): `avatar` is a fresh player.avatar answer, `params` what the game asked with. Older hosts never
 *  call it. Returns an unsubscribe function. Only the player's own avatar: never another player's (roomAvatars,
 *  opponentAvatar). */
export function onAvatarChange(cb: (avatar: PlayerAvatar | null, params: PlayerAvatarParams) => void): () => void {
  const api = bridge();
  if (!api || typeof api.onAvatarChange !== 'function') return () => {};
  return api.onAvatarChange((avatar: PlayerAvatar | null, params: Record<string, unknown> | undefined) => {
    if (params && (params.room !== undefined || params.challenge !== undefined)) return;
    cb(avatar, params as unknown as PlayerAvatarParams);
  }) as () => void;
}

/** One player of the live room the game is in, as `roomAvatars` answers them: the room's own player id and seat (the
 *  ones `match.live.players` carries) and their avatar, the same answer their own game gets (in a creator's game a
 *  holder's own token arrives as a platform look). Bots are not players: draw them your own way. */
export interface RoomPlayerAvatar {
  playerId: string;
  seat: number;
  /** This player. */
  you: boolean;
  avatar: PlayerAvatar;
}

const isAnswer = (v: unknown): v is PlayerAvatar =>
  !!v && typeof v === 'object' && typeof (v as PlayerAvatar).kit === 'string' && typeof (v as PlayerAvatar).id === 'string' && !!(v as PlayerAvatar).look;

/** Asks player.avatar for other players (`{ room }` or `{ challenge }`), with the game's kit when given. */
function askOthers(params: { room: string } | { challenge: string }, kit?: string): Promise<unknown> {
  return request('player.avatar', { ...params, ...(kit ? { kit } : {}) } as unknown as PlayerAvatarParams) as Promise<unknown>;
}

/** Everyone in the live room the game is in (`match.live.roomId`), in seat order, over the kits the game declared
 *  (`kit`: one of them). Signed in only: null outside the room, signed out, from a host that predates it, or with no
 *  room (a bot match). Rejects like request() (denied for a kit the game did not declare). */
export async function roomAvatars(roomId: string, kit?: string): Promise<RoomPlayerAvatar[] | null> {
  const result = (await askOthers({ room: roomId }, kit)) as { players?: unknown } | null;
  if (!result || !Array.isArray(result.players)) return null;
  return (result.players as RoomPlayerAvatar[]).filter(
    (p) => !!p && typeof p.playerId === 'string' && typeof p.seat === 'number' && isAnswer(p.avatar),
  ).map((p) => ({ playerId: p.playerId, seat: p.seat, you: p.you === true, avatar: p.avatar }));
}

/** A duel's opponent (`match.challengeId`) over the kits the game declared, once both players accepted the duel (and
 *  after it ends): null before then, outside the duel, signed out, or from a host that predates it. Always a platform
 *  look (a holder's own token arrives as the platform's bull). */
export async function opponentAvatar(challengeId: string, kit?: string): Promise<PlayerAvatar | null> {
  const result = (await askOthers({ challenge: challengeId }, kit)) as { opponent?: unknown } | null;
  return result && isAnswer(result.opponent) ? result.opponent : null;
}

/** True when the error is a CapabilityError with the given code. */
export function isCapabilityError(err: unknown, code?: CapabilityErrorCode): err is CapabilityError {
  const e = err as CapabilityError | null;
  if (!e || typeof e !== 'object' || typeof e.code !== 'string') return false;
  return code ? e.code === code : true;
}
