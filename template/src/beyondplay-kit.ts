// BeyondPlay game-kit — challenge-unit declaration + wiring (platform-owned; do not edit).
// You declare your duel in src/beyondplay.config.ts via these; the kit handles board submission,
// the shared seed, and emitting beyondplay.json. Never call db.leaderboard() for the duel board and
// never hand-edit beyondplay.json.
//
// The DUEL UI (you-vs-opponent, score-to-beat, the win/lose result) is drawn by the BeyondPlay app
// as a minimal native strip over your game — you don't build it. These are BUILDING BLOCKS: if you
// WANT richer in-game duel UI, read getMatch() for the opponent's score-to-beat + metric, call
// challenge.progress(score) on the way up to animate it, and subscribe with onMatchResult(cb) for
// the outcome. All optional — a game that only calls submit(score) still gets the native strip.

export type SortableSeed = boolean;
export type InstanceKind = 'static' | 'daily' | 'random' | 'rotating';
/** Forward-compat: v1 ships 'score_duel'. The match object + kit are mode-discriminated so
 *  turn-based / live multiplayer reuse the same surface later. */
export type MatchMode = 'score_duel' | 'turn_based' | 'live';

export interface ChallengeDecl {
  /** What the number means on the card ("Score", "Time", "Strokes"). */
  metricLabel: string;
  /** true = lowest wins (time/strokes/moves); false/omitted = highest wins (points/distance). */
  lowerIsBetter?: boolean;
  /** Set true if content varies per play (procedural/daily/random) — the platform mints a shared
   *  seed and seeds Math.random so both players get identical content. Read it via getMatch().seed. */
  seed?: SortableSeed;
  /** Optional mode label for a multi-mode game ("Speed Run"). Defaults to metricLabel. */
  modeLabel?: string;
  /** How the content rotates. Defaults to 'random' when seed is true, else 'static'. */
  instanceKind?: InstanceKind;
  /** Optional sane score bounds for a reaction/timing game (rejects impossible values server-side). */
  minValue?: number;
  maxValue?: number;
  /** @internal — the platform assigns the board; one game = one board (no free-form ids). */
  id?: string;
}
/** @deprecated alias kept for back-compat — use ChallengeDecl. */
export type ChallengeBoardDecl = ChallengeDecl;

/** The duel outcome for THIS player, delivered to onMatchResult once the duel resolves. */
export interface MatchResult {
  outcome: 'win' | 'loss' | 'draw' | 'pending';
  yourScore: number | null;
  opponentScore: number | null;
}

export interface ChallengeHandle {
  readonly id: string;
  /** Report a FINISHED run. The kit submits to the platform board with the DECLARED direction —
   *  the only sanctioned way to score a duel. */
  submit(score: number): void;
  /** Optional live score on the way up — animates the native strip's "you" marker (no-op outside a
   *  duel). Call submit() once at game-over regardless. */
  progress(score: number): void;
  /** @internal — the raw declaration (read by the manifest emitter). */
  readonly __decl: ChallengeDecl;
}
/** @deprecated alias kept for back-compat — use ChallengeHandle. */
export type ChallengeBoardHandle = ChallengeHandle;

export interface BeyondPlayMatch {
  seed: string;
  challengeId: string;
  /** v1 = 'score_duel'. */
  mode?: MatchMode;
  /** The score to beat — the opponent's current best (null until they've played). BUILDING BLOCK. */
  opponentScore?: number | null;
  /** The opponent's display name, for an in-game "vs Alex". BUILDING BLOCK. */
  opponentName?: string | null;
  /** Human metric label ("Score" | "Time" | "Strokes"). BUILDING BLOCK. */
  metricLabel?: string | null;
  /** Win direction for the duel — lowest wins when true. BUILDING BLOCK. */
  lowerIsBetter?: boolean;
}

/** The platform-canonical board every solo + duel run lands on (no free-form board ids). */
const DEFAULT_BOARD = 'highscores';

// Module-level registry the manifest emitter reads after importing beyondplay.config.ts (Node).
// define* only RECORDS here (pure) — nothing touches window at import time.
const __registry: { challenge: ChallengeDecl | null; playerMode: 'single' | 'duel' } = {
  challenge: null,
  playerMode: 'single',
};

function bp(): any {
  return (typeof window !== 'undefined' ? (window as any).BeyondPlay : undefined) ?? undefined;
}

