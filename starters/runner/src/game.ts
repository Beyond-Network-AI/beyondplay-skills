// Runner starter engine: three lanes, obstacles to dodge, jump or slide under,
// coins to pick up, sixty seconds or three hits. Make it your own game: change
// the obstacles, the speed curve, the scoring. Keep its shape: it is the
// deterministic core the platform's checks rely on.
//
// Determinism contract (duel fairness):
//   - The whole course (rows of obstacles, lines of coins) is drawn up front
//     from the match seed. Never Math.random after start, never the wall clock.
//   - Time is a step counter at a fixed 1/120 s. The shell converts real time
//     into whole steps; the engine never reads a clock.
//   - Inputs are applied at exact steps (leftAtStep, jumpAtStep, ...), so the
//     same seed and the same inputs give the same run, hash and score anywhere.
//   - The engine knows nothing about meshes, clips or sound: the shell listens
//     to its events and shows them.
//
// A run must end, and no score is free:
//   - The course never runs out. It is planned a chunk at a time, ahead of the
//     runner, each chunk its own stream of the seed (planChunk). A course drawn
//     once to a fixed length ends somewhere, and past its end there is nothing
//     to hit: the score climbs for nothing.
//   - This starter ends a run by the clock (RUN_STEPS). If you make it endless,
//     keep the difficulty rising for as long as a run can last (the speed, how
//     little room a row leaves) until nobody gets through; never let it go flat.
//   - Set maxValue in src/beyondplay.config.ts from these numbers: just above
//     the best an honest run can reach.

export const DT = 1 / 120;
export const RUN_STEPS = Math.round(60 / DT); // a 60 second run
export const LANES = [-1, 0, 1] as const;
export const LIVES = 3;

const SPEED_START = 8;      // metres a second
const SPEED_END = 14;
const GRAVITY = 22;
const JUMP_SPEED = 7;       // 0.64 s in the air, 1.1 m at the top
const SLIDE_STEPS = Math.round(0.7 / DT);
const SAFE_STEPS = Math.round(1 / DT);  // no second hit for a second after one
const CLEAR_HEIGHT = 0.6;   // a low obstacle is cleared above this
const COURSE_START = 30;    // metres of clear road before the first row
const CHUNK = 400;          // metres of course planned at a time
const PLAN_LEAD = 120;      // plan the next chunk when the runner is this close to the end of the plan (more than is drawn ahead)

/** What stands in one lane of a row. */
export const NONE = 0;
export const LOW = 1;   // jump over it
export const HIGH = 2;  // slide under it
export const WALL = 3;  // change lane
export type Cell = typeof NONE | typeof LOW | typeof HIGH | typeof WALL;

export interface Row { z: number; cells: [Cell, Cell, Cell]; passed: boolean }
export interface Coin { z: number; lane: number; taken: boolean }
export type Verb = 'left' | 'right' | 'jump' | 'slide';

export interface GameEvents {
  onScoreChange?: (score: number) => void;
  onCoin?: (coins: number) => void;
  onMove?: (verb: Verb) => void;
  onLand?: () => void;
  onHit?: (lives: number) => void;
  onGameOver?: (score: number, finished: boolean) => void;
}

