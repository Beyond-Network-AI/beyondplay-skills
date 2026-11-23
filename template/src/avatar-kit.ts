// PLATFORM-OWNED. Do not edit: the validator refuses a game whose copy differs from the template's,
// and the hosted build keeps the platform's copy anyway.
// Synced from Beyond-Network-AI/beyondplay-games library/characters/avatar-kit.ts by scripts/sync-avatar-kit.mjs.
//   commit  8378a1804b9327cf4803619a6ac6f00ab89a316c
//   sha256  49e82f5aecda84fd9c92ec09c26e1bf1bed71fc6319a5ed5e6f2583213359d07  (of the source file; template/src/avatar-kit.SOURCE.json records the same)
// To change the loader: edit it in the games repository, commit there, then run
//   npm run sync-avatar-kit -- <path to that checkout>
// ---- synced copy: everything below is the games repository's file, its two imports renamed to the template's files ----
// The avatar kit: every BeyondPlay avatar and every collectible on one skeleton, dressed and moving, for any game.
//
//   const avatars = await AvatarKit.load();                                 // the catalogue on the asset host
//   const me = await avatars.build({ body: 'beyonder-f', look: 'pink' });   // 1.6 to 1.9 m, feet at y = 0, faces +Z
//   scene.add(me.root);
//   const clips = await me.clips(['idle', 'walk', 'run', 'jump', 'wave']);  // the moves by their shared names, in her style
//   const anim = new Animator(me.root, clips, { idle: { clip: 'idle' }, run: { clip: 'run' } });   // or an AnimationMixer
//   await me.wear(['tee-white']);                // a top from her own wardrobe; the other slots keep what they had
//   me.point('rightHand').add(sword);             // head, back, rightHand, leftHand: metres, following the bone
//   const ape = await avatars.build({ body: 'ape', look: 'ape-07' });   // a live dressed ape: its fur and its outfit
//   await ape.wearLook('ape-02');                                       // another whole look
//   const racer = await avatars.build({ body: 'bull', look: 'bull-01' }); // a live bull (one file, worn whole)
//   const bull = await avatars.build({ collection: 'cobi', traits: item.traits, wear: ['quester'] });   // as minted
//   scene.remove(me.root); me.release();
//
// Two worlds (library/beyonder/README.md, the founder's direction of 21 November 2026):
// - BeyondPlay avatars (`body`): the two Beyonders, the ape, the platform bull and the platform bear. Each dresses only
//   from its own wardrobe (`avatars.wardrobe(body)`), has its own looks, and wears its base layer in any slot left
//   empty (the Beyonders' black shorts, and her sports top). An item hides the skin it covers, and the body stays one
//   mesh: any outfit draws the body once. A player wears a whole look, as sold (the founder, 23 November: no mixing);
//   the ape's looks are the live eighteen dressed apes (ape-01 ... ape-18), each with its own fur. The platform bull's
//   looks add the five live bulls (bull-01 Racer ... bull-05 Hooper): each one file baked from its COBI traits on the
//   same skeleton, worn whole (no item goes on or off it; build another avatar for another look).
// - Collectibles (`collection`): a holder's token, exactly as minted, built by its collection's own kit (COBI bulls:
//   cobi-kit.ts, from the traits the platform hands over), wearing only its collection's wearables (the bulls' back
//   pieces and the Pumpkin Head), which it covers traits with the way the game Bear Market of the Undead does. Which
//   wearables a holder owns is the platform's to say; the kit draws what it is asked to.
// What they share: the bull's 65 bones, the moves by name (idle, walk, run, jump, wave, ... and the dances), and four
// attachment points measured on each body. Each body moves in its own style where it has one (the founder, 23
// November): the ape plays the live apes' moves and each Beyonder its own, carried onto the shared skeleton; the bull,
// the bear and the collectibles play the library's bull moves (hips' travel scaled by the body's hip height). So any
// game plays any avatar by the same names, and a clip a game makes for the bull plays on every body (`fit`).
//
// Files: the catalogue (AVATARS_CATALOGUE, kept a minute on the host) names every file; files carry their content's
// hash in their name, so a re-cut item reaches every game with no code change. Built from the avatar proof
// (tools/avatar-proof, pack.mjs). One copy: the public creator kit (beyondplay-skills) carries this file as
// template/src/avatar-kit.ts, synced by its scripts/sync-avatar-kit.mjs.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AVATAR_CULL_RADIUS, CobiKit, shareSkeleton, webpBitmapPlugin, type CobiBull, type CobiTraits } from './cobi-kit';
import { loadClip, loadDance, retargetFrom, type HipsRest } from './beyondplay-characters';