/** Declare HOW this game is dueled. The platform owns the board, direction, seed, reporting, and the
 *  duel UI — your only choices are what the number means, which way wins, and whether content varies.
 *  Returns a handle whose submit() scores the duel. */
export function defineChallenge(decl: ChallengeDecl): ChallengeHandle {
  __registry.challenge = decl;
  __registry.playerMode = 'duel';
  const board = decl.id ?? DEFAULT_BOARD;
  const sortOrder = decl.lowerIsBetter ? 'asc' : 'desc';
  return {
    id: board,
    __decl: decl,
    submit(score: number) {
      const api = bp();
      if (api?.gameOver) api.gameOver({ score, board, sortOrder });
    },
    progress(score: number) {
      const api = bp();
      if (api?.progress) api.progress({ score, board });
    },
  };
}

/** @deprecated — use defineChallenge({ metricLabel, lowerIsBetter, seed }). The free-form board id is
 *  ignored (the platform assigns one board per game). Kept so older configs keep building. */
export function defineChallengeBoard(decl: ChallengeDecl): ChallengeHandle {
  return defineChallenge(decl);
}

/** Declare a solo score game. Pass a defineChallenge() result to make it duel-able, or null
 *  (or omit) for a non-duel game (share-only "Beat my run"). */
export function defineSoloGame(opts?: { challenge?: ChallengeHandle | null; lowerIsBetter?: boolean }) {
  const ch = opts?.challenge ?? null;
  if (!ch) __registry.playerMode = 'single';
  return {
    /** Report a finished run (to the duel board if declared, else the default solo board). */
    endRun(score: number) {
      if (ch) {
        ch.submit(score);
      } else {
        const api = bp();
        if (api?.gameOver) api.gameOver({ score, board: DEFAULT_BOARD, sortOrder: opts?.lowerIsBetter ? 'asc' : 'desc' });
      }
    },
    /** The shared seeded instance for this play (null for a normal play). */
    get match(): BeyondPlayMatch | null {
      return getMatch();
    },
  };
}

/** The shared seeded duel instance for this play — seed your RNG from match.seed so both players get
 *  identical content, and read match.opponentScore / match.metricLabel to render your own duel UI.
 *  Returns null for a normal (non-duel) play. */
export function getMatch(): BeyondPlayMatch | null {
  if (typeof window === 'undefined') return null;
  return ((window as any).BeyondPlay?.match ?? (window as any).BeyondPlayMatch ?? null) as BeyondPlayMatch | null;
}

/** BUILDING BLOCK — subscribe to the duel outcome (win/loss/draw) once it resolves, to render your
 *  own in-game result UI. Optional; the native strip shows the result regardless. Returns an
 *  unsubscribe fn. No-op outside a duel. */
export function onMatchResult(cb: (result: MatchResult) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: MessageEvent) => {
    const data = (e && (e as any).data) || {};
    if (data && data.type === 'bp_match_result' && data.result) {
      try { cb(data.result as MatchResult); } catch {}
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/** Build the beyondplay.json manifest from the declared kit calls. Called by scripts/emit-manifest.mjs
 *  at build (in Node) after importing beyondplay.config.ts. Maps the declaration to a ChallengeUnit. */
export function buildManifest() {
  const ch = __registry.challenge;
  if (!ch) return { playerMode: 'single', challenge: null, defaultUnitId: null };
  const boardId = ch.id ?? DEFAULT_BOARD;
  const sortOrder = ch.lowerIsBetter ? 'lower-wins' : 'higher-wins';
  const instanceKind: InstanceKind = ch.instanceKind ?? (ch.seed ? 'random' : 'static');
  const needsSeed = !!ch.seed || instanceKind !== 'static';
  const unit: Record<string, unknown> = {
    id: boardId,
    boardId: boardId,
    mode: 'score_duel',
    modeLabel: ch.modeLabel ?? ch.metricLabel,
    metricLabel: ch.metricLabel,
    valueFormat: 'INTEGER',
    sortOrder,
    aggregation: 'best',
    instanceKind,
    needsSeed,
    fairnessTier: typeof ch.minValue === 'number' || typeof ch.maxValue === 'number' ? 'bounded' : 'deterministic',
  };
  if (typeof ch.minValue === 'number') unit.minValue = ch.minValue;
  if (typeof ch.maxValue === 'number') unit.maxValue = ch.maxValue;
  return { playerMode: 'duel', challenge: [unit], defaultUnitId: boardId };
}