// ── Seeded PRNG (same construction as the platform seed bootstrap) ──────────
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RunnerGame {
  phase: 'playing' | 'gameover' = 'playing';
  finished = false;   // true when the run reached the full sixty seconds
  score = 0;
  step = 0;
  hash = 2166136261;  // FNV-1a fold of the visible state, per step
  z = 0;              // metres run
  lane = 0;           // -1, 0, 1
  y = 0;              // height above the ground
  sliding = 0;        // steps of slide left
  lives = LIVES;
  coins = 0;
  speed = SPEED_START;
  rows: Row[] = [];
  coinList: Coin[] = [];
  private vy = 0;
  private safe = 0;
  private slideOnLand = false;
  private nextRow = 0;
  private nextCoin = 0;
  private planEnd = 0;   // the course is planned up to here (metres)
  private chunk = 0;     // how many chunks are planned
  private queue = new Map<number, Verb[]>();
  private readonly cosmetic = mulberry32(0x9e3779b9); // never touches gameplay

  constructor(private readonly seed: string | null, private readonly ev: GameEvents = {}) {
    this.reset();
  }

  /**
   * Plan the next chunk of the course. Each chunk is its own stream of the seed, so the course is
   * the same for both players however far a run gets, and there is always more of it.
   */
  private planChunk(): void {
    const rng = mulberry32(xmur3(`${this.seed ?? 'solo-fallback-seed'}:${this.chunk}`)());
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length)];
    const end = this.planEnd + CHUNK;
    let z = this.chunk === 0 ? COURSE_START : this.planEnd;
    while (z < end) {
      const cells: [Cell, Cell, Cell] = [NONE, NONE, NONE];
      const p = this.rows.length < 3 ? rng() * 0.45 : rng(); // the first rows are the easy kinds
      if (p < 0.25) cells[1 + pick(LANES)] = WALL;
      else if (p < 0.45) cells[1 + pick(LANES)] = LOW;
      else if (p < 0.6) { const open = pick(LANES); for (const l of LANES) if (l !== open) cells[1 + l] = WALL; }
      else if (p < 0.75) cells.fill(LOW);
      else if (p < 0.88) cells.fill(HIGH);
      else {
        // One of each, shuffled by hand: Array.sort with a random comparator differs between browsers.
        const order: Cell[] = [WALL, LOW, HIGH];
        for (let i = 2; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
        cells[0] = order[0]; cells[1] = order[1]; cells[2] = order[2];
      }
      this.rows.push({ z, cells, passed: false });
      const gap = 14 + rng() * 6;
      // A line of five coins in one lane, in the middle of the gap to the next row.
      const lane = pick(LANES);
      for (let i = 0; i < 5; i++) this.coinList.push({ z: z + gap / 2 + (i - 2) * 1.6, lane, taken: false });
      z += gap;
    }
    this.planEnd = z;
    this.chunk += 1;
  }

  reset(): void {
    this.rows = [];
    this.coinList = [];
    this.planEnd = 0;
    this.chunk = 0;
    this.planChunk();
    this.phase = 'playing';
    this.finished = false;
    this.score = 0; this.step = 0; this.hash = 2166136261;
    this.z = 0; this.lane = 0; this.y = 0; this.vy = 0; this.sliding = 0;
    this.lives = LIVES; this.coins = 0; this.speed = SPEED_START;
    this.safe = 0; this.slideOnLand = false; this.nextRow = 0; this.nextCoin = 0;
    this.queue.clear();
    this.ev.onScoreChange?.(0);
  }

  /** Cosmetic randomness for particles and shake; never feeds the simulation. */
  cosmeticRng(): number { return this.cosmetic(); }

  // Live input: applied on the next step.
  left(): void { this.inputAtStep(this.step + 1, 'left'); }
  right(): void { this.inputAtStep(this.step + 1, 'right'); }
  jump(): void { this.inputAtStep(this.step + 1, 'jump'); }
  slide(): void { this.inputAtStep(this.step + 1, 'slide'); }

  /** Schedule an input at an exact step (the checks use this). */
  inputAtStep(step: number, verb: Verb): void {
    const at = Math.max(step, this.step + 1);
    const list = this.queue.get(at);
    if (list) list.push(verb); else this.queue.set(at, [verb]);
  }

  private apply(verb: Verb): void {
    if (verb === 'left' && this.lane > -1) { this.lane -= 1; this.ev.onMove?.(verb); }
    else if (verb === 'right' && this.lane < 1) { this.lane += 1; this.ev.onMove?.(verb); }
    else if (verb === 'jump' && this.y === 0) { this.vy = JUMP_SPEED; this.sliding = 0; this.slideOnLand = false; this.ev.onMove?.(verb); }
    else if (verb === 'slide') {
      if (this.y > 0) { this.vy = Math.min(this.vy, -12); this.slideOnLand = true; } // drop, then slide
      else { this.sliding = SLIDE_STEPS; this.ev.onMove?.(verb); }
    }
  }

  private hit(): void {
    if (this.safe > 0) return;
    this.lives -= 1;
    this.safe = SAFE_STEPS;
    this.ev.onHit?.(this.lives);
    if (this.lives <= 0) this.end(false);
  }

  private end(finished: boolean): void {
    this.phase = 'gameover';
    this.finished = finished;
    this.ev.onGameOver?.(this.score, finished);
  }

  stepOnce(): void {
    if (this.phase !== 'playing') return;
    this.step += 1;
    const inputs = this.queue.get(this.step);
    if (inputs) { this.queue.delete(this.step); for (const v of inputs) this.apply(v); }

    this.speed = Math.min(SPEED_END, SPEED_START + (SPEED_END - SPEED_START) * (this.step / RUN_STEPS));
    this.z += this.speed * DT;
    while (this.z + PLAN_LEAD > this.planEnd) this.planChunk(); // the course never runs out

    if (this.y > 0 || this.vy > 0) {
      this.vy -= GRAVITY * DT;
      this.y += this.vy * DT;
      if (this.y <= 0) {
        this.y = 0; this.vy = 0;
        this.ev.onLand?.();
        if (this.slideOnLand) { this.slideOnLand = false; this.sliding = SLIDE_STEPS; this.ev.onMove?.('slide'); }
      }
    }
    if (this.sliding > 0) this.sliding -= 1;
    if (this.safe > 0) this.safe -= 1;

    // Rows and coins are sorted by z: walk the ones the runner crossed this step.
    while (this.nextRow < this.rows.length && this.rows[this.nextRow].z <= this.z) {
      const row = this.rows[this.nextRow++];
      row.passed = true;
      const cell = row.cells[1 + this.lane];
      if (cell === WALL || (cell === LOW && this.y < CLEAR_HEIGHT) || (cell === HIGH && this.sliding === 0)) this.hit();
      if (this.phase !== 'playing') return;
    }
    while (this.nextCoin < this.coinList.length && this.coinList[this.nextCoin].z <= this.z) {
      const coin = this.coinList[this.nextCoin++];
      if (coin.lane === this.lane && this.y < 1.2) { coin.taken = true; this.coins += 1; this.ev.onCoin?.(this.coins); }
    }

    const score = Math.floor(this.z) + this.coins * 10;
    if (score !== this.score) { this.score = score; this.ev.onScoreChange?.(score); }

    // Fold the visible state into the trajectory hash.
    let h = this.hash;
    for (const n of [this.lane + 1, Math.round(this.y * 100), Math.round(this.z * 100), this.score, this.lives, this.sliding > 0 ? 1 : 0]) {
      h ^= n & 0xffff; h = Math.imul(h, 16777619);
    }
    this.hash = h >>> 0;

    if (this.step >= RUN_STEPS) this.end(true);
  }
}