export const AVATARS_CATALOGUE = 'https://assets.beyondplay.xyz/library/manifests/avatars.json';
export const SLOTS = ['top', 'bottom', 'shoes', 'eyes', 'hat'] as const;
export type Slot = (typeof SLOTS)[number];
export const POINTS = ['head', 'back', 'rightHand', 'leftHand'] as const;
export type PointName = (typeof POINTS)[number];

/** An attachment point: a bone (three.js's name for it) and a spot in that bone's own frame. */
export interface AttachPoint { bone: string; at: [number, number, number] }
export interface AvatarItem { slot: Slot; label: string; file: string; bytes: number; /** body zones it covers */ hides: string[] }
export interface AvatarLook {
  id: string; label: string; items: string[];
  /** the body's fur in this look (the ape) */
  fur?: string;
  /** a look that is one whole file in place of the body and its items (a live bull, baked from `traits`) */
  file?: string; bytes?: number; traits?: CobiTraits;
}
export interface AvatarBody {
  label: string; file: string; bytes: number;
  /** files always drawn with the body (the platform bull's horns) */
  parts: string[];
  /** hip height against the bull's: the moves' hip travel is scaled by it */
  hipScale: number;
  /** top of the head and eye line, metres over the feet */
  height: number; eyeY: number;
  points: Record<PointName, AttachPoint>;
  /** what it wears in a slot left empty */
  base: Partial<Record<Slot, string>>;
  items: Record<string, AvatarItem>;
  looks: AvatarLook[];
  /** a body that comes in several furs (the ape): each fur's map, which every one of its meshes takes, and the default */
  furs?: Record<string, { file: string; bytes: number }>;
  fur?: string;
  /** its own moves: the library move set it plays (by the shared names) and the hips' rest on the rig that set was made
   *  on; absent: the catalogue's `moves` */
  moves?: { set: string; rig: string; rest: HipsRest };
}
export interface CollectibleWearable {
  slot: string; label: string; file: string; bytes: number; hidesTraits: string[]; hidesEyes: boolean;
  /** it covers the head: the body's skin the Head bone carries is not drawn (the Pumpkin Head) */
  hidesHead?: boolean;
}
export interface AvatarCollection {
  label: string;
  /** the collection's own kit on the asset host, and the kit id it must announce */
  kit: string; kitId: string;
  hipScale: number; height: number;
  points: Record<PointName, AttachPoint>;
  wearables: Record<string, CollectibleWearable>;
}
export interface AvatarCatalogue {
  version: number;
  /** where the files are: each file name is relative to it */
  base: string;
  skeleton: string;
  /** the library move set every body without its own plays, and the collectibles (characters.ts): the bull's */
  moves: string;
  slots: Slot[];
  zones: string[];
  points: Record<PointName, string>;
  bodies: Record<string, AvatarBody>;
  collections: Record<string, AvatarCollection>;
}

/** What to build: a BeyondPlay avatar in one of its looks and/or chosen items (no look and no items: its first look;
 *  `wear: []` alone: its base layer), or a collectible from its traits with wearables of its collection. */
export type AvatarSpec =
  | { body: string; look?: string; wear?: string[] }
  | { collection: 'cobi'; traits: CobiTraits; wear?: string[] };

export interface AvatarKitOptions {
  /** Serve the files from here instead of the catalogue's `base` (a local copy of the pack, for tests). */
  base?: string;
  /** A COBI kit the game already holds (cobi-kit.ts), shared with its other bulls; else loaded when first needed. */
  cobi?: CobiKit;
}

const HIPS_POSITION = /Hips\.position$/;

/** A copy of a clip with the hips' travel scaled (a body whose hips are lower than the bull's takes shorter steps up and down). */
function scaleHips(clip: THREE.AnimationClip, s: number): THREE.AnimationClip {
  const c = clip.clone();
  if (s !== 1) for (const t of c.tracks) if (HIPS_POSITION.test(t.name)) for (let i = 0; i < t.values.length; i++) t.values[i] *= s;
  return c;
}

/** A mesh's matrix relative to `root` (the avatar's own frame, wherever the game has put it). */
function inRoot(o: THREE.Object3D, root: THREE.Object3D): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) { p.updateMatrix(); m.premultiply(p.matrix); }
  return m;
}

