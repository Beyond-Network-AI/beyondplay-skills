import { useEffect, useRef, useState } from 'react';
import { RunnerGame, DT, LIVES, type Verb } from './game';
import { RunnerScene } from './scene';
import { challenge } from './beyondplay.config';
import { getMatch } from './beyondplay-kit';
import { haptic } from './haptics';
import { can, onCapabilities, request } from './beyondplay-platform';
import { Callout, EndCard, Hearts, Hud, HudButton, HudRow, Stat } from './beyondplay-hud';
import { isMuted, loadSounds, play, setMuted, startMusic } from './beyondplay-audio';

// The shell of the runner starter: one canvas, the HUD kit over it, an end card.
// It turns real time into whole engine steps, shows what the engine reports
// (scene, sound, haptics) and never decides gameplay. Swipe left or right to
// change lane, up (or tap) to jump, down to slide; arrows, WASD and Space do the
// same on a keyboard. Keep the loop, the hold, the ready call, the single
// submit, the replay paths and the test hook.
const DT_MS = DT * 1000;
const SWIPE = 24; // pixels before a drag counts as a swipe

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [muted, setMutedState] = useState(isMuted());
  const [callout, setCallout] = useState<string | null>(null);
  const [over, setOver] = useState<null | { score: number; coins: number; metres: number; finished: boolean }>(null);
  // The platform's share: shown only where the host offers it.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => onCapabilities(() => setCanShare(can('share'))), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Test mode, only under ?bp_test=1: the loop draws but never steps; the checks step the engine.
    const testMode = new URLSearchParams(window.location.search).get('bp_test') === '1';
    const scene = new RunnerScene(canvas, testMode);

    const g = new RunnerGame(getMatch()?.seed ?? null, {
      onScoreChange: (s) => { setScore(s); challenge.progress(s); },
      onCoin: (n) => { setCoins(n); play('coin', { volume: 0.5 }); haptic('selection'); },
      onMove: (verb) => {
        if (verb === 'jump') { scene.event('jump'); play('jump', { volume: 0.5 }); }
        else if (verb === 'slide') { scene.event('slide'); play('slide', { volume: 0.4 }); }
        haptic('impact-light');
      },
      onLand: () => scene.event('land'),
      onHit: (left) => { setLives(left); scene.event('hit'); play('hit'); haptic('impact-heavy'); },
      onGameOver: (s, finished) => {
        scene.event(finished ? 'win' : 'down');
        play(finished ? 'win' : 'lose');
        haptic(finished ? 'success' : 'error');
        setCallout(null);
        setOver({ score: s, coins: g.coins, metres: Math.floor(g.z), finished });
        challenge.submit(s); // exactly once per run, through the kit
      },
    });
    const reset = () => { setOver(null); setCoins(0); setLives(LIVES); setCallout(null); g.reset(); scene.event('run'); };
    resetRef.current = reset;
    (window as any).BeyondPlay?.on?.('play_again', reset);

    // The test hook: the checks step the engine through tick(n) and play it through the verbs.
    if (testMode) {
      const at = (verb: Verb) => (step: number) => g.inputAtStep(step, verb);
      (window as any).__bpTest = {
        leftAtStep: at('left'),
        rightAtStep: at('right'),
        jumpAtStep: at('jump'),
        slideAtStep: at('slide'),
        tick: (n: number) => { for (let i = 0; i < n; i++) g.stepOnce(); },
        state: () => ({
          phase: g.phase,
          score: g.score,
          step: g.step,
          hash: g.hash,
          z: Math.round(g.z * 100),          // centimetres
          lane: g.lane,
          y: Math.round(g.y * 100),
          sliding: g.sliding,
          speed: Math.round(g.speed * 100),  // centimetres a second
          lives: g.lives,
          plan: g.rows.map((r) => [Math.round(r.z * 100), r.cells[0], r.cells[1], r.cells[2]]),
        }),
        perf: () => scene.perf(),
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

    // Input: pointer events first (a swipe or a tap), keys as an addition. Every
    // input is recorded and applied by the engine on its next step.
    const act = (verb: Verb) => { if (g.phase === 'playing' && live.current) g[verb](); };
    let down: { id: number; x: number; y: number; used: boolean } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, used: false };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!down || down.id !== e.pointerId || down.used) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
      down.used = true;
      if (Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'left' : 'right');
      else act(dy < 0 ? 'jump' : 'slide');
    };
    const onPointerUp = (e: PointerEvent) => {
      if (down && down.id === e.pointerId && !down.used) act('jump'); // a tap jumps
      down = null;
    };
    const KEYS: Record<string, Verb> = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'jump', w: 'jump', ' ': 'jump', arrowdown: 'slide', s: 'slide' };
    const onKeyDown = (e: KeyboardEvent) => {
      const verb = KEYS[e.key.toLowerCase()];
      if (!verb || e.repeat) return;
      e.preventDefault();
      act(verb);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);

    const resize = () => scene.resize(window.innerWidth, window.innerHeight);
    resize();
    window.addEventListener('resize', resize);

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
      scene.draw(g, dtSec);
      if (!readySent) {
        readySent = true;
        (window as any).BeyondPlay?.ready?.(); // after the first real draw
        // Everything heavier loads after the first frame and never blocks play.
        void scene.loadCharacter();
        void loadSounds({
          coin: '/assets/library/sfx-core/coin/sfx-coin-cluster2.ogg',
          jump: '/assets/library/sfx-core/jump/sfx-jump-38.ogg',
          slide: '/assets/library/sfx-core/jump/sfx-jump-04.ogg',
          hit: '/assets/library/sfx-core/hit/sfx-sounds-impact10.ogg',
          lose: '/assets/library/sfx-core/lose/sfx-sounds-error10.ogg',
          win: '/assets/library/music-core/stinger/win-jingle.ogg',
        });
        startMusic('/assets/library/music-core/loop/chase-level-2.ogg', { volume: 0.35 });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', resize);
      scene.dispose();
    };
  }, []);

  // One word when the last life is left; the kit shows it for a moment.
  useEffect(() => { if (lives === 1 && !over) setCallout('Last life'); }, [lives, over]);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', touchAction: 'none' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }} />
      <Hud>
        <HudRow
          at="top"
          left={<><Stat value={score} large /><Hearts value={lives} max={LIVES} /></>}
          right={<>
            <HudButton icon={muted ? 'mute' : 'sound'} label="Sound" onPress={() => { setMuted(!muted); setMutedState(!muted); }} />
            <Stat icon="coin" value={coins} />
          </>}
        />
        <Callout text={callout} tone="danger" />
      </Hud>
      {over && (
        <EndCard
          score={over.score}
          title={over.finished ? 'Finished' : 'Score'}
          lines={[`${over.metres} m`, `${over.coins} coins`]}
          onPlayAgain={() => resetRef.current()}
          onShare={canShare ? () => { request('share', { score: over.score }).catch(() => {}); } : undefined}
        />
      )}
    </div>
  );
}
