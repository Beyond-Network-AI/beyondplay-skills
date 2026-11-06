// PLATFORM-OWNED. Do not edit: the validator refuses a game whose copy differs from the template's,
// and the hosted build keeps the platform's copy anyway.
// Synced from Beyond-Network-AI/beyondplay-games library/characters/cobi.ts by scripts/sync-cobi-kit.mjs.
//   commit  cb2daee517a7f165abe773f8f00e5b1e75985b95
//   sha256  7aef6f5084241245c40a2dd106a3ec0bc715f579185f56f78780ebf78a3a9b70  (of the source file; template/src/cobi-kit.SOURCE.json records the same)
// To change the loader: edit it in the games repository, commit there, then run
//   npm run sync-cobi-kit -- <path to that checkout>
// ---- synced copy: everything below is the games repository's file, byte for byte ----
// COBI bull loader: assembles any of the 10,000 Bullieverse bulls at runtime from the rigged trait kit
// (tools/blender/bull-kit.py + tools/bull-kit-assets.py). Every part is skinned to the same Mixamo 65-bone skeleton
// as the game bull, so Mixamo clips (e.g. games/bull-run/src/assets/anim-run.glb) play on any assembled bull.
//
//   const kit = await CobiKit.load('https://assets.beyondplay.xyz/cobi/kit/v2/phone/', { tokens: false, kit: 'cobi/v2' });
//   const bull = await kit.build({ Fur: 'Gold', Horns: 'Fire', ... });   // or kit.build(kit.traitsOf(1234)!) with tokens
//   scene.add(bull.root);                                    // ~1.9 m tall, feet at y=0, faces +Z
//   new THREE.AnimationMixer(bull.root).clipAction(runClip).play();
//   ...
//   scene.remove(bull.root); bull.release();                 // done with it: frees what no other bull uses
//
// Load options: `tokens: false` skips the kit's tokens.json (a game that is handed a bull's traits by the platform
// needs no token table; traitsOf() then answers null), and `kit: 'cobi/v2'` refuses a base whose manifest names a
// different kit. A manifest without a `tokens` entry (the phone tier, scripts/kit-phone-tier.mjs) is treated the same
// way as `tokens: false`.
//
// THE ONE COPY (library/characters/README.md). Games import it from here (`../../../library/characters/cobi`); the worlds
// repo (Beyond-Network-AI/play-bullieverse-com) carries it verbatim as packages/characters/src/cobi.ts, synced by its
// scripts/sync-characters.mjs and checked by `pnpm check:characters`; the public creator kit (beyondplay-skills)
// carries it as template/src/cobi-kit.ts, synced by that repository's scripts/sync-cobi-kit.mjs. Edit here, never in
// a copy. Textures are decoded with createImageBitmap (the stock blob:-URL path renders grey on iPhones / under a
// strict CSP) and meshes are meshopt-compressed.
//
// One module since 2026-10-22: it was copied into Boss Bear, BullRun, the worlds and the hub, and the copies drifted.
// This is BullRun's copy with the worlds' two additions: `webpBitmapPlugin` exported for any other GLTFLoader that may
// meet a webp GLB (the kit's own loader keeps its sharing variant, kitWebpPlugin), and `cullSphere`, which
// `build(traits, { cull: true })` uses instead of switching frustum culling off (a room of many bulls culls those off
// screen; a game with one bull in view need not).
//
// BullRun's copy (2026-10-16) is Boss Bear's copy (below) plus `pool`: the trimmed kit's manifest lists the runner
// pool (scripts/bulls-bull-run.mjs), read by src/bull.ts; and, since BullRun builds a new bull every game, a kit
// whose caches let go (2026-10-16, memory): before, every byte fetched, every decoded bitmap, every hooves composite
// and every uploaded texture stayed for the session (~55 MB after the first bull, ~380 MB of CPU + GPU memory once
// the 14-bull pool had run: enough to get the page killed on a 2-3 GB iPhone or in an in-app webview). Now
// everything is reference-counted and a session holds about two bulls' worth (the runner + the next one):
//   - a built bull holds its made textures (fur or hooves composite, ORM, emissive, eyes) and its part glTFs, from
//     the start of build() until release(); the kit holds the body glTF for good (small, and every bull needs it);
//   - a part glTF holds the glTF images it uses (shared by content across parts, see webpBitmapPlugin); a made
//     texture holds the bitmap it shows (a hooves composite only its canvas: the fur and overlay bitmaps are closed
//     once painted); fetched bytes are held by a prefetch (until its bull's build takes them over) and by the
//     parse / decode that reads them, so they go as soon as they are parsed unless a bull not built yet needs them.
//   The last holder's release frees the thing: texture.dispose() (its GL texture goes), ImageBitmap.close(),
//   geometry.dispose(), a canvas shrunk to 0x0, bytes and parsed glTFs dropped. A build counts everything it will
//   use before its first await, so a bull released while the next one builds (or waits, built, for its swap) never
//   frees what the two share; a bull dropped without release() (a build its caller gave up on) gives its holds back
//   when it is garbage-collected.
//
// Boss Bear's copy (2026-10-14, mobile hitches) adds, without changing what a bull looks like:
// - one Skeleton per bull: the kit's parts were exported quantized, so each part's inverse bind matrices differ from the
//   body's by its own constant dequantization transform; that transform moves into the part's bind matrix and the part
//   shares the body's skeleton (shareSkeleton). Before, every part had its own skeleton: 9 bone-matrix passes and 9
//   bone-texture uploads a frame for one bull, now 1.
// - identical images are decoded and uploaded once (the cigar, the nose ring and the sunglasses ship the same three
//   atlases, the two chains and the two horn sets the same ones; the fur, eye and hooves textures are shared by bulls).
// - prefetch(): fetch a bull's files early (network only); build({ yieldTo }) spreads a background build's main-thread
//   work (glTF parses, the hooves composite) over idle moments.
import * as THREE from 'three';
import { GLTFLoader, type GLTFLoaderPlugin, type GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type CobiTraits = Record<string, string>;   // trait_type -> value, as in the COBI metadata

interface TraitEntry { status: 'exact' | 'approx' | 'none'; parts?: string[]; fur?: string; eyes?: string; hooves?: string }
interface FurEntry { base: string; orm: string; normal?: string; emissive?: string }
export interface CobiManifest {
  version: number; body: string;
  kit?: string;                            // the kit this is a tier of ('cobi/v2'); load({ kit }) checks it
  tier?: string;                           // 'phone' for the trimmed tier (scripts/kit-phone-tier.mjs)
  tokens?: string;                         // the token table (tokens.json); absent on a tier that ships none
  furs: Record<string, FurEntry>; hooves: Record<string, string>; eyes: Record<string, string>;
  glow?: string[];                         // eye textures that emit light (Triggered, Laser)
  traits: Record<string, TraitEntry>; parts: Record<string, { bind: 'head' | 'skin' | 'cape'; tris: number; file?: string }>;
  pool?: PoolBull[];                       // BullRun: the runner pool (scripts/bulls-bull-run.mjs)
}
/** One bull of a trimmed kit's pool: a real COBI token, its traits, a HUD name ('COBI #1234') and words ('Gold · Hoodie · Crown'). */
export interface PoolBull { id: string; name: string; words: string; traits: CobiTraits }
export interface CobiTokens { types: string[]; values: Record<string, string[]>; t: Record<string, number[]> }

export interface CobiLoadOptions {
  /** false: do not fetch the kit's tokens.json even when the manifest names one (traitsOf() answers null). */
  tokens?: boolean;
  /** The kit expected at this base ('cobi/v2'); load() throws when the manifest names a different one. */
  kit?: string;
}

/** The COBI traits of a token from a kit's token table, or null if the id is unknown (pure; traitsOf() uses it). */
export function tokenTraits(tokens: CobiTokens | null | undefined, tokenId: number | string): CobiTraits | null {
  const row = tokens?.t[String(tokenId)];
  if (!row || !tokens) return null;
  const out: CobiTraits = {};
  tokens.types.forEach((type, i) => { if (row[i] >= 0) out[type] = tokens.values[type][row[i]]; });
  return out;
}

/** What a trait set needs from a kit: its fur, eye and hooves names and part ids, and the trait values the kit renders
 *  approximately or not at all (pure; build() and the check scripts use it). */
export interface CobiResolved { missing: string[]; fur: string; eyes: string; hooves?: string; partIds: string[] }
export function resolveTraits(m: CobiManifest, traits: CobiTraits): CobiResolved {
  const missing: string[] = [];
  let fur = 'Base', eyes = 'Normal', hooves: string | undefined;
  const partIds: string[] = [];
  for (const [type, value] of Object.entries(traits)) {
    if (type === 'Background' || type === 'Level') continue;
    const e = m.traits[`${type}/${value}`];
    if (!e) { missing.push(`${type}/${value}`); continue; }
    if (e.status !== 'exact') missing.push(`${type}/${value}`);
    if (e.fur) fur = e.fur;
    if (e.eyes) eyes = e.eyes;
    if (e.hooves) hooves = e.hooves;
    for (const p of e.parts ?? []) partIds.push(p);
  }
  // No Clothes trait (the 2D art is waist-up): the kit's default bottoms instead of bare underwear.
  if (!traits.Clothes) for (const p of m.traits['Clothes/(none)']?.parts ?? []) partIds.push(p);
  return { missing, fur, eyes, hooves, partIds };
}

export interface CobiBull {
  root: THREE.Group;                       // add this to the scene; animate it with an AnimationMixer
  meshes: THREE.SkinnedMesh[];             // body, eyes and every part, all on one skeleton
  bones: Map<string, THREE.Bone>;          // by glTF node name (e.g. 'mixamorigHead')
  traits: CobiTraits;
  missing: string[];                       // trait values the kit renders approximately or not at all
  /** Done with this bull (it has left the scene): frees its skeleton's bone texture and its own materials, and gives
   *  back what it holds of the kit, which frees whatever no other bull (built, or building) still uses. Once only. */
  release(): void;
}

export interface BuildOptions {
  /** Awaited before each heavy main-thread step of the build (a background build passes one that waits for the next
   *  frame, so the work never lands in one long task). */
  yieldTo?: () => Promise<void>;
  /** Give the bull a culling sphere (cullSphere) instead of switching frustum culling off on its meshes. */
  cull?: boolean;
}

/** What the kit holds now (cache entries and estimated bytes; GPU bytes assume every texture uploaded with mipmaps). */
export interface KitStats {
  leases: number;                          // bulls holding kit resources (built and not released, or building)
  raw: { n: number; MB: number };          // fetched file bytes
  gltf: { n: number; geometries: number; MB: number };   // parsed glTFs (body + parts): their geometry arrays
  bitmaps: { n: number; MB: number };      // decoded images (fur / eyes / hooves and glTF images), RGBA
  canvases: { n: number; MB: number };     // hooves composites
  textures: { n: number; MB: number };     // made + glTF textures, uploaded size with mipmaps
  cpuMB: number; gpuMB: number;
}

const BITMAP_OPTS: ImageBitmapOptions = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };

