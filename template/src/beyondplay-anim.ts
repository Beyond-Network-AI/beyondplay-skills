// BeyondPlay character animation: clip packs for the shared bull kit and an
// Animator that blends between named states, so a character never snaps from
// one pose to the next.
//
//   const clips = await loadClips('runner');                 // a platform pack, or a .glb path of your own
//   const anim = new Animator(bull.root, clips, {
//     run:   { clip: 'run' },
//     jump:  { clip: 'run-jump', loop: false, then: 'run' },
//     slide: { clip: 'run-slide', loop: false, then: 'run' },
//     down:  { clip: 'knockout', loop: false },
//   });
//   anim.play('run');
//   // on a game event, in the shell (never in the engine):
//   anim.play('jump');
//   // every frame, with the render clock:
//   anim.setSpeed('run', speed / 8); anim.update(dt);
//
// Rules it keeps for you: every change of state cross-fades (0.18 s unless the
// state says otherwise); a one-shot state holds its last pose or moves on to
// its `then` state by itself; clips are played in place, so the engine alone
// decides where the character is. Animation is look only: the simulation never
// reads it, and it runs on the render clock.
//
// The packs (https://assets.beyondplay.xyz/cobi/clips/v1/<name>.glb) are baked
// for the 65-bone skeleton every kit bull shares:
//   runner   idle-neutral, run, run-jump, run-slide, hit-react, knockout, victory
//
// PLATFORM-OWNED. Do not edit: the validator compares this file with the template.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const CLIPS_BASE = 'https://assets.beyondplay.xyz/cobi/clips/v1/';
export type ClipSet = Record<string, THREE.AnimationClip>;

export interface LoadClipsOptions {
  /** Clips that keep their own travel across the ground (default: none; every clip plays in place). */
  travel?: string[];
  /** false for a model that is not a kit bull: the clips are left in their own frame (metres, Y up). */
  forKit?: boolean;
}

const HIPS_POSITION = /Hips\.position$/;
const HIPS_ROTATION = /Hips\.quaternion$/;

/** Keep a clip in place: the hips keep their bob and lose their drift across the ground. */
function inPlace(clip: THREE.AnimationClip): void {
  for (const t of clip.tracks) {
    if (!HIPS_POSITION.test(t.name)) continue;
    const v = t.values;
    const x0 = v[0];
    const z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
}

/**
 * The packs are baked in metres, Y up, hips under the model. The kit's skeleton sits under an
 * armature in centimetres turned a quarter about X; only the hips tracks see that parent, so only
 * they are carried into its frame.
 */
function toKitFrame(clip: THREE.AnimationClip): void {
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const q = new THREE.Quaternion();
  for (const t of clip.tracks) {
    const v = t.values;
    if (HIPS_POSITION.test(t.name)) {
      for (let i = 0; i < v.length; i += 3) {
        const x = v[i];
        const y = v[i + 1];
        const z = v[i + 2];
        v[i] = x * 100; v[i + 1] = z * 100; v[i + 2] = -y * 100;
      }
    } else if (HIPS_ROTATION.test(t.name)) {
      for (let i = 0; i < v.length; i += 4) q.fromArray(v, i).premultiply(turn).toArray(v, i);
    }
  }
}

/** Load a clip pack by name ('runner') or from a .glb address, ready to play on a kit bull. */
export async function loadClips(pack: string, opts: LoadClipsOptions = {}): Promise<ClipSet> {
  const url = /\.glb($|\?)/.test(pack) ? pack : `${CLIPS_BASE}${pack}.glb`;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const out: ClipSet = {};
  for (const source of gltf.animations) {
    const clip = source.clone();
    if (!opts.travel?.includes(clip.name)) inPlace(clip);
    if (opts.forKit !== false) toKitFrame(clip);
    out[clip.name] = clip;
  }
  return out;
}

export interface AnimState {
  /** The clip's name in the set. */
  clip: string;
  /** false plays it once and holds the last pose (or moves to `then`). Default true. */
  loop?: boolean;
  /** Seconds of cross-fade into this state. Default 0.18. */
  fade?: number;
  /** Playback speed. Default 1. */
  speed?: number;
  /** The state to move to when a one-shot ends. */
  then?: string;
}

/** Named states over one character, cross-faded. */
export class Animator {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: string | null = null;

  constructor(private readonly root: THREE.Object3D, clips: ClipSet, private readonly states: Record<string, AnimState>) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const [name, def] of Object.entries(states)) {
      const clip = clips[def.clip];
      if (!clip) continue; // a missing clip leaves the state out; play() of it is ignored
      // Each state gets its own action, so two states may share one clip at different speeds.
      const action = this.mixer.clipAction(clip.clone());
      if (def.loop === false) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
      this.actions.set(name, action);
    }
    this.mixer.addEventListener('finished', (e) => {
      const done = [...this.actions.entries()].find(([, a]) => a === e.action)?.[0];
      const next = done && done === this.current ? this.states[done].then : undefined;
      if (next) this.play(next);
    });
  }

  /** The state playing now, or null before the first play(). */
  get state(): string | null { return this.current; }
  /** Whether the state exists (its clip was in the set). */
  has(state: string): boolean { return this.actions.has(state); }

  /** Cross-fade to a state. The same state again is ignored unless `restart` is set. */
  play(state: string, opts: { fade?: number; restart?: boolean } = {}): void {
    const next = this.actions.get(state);
    if (!next) return;
    if (state === this.current && !opts.restart) return;
    const def = this.states[state];
    const prev = this.current ? this.actions.get(this.current) : undefined;
    const fade = opts.fade ?? def.fade ?? 0.18;
    next.reset();
    next.setEffectiveTimeScale(def.speed ?? 1);
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next) next.crossFadeFrom(prev, fade, false);
    else if (!prev) next.fadeIn(fade);
    this.current = state;
  }

  /** Change a state's playback speed, for example a run cycle that follows the game's speed. */
  setSpeed(state: string, speed: number): void { this.actions.get(state)?.setEffectiveTimeScale(speed); }

  /** Advance by render time, in seconds. */
  update(dt: number): void { this.mixer.update(dt); }

  /** Stop everything and let go of the character. */
  dispose(): void { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); }
}