/** A body's skin by zone: geometries that leave out the triangles of hidden zones, made once per set of zones and
 *  shared by every avatar of that body. */
interface SkinVariants { users: number; made: Map<string, THREE.BufferGeometry> }

export class AvatarKit {
  private loader = new GLTFLoader();
  private files = new Map<string, Promise<GLTF>>();
  private variants = new Map<string, SkinVariants>();
  private headless = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
  private textures = new Map<string, Promise<THREE.Texture>>();
  private cobiKit: Promise<CobiKit> | null;

  private constructor(readonly catalogue: AvatarCatalogue, private base: string, cobi?: CobiKit) {
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.loader.register(webpBitmapPlugin);
    this.cobiKit = cobi ? Promise.resolve(cobi) : null;
  }

  /** Reads the catalogue (the asset host's, unless another address is given). */
  static async load(url: string = AVATARS_CATALOGUE, opts: AvatarKitOptions = {}): Promise<AvatarKit> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`avatar kit: HTTP ${r.status} for ${url}`);
    const catalogue = (await r.json()) as AvatarCatalogue;
    let base = opts.base ?? catalogue.base;
    if (!base.endsWith('/')) base += '/';
    return new AvatarKit(catalogue, base, opts.cobi);
  }

  /** The BeyondPlay avatars' bodies ('beyonder', 'beyonder-f', 'ape', 'bull', 'bear'). */
  get bodies(): string[] { return Object.keys(this.catalogue.bodies); }
  /** A body's own wardrobe, by item id ('puffer-pink': { slot: 'top', label: 'Pink puffer', ... }). */
  wardrobe(body: string): Record<string, AvatarItem> { return this.body(body).items; }
  /** A body's looks (whole outfits: 'pink', 'summer', ...). */
  looks(body: string): AvatarLook[] { return this.body(body).looks; }
  /** A collection's wearables ('quester', 'pumpkin-head', ...). */
  wearables(collection: string): Record<string, CollectibleWearable> { return this.collection(collection).wearables; }

  private body(id: string): AvatarBody {
    const b = this.catalogue.bodies[id];
    if (!b) throw new Error(`avatar kit: no body ${id} (bodies: ${this.bodies.join(', ')})`);
    return b;
  }
  private collection(id: string): AvatarCollection {
    const c = this.catalogue.collections[id];
    if (!c) throw new Error(`avatar kit: no collection ${id} (collections: ${Object.keys(this.catalogue.collections).join(', ')})`);
    return c;
  }

  /** One file of the pack, fetched and parsed once (its meshes and materials are shared by every avatar using it). */
  gltf(file: string): Promise<GLTF> {
    const url = this.base + file;
    let p = this.files.get(url);
    if (!p) { p = this.loader.loadAsync(url); this.files.set(url, p); p.catch(() => this.files.delete(url)); }
    return p;
  }

  /** One image of the pack (a fur), decoded once through createImageBitmap (no blob: URL, which a strict CSP refuses and
   *  an iPhone can draw blank) and shared by every avatar using it. */
  texture(file: string): Promise<THREE.Texture> {
    const url = this.base + file;
    let p = this.textures.get(url);
    if (!p) {
      p = (async () => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`avatar kit: HTTP ${r.status} for ${url}`);
        const t = new THREE.Texture(await createImageBitmap(await r.blob()));
        t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
        return t;
      })();
      this.textures.set(url, p);
      p.catch(() => this.textures.delete(url));
    }
    return p;
  }

  /** The COBI kit the collectible bulls are built with (the game's own when it passed one). */
  cobi(): Promise<CobiKit> {
    if (!this.cobiKit) {
      const c = this.collection('cobi');
      this.cobiKit = CobiKit.load(c.kit, { tokens: false, kit: c.kitId });
      this.cobiKit.catch(() => { this.cobiKit = null; });
    }
    return this.cobiKit;
  }

  /** Start fetching what an avatar will need, without building it (a menu's next pick, the next level's crowd). */
  prefetch(spec: AvatarSpec): void {
    const files = 'body' in spec
      ? (() => { const b = this.body(spec.body), o = outfitOf(b, spec); if (o.whole) return [o.whole.file!]; if (o.fur) this.texture(b.furs![o.fur].file).catch(() => undefined); return [b.file, ...b.parts, ...o.items.map((i) => b.items[i].file)]; })()
      : (spec.wear ?? []).map((w) => this.collection(spec.collection).wearables[w]?.file).filter((f): f is string => !!f);
    for (const f of files) this.gltf(f).catch(() => undefined);
  }

  /** An avatar, dressed and ready to animate. Throws for a body, look, item, collection or wearable the catalogue
   *  does not hold. */
  async build(spec: AvatarSpec): Promise<Avatar> {
    if ('body' in spec) {
      const b = this.body(spec.body);
      const outfit = outfitOf(b, spec);
      // a whole look (a live bull) is its own file, drawn in place of the body, its parts and any item
      const [body, ...parts] = await Promise.all(outfit.whole ? [this.gltf(outfit.whole.file!)] : [this.gltf(b.file), ...b.parts.map((p) => this.gltf(p))]);
      const scene = cloneSkinned(body.scene);
      const root = new THREE.Group();
      root.name = spec.body;
      root.add(scene);
      const bones = new Map<string, THREE.Bone>();
      const skins: THREE.SkinnedMesh[] = [];
      scene.traverse((o) => { if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone); if ((o as THREE.SkinnedMesh).isSkinnedMesh) skins.push(o as THREE.SkinnedMesh); });
      // the body's other skins (the ape's twelve region meshes) onto the first one's skeleton where that draws them the same
      const skel = skins[0].skeleton;
      for (const s of skins.slice(1)) if (s.skeleton !== skel) shareSkeleton(s, s.skeleton.bones, s.skeleton.boneInverses, s.bindMatrix, skel);
      const zoned = skins.map((s, i) => ({ mesh: s, i, zone: s.geometry.getAttribute('_zone') as THREE.BufferAttribute | undefined, full: s.geometry }));
      const key = outfit.whole ? `${spec.body}/${outfit.whole.id}` : spec.body;
      const v = this.variants.get(key) ?? { users: 0, made: new Map() };
      v.users++; this.variants.set(key, v);
      const a = new Avatar(this, { kind: 'body', id: spec.body, root, bones, skeleton: skel, scene, meshes: skins, hipScale: b.hipScale, height: b.height, points: b.points });
      a.body = b; a.zoned = zoned; a.variantsKey = key; a.whole = outfit.whole?.id ?? null;
      a.setSphere();
      try {
        for (const p of parts) a.bindGltf(p);
        if (!outfit.whole) await Promise.all([a.dress(outfit.items), outfit.fur ? a.setFur(outfit.fur) : undefined]);
        a.lookId = outfit.look;
      } catch (e) {
        a.release();
        throw e;
      }
      return a;
    }
    const c = this.collection(spec.collection);
    const kit = await this.cobi();
    const bull: CobiBull = await kit.build(spec.traits, { cull: true });
    const a = new Avatar(this, { kind: 'collectible', id: spec.collection, root: bull.root, bones: bull.bones, skeleton: bull.meshes[0].skeleton, scene: bull.root.children[0], meshes: bull.meshes, hipScale: c.hipScale, height: c.height, points: c.points });
    a.collection = c; a.bull = bull;
    const fur = bull.meshes.find((m) => (m.material as THREE.Material).name === 'fur');
    if (fur?.geometry.index) a.furSkin = { mesh: fur, full: fur.geometry };
    a.partsOf = (type: string) => kit.manifest.traits[`${type}/${bull.traits[type]}`]?.parts ?? [];
    a.setSphere();
    try {
      await a.dress(spec.wear ?? []);
    } catch (e) {
      a.release();
      throw e;
    }
    return a;
  }

  /** A body's skin without the zones in `hidden` (shared by every avatar of the body; the full skin when none). */
  skin(key: string, index: number, full: THREE.BufferGeometry, zone: THREE.BufferAttribute, hidden: Set<number>): THREE.BufferGeometry {
    if (!hidden.size) return full;
    const v = this.variants.get(key)!;
    const k = `${index}|${[...hidden].sort((x, y) => x - y).join(',')}`;
    let g = v.made.get(k);
    if (!g) {
      const src = full.index!.array, out = new (src.constructor as Uint16ArrayConstructor | Uint32ArrayConstructor)(src.length), z = zone.array;
      let n = 0;
      for (let t = 0; t < src.length; t += 3) {
        const i0 = src[t], i1 = src[t + 1], i2 = src[t + 2];
        if (hidden.has(z[i0]) && hidden.has(z[i1]) && hidden.has(z[i2])) continue;
        out[n++] = i0; out[n++] = i1; out[n++] = i2;
      }
      g = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(full.attributes)) g.setAttribute(name, attr);
      g.setIndex(new THREE.BufferAttribute(out.slice(0, n), 1));
      g.boundingBox = full.boundingBox; g.boundingSphere = full.boundingSphere;
      v.made.set(k, g);
    }
    return g;
  }

  /** A collectible body's skin without the triangles the Head bone carries (all three corners weighted mostly to
   *  it), made once per body geometry: what a wearable that covers the head leaves of it. */
  withoutHead(mesh: THREE.SkinnedMesh, full: THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.headless.get(full);
    if (!g) {
      const si = full.getAttribute('skinIndex'), sw = full.getAttribute('skinWeight'), bones = mesh.skeleton.bones;
      const head = new Uint8Array(si.count);
      for (let v = 0; v < si.count; v++) {
        let best = 0, w = -1;
        for (let k = 0; k < 4; k++) { const x = sw.getComponent(v, k); if (x > w) { w = x; best = si.getComponent(v, k); } }
        head[v] = /^mixamorigHead/.test(bones[best]?.name ?? '') ? 1 : 0;
      }
      const src = full.index!.array, out = new (src.constructor as Uint16ArrayConstructor | Uint32ArrayConstructor)(src.length);
      let n = 0;
      for (let t = 0; t < src.length; t += 3) {
        if (head[src[t]] && head[src[t + 1]] && head[src[t + 2]]) continue;
        out[n++] = src[t]; out[n++] = src[t + 1]; out[n++] = src[t + 2];
      }
      g = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(full.attributes)) g.setAttribute(name, attr);
      g.setIndex(new THREE.BufferAttribute(out.slice(0, n), 1));
      g.boundingBox = full.boundingBox; g.boundingSphere = full.boundingSphere;
      this.headless.set(full, g);
    }
    return g;
  }

  /** An avatar of `key` let go: once none is left, its skin variants are freed. */
  drop(key: string): void {
    const v = this.variants.get(key);
    if (!v || --v.users > 0) return;
    for (const g of v.made.values()) g.dispose();
    this.variants.delete(key);
  }
}

