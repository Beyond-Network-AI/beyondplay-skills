import React from 'react'
import ReactDOM from 'react-dom/client'
// FIRST, before any game module draws: WebKit canvas-image hardening (see
// the module header for the WKWebView decode-curse it heals — white screens /
// invisible sprites on iOS that no Chromium-based battery can catch). An
// explicit call, not a bare side-effect import — bundlers tree-shake those.
import { installWebKitImageHardening } from './webkit-image-hardening'

installWebKitImageHardening()
import App from './App'
import './index.css'

// ── Platform shell ───────────────────────────────────────────────────────
// This file is platform-owned wiring: the auth listener and the
// window.BeyondPlay SDK below are what every published game ships, so a game
// built from this kit behaves identically inside the BeyondPlay app. Do not
// edit it; the validator compares it with template/src/main.tsx by hash.
//
// One difference from the shell the platform installs at build time: the
// leaderboard write in bpSubmitScore. Published games write the score through
// the platform's private data SDK; this local copy only posts the message, so
// a game plays and tests the same way here without that SDK. The hosted build
// (the creator MCP's start_build) replaces this file with the platform's own.

const ALLOWED_PARENT_ORIGINS = [
  'https://studio.beyondplay.xyz',
  'https://beyondplay.xyz',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const isAllowedOrigin = (origin: string): boolean => {
  if (ALLOWED_PARENT_ORIGINS.includes(origin)) {
    return true;
  }
  if (origin.endsWith('.vercel.app')) {
    return true;
  }
  if (origin.endsWith('.beyondplay.xyz')) {
    return true;
  }
  return false;
};

const usedNonces = new Set<string>();

window.addEventListener('message', (event) => {
  if (!isAllowedOrigin(event.origin)) {
    console.warn('[BeyondPlay] Rejected message from untrusted origin:', event.origin);
    return;
  }
  if (event.data?.type !== 'accelerate:auth') {
    return;
  }
  const { nonce, proof } = event.data;
  if (!nonce || !proof) {
    console.warn('[BeyondPlay] Auth message missing nonce or proof');
    return;
  }
  if (usedNonces.has(nonce)) {
    console.warn('[BeyondPlay] Rejected replay attack with nonce:', nonce);
    return;
  }
  usedNonces.add(nonce);
  (window as any).__accelerateAuthProof = proof;
  window.dispatchEvent(new CustomEvent('accelerate:auth-ready', { detail: { proof } }));
  console.debug('[BeyondPlay] Auth proof received from parent');
});

// ── BeyondPlay platform SDK (game-over contract) ─────────────────────────
// Games report outcomes with ONE call: window.BeyondPlay?.gameOver({ score }).
type BPGameOverOpts = { score: number; board?: string; sortOrder?: 'asc' | 'desc' };
const bpListeners: { [event: string]: Array<() => void> } = {};

function bpPost(message: Record<string, unknown>): void {
  const json = JSON.stringify(message);
  try {
    (window as any).ReactNativeWebView?.postMessage(json);
  } catch { /* not in the app shell */ }
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, '*');
    }
  } catch { /* no embedding parent */ }
}

async function bpSubmitScore(opts: BPGameOverOpts): Promise<void> {
  // Local kit: no leaderboard write (the platform's shell does it in production).
  // The message below is what the embedding app and the smokes listen for.
  try {
    bpPost({ type: 'bp_score_submitted', score: opts.score, board: opts.board ?? 'highscores' });
  } catch (e) {
    console.warn('[BeyondPlay] score submit failed:', e);
  }
}

(window as any).BeyondPlay = {
  match: ((window as any).BeyondPlayMatch ?? null) as {
    seed: string;
    challengeId: string;
    mode?: string;
    opponentScore?: number | null;
    opponentName?: string | null;
    metricLabel?: string | null;
    lowerIsBetter?: boolean;
  } | null,
  ready(): void {
    bpPost({ type: 'bp_ready' });
  },
  gameOver(opts: BPGameOverOpts): void {
    const score = Number(opts?.score);
    if (!Number.isFinite(score)) return;
    bpPost({ type: 'bp_game_over', score, board: opts?.board ?? 'highscores' });
    void bpSubmitScore({ ...opts, score });
  },
  progress(opts: { score: number; board?: string }): void {
    const score = Number(opts?.score);
    if (!Number.isFinite(score)) return;
    bpPost({ type: 'bp_progress', score, board: opts?.board ?? 'highscores' });
  },
  /** Optional: fire a platform haptic. Kinds: impact-light | impact-medium | impact-heavy |
   *  success | warning | error | selection. Fire-and-forget — the shell owns surface routing
   *  (Telegram / iOS app / Android vibrate / no-op), the user preference, and throttling. */
  haptic(kind: string): void {
    if (typeof kind !== 'string') return;
    bpPost({ type: 'bp_haptic', kind });
  },
  on(event: 'play_again', cb: () => void): void {
    (bpListeners[event] = bpListeners[event] || []).push(cb);
  },
};

window.addEventListener('message', (event) => {
  if (event.data?.type === 'bp_play_again') {
    (bpListeners['play_again'] || []).forEach((cb) => {
      try { cb(); } catch (e) { console.warn('[BeyondPlay] play_again handler error:', e); }
    });
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
