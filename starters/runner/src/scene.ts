// Runner starter scene: what the player sees. It reads the engine's state and
// draws it; it never decides gameplay. The runner is the player, as their own
// avatar (src/beyondplay-avatar.ts: the look they chose in the app, a Beyonder,
// an ape, a bull, a bear or their own COBI bull), loaded from the platform's
// asset host after the first frame (a stand-in runs until it arrives) and
// animated through the platform Animator: its own run, and the runner's jump,
// slide, hit and knockout fitted to its body. The look never changes the run:
// the engine's lanes and boxes are the same for every avatar.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Animator, loadClips } from './beyondplay-anim';
import { DEFAULT_AVATAR, loadPlayerAvatar, onPlayerAvatarChange, type LoadedAvatar } from './beyondplay-avatar';
import type { PlayerAvatar } from './beyondplay-platform';
import { HIGH, LOW, WALL, type RunnerGame } from './game';

const LANE_W = 2.2;
const AHEAD = 80;        // metres drawn in front of the runner
const BEHIND = 8;
const DASH = 8;          // metres per repeat of the road texture
// Where no host answers (a local run, the creator's preview), the pink Beyonder,
// built by the avatar kit like every player's look. Published, the platform
// answers player.avatar with the player's own (src/beyondplay.config.ts declares
// every avatar kit).
const LOCAL: PlayerAvatar = { ...DEFAULT_AVATAR, avatarKit: { body: 'beyonder-f', look: 'pink' } };
const AIR = 0.64; // the engine's time in the air, so the jump clip lands with the runner

const COLORS = { sky: 0x2a1f5c, road: '#1c1836', line: '#f2b134', edge: '#35e0c8', wall: 0xff5a4f, low: 0xf2b134, high: 0x35e0c8, coin: 0xffd24a };

function roadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = COLORS.road; g.fillRect(0, 0, 256, 256);
  // The plane is three lanes plus a shoulder on each side: lane lines at the lane borders.
  const total = 3 * LANE_W + 2;
  const px = (x: number) => ((x + total / 2) / total) * 256;
  g.fillStyle = COLORS.line;
  for (const x of [-LANE_W / 2, LANE_W / 2]) g.fillRect(px(x) - 2, 0, 4, 128); // dashed
  g.fillStyle = COLORS.edge;
  for (const x of [-1.5 * LANE_W, 1.5 * LANE_W]) g.fillRect(px(x) - 3, 0, 6, 256); // solid edges
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A dusk sky: one vertical gradient behind everything. */
function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#140f38');
  grad.addColorStop(0.45, '#3a2470');
  grad.addColorStop(0.62, '#b2477e');
  grad.addColorStop(0.72, '#f2a154');
  grad.addColorStop(1, '#f2a154');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Lit windows for the towers: a small grid, some on, some off, always the same. */
function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
    const on = (Math.imul(x * 31 + y * 17 + 7, 2654435761) >>> 28) > 6;
    if (!on) continue;
    g.fillStyle = (x + y) % 5 === 0 ? '#35e0c8' : '#ffd98a';
    g.fillRect(x * 8 + 2, y * 8 + 2, 4, 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Hazard stripes for a wall. */
function stripeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff5a4f'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#2a1030'; g.lineWidth = 9;
  for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function instanced(geometry: THREE.BufferGeometry, color: number, count: number, emissive = 0): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, emissive: color, emissiveIntensity: emissive }), count);
  m.count = 0;
  m.frustumCulled = false; // instances are placed by hand every frame
  return m;
}