/** What a spec dresses a body in: its look's items and fur (its first look's when it names neither a look nor items),
 *  then each item it names over its own slot (the look is then no longer whole: `look` is null). */
function outfitOf(b: AvatarBody, spec: { look?: string; wear?: string[] }): { items: string[]; fur?: string; look: string | null; whole?: AvatarLook } {
  const look = spec.look !== undefined ? b.looks.find((l) => l.id === spec.look) : spec.wear ? undefined : b.looks[0];
  if (spec.look !== undefined && !look) throw new Error(`avatar kit: no look ${spec.look} (looks: ${b.looks.map((l) => l.id).join(', ')})`);
  if (look?.file) {
    if (spec.wear?.length) throw new Error(`avatar kit: ${look.id} is worn whole; it takes no items`);
    return { items: [], look: look.id, whole: look };
  }
  const bySlot = new Map<string, string>();
  for (const id of [...(look?.items ?? []), ...(spec.wear ?? [])]) {
    const it = b.items[id];
    if (!it) throw new Error(`avatar kit: ${id} is not in this body's wardrobe (${Object.keys(b.items).join(', ')})`);
    bySlot.set(it.slot, id);
  }
  if (look?.fur && !b.furs?.[look.fur]) throw new Error(`avatar kit: look ${look.id} names fur ${look.fur}, which the body lacks`);
  return { items: [...bySlot.values()], fur: look?.fur ?? b.fur, look: look && !spec.wear?.length ? look.id : null };
}

