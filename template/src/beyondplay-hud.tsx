// The BeyondPlay HUD kit: the on-screen pieces of a game, already sized for a
// thumb and readable over any scene. Smoke modules, cream ink, one lit colour.
//
//   <Hud>
//     <HudRow at="top" left={<Stat icon="gem" value={gems} />} center={<Timer seconds={left} />}
//             right={<HudButton icon={muted ? 'mute' : 'sound'} label="Sound" onPress={toggle} />} />
//     <HudRow at="bottom" left={<Stick onMove={move} />}
//             right={<HudButton icon="dash" label="Dash" size={64} lit cooldown={cd} onPress={dash} />} />
//   </Hud>
//
// Rules it keeps for you: nothing here starts, pauses or explains a game (the
// feed card is already playing); every control is 44 px or larger; the top row
// clears the notch and the bottom row clears the home bar; motion stops under
// "reduce motion". Give it at most one lit element at a time.
//
// Layout: status at the top (what the player has), controls at the bottom (what
// the player does): movement under the left thumb, one 64 px action and at most
// one 52 px second action under the right. Keep the middle of the screen empty.
//
// On a large screen (a landscape or full-screen stage on a desktop) the same HUD
// grows with the stage, up to one and a half times, and stays in the corners. When
// the player uses a keyboard, a control that names its key shows a key cap and the
// stick gives way to its keys, which fade once the player has used them. The host
// owns Full screen, Esc and the key hint line; a game draws none of those.
//
// PLATFORM-OWNED. Do not edit: the validator compares this file with the template.
// Change its colours with setHudTheme(); ask the platform for a piece it lacks.
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface HudTheme {
  ink: string; lit: string; open: string; danger: string; smoke: string; line: string; font: string;
}
export const HUD: HudTheme = {
  ink: '#f6f2ea',
  lit: '#f2b134',
  open: '#35e0c8',
  danger: '#ff453a',
  smoke: 'rgba(16, 14, 12, 0.62)',
  line: 'rgba(246, 242, 234, 0.16)',
  font: "'Geist', system-ui, -apple-system, sans-serif",
};
/** Change the kit's colours for one game (a partial theme); call once, before the first render. */
export function setHudTheme(theme: Partial<HudTheme>): void { Object.assign(HUD, theme); }

export type Tone = 'plain' | 'lit' | 'open' | 'danger';
const toneColor = (tone: Tone = 'plain') => (tone === 'lit' ? HUD.lit : tone === 'open' ? HUD.open : tone === 'danger' ? HUD.danger : HUD.ink);