export class RunnerScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 200);
  private readonly runner = new THREE.Group();
  private readonly standIn: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly road: THREE.Mesh;
  private readonly roadMap = roadTexture();
  private readonly walls: THREE.InstancedMesh;
  private readonly lows: THREE.InstancedMesh;
  private readonly highs: THREE.InstancedMesh;
  private readonly coins: THREE.InstancedMesh;
  private readonly towers: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private anim: Animator | null = null;
  private me: LoadedAvatar | null = null;
  private stopChange: (() => void) | null = null;
  private turn = 0;     // the latest avatar asked for; an older load that finishes later is dropped
  private x = 0;        // the runner's drawn x, eased toward its lane
  private blink = 0;    // seconds of blinking left after a hit
  private spin = 0;
  private disposed = false;
  private warned = false;

  /** `test` keeps the drawing readable for the platform's render check (?bp_test=1); leave it off in play. */
  constructor(canvas: HTMLCanvasElement, test = false) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: test });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0x4a2c78, 34, AHEAD);
    this.scene.add(new THREE.HemisphereLight(0xcabfff, 0x2a2440, 1.6));
    const sun = new THREE.DirectionalLight(0xffe2b0, 2.2);
    sun.position.set(-4, 8, -6);
    this.scene.add(sun);

    this.roadMap.repeat.set(1, (AHEAD + BEHIND) / DASH);
    this.road = new THREE.Mesh(new THREE.PlaneGeometry(3 * LANE_W + 2, AHEAD + BEHIND), new THREE.MeshStandardMaterial({ map: this.roadMap, roughness: 0.9 }));
    this.road.rotation.x = -Math.PI / 2;
    this.scene.add(this.road);

    // A wall fills its lane; a low bar is jumped; a gate (a beam on two posts) is slid under.
    const gate = mergeGeometries([
      new THREE.BoxGeometry(2, 0.45, 0.4).translate(0, 1.95, 0),
      new THREE.BoxGeometry(0.16, 1.75, 0.16).translate(-0.92, 0.875, 0),
      new THREE.BoxGeometry(0.16, 1.75, 0.16).translate(0.92, 0.875, 0),
    ])!;
    this.walls = instanced(new THREE.BoxGeometry(1.9, 1.9, 1.2).translate(0, 0.95, 0), COLORS.wall, 48);
    this.lows = instanced(new THREE.BoxGeometry(1.9, 0.55, 0.5).translate(0, 0.275, 0), COLORS.low, 48, 0.25);
    this.highs = instanced(gate, COLORS.high, 48, 0.35);
    this.coins = instanced(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 20).rotateX(Math.PI / 2), COLORS.coin, 96, 0.6);
    this.towers = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0x3a2d7a, 40);
    const glass = this.towers.material as THREE.MeshStandardMaterial;
    glass.emissive.set(0xffffff); glass.emissiveMap = windowTexture(); glass.emissiveIntensity = 0.9;
    const crate = this.walls.material as THREE.MeshStandardMaterial;
    crate.color.set(0xffffff); crate.map = stripeTexture(); crate.emissive.set(0x000000);
    this.scene.add(this.walls, this.lows, this.highs, this.coins, this.towers);

    // The stand-in runs until the avatar arrives, so the first frame never waits for the network.
    this.standIn = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 6, 12).translate(0, 0.87, 0), new THREE.MeshStandardMaterial({ color: 0xf2b134, roughness: 0.5 }));
    this.runner.add(this.standIn);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.position.y = 0.02;
    this.scene.add(this.runner, this.shadow);
  }

  /** Fit the drawing to the viewport; device pixel ratio capped at 2. */
  resize(width: number, height: number): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width > height ? 46 : 62; // a wide screen sees the same road, not more sky
    this.camera.updateProjectionMatrix();
  }

  /** Load the player's avatar and its moves. Safe to fail: the stand-in keeps running. */
  async loadCharacter(): Promise<void> {
    // They saved another look and came back to the running game: swap it in.
    this.stopChange ??= onPlayerAvatarChange((next) => { void this.show(next); });
    try {
      await this.show(await loadPlayerAvatar({ fallback: LOCAL }));
    } catch {
      /* offline, or the asset host did not answer: the stand-in stays */
    }
  }

  /** Put an avatar on the runner: its own run (and jump, fall and victory), and the runner's moves made for the
   *  bull (run-jump, run-slide, hit-react, knockout) fitted to its body. A body the avatar kit did not build (a
   *  library character, when the kit fails) plays its own moves only. */
  private async show(next: LoadedAvatar): Promise<void> {
    const mine = ++this.turn;
    let clips: Record<string, THREE.AnimationClip>;
    try {
      const [own, pack] = await Promise.all([
        next.clips(['run', 'jump', 'fall', 'victory']),
        next.kitAvatar ? loadClips('runner').then((c) => next.kitAvatar!.fit(c)) : Promise.resolve({}),
      ]);
      clips = { ...pack, ...own }; // its own run wins over the bull's
    } catch {
      next.kitAvatar?.release();
      return;
    }
    if (this.disposed || mine !== this.turn) { next.kitAvatar?.release(); return; }
    const jump = clips['run-jump'] ? 'run-jump' : 'jump';
    const anim = new Animator(next.character.root, clips, {
      run: { clip: 'run' },
      jump: { clip: jump, loop: false, fade: 0.1, speed: (clips[jump]?.duration ?? AIR) / (AIR + 0.1) },
      slide: { clip: 'run-slide', loop: false, fade: 0.1, speed: (clips['run-slide']?.duration ?? 0.7) / 0.75, then: 'run' },
      hit: { clip: clips['hit-react'] ? 'hit-react' : 'fall', loop: false, fade: 0.08, speed: 1.4, then: 'run' },
      down: { clip: clips.knockout ? 'knockout' : 'fall', loop: false, fade: 0.12 },
      win: { clip: 'victory' },
    });
    const was = this.anim?.state;
    anim.play(was === 'down' || was === 'win' ? was : 'run');
    // Swap in one step: nothing renders between taking the old look off and putting the new one on.
    const old = this.me;
    this.anim?.dispose();
    this.runner.remove(this.standIn);
    if (old) this.runner.remove(old.character.root);
    this.runner.add(next.character.root);
    this.anim = anim;
    this.me = next;
    old?.kitAvatar?.release();
  }

  /** A game event to show: 'jump', 'slide', 'land', 'hit', 'down', 'win', 'run'. */
  event(name: 'jump' | 'slide' | 'land' | 'hit' | 'down' | 'win' | 'run'): void {
    if (name === 'hit') this.blink = 1;
    if (name === 'down' || name === 'run') this.blink = 0;
    if (!this.anim) return;
    if (name === 'land') { if (this.anim.state === 'jump') this.anim.play('run', { fade: 0.12 }); return; }
    this.anim.play(name, { restart: name === 'jump' || name === 'slide' || name === 'hit' });
  }

  private place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, turn = 0, sx = 1, sy = 1, sz = 1): void {
    this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, turn);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    mesh.setMatrixAt(i, this.m);
  }

  /** Draw the engine's state. `dt` is render time in seconds (look only). */
  draw(g: RunnerGame, dt: number): void {
    // Lane +1 is on the right of the screen: the camera looks along +Z, where +X is on the left.
    const targetX = -g.lane * LANE_W;
    this.x += (targetX - this.x) * Math.min(1, dt * 14);
    this.runner.position.set(this.x, g.y, g.z);
    this.runner.rotation.z = THREE.MathUtils.clamp((this.x - targetX) * 0.18, -0.3, 0.3); // lean into a lane change
    this.shadow.position.set(this.x, 0.02, g.z);
    this.shadow.scale.setScalar(Math.max(0.4, 1 - g.y * 0.35));
    if (this.blink > 0) this.blink = Math.max(0, this.blink - dt);
    this.runner.visible = this.blink <= 0 || Math.floor(this.blink * 12) % 2 === 0;
    if (!this.anim) this.standIn.scale.y = g.sliding > 0 ? 0.5 : 1;

    this.road.position.set(0, 0, g.z + (AHEAD - BEHIND) / 2);
    this.roadMap.offset.y = -(this.road.position.z / DASH) % 1;

    let w = 0, l = 0, h = 0;
    for (const row of g.rows) {
      if (row.z < g.z - BEHIND) continue;
      if (row.z > g.z + AHEAD) break;
      for (let i = 0; i < 3; i++) {
        const x = -(i - 1) * LANE_W;
        const cell = row.cells[i];
        if (cell === WALL && w < 48) this.place(this.walls, w++, x, 0, row.z);
        else if (cell === LOW && l < 48) this.place(this.lows, l++, x, 0, row.z);
        else if (cell === HIGH && h < 48) this.place(this.highs, h++, x, 0, row.z);
      }
    }
    // An obstacle past its pool is not drawn but still hits: if you make the rows denser, raise the pools.
    if ((w === 48 || l === 48 || h === 48) && !this.warned) { this.warned = true; console.warn('runner: an obstacle pool is full; some obstacles are not drawn. Raise the pool sizes in scene.ts.'); }
    this.walls.count = w; this.lows.count = l; this.highs.count = h;
    this.walls.instanceMatrix.needsUpdate = this.lows.instanceMatrix.needsUpdate = this.highs.instanceMatrix.needsUpdate = true;

    this.spin += dt * 4;
    let c = 0;
    for (const coin of g.coinList) {
      if (coin.taken || coin.z < g.z - 1) continue;
      if (coin.z > g.z + AHEAD) break;
      if (c < 96) this.place(this.coins, c++, -coin.lane * LANE_W, 0.95, coin.z, this.spin + coin.z);
    }
    this.coins.count = c;
    this.coins.instanceMatrix.needsUpdate = true;

    // Towers along both sides, every ten metres, the same for a given place on the course.
    const first = Math.floor((g.z - BEHIND) / 10);
    let t = 0;
    for (let k = 0; k < 20; k++) {
      const n = first + k;
      for (const side of [-1, 1]) {
        const height = 4 + ((Math.imul(n * 2 + (side > 0 ? 1 : 0), 2654435761) >>> 24) / 255) * 9;
        this.place(this.towers, t++, side * (1.5 * LANE_W + 3.2), 0, n * 10, 0, 3, height, 6);
      }
    }
    this.towers.count = t;
    this.towers.instanceMatrix.needsUpdate = true;

    if (this.anim) {
      if (this.anim.state === 'run') this.anim.setSpeed('run', g.speed / 8.5);
      this.anim.update(dt);
    }

    this.camera.position.set(this.x * 0.6, 3.6, g.z - 6.8);
    this.camera.lookAt(this.x * 0.4, 1.4, g.z + 8);
    this.renderer.render(this.scene, this.camera);
  }

  /** Draw calls and triangles of the last frame, for the performance check. */
  perf(): { calls: number; triangles: number } {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  dispose(): void {
    this.disposed = true;
    this.stopChange?.();
    this.anim?.dispose();
    this.me?.kitAvatar?.release();
    this.renderer.dispose();
  }
}
