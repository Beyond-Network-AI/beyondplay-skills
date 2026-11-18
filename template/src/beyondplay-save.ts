// BeyondPlay save: a game's progress that follows the player.
//
//   const save = await loadSave({ gems: 0, unlocked: [] as string[] });   // after the first frame
//   save.gems += 5;
//   writeSave(save);                                                      // whenever it changes
//   flushSave();                                                          // at the end of a run
//
// Where it lives: for a signed-in player the platform keeps it (the player.save
// capability), so it is there on their next phone, in the app and on the web. A
// copy is always kept on the device too, which is all a signed-out player has;
// on load the newer of the two wins. Declare it in src/beyondplay.config.ts:
//   defineSoloGame({ challenge, uses: ['player.save'] })
//
// Rules it keeps for you: one JSON value of at most 16 KB; the platform is
// written at most every five seconds and when the page is hidden; a host that
// does not answer (signed out, switched off, offline) is never an error.
// Rules you keep: a save is the player's own progress (unlocks, settings, a
// collection, how far they got) and holds no personal data; in a duel a run
// plays the same for both players whatever either has saved. Read it in
// src/App.tsx, never in the seeded simulation of a duel.
//
// PLATFORM-OWNED. Do not edit: the validator compares this file with the template.
import { can, onCapabilities, request, type PlayerSave, type PlayerSaveWrite } from './beyondplay-platform';

export const SAVE_MAX_BYTES = 16 * 1024;
const KEY = 'bp-save';
const PUSH_EVERY_MS = 5000;
const HELLO_WAIT_MS = 1500;

/** What the device keeps: the value and when it was written (the platform's clock once it has answered). */
interface Stored { data: unknown; at: number }

let latest: Stored | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let dirty = false;

function readDevice(): Stored | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value.at === 'number' ? (value as Stored) : null;
  } catch {
    return null; // private mode, blocked storage or a broken value: no device copy
  }
}

function writeDevice(stored: Stored): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(stored)); } catch { /* the platform copy, if any, stands */ }
}

/** Resolves once the host has said hello, or after a short wait where no host answers. */
function hostReady(): Promise<void> {
  if (can('capabilities')) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    let off: () => void = () => {};
    const finish = () => { if (done) return; done = true; off(); resolve(); };
    off = onCapabilities(finish);
    if (done) off();
    setTimeout(finish, HELLO_WAIT_MS);
  });
}

async function push(): Promise<void> {
  timer = null;
  if (!latest || pushing || !can('player.save')) return;
  pushing = true;
  dirty = false;
  const sent = latest;
  try {
    const answer = (await request('player.save', { op: 'set', data: sent.data })) as PlayerSaveWrite | null;
    // Keep the device's time on the platform's clock, so two devices compare like with like.
    if (answer && answer.ok && latest === sent) { latest = { data: sent.data, at: Date.parse(answer.updatedAt) || sent.at }; writeDevice(latest); }
  } catch {
    /* signed out, switched off or offline: the device copy stands */
  }
  pushing = false;
  if (dirty) schedule();
}

function schedule(): void {
  if (timer === null) timer = setTimeout(() => { void push(); }, PUSH_EVERY_MS);
}

const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The player's save, or `fallback` when there is none. When both are plain objects the save is
 * laid over the fallback, so a field added in a later version of the game gets its default.
 * Call it after the first frame and never hold play for it.
 */
export async function loadSave<T>(fallback: T): Promise<T> {
  const device = readDevice();
  await hostReady();
  let remote: PlayerSave | null = null;
  if (can('player.save')) {
    try { remote = (await request('player.save', { op: 'get' })) as PlayerSave | null; } catch { remote = null; }
  }
  const remoteAt = remote && remote.data !== null && remote.updatedAt ? Date.parse(remote.updatedAt) || 0 : 0;
  let chosen: unknown;
  if (remote && remoteAt && (!device || remoteAt >= device.at)) {
    chosen = remote.data;
    latest = { data: chosen, at: remoteAt };
    writeDevice(latest);
  } else if (device) {
    chosen = device.data;
    latest = device;
    if (can('player.save')) { dirty = true; schedule(); } // the device is ahead: send it up
  } else {
    return fallback;
  }
  return plain(fallback) && plain(chosen) ? ({ ...fallback, ...chosen } as T) : (chosen as T);
}

/**
 * Keep the value: on the device at once, on the platform shortly after. Returns false, and keeps
 * nothing, when the value is not JSON or is larger than 16 KB.
 */
export function writeSave<T>(data: T): boolean {
  let json: string | undefined;
  try { json = JSON.stringify(data); } catch { json = undefined; }
  if (json === undefined) return false;
  if (new Blob([json]).size > SAVE_MAX_BYTES) {
    console.warn(`beyondplay-save: the save is larger than ${SAVE_MAX_BYTES} bytes and was not kept; save less.`);
    return false;
  }
  latest = { data: JSON.parse(json), at: Date.now() }; // a wall-clock stamp for ordering saves, never gameplay
  writeDevice(latest);
  dirty = true;
  schedule();
  return true;
}

/** Send the latest save to the platform now; the end of a run is a good moment. */
export function flushSave(): void {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  void push();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) flushSave(); });
}
