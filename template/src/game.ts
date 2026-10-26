// Starter engine: Tap Timing. A marker sweeps along a bar; tap while it is in
// the lit zone. Ten rounds, one score. Replace this file with your own game but
// keep its shape: it is the deterministic core the platform's checks rely on.
//
// Determinism contract (duel fairness):
//   - Everything that varies per run (the zones, the sweep speeds) is drawn up
//     front from the match seed through a local PRNG. Never from Math.random
//     after start, never from the wall clock.
//   - Time is a step counter at a fixed 1/120 s. The shell converts real time
//     into whole steps; the engine never reads a clock.
//   - Inputs are applied at exact steps (tapAtStep), so the same seed and the
//     same inputs reproduce the same run, hash and score on any device.
//   - A trajectory hash folds the visible state every step; the seed smoke
//     compares it across two separate loads.

export const DESIGN_W = 400;
export const DESIGN_H = 640;
export const DT = 1 / 120;
export const ROUNDS = 10;
export const ROUND_STEPS = Math.round(1.5 / DT); // 180 steps, 1.5 s per round

export interface Round { zoneStart: number; zoneWidth: number; speed: number }

export interface GameEvents {
  onScoreChange?: (score: number) => void;
  onRoundChange?: (round: number) => void;
  onHit?: (points: number, perfect: boolean) => void;
  onMiss?: () => void;
  onGameOver?: (score: number) => void;
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

export class TapTimingGame {
  phase: 'playing' | 'gameover' = 'playing';
  score = 0;
  round = 0;
  step = 0;          // total steps this run
  roundStep = 0;     // steps into the current round
  hash = 2166136261; // FNV-1a fold of the visible state, per step
  rounds: Round[] = [];
  hits = 0;
  perfects = 0;
  private pending = new Set<number>();
  private readonly cosmetic = mulberry32(0x9e3779b9); // never touches gameplay

  constructor(private readonly seed: string | null, private readonly ev: GameEvents = {}) {
    this.reset();
  }

  reset(): void {
    const rng = mulberry32(xmur3(this.seed ?? 'solo-fallback-seed')());
    // Draw the whole run plan up front so play-again and duels share it.
    this.rounds = [];
    for (let i = 0; i < ROUNDS; i++) {
      const zoneWidth = 0.26 - i * 0.014;                    // 0.26 → 0.13, tighter each round
      const zoneStart = 0.08 + rng() * (0.84 - zoneWidth);
      const speed = [1, 1.5, 2][Math.min(2, Math.floor(i / 4) + (rng() < 0.3 ? 1 : 0))];
      this.rounds.push({ zoneStart, zoneWidth, speed });
    }
    this.phase = 'playing';
    this.score = 0;
    this.round = 0;
    this.step = 0;
    this.roundStep = 0;
    this.hash = 2166136261;
    this.hits = 0;
    this.perfects = 0;
    this.pending.clear();
    this.ev.onScoreChange?.(0);
    this.ev.onRoundChange?.(0);
  }

  /** Marker position along the bar, 0..1, for a step inside the current round. */
  markerAt(roundStep: number, round = this.round): number {
    const r = this.rounds[Math.min(round, ROUNDS - 1)];
    return ((roundStep * r.speed) / ROUND_STEPS) % 1;
  }

  /** Queue a tap at an exact simulation step (the test hook and the shell both use this). */
  tapAtStep(step: number): void {
    if (step > this.step) this.pending.add(step);
  }

  /** Immediate form: applies on the next step. */
  tap(): void {
    this.tapAtStep(this.step + 1);
  }

  /** Advance one fixed step. */
  stepOnce(): void {
    if (this.phase !== 'playing') return;
    this.step += 1;
    this.roundStep += 1;
    const r = this.rounds[this.round];
    const pos = this.markerAt(this.roundStep);

    if (this.pending.has(this.step)) {
      this.pending.delete(this.step);
      const inZone = pos >= r.zoneStart && pos <= r.zoneStart + r.zoneWidth;
      if (inZone) {
        const centre = r.zoneStart + r.zoneWidth / 2;
        const closeness = 1 - Math.abs(pos - centre) / (r.zoneWidth / 2); // 1 at the centre
        const perfect = closeness > 0.7;
        const points = 50 + Math.round(closeness * 50) + (perfect ? 25 : 0);
        this.score += points;
        this.hits += 1;
        if (perfect) this.perfects += 1;
        this.ev.onScoreChange?.(this.score);
        this.ev.onHit?.(points, perfect);
      } else {
        this.ev.onMiss?.();
      }
      this.nextRound();
    } else if (this.roundStep >= ROUND_STEPS) {
      this.ev.onMiss?.();
      this.nextRound();
    }

    // Fold the visible state. Quantised so the hash is stable across engines.
    this.fold(Math.round(pos * 10000));
    this.fold(this.score);
    this.fold(this.round);
  }

  private nextRound(): void {
    this.round += 1;
    this.roundStep = 0;
    this.pending.clear();
    if (this.round >= ROUNDS) {
      this.phase = 'gameover';
      this.ev.onGameOver?.(this.score);
    } else {
      this.ev.onRoundChange?.(this.round);
    }
  }

  private fold(x: number): void {
    this.hash = Math.imul(this.hash ^ (x | 0), 16777619) >>> 0;
  }

  /** Cosmetic randomness for particles; separate stream, never affects play. */
  cosmeticRng(): number {
    return this.cosmetic();
  }
}