interface AvatarParts {
  kind: 'body' | 'collectible'; id: string; root: THREE.Group; bones: Map<string, THREE.Bone>; skeleton: THREE.Skeleton;
  /** the frame its pack files' meshes go in (the body file's scene) */
  scene: THREE.Object3D; meshes: THREE.SkinnedMesh[]; hipScale: number; height: number; points: Record<PointName, AttachPoint>;
}

/** One avatar: a body or a collectible, its outfit, its moves and its attachment points. */
export class Avatar {
  /** 'body': a BeyondPlay avatar; 'collectible': a holder's token. */
  readonly kind: 'body' | 'collectible';
  /** the body ('beyonder-f') or the collection ('cobi') */
  readonly id: string;
  /** add it to the scene; animate it (an AnimationMixer, or the template's Animator) */
  readonly root: THREE.Group;
  /** its bones by three.js name ('mixamorigHead') */
  readonly bones: Map<string, THREE.Bone>;
  readonly hipScale: number;
  /** top of the head, metres over the feet */
  readonly height: number;
  /** the library move set its moves come from ('ape-kit', 'beyonder-pink', 'bull') */
  get moveSet(): string { return this.body?.moves?.set ?? this.kit.catalogue.moves; }
  private chosen: string[] = [];
  private wanted: string[] = [];
  private kit: AvatarKit;
  private skeleton: THREE.Skeleton;
  private scene: THREE.Object3D;
  private meshes: THREE.SkinnedMesh[];
  private pointsAt: Record<PointName, AttachPoint>;
  private anchors = new Map<PointName, THREE.Object3D>();
  private worn = new Map<string, THREE.SkinnedMesh[]>();
  private own: THREE.Skeleton[] = [];
  private sphere: THREE.Sphere | null = null;
  private furName: string | null = null;
  private furTurn = 0;
  private furMats = new Map<THREE.Material, THREE.Material>();
  private turn = 0;
  private done = false;
  /** @internal */ body?: AvatarBody;
  /** @internal */ zoned: { mesh: THREE.SkinnedMesh; i: number; zone?: THREE.BufferAttribute; full: THREE.BufferGeometry }[] = [];
  /** @internal */ variantsKey = '';
  /** @internal */ collection?: AvatarCollection;
  /** @internal */ bull?: CobiBull;
  /** @internal */ partsOf?: (traitType: string) => string[];
  /** @internal a collectible's fur skin and its full geometry */ furSkin?: { mesh: THREE.SkinnedMesh; full: THREE.BufferGeometry };
  /** @internal the look it wears whole, if it does */ lookId: string | null = null;
  /** @internal the whole-file look it is (a live bull), which nothing changes */ whole: string | null = null;

