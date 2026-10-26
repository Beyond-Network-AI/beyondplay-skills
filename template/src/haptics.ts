// BeyondPlay haptics — one fire-and-forget call per juice moment.
//
// Games never touch vibration hardware. You post ONE message and the shell
// routes it to the right surface (Telegram HapticFeedback, the iOS app's
// native engine, navigator.vibrate on Android — and a silent no-op where no
// API exists, like plain iOS Safari). The shell also owns the user's haptics
// preference and the throttle (>=50ms spacing + a per-second burst cap), so a
// dropped haptic is correct behavior, not an error.
//
// Rules: discrete player-caused moments only, never per frame, never inside a
// physics loop, and never gate gameplay on it (there is no ack).

export type HapticKind =
  | 'impact-light'   // small player-caused contact: rim clang, gate thread, soft bounce
  | 'impact-medium'  // solid contact: heavy landing, big object destroyed
  | 'impact-heavy'   // big moment: explosion, taking a direct hit
  | 'success'        // scored / cleared / leveled up
  | 'warning'        // took damage / conceded / time running out
  | 'error'          // run lost, wrong answer, illegal move
  | 'selection';     // UI tick: menu move, countdown tick

export function haptic(kind: HapticKind): void {
  const w = window as any;
  // Newer shells expose the SDK method directly — prefer it when present.
  if (typeof w.BeyondPlay?.haptic === 'function') { w.BeyondPlay.haptic(kind); return; }
  const msg = { type: 'bp_haptic', kind };
  try { w.ReactNativeWebView?.postMessage(JSON.stringify(msg)); } catch { /* not in the app shell */ }
  try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*'); } catch { /* no parent */ }
}