const CSS = `
@keyframes bp-hud-pop { 0% { transform: scale(1.28); } 100% { transform: scale(1); } }
@keyframes bp-hud-callout { 0% { opacity: 0; transform: translateY(8px) scale(0.92); } 12% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; transform: translateY(-6px); } }
@keyframes bp-hud-rise { 0% { opacity: 0; transform: translateY(16px) scale(0.96); } 100% { opacity: 1; transform: none; } }
@keyframes bp-hud-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.bp-hud-pop { display: inline-block; animation: bp-hud-pop 150ms cubic-bezier(0.2, 0, 0, 1); }
.bp-hud-press { transition: transform 100ms cubic-bezier(0.2, 0, 0, 1); }
.bp-hud-press:active { transform: scale(0.92); }
@media (hover: hover) { .bp-hud-press:hover { filter: brightness(1.18); } }
@media (prefers-reduced-motion: reduce) { .bp-hud-pop, .bp-hud-callout, .bp-hud-rise, .bp-hud-pulse { animation: none !important; } .bp-hud-press { transition: none; } }
`;
// ---------------------------------------------------------------- screen and input
/** How much larger the HUD draws: 1 on a phone, up to 1.5 on a large stage. */
export function hudScaleFor(width: number, height: number): number {
  return Math.max(1, Math.min(1.5, Math.min(width, height) / 480));
}
function useHudScale(): number {
  const [scale, setScale] = useState(() => hudScaleFor(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const on = () => setScale(hudScaleFor(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return scale;
}

/** What the player is holding: 'touch' (and a mouse on its own) or 'keys' once a key is pressed. */
export type InputMode = 'touch' | 'keys';
function useInputMode(): InputMode {
  const [mode, setMode] = useState<InputMode>(() => (window.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'keys'));
  useEffect(() => {
    const keys = () => setMode('keys');
    const touch = (e: PointerEvent) => { if (e.pointerType === 'touch') setMode('touch'); };
    window.addEventListener('keydown', keys);
    window.addEventListener('pointerdown', touch, true);
    return () => { window.removeEventListener('keydown', keys); window.removeEventListener('pointerdown', touch, true); };
  }, []);
  return mode;
}
const HudContext = createContext<{ scale: number; mode: InputMode }>({ scale: 1, mode: 'touch' });

/** A key as the player sees it on the keyboard. */
function KeyCap({ children, lit }: { children: ReactNode; lit?: boolean }) {
  return (
    <span style={{ minWidth: 22, height: 22, padding: '0 6px', borderRadius: 6, background: lit ? HUD.lit : HUD.ink, color: '#1a1300', fontFamily: HUD.font, fontSize: 12, fontWeight: 700, lineHeight: '22px', textAlign: 'center', boxSizing: 'border-box', boxShadow: '0 2px 0 rgba(0, 0, 0, 0.45)', display: 'inline-block', whiteSpace: 'nowrap' }}>{children}</span>
  );
}

function useHudStyle(): void {
  useEffect(() => {
    if (document.getElementById('bp-hud-style')) return;
    const el = document.createElement('style');
    el.id = 'bp-hud-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

const module = (height: number): CSSProperties => ({
  height, minWidth: height, borderRadius: height / 2, background: HUD.smoke, border: `1px solid ${HUD.line}`,
  color: HUD.ink, fontFamily: HUD.font, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
});

// ---------------------------------------------------------------- icons
// Stroke 2 on a 24 box, the same family as the platform's own glyphs.
const PATHS: Record<string, ReactNode> = {
  heart: <path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z" />,
  gem: <><path d="M6.5 4h11L21 9.5 12 20.5 3 9.5z" /><path d="M3 9.5h18M9 4 7.5 9.5 12 20.5l4.5-11L15 4" /></>,
  coin: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.5 9.8c0-1 1-1.8 2.5-1.8s2.5.8 2.5 1.8c0 2.4-5 1.6-5 4.2 0 1 1 2 2.5 2s2.5-.9 2.5-2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  bolt: <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" />,
  star: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z" />,
  shield: <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z" />,
  skull: <><path d="M12 3a8 8 0 0 0-5 14.2V20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2.8A8 8 0 0 0 12 3z" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><path d="M10.5 21v-2.5M13.5 21v-2.5" /></>,
  sound: <><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" /></>,
  mute: <><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></>,
  dash: <path d="M4 12h6M4 7.5h3M4 16.5h3M12 6l6 6-6 6M17 6l6 6-6 6" />,
  jump: <path d="M12 20V5M5.5 11.5 12 5l6.5 6.5" />,
  sword: <path d="M19.5 4.5 9 15M19.5 4.5h-5M19.5 4.5v5M6 12l6 6M4.5 19.5l3-3M8.5 17.5l-2 2" />,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" /></>,
  flame: <path d="M12 21.5c-3.6 0-6.5-2.7-6.5-6.3 0-3 2-4.7 3-7.2.6 1.5 1.5 2.3 2.5 2.8C11 7.5 12 5 14.5 2.5c.3 3.5 4 5.7 4 10.7 0 4.6-2.9 8.3-6.5 8.3z" />,
  share: <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 13v6a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6" />,
  replay: <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4.5v4.5h4.5" />,
};
export type IconName = 'heart' | 'gem' | 'coin' | 'clock' | 'bolt' | 'star' | 'shield' | 'skull' | 'sound' | 'mute' | 'dash' | 'jump' | 'sword' | 'target' | 'flame' | 'share' | 'replay';

export function Icon({ name, size = 20, color, filled }: { name: IconName; size?: number; color?: string; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? (color ?? 'currentColor') : 'none'} stroke={color ?? 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
      {PATHS[name]}
    </svg>
  );
}

// ---------------------------------------------------------------- layout
/** The overlay. Put it after the canvas; it never takes a touch itself. */
export function Hud({ children }: { children?: ReactNode }) {
  useHudStyle();
  const scale = useHudScale();
  const mode = useInputMode();
  // `zoom` scales the layout, not a picture of it: the rows stay on the stage's edges at any size.
  return (
    <HudContext.Provider value={{ scale, mode }}>
      <div data-bp-hud="" data-bp-hud-mode={mode} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: HUD.font, color: HUD.ink, WebkitFontSmoothing: 'antialiased', zoom: scale }}>
        {children}
      </div>
    </HudContext.Provider>
  );
}

/**
 * A row pinned to the top (status) or the bottom (controls), clear of the notch and the home bar.
 * `wide` is one more line across the full width, toward the middle of the screen: a level bar, a boss bar.
 */
export function HudRow({ at, left, center, right, wide }: { at: 'top' | 'bottom'; left?: ReactNode; center?: ReactNode; right?: ReactNode; wide?: ReactNode }) {
  const edge: CSSProperties = at === 'top'
    ? { top: 'max(12px, env(safe-area-inset-top))', alignItems: 'flex-start' }
    : { bottom: 'max(20px, calc(env(safe-area-inset-bottom) + 12px))', alignItems: 'flex-end' };
  const cell = (justify: string): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap: 8, alignItems: justify, minWidth: 0 });
  return (
    <div style={{ position: 'absolute', left: 'max(12px, env(safe-area-inset-left))', right: 'max(12px, env(safe-area-inset-right))', display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, ...edge }}>
      <div style={cell('flex-start')}>{left}</div>
      <div style={cell('center')}>{center}</div>
      <div style={cell('flex-end')}>{right}</div>
      {wide && <div style={{ gridColumn: '1 / -1', gridRow: at === 'top' ? 2 : 1, display: 'flex', justifyContent: 'center' }}>{wide}</div>}
    </div>
  );
}

/** Several pieces side by side inside one cell of a row. */
export function HudGroup({ children, gap = 8 }: { children?: ReactNode; gap?: number }) {
  return <div style={{ display: 'flex', gap, alignItems: 'center' }}>{children}</div>;
}

// ---------------------------------------------------------------- status
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** A number the player has: score, gems, a streak. It pops when it changes. */
export function Stat({ icon, value, label, tone = 'plain', large }: { icon?: IconName; value: number | string; label?: string; tone?: Tone; large?: boolean }) {
  const text = typeof value === 'number' ? fmt(value) : value;
  return (
    <div style={{ ...module(44), padding: icon ? '0 16px 0 12px' : '0 16px', gap: 6 }}>
      {icon && <Icon name={icon} size={20} color={tone === 'plain' ? HUD.lit : toneColor(tone)} filled={icon === 'heart' || icon === 'gem' || icon === 'star' || icon === 'bolt' || icon === 'flame'} />}
      <span key={text} className="bp-hud-pop" style={{ fontSize: large ? 24 : 18, fontWeight: 700, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums', color: toneColor(tone) }}>{text}</span>
      {label && <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: 0.4, opacity: 0.7, textTransform: 'uppercase' }}>{label}</span>}
    </div>
  );
}

/** Time left, m:ss. Turns to the danger colour and pulses for the last seconds. */
export function Timer({ seconds, warnAt = 10 }: { seconds: number; warnAt?: number }) {
  const s = Math.max(0, Math.ceil(seconds));
  const warn = s <= warnAt;
  return (
    <div style={{ ...module(44), padding: '0 16px', gap: 6, borderColor: warn ? HUD.danger : HUD.line }}>
      <span className={warn ? 'bp-hud-pulse' : undefined} style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums', color: warn ? HUD.danger : HUD.ink, animation: warn ? 'bp-hud-pulse 700ms ease-in-out infinite' : undefined }}>
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      </span>
    </div>
  );
}

/** Lives as hearts: filled for what is left, hollow for what is lost. Up to about six. */
export function Hearts({ value, max }: { value: number; max: number }) {
  return (
    <div role="img" aria-label={`${value} of ${max} lives`} style={{ ...module(44), padding: '0 14px', gap: 4 }}>
      {Array.from({ length: max }, (_, i) => (
        <Icon key={i} name="heart" size={18} color={i < value ? HUD.danger : 'rgba(246, 242, 234, 0.3)'} filled={i < value} />
      ))}
    </div>
  );
}

/** A bar for anything with a full and an empty: level progress, a boss, a charge. */
export function Meter({ value, max, label, tone = 'lit', width = 220 }: { value: number; max: number; label?: string; tone?: Tone; width?: number }) {
  const part = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div style={{ ...module(28), padding: '0 10px', gap: 8, width }}>
      {label && <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', flex: 'none' }}>{label}</span>}
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(246, 242, 234, 0.18)', overflow: 'hidden' }}>
        <div style={{ width: `${part * 100}%`, height: '100%', borderRadius: 3, background: toneColor(tone), transition: 'width 200ms cubic-bezier(0.2, 0, 0, 1)' }} />
      </div>
    </div>
  );
}

/** A short word in the middle of the screen for a moment: "Boss", "Combo x4". One at a time; no instructions. */
export function Callout({ text, tone = 'lit' }: { text: string | null; tone?: Tone }) {
  if (!text) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: '22%', display: 'flex', justifyContent: 'center' }}>
      <div key={text} className="bp-hud-callout" style={{ ...module(44), padding: '0 20px', fontSize: 17, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: toneColor(tone), animation: 'bp-hud-callout 1600ms cubic-bezier(0.2, 0, 0, 1) forwards' }}>
        {text}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- controls
/**
 * A round control: 44 for the top row, 52 for a second action, 64 for the main one.
 * It fires on touch-down, so an action is never a frame late. `cooldown` (1 just used,
 * 0 ready) draws the ring; `lit` marks the one control that matters right now.
 */
export function HudButton({ icon, label, onPress, size = 44, lit, cooldown = 0, disabled, keyHint }: { icon: IconName; label: string; onPress: () => void; size?: 44 | 52 | 64; lit?: boolean; cooldown?: number; disabled?: boolean; /** The key that does the same, as printed on it: "Space", "Shift", "E". Shown while the player uses a keyboard. */ keyHint?: string }) {
  const { mode } = useContext(HudContext);
  const ready = cooldown <= 0 && !disabled;
  const r = size / 2 - 3;
  const round = 2 * Math.PI * r;
  return (
    <button
      type="button"
      aria-label={label}
      className="bp-hud-press"
      onPointerDown={(e) => { e.stopPropagation(); if (ready) onPress(); }}
      style={{ ...module(size), position: 'relative', padding: 0, pointerEvents: 'auto', touchAction: 'none', cursor: 'pointer', opacity: disabled ? 0.4 : 1, borderColor: lit && ready ? HUD.lit : HUD.line, boxShadow: lit && ready ? `0 0 0 3px ${HUD.lit}59` : 'none', color: lit && ready ? HUD.lit : HUD.ink }}
    >
      <Icon name={icon} size={size >= 64 ? 28 : 24} />
      {cooldown > 0 && (
        <svg width={size} height={size} style={{ position: 'absolute', inset: -1, transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={HUD.lit} strokeWidth={3} strokeLinecap="round" strokeDasharray={round} strokeDashoffset={round * Math.min(1, cooldown)} />
        </svg>
      )}
      {keyHint && mode === 'keys' && (
        <span style={{ position: 'absolute', left: '50%', bottom: -10, transform: 'translateX(-50%)' }}><KeyCap lit={lit && ready}>{keyHint}</KeyCap></span>
      )}
    </button>
  );
}

/**
 * A thumb stick: touch anywhere in its pad and drag. `onMove` gets x and y from -1 to 1
 * (y up is negative) on every change and (0, 0) on release. Feed the value to the engine
 * at the next step; never move the player from here. Name the keys that move the player
 * (`keys`) and, while the player uses a keyboard, the stick gives way to those keys, which
 * fade after the first press. The game reads the keys itself.
 */
export function Stick({ onMove, size = 132, keys }: { onMove: (x: number, y: number) => void; size?: number; keys?: 'wasd' | 'arrows' }) {
  const { scale, mode } = useContext(HudContext);
  const [knob, setKnob] = useState({ x: 0, y: 0, held: false });
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);
  const reach = size / 2 - 26;
  const move = (cx: number, cy: number) => {
    const o = origin.current;
    if (!o) return;
    let dx = (cx - o.x) / scale;
    let dy = (cy - o.y) / scale;
    const d = Math.hypot(dx, dy);
    if (d > reach) { dx = (dx / d) * reach; dy = (dy / d) * reach; }
    setKnob({ x: dx, y: dy, held: true });
    onMove(dx / reach, dy / reach);
  };
  const end = () => { origin.current = null; setKnob({ x: 0, y: 0, held: false }); onMove(0, 0); };
  if (keys && mode === 'keys') return <MoveKeys keys={keys} />;
  return (
    <div
      role="application"
      aria-label="Move"
      onPointerDown={(e) => {
        e.stopPropagation();
        // The stick starts where the thumb lands: no need to find its centre.
        origin.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => { if (origin.current?.id === e.pointerId) move(e.clientX, e.clientY); }}
      onPointerUp={end}
      onPointerCancel={end}
      style={{ width: size, height: size, borderRadius: size / 2, background: 'rgba(16, 14, 12, 0.34)', border: `1px solid ${HUD.line}`, position: 'relative', pointerEvents: 'auto', touchAction: 'none', boxSizing: 'border-box' }}
    >
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 52, height: 52, margin: -26, borderRadius: 26, background: knob.held ? HUD.lit : HUD.ink, opacity: knob.held ? 1 : 0.85, transform: `translate(${knob.x}px, ${knob.y}px)`, boxShadow: knob.held ? `0 0 0 3px ${HUD.lit}59` : '0 2px 8px rgba(0, 0, 0, 0.35)' }} />
    </div>
  );
}

const MOVE_KEYS: Record<'wasd' | 'arrows', { caps: [string, string, string, string]; keys: string[] }> = {
  wasd: { caps: ['W', 'A', 'S', 'D'], keys: ['w', 'a', 's', 'd'] },
  arrows: { caps: ['\u2191', '\u2190', '\u2193', '\u2192'], keys: ['arrowup', 'arrowleft', 'arrowdown', 'arrowright'] },
};
/** The movement keys, drawn as the player finds them on the keyboard; gone once one is pressed. */
function MoveKeys({ keys }: { keys: 'wasd' | 'arrows' }) {
  const [used, setUsed] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (MOVE_KEYS[keys].keys.includes(e.key.toLowerCase())) setUsed(true); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [keys]);
  const [up, left, down, right] = MOVE_KEYS[keys].caps;
  return (
    <div aria-hidden="true" style={{ ...module(44), height: 'auto', borderRadius: 16, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 22px)', gap: 4, opacity: used ? 0 : 1, transition: 'opacity 600ms cubic-bezier(0.2, 0, 0, 1)' }}>
      <span /><KeyCap>{up}</KeyCap><span />
      <KeyCap>{left}</KeyCap><KeyCap>{down}</KeyCap><KeyCap>{right}</KeyCap>
    </div>
  );
}

// ---------------------------------------------------------------- end card
/**
 * The end of a run: the score, a best if there is one, up to three short lines, then
 * Play again. Pass `onShare` only where the platform offers its share (can('share')).
 */
export function EndCard({ score, title = 'Score', best, lines = [], onPlayAgain, onShare, children }: { score: number; title?: string; best?: number | null; lines?: string[]; onPlayAgain: () => void; onShare?: () => void; children?: ReactNode }) {
  useHudStyle();
  const scale = useHudScale();
  const record = best != null && score > best;
  const pill = (primary: boolean): CSSProperties => ({
    height: 52, padding: '0 28px', borderRadius: 26, border: primary ? 0 : `1px solid ${HUD.line}`, background: primary ? HUD.lit : 'transparent',
    color: primary ? '#1a1300' : HUD.ink, fontFamily: HUD.font, fontSize: 17, fontWeight: 700, letterSpacing: -0.2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, touchAction: 'manipulation', cursor: 'pointer', width: '100%',
  });
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0, 0, 0, 0.78)', fontFamily: HUD.font, color: HUD.ink, pointerEvents: 'auto', padding: 24 }}>
      <div className="bp-hud-rise" style={{ zoom: scale, width: '100%', maxWidth: 320, textAlign: 'center', padding: '28px 24px 24px', borderRadius: 28, background: 'rgba(24, 22, 20, 0.96)', border: `1px solid ${HUD.line}`, animation: 'bp-hud-rise 340ms cubic-bezier(0.2, 0, 0, 1)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase', color: record ? HUD.lit : 'rgba(246, 242, 234, 0.6)' }}>{record ? 'New best' : title}</div>
        <div style={{ fontSize: 56, lineHeight: '60px', fontWeight: 700, letterSpacing: -2, fontVariantNumeric: 'tabular-nums', marginTop: 4, color: record ? HUD.lit : HUD.ink }}>{fmt(score)}</div>
        {best != null && !record && <div style={{ fontSize: 14, opacity: 0.6, marginTop: 2 }}>Best {fmt(best)}</div>}
        {lines.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${HUD.line}`, display: 'grid', gap: 6 }}>
            {lines.slice(0, 3).map((line) => <div key={line} style={{ fontSize: 15, opacity: 0.8 }}>{line}</div>)}
          </div>
        )}
        {children}
        <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
          <button type="button" className="bp-hud-press" onPointerUp={onPlayAgain} style={pill(true)}><Icon name="replay" size={20} />Play again</button>
          {onShare && <button type="button" className="bp-hud-press" onPointerUp={onShare} style={pill(false)}><Icon name="share" size={20} />Share</button>}
        </div>
      </div>
    </div>
  );
}
