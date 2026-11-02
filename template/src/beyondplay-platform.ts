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

export type CapabilityName = 'capabilities' | 'host' | 'player.profile' | 'share';

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

export interface CapabilityParams {
  capabilities: undefined;
  host: undefined;
  'player.profile': undefined;
  share: ShareParams;
}

export interface CapabilityResults {
  capabilities: string[];
  host: HostInfo;
  'player.profile': PlayerProfile | null;
  share: ShareResult;
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