  /** @internal made by AvatarKit.build */
  constructor(kit: AvatarKit, p: AvatarParts) {
    this.kit = kit; this.kind = p.kind; this.id = p.id; this.root = p.root; this.bones = p.bones; this.skeleton = p.skeleton;
    this.scene = p.scene; this.meshes = p.meshes; this.hipScale = p.hipScale; this.height = p.height; this.pointsAt = p.points;
  }

  /** What it wears, one per slot: item ids (a body) or wearable ids (a collectible), the base layer not included. */
  get outfit(): string[] { return [...this.chosen]; }

  /** The look it wears whole ('ape-07', 'pink'), or null once single items changed it (or for a collectible). */
  get look(): string | null { return this.lookId; }

  /** Its fur ('slate'), for a body that comes in several (the ape); null otherwise. */
  get fur(): string | null { return this.furName; }

  /** Wear one of its body's looks whole: its items (the base layer in the slots it leaves empty) and its fur. */
  async wearLook(id: string): Promise<void> {
    const look = this.body?.looks.find((l) => l.id === id);
    if (!look) throw new Error(`avatar kit: no look ${id} for ${this.id}${this.body ? ` (looks: ${this.body.looks.map((l) => l.id).join(', ')})` : ''}`);
    if (this.whole === id) return;
    if (this.whole || look.file) throw new Error(`avatar kit: ${this.whole ?? id} is a whole look: build another avatar for it`);
    await Promise.all([this.dress(look.items), look.fur ? this.setFur(look.fur) : undefined]);
    this.lookId = id;
  }

  /** Change its fur (the ape): every one of its body's meshes takes the fur's map. */
  async setFur(name: string): Promise<void> {
    if (this.whole) throw new Error(`avatar kit: ${this.whole} is worn whole`);
    const f = this.body?.furs?.[name];
    if (!f) throw new Error(`avatar kit: no fur ${name} for ${this.id}${this.body?.furs ? ` (furs: ${Object.keys(this.body.furs).join(', ')})` : ''}`);
    const turn = ++this.furTurn;
    const tex = await this.kit.texture(f.file);
    if (turn !== this.furTurn || this.done) return;
    for (const m of this.meshes) {
      const src = m.material as THREE.MeshStandardMaterial;
      let own = this.furMats.get(src) as THREE.MeshStandardMaterial | undefined;
      if (!own) {
        own = [...this.furMats.values()].includes(src) ? src : src.clone();
        if (own !== src) { this.furMats.set(src, own); this.furMats.set(own, own); }
      }
      own.map = tex; own.needsUpdate = true; m.material = own;
    }
    this.furName = name;
    this.lookId = null;
  }

  /** What it draws: its outfit and, for a body, its base layer in the slots its outfit leaves empty. */
  get showing(): string[] { return this.shown(this.chosen); }

