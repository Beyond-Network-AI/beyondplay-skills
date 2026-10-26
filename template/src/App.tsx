import { useEffect, useRef, useState } from 'react';
import { TapTimingGame, DESIGN_W, DESIGN_H, DT, ROUNDS, ROUND_STEPS } from './game';
import { challenge } from './beyondplay.config';
import { getMatch } from './beyondplay-kit';
import { haptic } from './haptics';

// The shell: one canvas, a HUD, an end card. It converts real time into whole
// engine steps and draws; it never decides gameplay. Replace the drawing and
// the HUD with your game's; keep the loop, the hold, the ready call, the single
// submit, the replay paths and the test hook.
const DT_MS = DT * 1000;
const FONT = "'Geist', system-ui, -apple-system, sans-serif";

interface Spark { x: number; y: number; vx: number; vy: number; life: number }

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<TapTimingGame | null>(null);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [over, setOver] = useState<null | { score: number; hits: number; perfects: number }>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sparks: Spark[] = [];
    let flash = 0;
    let shake = 0;
    const g = new TapTimingGame(getMatch()?.seed ?? null, {
      onScoreChange: (s) => { setScore(s); challenge.progress(s); },
      onRoundChange: (r) => setRound(r),
      onHit: (_points, perfect) => {
        flash = 1;
        haptic(perfect ? 'success' : 'impact-light');
        for (let i = 0; i < 24; i++) {
          const a = g.cosmeticRng() * Math.PI * 2;
          const sp = 80 + g.cosmeticRng() * 220;
          sparks.push({ x: DESIGN_W / 2, y: DESIGN_H * 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + g.cosmeticRng() * 0.4 });
        }
      },
      onMiss: () => { shake = 6; haptic('warning'); },
      onGameOver: (s) => {
        setOver({ score: s, hits: g.hits, perfects: g.perfects });
        challenge.submit(s);            // exactly once per run, through the kit
      },
    });
    gameRef.current = g;

    const reset = () => { setOver(null); g.reset(); };
    (window as any).BeyondPlay?.on?.('play_again', reset);

    // Test hook, only under ?bp_test=1. In test mode the loop draws but never
    // steps; the checks step the engine through tick(n).
    const params = new URLSearchParams(window.location.search);
    const testMode = params.get('bp_test') === '1';
    if (testMode) {
      (window as any).__bpTest = {
        tapAtStep: (step: number) => g.tapAtStep(step),
        tick: (n: number) => { for (let i = 0; i < n; i++) g.stepOnce(); },
        state: () => ({
          phase: g.phase,
          score: g.score,
          round: g.round,
          step: g.step,
          roundStep: g.roundStep,
          roundSteps: ROUND_STEPS,
          hash: g.hash,
          plan: g.rounds.map((r) => [Math.round(r.zoneStart * 1000), Math.round(r.zoneWidth * 1000), Math.round(r.speed * 10)]),
        }),
        reset,
      };
    }

    // Preboot hold: the feed boots neighbour cards early. Paint, but do not run
    // the simulation until this iframe is in the top-level viewport.
    const live = { current: testMode };
    try {
      const io = new IntersectionObserver((es) => {
        if (es.some((e) => e.isIntersecting && e.intersectionRatio >= 0.4)) { live.current = true; io.disconnect(); }
      }, { threshold: [0, 0.4, 1] });
      io.observe(document.documentElement);
      if (!testMode) setTimeout(() => { if (!live.current && window.self === window.top) live.current = true; }, 1500);
    } catch { live.current = true; }

    // Input: pointer events only, captured, applied on the next step.
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      if (g.phase === 'playing' && live.current) g.tap();
    };
    canvas.addEventListener('pointerdown', onPointerDown);

    // Fit the design space to the viewport (letterboxed), device pixel ratio capped at 2.
    const view = { scale: 1, offX: 0, offY: 0 };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      view.scale = Math.min(w / DESIGN_W, h / DESIGN_H) * dpr;
      view.offX = (canvas.width - DESIGN_W * view.scale) / 2;
      view.offY = (canvas.height - DESIGN_H * view.scale) / 2;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (dtSec: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const jitter = shake > 0 ? (g.cosmeticRng() - 0.5) * shake : 0;
      ctx.setTransform(view.scale, 0, 0, view.scale, view.offX + jitter, view.offY);
      shake = Math.max(0, shake - dtSec * 30);
      flash = Math.max(0, flash - dtSec * 3);

      // Backdrop
      const grad = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
      grad.addColorStop(0, '#15204a');
      grad.addColorStop(1, '#0b1020');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

      // The bar, the zone, the marker
      const barY = DESIGN_H * 0.5;
      const barX0 = 36, barX1 = DESIGN_W - 36;
      const r = g.rounds[Math.min(g.round, ROUNDS - 1)];
      ctx.lineCap = 'round';
      ctx.lineWidth = 18;
      ctx.strokeStyle = '#273363';
      ctx.beginPath(); ctx.moveTo(barX0, barY); ctx.lineTo(barX1, barY); ctx.stroke();
      ctx.strokeStyle = flash > 0 ? `rgba(255, 220, 120, ${0.6 + flash * 0.4})` : '#f5b942';
      ctx.beginPath();
      ctx.moveTo(barX0 + (barX1 - barX0) * r.zoneStart, barY);
      ctx.lineTo(barX0 + (barX1 - barX0) * (r.zoneStart + r.zoneWidth), barY);
      ctx.stroke();
      const pos = g.phase === 'playing' ? g.markerAt(g.roundStep) : 0;
      const mx = barX0 + (barX1 - barX0) * pos;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(mx, barY, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7ad7ff';
      ctx.beginPath(); ctx.arc(mx, barY, 7, 0, Math.PI * 2); ctx.fill();

      // Round pips
      for (let i = 0; i < ROUNDS; i++) {
        ctx.fillStyle = i < g.round ? '#f5b942' : i === g.round ? '#ffffff' : '#273363';
        ctx.beginPath(); ctx.arc(DESIGN_W / 2 + (i - (ROUNDS - 1) / 2) * 22, barY + 56, 5, 0, Math.PI * 2); ctx.fill();
      }

      // Sparks (cosmetic)
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= dtSec; s.x += s.vx * dtSec; s.y += s.vy * dtSec; s.vy += 300 * dtSec;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.fillStyle = '#ffd98a';
        ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
    };

    // Accumulator loop: real time in, whole steps out. Test mode never steps here.
    let last = performance.now(); // render clock only; the engine counts steps
    let acc = 0;
    let raf = 0;
    let readySent = false;
    const frame = (now: number) => {
      const dtSec = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!testMode && live.current) {
        acc += dtSec * 1000;
        while (acc >= DT_MS) { g.stepOnce(); acc -= DT_MS; }
      }
      draw(dtSec);
      if (!readySent) { readySent = true; (window as any).BeyondPlay?.ready?.(); } // after the first real draw
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', touchAction: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none', fontFamily: FONT }}>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>{score}</div>
        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>{Math.min(round + 1, ROUNDS)} / {ROUNDS}</div>
      </div>
      {over && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(5, 8, 20, 0.72)', fontFamily: FONT }}>
          <div style={{ textAlign: 'center', padding: 28, borderRadius: 24, background: '#141c3a', minWidth: 240 }}>
            <div style={{ fontSize: 13, opacity: 0.6, letterSpacing: 2 }}>SCORE</div>
            <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2 }}>{over.score}</div>
            <div style={{ fontSize: 14, opacity: 0.75, marginTop: 4 }}>{over.hits} hits, {over.perfects} perfect</div>
            <button
              onPointerUp={() => { setOver(null); gameRef.current?.reset(); }}
              style={{ marginTop: 20, padding: '14px 28px', borderRadius: 999, border: 0, background: '#f5b942', color: '#1a1300', fontSize: 16, fontWeight: 800, fontFamily: FONT, touchAction: 'manipulation' }}
            >
              Play again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