/** A cheap content key for an image's bytes (FNV-1a over the 32-bit words, plus the tail and the length). */
function contentKey(buf: ArrayBuffer): string {
  const n = buf.byteLength >> 2, w = new Uint32Array(buf, 0, n), b = new Uint8Array(buf);
  let h = 0x811c9dc5 ^ buf.byteLength;
  for (let i = 0; i < n; i++) h = Math.imul(h ^ w[i], 0x01000193);
  for (let i = n << 2; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  return `${buf.byteLength}:${(h >>> 0).toString(36)}`;
}

// ── Reference counting ──
interface Held<T> { key: string; refs: number; p?: Promise<T>; v?: T; dead?: boolean }
/** A cache whose entries live while held: hold() counts a holder (nothing loads yet: a build counts everything up
 *  front, then loads it paced), load() makes the value once, release() frees it (free()) when the last holder lets
 *  go — at once, or when a value still loading settles. A failed load is retried by the next load(), not cached. */
class Holds<T> {
  readonly map = new Map<string, Held<T>>();
  constructor(private free: (v: T) => void) {}
  hold(key: string): Held<T> {
    let e = this.map.get(key);
    if (!e) { e = { key, refs: 0 }; this.map.set(key, e); }
    e.refs++;
    return e;
  }
  load(e: Held<T>, make: () => Promise<T>): Promise<T> {
    if (!e.p) {
      const p = make();
      e.p = p;
      p.then((v) => { if (e.p !== p) return; e.v = v; if (e.refs <= 0 && !e.dead) { e.dead = true; this.free(v); } },
        () => { if (e.p === p) e.p = undefined; });
    }
    return e.p;
  }
  release(e: Held<T>): void {
    if (e.refs <= 0 || --e.refs > 0) return;
    if (this.map.get(e.key) === e) this.map.delete(e.key);
    if (e.v !== undefined && !e.dead) { e.dead = true; this.free(e.v); }
  }
}

/** A part (or the body) glTF as the kit keeps it: the scene only (the parser, the .glb's binary chunk and the image
 *  bytes it copied are dropped), and its holds on the shared glTF images. */
interface Part { scene: THREE.Group; images: Held<THREE.Texture>[] }
/** A texture the kit made (fur, ORM, emissive, eyes, hooves composite) and the bitmaps it shows. */
interface Made { tex: THREE.Texture; bmps: Held<ImageBitmap>[]; canvas?: HTMLCanvasElement | OffscreenCanvas }
/** One parse's holds on the shared glTF images (see kitWebpPlugin); `closed` once the parse has failed. */
interface ParseCtx { holds: Held<THREE.Texture>[]; byKey: Map<string, Held<THREE.Texture>>; closed: boolean }

/** The kit's EXT_texture_webp through createImageBitmap (see the header), with every identical image shared: one
 *  texture per image content for the whole kit, held by each parsed glTF that uses it (`kit.parsing`: the parse being
 *  set up — GLTFLoader.parse makes its plugins synchronously, before it returns). */
function kitWebpPlugin(kit: { parsing: ParseCtx | null; images: Holds<THREE.Texture> }) {
  return (parser: any) => {
    const ctx = kit.parsing;
    return {
      name: 'EXT_texture_webp',
      loadTexture(index: number) {
        const def = parser.json.textures[index];
        const src = def.extensions?.EXT_texture_webp?.source ?? def.source;
        const img = parser.json.images[src];
        if (img?.bufferView === undefined) return null;
        return parser.getDependency('bufferView', img.bufferView)
          .then((buf: ArrayBuffer) => {
            // (the buffer view is its own copy: 4-byte aligned)
            if (!ctx || ctx.closed) throw new Error('cobi kit: parse abandoned');
            const key = contentKey(buf);
            let h = ctx.byKey.get(key);
            if (!h) { h = kit.images.hold(key); ctx.byKey.set(key, h); ctx.holds.push(h); }
            return kit.images.load(h, () => createImageBitmap(new Blob([buf], { type: img.mimeType || 'image/webp' }), BITMAP_OPTS).then((bmp) => {
              const t = new THREE.Texture(bmp);
              t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter;
              t.needsUpdate = true;
              return t;
            }));
          })
          .then((t: THREE.Texture) => { parser.associations.set(t, { textures: index }); return t; });
      },
    };
  };
}

interface WebpJson {
  textures: { source?: number; extensions?: { EXT_texture_webp?: { source: number } } }[];
  images: { bufferView?: number; mimeType?: string }[];
}

/**
 * GLTFLoader plugin for EXT_texture_webp that decodes embedded webp through createImageBitmap instead of the stock
 * blob: URL path (which renders grey on iPhones and under a strict CSP), for any loader outside the kit that may meet
 * a webp GLB: `loader.register(webpBitmapPlugin)`. Nothing is shared or reference-counted (the kit's own variant,
 * kitWebpPlugin, does that).
 */
export function webpBitmapPlugin(parser: GLTFParser): GLTFLoaderPlugin {
  const json = parser.json as WebpJson;
  return {
    name: 'EXT_texture_webp',
    loadTexture(index: number) {
      const def = json.textures[index];
      const src = def.extensions?.EXT_texture_webp?.source ?? def.source;
      const img = src === undefined ? undefined : json.images[src];
      if (!img || img.bufferView === undefined) return null;
      return parser.getDependency('bufferView', img.bufferView)
        .then((buf: ArrayBuffer) => createImageBitmap(new Blob([buf], { type: img.mimeType || 'image/webp' }), BITMAP_OPTS))
        .then((bmp: ImageBitmap) => {
          const t = new THREE.Texture(bmp);
          t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter;
          t.needsUpdate = true; parser.associations.set(t, { textures: index });
          return t;
        });
    },
  } as GLTFLoaderPlugin;
}

/** Radius of the culling sphere around an avatar, in metres; its centre is the hips bone at rest. */
export const AVATAR_CULL_RADIUS = 1.6;

/**
 * Gives every skinned mesh of an assembled avatar a bounding sphere so the renderer can frustum cull it.
 * Skinned vertices move with the bones, so three cannot bound them from the geometry (which is why the
 * kit used to set frustumCulled false on every part); instead one sphere of AVATAR_CULL_RADIUS at hip
 * height, which holds a 1.9 m bull through the locomotion clips, is written into each mesh's own frame
 * (the kit armature is centimetres under a +90 degree X root, so the centre goes through the inverse of
 * the mesh's world matrix and the radius is divided by that matrix's scale). Call it with `root`
 * detached or at rest: the centre is measured relative to root's parent. Returns the sphere in that
 * frame, or null (and leaves the meshes unculled) when the rig has no hips.
 */
export function cullSphere(root: THREE.Object3D, meshes: THREE.SkinnedMesh[], hipsName = 'mixamorigHips'): THREE.Sphere | null {
  const hips = root.getObjectByName(hipsName);
  if (!hips) { for (const m of meshes) m.frustumCulled = false; return null; }
  root.updateMatrixWorld(true);
  const centre = hips.getWorldPosition(new THREE.Vector3());
  const inv = new THREE.Matrix4();
  for (const m of meshes) {
    inv.copy(m.matrixWorld).invert();
    m.boundingSphere = new THREE.Sphere(centre.clone().applyMatrix4(inv), AVATAR_CULL_RADIUS / m.matrixWorld.getMaxScaleOnAxis());
    m.frustumCulled = true;
  }
  return new THREE.Sphere(centre, AVATAR_CULL_RADIUS);
}

function texture(src: ImageBitmap | HTMLCanvasElement | OffscreenCanvas, srgb: boolean): THREE.Texture {
  const t = src instanceof ImageBitmap ? new THREE.Texture(src) : new THREE.CanvasTexture(src as HTMLCanvasElement);
  t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Paint a hooves overlay (RGBA, body UV layout) over the fur colour. */
function composite(fur: ImageBitmap, overlay: ImageBitmap): HTMLCanvasElement | OffscreenCanvas {
  const c: any = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(fur.width, fur.height) : Object.assign(document.createElement('canvas'), { width: fur.width, height: fur.height });
  const g = c.getContext('2d');
  g.drawImage(fur, 0, 0); g.drawImage(overlay, 0, 0, fur.width, fur.height);
  return c;
}

/**
 * Bind skinned mesh `mesh` (bones `bones`, inverse binds `inv`, bind matrix `bind`) to skeleton `ref` instead of its
 * own, when that draws it exactly the same: the same bones in the same order, and for every joint the mesh uses
 * ref.boneInverses[j]^-1 * inv[j] the same matrix D (a quantized part's dequantization), which then moves into the
 * bind matrix (D * bind). Returns false (nothing changed) otherwise.
 */
export function shareSkeleton(mesh: THREE.SkinnedMesh, bones: THREE.Bone[], inv: THREE.Matrix4[], bind: THREE.Matrix4, ref: THREE.Skeleton): boolean {
  if (bones.length !== ref.bones.length || inv.length !== bones.length) return false;
  for (let j = 0; j < bones.length; j++) if (bones[j] !== ref.bones[j]) return false;
  const si = mesh.geometry.getAttribute('skinIndex'), sw = mesh.geometry.getAttribute('skinWeight');
  if (!si || !sw) return false;
  const used = new Uint8Array(bones.length);
  for (let i = 0; i < si.count; i++) {
    if (sw.getX(i) > 0) used[si.getX(i)] = 1; if (sw.getY(i) > 0) used[si.getY(i)] = 1;
    if (sw.getZ(i) > 0) used[si.getZ(i)] = 1; if (sw.getW(i) > 0) used[si.getW(i)] = 1;
  }
  const t = new THREE.Matrix4(); let D: THREE.Matrix4 | null = null;
  for (let j = 0; j < bones.length; j++) {
    if (!used[j]) continue;
    t.copy(ref.boneInverses[j]).invert().multiply(inv[j]);
    if (!D) { D = t.clone(); continue; }
    for (let k = 0; k < 16; k++) if (Math.abs(t.elements[k] - D.elements[k]) > 1e-4 * (1 + Math.abs(D.elements[k]))) return false;
  }
  if (!D) return false;
  mesh.bind(ref, D.multiply(bind));
  return true;
}

/** FinalizationRegistry (ES2021; the game builds against ES2020 libs): typed here, feature-tested at runtime. */
interface Finalizer { register(target: object, held: () => void, token?: object): void; unregister(token: object): boolean }
const Finalizers = (globalThis as { FinalizationRegistry?: new (cleanup: (held: () => void) => void) => Finalizer }).FinalizationRegistry;

const traitsKey = (t: CobiTraits) => JSON.stringify(Object.entries(t).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const px = (i: { width?: number; height?: number } | null | undefined) => (i && (i.width ?? 0) > 0 ? i.width! * i.height! * 4 : 0);

export class CobiKit {
  private loader = new GLTFLoader();
  /** Set around each GLTFLoader.parse call, for kitWebpPlugin. */
  parsing: ParseCtx | null = null;
  /** test probes (?bp_test=1, set by the game): remember what the kit has freed, for check() */
  debug = false;
  private freed = new WeakSet<object>();
  private live = 0;                                                 // bulls holding kit resources
  private raw = new Holds<ArrayBuffer>(() => { /* dropped */ });   // fetched bytes, by path
  private bitmaps = new Holds<ImageBitmap>((b) => b.close());       // fur / eye / hooves images, by path
  /** glTF images by content (see kitWebpPlugin), held by the parsed glTFs that use them */
  readonly images = new Holds<THREE.Texture>((t) => { this.gone(t); t.dispose(); (t.image as ImageBitmap | null)?.close?.(); });
  private made = new Holds<Made>((m) => {
    this.gone(m.tex); m.tex.dispose();
    for (const b of m.bmps) this.bitmaps.release(b);
    if (m.canvas) m.canvas.width = m.canvas.height = 0;   // free the backing store now (iOS keeps canvas memory long)
  });
  private gltfs = new Holds<Part>((g) => this.freePart(g));        // parsed glTFs, by path
  private body: Held<Part>;                                         // the kit's own hold on the body glTF: never released
  private prefetched: { key: string; holds: Held<ArrayBuffer>[] }[] = [];   // the latest prefetches, their bulls not built yet
  private finalizer: Finalizer | null = Finalizers ? new Finalizers((free) => free()) : null;

  private constructor(readonly base: string, readonly manifest: CobiManifest, readonly tokens: CobiTokens | null) {
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.loader.register(kitWebpPlugin(this) as any);
    this.body = this.gltfs.hold(manifest.body);
  }

  /** Fetch a kit's manifest (and its token table, unless the manifest names none or `opts.tokens` is false). */
  static async load(base: string, opts: CobiLoadOptions = {}): Promise<CobiKit> {
    if (!base.endsWith('/')) base += '/';
    const manifest: CobiManifest = await (await fetch(base + 'manifest.json')).json();
    if (opts.kit && manifest.kit && manifest.kit !== opts.kit) throw new Error(`cobi kit: expected ${opts.kit}, found ${manifest.kit}`);
    const tokens: CobiTokens | null = manifest.tokens && opts.tokens !== false ? await (await fetch(base + manifest.tokens)).json() : null;
    return new CobiKit(base, manifest, tokens);
  }

  /** The kit's runner pool (empty for a kit without one). */
  get pool(): PoolBull[] { return this.manifest.pool ?? []; }

  /** The COBI traits of a token (snapshot in the kit), or null if the id is unknown or the kit was loaded without its
   *  token table. */
  traitsOf(tokenId: number | string): CobiTraits | null { return tokenTraits(this.tokens, tokenId); }

  // ── loading: bytes (held while read), bitmaps, glTFs ──
  private fetchHold(path: string): Held<ArrayBuffer> {
    const h = this.raw.hold(path);
    this.raw.load(h, () => fetch(this.base + path).then((r) => { if (!r.ok) throw new Error(`cobi kit: ${r.status} ${path}`); return r.arrayBuffer(); }))
      .catch(() => { /* reported (and retried) by the build that reads it */ });
    return h;
  }
  /** Read `path`'s bytes with `use`, holding them only meanwhile (a prefetch's hold keeps them for its bull). */
  private async withBytes<T>(path: string, use: (buf: ArrayBuffer) => Promise<T>): Promise<T> {
    const h = this.fetchHold(path);
    try { return await use(await h.p!); } finally { this.raw.release(h); }
  }
  /** A hold on `path`'s bitmap, decoding it if needed. */
  private bitmap(path: string): [Held<ImageBitmap>, Promise<ImageBitmap>] {
    const h = this.bitmaps.hold(path);
    return [h, this.bitmaps.load(h, () => this.withBytes(path, (buf) => createImageBitmap(new Blob([buf]), BITMAP_OPTS)))];
  }
  private loadGltf(h: Held<Part>): Promise<Part> {
    const path = h.key;
    return this.gltfs.load(h, () => this.withBytes(path, (buf) => {
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
      const ctx: ParseCtx = { holds: [], byKey: new Map(), closed: false };
      this.parsing = ctx;
      let p: Promise<{ scene: THREE.Group }>;
      try { p = this.loader.parseAsync(buf, this.base + dir); } finally { this.parsing = null; }
      return p.then((g) => ({ scene: g.scene, images: ctx.holds }), (e) => { ctx.closed = true; for (const x of ctx.holds) this.images.release(x); throw e; });
    }));
  }
  private freePart(g: Part) {
    const own = new Set(g.images.map((h) => h.v));
    g.scene.traverse((o: any) => {
      if (o.geometry) { this.gone(o.geometry); o.geometry.dispose(); }
      for (const mat of ([] as THREE.Material[]).concat(o.material ?? [])) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture && !own.has(v)) { this.gone(v); v.dispose(); }   // clones (texCoord / transform)
        mat.dispose();
      }
    });
    for (const h of g.images) this.images.release(h);
  }
  private gone(o: object) { if (this.debug) this.freed.add(o); }

  /** What a bull is made of: fur, eyes, hooves and its part ids. */
  private resolve(traits: CobiTraits) {
    const m = this.manifest;
    const { missing, fur, eyes, hooves, partIds } = resolveTraits(m, traits);
    const furE = m.furs[fur] ?? m.furs.Base;
    const hoofPath = hooves && m.hooves[hooves] ? m.hooves[hooves] : null;
    const eyePath = m.eyes[eyes] ?? null;
    const partFile = (p: string) => m.parts[p]?.file ?? `parts/${p}.glb`;
    // the textures the kit makes for it: key -> the files they are made from
    const made: [string, string[]][] = [[`base|${furE.base}|${hoofPath ?? ''}`, hoofPath ? [furE.base, hoofPath] : [furE.base]], [`orm|${furE.orm}`, [furE.orm]]];
    if (furE.normal) made.push([`n|${furE.normal}`, [furE.normal]]);
    if (furE.emissive) made.push([`e|${furE.emissive}`, [furE.emissive]]);
    if (eyePath) made.push([`eye|${eyePath}`, [eyePath]]);
    return { missing, fur, eyes, furE, hoofPath, eyePath, partIds, partFile, made };
  }

  /** Hold the bytes of every file of a bull whose glTF or texture the kit does not have yet (fetches start now). */
  private fetchAll(r: ReturnType<CobiKit['resolve']>): Held<ArrayBuffer>[] {
    const files = new Set<string>();
    if (this.body.v === undefined) files.add(this.manifest.body);
    for (const p of r.partIds) { const f = r.partFile(p); if (this.gltfs.map.get(f)?.v === undefined) files.add(f); }
    for (const [key, fs] of r.made) if (this.made.map.get(key)?.v === undefined) for (const f of fs) files.add(f);
    return [...files].map((f) => this.fetchHold(f));
  }
  /** Start fetching everything a bull needs (network only: nothing is parsed or decoded). The bytes are kept for its
   *  build (the latest two prefetches), which takes them over and drops them once parsed. */
  prefetch(traits: CobiTraits): void {
    const key = traitsKey(traits);
    if (this.prefetched.some((x) => x.key === key)) return;
    const holds = this.fetchAll(this.resolve(traits));
    if (!holds.length) return;
    this.prefetched.push({ key, holds });
    while (this.prefetched.length > 2) for (const h of this.prefetched.shift()!.holds) this.raw.release(h);
  }
  private takePrefetch(key: string): Held<ArrayBuffer>[] {
    const i = this.prefetched.findIndex((x) => x.key === key);
    return i < 0 ? [] : this.prefetched.splice(i, 1)[0].holds;
  }

  async build(traits: CobiTraits, opts: BuildOptions = {}): Promise<CobiBull> {
    const m = this.manifest;
    const r = this.resolve(traits);
    const { missing, eyes, furE, partIds, partFile } = r;
    const y = opts.yieldTo;
    // Everything this bull will use is counted now, before the first await: a bull released meanwhile (the runner
    // leaving while this one builds) never frees what the two share.
    const madeH = new Map(r.made.map(([key]) => [key, this.made.hold(key)] as const));
    const partH = partIds.map((p) => this.gltfs.hold(partFile(p)));
    const freeHolds = this.lease(madeH, partH);
    const madeFiles = new Map(r.made);
    let early: Held<ImageBitmap>[] = [];
    // The bytes: this bull's prefetch (if the caller made one) is taken over, a paced build fetches everything else
    // now, and each file's bytes are let go once what is made of it is in (unless another prefetch still needs them).
    const fetches = new Map<string, Held<ArrayBuffer>[]>();
    const keep = (hs: Held<ArrayBuffer>[]) => { for (const h of hs) fetches.set(h.key, [...(fetches.get(h.key) ?? []), h]); };
    const drop = (...paths: string[]) => { for (const f of paths) { for (const h of fetches.get(f) ?? []) this.raw.release(h); fetches.delete(f); } };
    keep(this.takePrefetch(traitsKey(traits)));
    try {
      if (y) { keep(this.fetchAll(r)); await y(); }   // every fetch in flight at once; decodes and parses below start only once the caller lets them
      const tex = (key: string, srgb: boolean) => this.made.load(madeH.get(key)!, async () => {
        const [h, p] = this.bitmap(madeFiles.get(key)![0]);
        try { return { tex: texture(await p, srgb), bmps: [h] }; } catch (e) { this.bitmaps.release(h); throw e; }
      }).then((v) => { drop(...madeFiles.get(key)!); return v; });
      // The hooves composite is painted at this build's turn, after the parses (a heavy main-thread step, like them);
      // its fur and overlay start decoding now, unless the kit has the composite already. It keeps only its canvas:
      // the two bitmaps are closed once it is painted (unless something else holds them).
      const baseKey = r.made[0][0], hoofPath = r.hoofPath;
      if (hoofPath && !madeH.get(baseKey)!.p) early = [this.bitmap(furE.base)[0], this.bitmap(hoofPath)[0]];
      const paint = (hoof: string) => this.made.load(madeH.get(baseKey)!, async () => {
        const [fh, fp] = this.bitmap(furE.base), [oh, op] = this.bitmap(hoof);
        try {
          const [fur, overlay] = await Promise.all([fp, op]);
          const canvas = composite(fur, overlay);
          return { tex: texture(canvas, true), bmps: [], canvas };
        } finally { this.bitmaps.release(fh); this.bitmaps.release(oh); }
      }).then((v) => { drop(furE.base, hoof); return v; });
      const maps = Promise.all([
        hoofPath ? null : tex(baseKey, true),
        tex(`orm|${furE.orm}`, false),
        furE.normal ? tex(`n|${furE.normal}`, false) : null, furE.emissive ? tex(`e|${furE.emissive}`, true) : null,
        r.eyePath ? tex(`eye|${r.eyePath}`, true) : null,
      ]);
      maps.catch(() => { /* awaited below */ });
      let body: Part, parts: Part[];
      const gltf = (h: Held<Part>) => this.loadGltf(h).then((v) => { drop(h.key); return v; });
      if (y) {
        await y(); body = await gltf(this.body);
        parts = [];
        for (const h of partH) { await y(); parts.push(await gltf(h)); }
      } else {
        [body, parts] = await Promise.all([gltf(this.body), Promise.all(partH.map(gltf))]);
      }
      if (y) await y();
      const [furM, ormM, nM, eM, eyeM] = await maps;
      const baseM = hoofPath ? await paint(hoofPath) : furM!;

      // Clone the body per bull (the cached glTF stays pristine); parts are cloned onto its skeleton.
      const root = new THREE.Group();
      const bodyScene = cloneSkinned(body.scene);
      root.add(bodyScene);
      const bones = new Map<string, THREE.Bone>();
      const meshes: THREE.SkinnedMesh[] = [];
      bodyScene.traverse((o: any) => { if (o.isBone) bones.set(o.name, o); if (o.isSkinnedMesh) meshes.push(o); });
      const bodyMesh = meshes.find((x) => (x.material as THREE.Material).name === 'fur') ?? meshes[0];
      const eyeMesh = meshes.find((x) => (x.material as THREE.Material).name === 'eyes');
      const holder = bodyMesh.parent!;
      const skel = bodyMesh.skeleton;
      // the body's other skins (the eyes) onto its skeleton too
      for (const x of meshes) if (x !== bodyMesh && x.skeleton !== skel) shareSkeleton(x, x.skeleton.bones, x.skeleton.boneInverses, x.bindMatrix, skel);

      // Fur (+ hooves overlay) and eyes: one texture per image for every bull built from this kit (held, see above).
      const own: THREE.Material[] = [];
      const fm = (bodyMesh.material as THREE.MeshStandardMaterial).clone(); own.push(fm);
      fm.map = baseM.tex;
      fm.roughnessMap = fm.metalnessMap = ormM.tex; fm.roughness = 1; fm.metalness = 1;
      if (nM) fm.normalMap = nM.tex;
      if (eM) { fm.emissiveMap = eM.tex; fm.emissive.set(0xffffff); } else { fm.emissiveMap = null; fm.emissive.set(0x000000); }
      fm.needsUpdate = true; bodyMesh.material = fm;
      if (eyeMesh && eyeM) {
        const em = (eyeMesh.material as THREE.MeshStandardMaterial).clone(); own.push(em); em.map = eyeM.tex;
        if (m.glow?.includes(eyes)) { em.emissiveMap = em.map; em.emissive.set(0xffffff); em.emissiveIntensity = 1.6; }
        eyeMesh.material = em;
      }

      // Parts: rebind each skinned mesh to the body's bones (same names, same rest pose) — and to the body's own
      // skeleton where that draws it the same (shareSkeleton), else to a skeleton of its own.
      for (const g of parts) {
        g.scene.updateMatrixWorld(true);
        g.scene.traverse((o: any) => {
          if (!o.isSkinnedMesh) return;
          const sm = o as THREE.SkinnedMesh;
          const mesh = new THREE.SkinnedMesh(sm.geometry, sm.material);
          mesh.name = sm.name; mesh.frustumCulled = false;
          mesh.position.copy(sm.position); mesh.quaternion.copy(sm.quaternion); mesh.scale.copy(sm.scale);
          const pb = sm.skeleton.bones.map((b) => bones.get(b.name)!);
          holder.add(mesh);
          if (!shareSkeleton(mesh, pb, sm.skeleton.boneInverses, sm.bindMatrix, skel)) mesh.bind(new THREE.Skeleton(pb, sm.skeleton.boneInverses), sm.bindMatrix);
          meshes.push(mesh);
        });
      }
      if (opts.cull) cullSphere(root, meshes); else for (const x of meshes) x.frustumCulled = false;

      // A bull dropped without release() gives its kit holds back when collected (the closure holds no part of it).
      this.finalizer?.register(root, freeHolds, root);
      let done = false;
      const release = () => {
        if (done) return; done = true;
        this.finalizer?.unregister(root);
        for (const s of new Set(meshes.map((x) => x.skeleton))) s.dispose();   // its bone textures
        for (const mat of own) mat.dispose();
        freeHolds();
      };
      return { root, meshes, bones, traits, missing, release };
    } catch (e) {
      freeHolds();
      throw e;
    } finally {
      for (const h of early) this.bitmaps.release(h);
      drop(...fetches.keys());   // (a failed build, or files whose glTF / texture the kit had already)
    }
  }
  /** A bull's holds on the kit, given back once (by release(), a failed build, or the finalizer). Made here, not in
   *  build(): a closure shares its scope's context with every other closure there, and one made in build() would keep
   *  the bull's root alive through release()'s captures, so the finalizer could never run. */
  private lease(madeH: Map<string, Held<Made>>, partH: Held<Part>[]): () => void {
    this.live++;
    let freed = false;
    return () => {
      if (freed) return; freed = true; this.live--;
      for (const h of madeH.values()) this.made.release(h);
      for (const h of partH) this.gltfs.release(h);
    };
  }

  /** Test probe: how many of `objs` (a runner's textures and geometries) the kit has freed — 0, or a bull in use lost
   *  something it shares with a released one. Needs `debug`. */
  check(objs: object[]): { held: number; freed: number } {
    let freed = 0;
    for (const o of objs) if (this.freed.has(o)) freed++;
    return { held: objs.length, freed };
  }

  /** What the kit holds now (entries and estimated bytes). */
  stats(): KitStats {
    let rawN = 0, rawB = 0;
    for (const e of this.raw.map.values()) if (e.v) { rawN++; rawB += e.v.byteLength; }
    let gN = 0, gB = 0, geos = 0;
    for (const e of this.gltfs.map.values()) {
      if (!e.v) continue;
      gN++; const bufs = new Set<ArrayBufferLike>();
      e.v.scene.traverse((o: any) => {
        if (!o.geometry) return; geos++;
        for (const a of [...Object.values(o.geometry.attributes), o.geometry.index] as any[]) if (a) bufs.add(a.array.buffer);
      });
      for (const b of bufs) gB += b.byteLength;
    }
    const bmps = new Set<ImageBitmap>(); let canN = 0, canB = 0, tN = 0, tB = 0;
    for (const e of this.bitmaps.map.values()) if (e.v) bmps.add(e.v);
    const texs: THREE.Texture[] = [];
    for (const e of this.made.map.values()) if (e.v) { texs.push(e.v.tex); if (e.v.canvas) { canN++; canB += px(e.v.canvas); } }
    for (const e of this.images.map.values()) if (e.v) { texs.push(e.v); if (e.v.image instanceof ImageBitmap) bmps.add(e.v.image); }
    for (const t of texs) { tN++; tB += px(t.image) * 4 / 3; }
    let bN = 0, bB = 0;
    for (const b of bmps) if (b.width > 0) { bN++; bB += px(b); }
    const MB = (x: number) => +(x / 1048576).toFixed(2);
    return {
      leases: this.live, raw: { n: rawN, MB: MB(rawB) }, gltf: { n: gN, geometries: geos, MB: MB(gB) },
      bitmaps: { n: bN, MB: MB(bB) }, canvases: { n: canN, MB: MB(canB) }, textures: { n: tN, MB: MB(tB) },
      cpuMB: MB(rawB + gB + bB + canB), gpuMB: MB(tB),
    };
  }
}

/** Clone a glTF scene with skinned meshes bound to the cloned bones (SkeletonUtils.clone, inlined). */
function cloneSkinned(src: THREE.Object3D): THREE.Object3D {
  const clone = src.clone(true);
  const srcBones = new Map<THREE.Object3D, THREE.Object3D>();
  const pair = (a: THREE.Object3D, b: THREE.Object3D) => { srcBones.set(a, b); a.children.forEach((c, i) => pair(c, b.children[i])); };
  pair(src, clone);
  src.traverse((o: any) => {
    if (!o.isSkinnedMesh) return;
    const c = srcBones.get(o) as THREE.SkinnedMesh;
    c.skeleton = o.skeleton.clone();
    c.bindMatrix.copy(o.bindMatrix);
    c.skeleton.bones = o.skeleton.bones.map((b: THREE.Bone) => srcBones.get(b) as THREE.Bone);
    c.bind(c.skeleton, c.bindMatrix);
  });
  return clone;
}