  private shown(outfit: string[]): string[] {
    const b = this.body;
    if (!b || this.whole) return [...outfit];
    return SLOTS.map((s) => outfit.find((i) => b.items[i].slot === s) ?? b.base[s]).filter((i): i is string => !!i);
  }

  /** Put these on, each in its own slot (what was there comes off); the other slots keep what they have. */
  async wear(ids: string[]): Promise<void> {
    const slots = new Set(ids.map((n) => this.slotOf(n)));
    return this.dress([...this.wanted.filter((i) => !slots.has(this.slotOf(i))), ...ids]);
  }

  /** Empty these slots (a body shows its base layer there). */
  async takeOff(slots: string[]): Promise<void> {
    return this.dress(this.wanted.filter((i) => !slots.includes(this.slotOf(i))));
  }

  /** The whole outfit: exactly these (a body: one per slot, its base layer in the rest). Resolves once drawn; if a
   *  newer call came in meanwhile, that one is what shows. A file that fails to load leaves the outfit as it was. */
  async dress(ids: string[]): Promise<void> {
    if (this.done) throw new Error('avatar kit: this avatar was released');
    if (this.whole) throw new Error(`avatar kit: ${this.whole} is worn whole; it takes no items (build another avatar)`);
    this.lookId = null;
    const bySlot = new Map<string, string>();
    for (const id of ids) bySlot.set(this.slotOf(id), id);
    const outfit = [...bySlot.values()];
    const turn = ++this.turn;
    const show = this.shown(outfit);
    this.wanted = outfit;
    try {
      await Promise.all(show.map((id) => this.load(id)));
    } catch (e) {
      if (turn === this.turn) this.wanted = this.chosen;
      throw e;
    }
    if (turn !== this.turn || this.done) return;
    this.chosen = outfit;
    for (const [id, meshes] of this.worn) for (const m of meshes) m.visible = show.includes(id);
    if (this.body) {
      const b = this.body, zones = this.kit.catalogue.zones;
      const hidden = new Set(show.flatMap((i) => b.items[i].hides).map((z) => zones.indexOf(z)).filter((z) => z >= 0));
      for (const z of this.zoned) if (z.zone && z.full.index) z.mesh.geometry = this.kit.skin(this.variantsKey, z.i, z.full, z.zone, hidden);
    } else {
      const w = this.collection!.wearables, parts = new Set(show.flatMap((id) => w[id].hidesTraits).flatMap((t) => this.partsOf!(t)));
      const eyes = show.some((id) => w[id].hidesEyes), head = show.some((id) => w[id].hidesHead);
      if (this.furSkin) this.furSkin.mesh.geometry = head ? this.kit.withoutHead(this.furSkin.mesh, this.furSkin.full) : this.furSkin.full;
      for (const m of this.bull!.meshes) {
        const mat = m.material as THREE.Material;
        if (mat.name === 'eyes') m.visible = !eyes;
        else m.visible = ![...parts].some((p) => m.name === p || (m.name.startsWith(p) && /^\d+$/.test(m.name.slice(p.length))));
      }
    }
  }

  /** The moves by their shared names, ready for this avatar (idle, walk, run, jump, sit, sit-down, stand-up, fall,
   *  land, glide, wave, point, clap, cheer): its own style carried onto it where its body has one (the ape's, each
   *  Beyonder's), else the library's bull moves with the hips' travel fitted to it; and the dances (backflip, victory,
   *  dance-hiphop, dance-samba, dance-slide, dance-ymca) retargeted onto it. A name it has none of is left out. Ask
   *  before the first move plays: the carrying measures the hips at rest. */
  async clips(names: string[]): Promise<Record<string, THREE.AnimationClip>> {
    const out: Record<string, THREE.AnimationClip> = {};
    const own = this.body?.moves;
    await Promise.all(names.map(async (name) => {
      const mine = own ? await loadClip(own.set, name) : null;
      const move = mine ? null : await loadClip(this.kit.catalogue.moves, name);
      const clip = mine ? retargetFrom(mine, own!.rest, this.root) : move ? scaleHips(move, this.hipScale) : await loadDance(name, this.root);
      if (clip) { clip.name = name; out[name] = clip; }
    }));
    return out;
  }

