// BeyondPlay audio: sound effects and a music loop, the same way in every game.
//
//   import { loadSound, play, startMusic, setMuted } from './beyondplay-audio';
//   loadSound('coin', '/assets/library/sfx-core/coin/coin-01.ogg');   // after the first frame
//   play('coin');                                                      // on the event
//   startMusic('/assets/library/music-core/loop/arcade-level-1.ogg'); // starts on the first touch
//
// The rules it keeps for you:
// - Nothing sounds before the player's first touch (browsers and the feed both require it): sounds
//   asked for earlier are dropped, and music waits for the touch.
// - Audio loads after the first frame and never blocks play: a sound that has not loaded is skipped.
// - The game goes quiet when the page is hidden (the feed scrolls a card away) and resumes on return.
// - The checks run silent: under ?bp_test=1 nothing loads and nothing plays.
// - Sound is look and feel only: never read it from the simulation (src/game.ts).
//
// Assets come from the asset library (search_assets and add_asset on the creator MCP, or the app's
// library), which also writes each one's line in CREDITS.md.

type Ctx = AudioContext;
const TEST = typeof location !== 'undefined' && /[?&]bp_test=1\b/.test(location.search);
const buffers = new Map<string, AudioBuffer>();
const pending = new Map<string, Promise<void>>();
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let unlocked = false;
let muted = false;
let musicUrl: string | null = null;
let musicVolume = 0.5;
let musicNode: AudioBufferSourceNode | null = null;
let musicGain: GainNode | null = null;

function context(): Ctx | null {
  if (TEST || typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx!.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx!.destination);
  }
  return ctx;
}

async function fetchBuffer(url: string): Promise<AudioBuffer | null> {
  const c = context();
  if (!c) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio ${res.status} ${url}`);
  return await c.decodeAudioData(await res.arrayBuffer());
}

/** Load one sound under a name. Call it after the first frame; a failed load only means silence. */
export function loadSound(name: string, url: string): Promise<void> {
  if (TEST) return Promise.resolve();
  const existing = pending.get(name);
  if (existing) return existing;
  const p = fetchBuffer(url).then((b) => { if (b) buffers.set(name, b); }).catch(() => { /* silent: the game plays on */ });
  pending.set(name, p);
  return p;
}

/** Load several sounds: { coin: '/assets/library/...ogg', hit: '...' }. */
export function loadSounds(map: Record<string, string>): Promise<void> {
  return Promise.all(Object.entries(map).map(([name, url]) => loadSound(name, url))).then(() => undefined);
}

/** Play a loaded sound once. Dropped before the first touch, while muted, or if it has not loaded. */
export function play(name: string, opts: { volume?: number; rate?: number } = {}): void {
  const c = ctx;
  const buffer = buffers.get(name);
  if (!c || !master || !unlocked || muted || !buffer || c.state !== 'running') return;
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = opts.rate ?? 1;
  const gain = c.createGain();
  gain.gain.value = Math.max(0, Math.min(1, opts.volume ?? 1));
  src.connect(gain).connect(master);
  src.start();
}

async function beginMusic(): Promise<void> {
  const c = context();
  if (!c || !master || !musicUrl || musicNode) return;
  const url = musicUrl;
  let buffer = buffers.get(`music:${url}`) ?? null;
  if (!buffer) {
    try { buffer = await fetchBuffer(url); } catch { return; }
    if (!buffer) return;
    buffers.set(`music:${url}`, buffer);
  }
  if (musicUrl !== url || musicNode) return;   // changed or started while loading
  musicGain = c.createGain();
  musicGain.gain.value = musicVolume;
  musicNode = c.createBufferSource();
  musicNode.buffer = buffer;
  musicNode.loop = true;
  musicNode.connect(musicGain).connect(master);
  musicNode.start();
}

/** Loop a music track. It starts on the player's first touch if that has not happened yet. */
export function startMusic(url: string, opts: { volume?: number } = {}): void {
  if (TEST) return;
  if (musicUrl === url && musicNode) return;
  stopMusic();
  musicUrl = url;
  musicVolume = Math.max(0, Math.min(1, opts.volume ?? 0.5));
  if (unlocked) void beginMusic();
}

export function stopMusic(): void {
  try { musicNode?.stop(); } catch { /* already stopped */ }
  musicNode?.disconnect();
  musicGain?.disconnect();
  musicNode = null;
  musicGain = null;
  musicUrl = null;
}

/** The game's mute control. Give every game with sound one. */
export function setMuted(value: boolean): void {
  muted = value;
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 1, ctx.currentTime, 0.02);
}
export function isMuted(): boolean { return muted; }

function unlock(): void {
  if (unlocked) return;
  const c = context();
  if (!c) return;
  unlocked = true;
  void c.resume().then(() => { if (musicUrl) void beginMusic(); }).catch(() => { /* stays silent */ });
}

if (!TEST && typeof window !== 'undefined') {
  // The first touch unlocks audio; the listeners stay passive and never block the game's own input.
  for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, unlock, { once: true, passive: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !unlocked) return;
    if (document.hidden) void ctx.suspend().catch(() => {});
    else void ctx.resume().catch(() => {});
  });
}