  /** Clips made for the COBI kit's bull (beyondplay-anim.ts loadClips, a game's own) fitted to this body: copies with
   *  the hips' travel scaled by its hip height. */
  fit(clips: Record<string, THREE.AnimationClip>): Record<string, THREE.AnimationClip> {
    return Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, scaleHips(c, this.hipScale)]));
  }

  /** An attachment point to hang things on ('head', 'back', 'rightHand', 'leftHand'): an empty object at that spot of
   *  its bone, in metres (its children are not shrunk by the rig's centimetres) and turning with the bone. */
  point(name: PointName): THREE.Object3D {
    let a = this.anchors.get(name);
    if (a) return a;
    const p = this.pointsAt[name];
    const bone = p && this.bones.get(p.bone);
    if (!bone) throw new Error(`avatar kit: no point ${name}`);
    a = new THREE.Object3D();
    a.name = `point:${name}`;
    a.position.fromArray(p.at);
    const s = new THREE.Vector3();
    inRoot(bone, this.root).decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    a.scale.setScalar(1 / s.x);
    bone.add(a);
    this.anchors.set(name, a);
    return a;
  }

  /** Done with it (take `root` out of the scene too): frees what it alone holds; a collectible gives its bull back to
   *  its kit. Once only. */
  release(): void {
    if (this.done) return;
    this.done = true;
    for (const s of this.own) s.dispose();
    for (const [src, own] of this.furMats) if (src !== own) own.dispose();
    if (this.furSkin) this.furSkin.mesh.geometry = this.furSkin.full;
    if (this.bull) this.bull.release();
    else {
      for (const s of new Set(this.meshes.map((m) => m.skeleton))) s.dispose();
      for (const z of this.zoned) z.mesh.geometry = z.full;
      this.kit.drop(this.variantsKey);
    }
  }

  private slotOf(id: string): string {
    if (this.body) {
      const it = this.body.items[id];
      if (!it) throw new Error(`avatar kit: ${id} is not in ${this.id}'s wardrobe (${Object.keys(this.body.items).join(', ')})`);
      return it.slot;
    }
    const w = this.collection!.wearables[id];
    if (!w) throw new Error(`avatar kit: ${id} is not a wearable of ${this.id} (${Object.keys(this.collection!.wearables).join(', ')})`);
    return w.slot;
  }

  private load(id: string): Promise<void> {
    if (this.worn.has(id)) return Promise.resolve();
    const file = this.body ? this.body.items[id].file : this.collection!.wearables[id].file;
    return this.kit.gltf(file).then((g) => {
      if (this.done || this.worn.has(id)) return;
      const meshes = this.bindGltf(g);
      for (const m of meshes) m.visible = false;
      this.worn.set(id, meshes);
    });
  }

  /** @internal Each skinned mesh of a pack file onto this avatar's bones (the files share the body's skeleton). */
  bindGltf(g: GLTF): THREE.SkinnedMesh[] {
    const out: THREE.SkinnedMesh[] = [];
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      const mesh = new THREE.SkinnedMesh(sm.geometry, sm.material);
      mesh.name = sm.name;
      inRoot(sm, g.scene).decompose(mesh.position, mesh.quaternion, mesh.scale);
      const bones = sm.skeleton.bones.map((b) => this.bones.get(b.name));
      if (bones.some((b) => !b)) throw new Error(`avatar kit: ${sm.name} has a bone this avatar lacks`);
      this.scene.add(mesh);
      if (!shareSkeleton(mesh, bones as THREE.Bone[], sm.skeleton.boneInverses, sm.bindMatrix, this.skeleton)) {
        const s = new THREE.Skeleton(bones as THREE.Bone[], sm.skeleton.boneInverses);
        mesh.bind(s, sm.bindMatrix);
        this.own.push(s);
      }
      mesh.castShadow = true;
      this.cull(mesh);
      out.push(mesh);
    });
    return out;
  }

  /** @internal The culling sphere (cobi.ts cullSphere): AVATAR_CULL_RADIUS round the hips at rest, in this avatar's frame. */
  setSphere(): void {
    const hips = this.bones.get('mixamorigHips');
    if (!hips) return;
    const centre = new THREE.Vector3().applyMatrix4(inRoot(hips, this.root));
    this.sphere = new THREE.Sphere(centre, AVATAR_CULL_RADIUS);
    for (const m of this.meshes) { m.castShadow = true; if (!this.bull) this.cull(m); }
  }

  private cull(m: THREE.SkinnedMesh): void {
    if (!this.sphere) { m.frustumCulled = false; return; }
    const inv = inRoot(m, this.root).invert();
    m.boundingSphere = new THREE.Sphere(this.sphere.center.clone().applyMatrix4(inv), this.sphere.radius * inv.getMaxScaleOnAxis());
    m.frustumCulled = true;
  }
}
