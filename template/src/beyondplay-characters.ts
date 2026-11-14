// PLATFORM-OWNED. Do not edit: the validator refuses a game whose copy differs from the template's,
// and the hosted build keeps the platform's copy anyway.
// Synced from Beyond-Network-AI/beyondplay-games library/characters/characters.ts by scripts/sync-characters.mjs.
//   commit  c95239b8d1e4ce42425c9772903e58410cf8adc0
//   sha256  48902a4c25b26c82f22803c011f0e8d94a2f797e73fe47174207f78d8bfdf77c  (of the source file; template/src/beyondplay-characters.SOURCE.json records the same)
// To change the loader: edit it in the games repository, commit there, then run
//   npm run sync-characters -- <path to that checkout>
// ---- synced copy: everything below is the games repository's file, byte for byte ----
// BeyondPlay characters and their moves from the creation library: the rigged characters (bullieverse-3d) and one
// clip per character per move (bullieverse-moves), found through the library's index on the asset host, never
// copied into a game.
//
//   const ape = await loadCharacter('ape');                       // 1.75 m, feet at y=0, faces +Z
//   scene.add(ape.root);
//   const clips = await clipsFor(ape, ['idle', 'walk', 'sit', 'wave', 'fall', 'dance-ymca']);
//   const anim = new Animator(ape.root, clips, { idle: { clip: 'idle' }, wave: { clip: 'wave', loop: false, then: 'idle' } });
//   // a kit bull (cobi-kit.ts) plays the bull's moves the same way:
//   const bullClips = await clipsFor({ id: 'bull', root: bull.root }, ['idle', 'sit', 'wave']);
//
// Characters: `ape`, `beyonder-pink`, `beyonder-green` (and `bull`, whose body is the COBI kit, cobi-kit.ts).
// Moves, by the engine's names: idle, walk, run, jump, sit, sit-down, stand-up, fall, land, glide, wave, point, clap,
// cheer. Dances (any character): backflip, victory, dance-hiphop, dance-samba, dance-slide, dance-ymca.
//
// The rule: every character has its own file for every move it has, its own clip or another
// character's baked onto its skeleton when the library was built (the character's `clips` record says which). A move
// plays on the character it was made for; tracks for bones a character lacks are dropped. The dances were authored on
// another skeleton and are retargeted onto the character here, the hips scaled by the two hips' heights. Moves are
// played in place: the game moves the character; the sit transitions' travel is in the move's `travel`.
//
// Everything resolves through the library's index (LIBRARY_INDEX), so a clip re-exported or a character's own clip
// replacing a borrowed one reaches every game with no code change. Files are meshopt-compressed.
//
// THE ONE COPY (library/characters/README.md). Edit here, never in a copy: the public creator kit (beyondplay-skills)
// carries it as template/src/beyondplay-characters.ts, synced by that repository's scripts/sync-characters.mjs.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const LIBRARY_INDEX = 'https://assets.beyondplay.xyz/library/manifests/index.json';
const CHARACTERS_PACK = 'bullieverse-3d';
const MOVES_PACK = 'bullieverse-moves';

/** One catalogue item, as the library's pack manifests list it. */
export interface LibraryItem {
  id: string;
  kind: string;
  url: string;
  bytes: number;
  title: string;
  meta: Record<string, unknown> & { character?: string; clip?: string; playsOn?: string[]; retarget?: string };
}

/** A character ready to animate: its root (add it to the scene), its bones by name and its catalogue record. */
export interface LibraryCharacter {
  id: string;
  root: THREE.Object3D;
  bones: Record<string, THREE.Bone>;
  meta: LibraryItem['meta'];
}

/** Anything with a root to animate and the library id of the character it is (a kit bull: `{ id: 'bull', root }`). */
export interface Animatable { id: string; root: THREE.Object3D }

interface Catalogue { characters: Map<string, LibraryItem>; moves: Map<string, Map<string, LibraryItem>>; dances: Map<string, LibraryItem> }

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const files = new Map<string, Promise<GLTF>>();
const file = (url: string): Promise<GLTF> => {
  let p = files.get(url);
  if (!p) { p = loader.loadAsync(url); files.set(url, p); p.catch(() => files.delete(url)); }
  return p;
};

let opened: { index: string; catalogue: Promise<Catalogue> } | null = null;

/** Reads the library's index and the two packs' manifests (once per index address). */
export function openLibrary(index: string = LIBRARY_INDEX): Promise<Catalogue> {
  if (opened?.index === index) return opened.catalogue;
  const catalogue = (async () => {
    const json = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`library: HTTP ${r.status} for ${url}`); return r.json(); };
    const idx = await json(index) as { packs: Array<{ pack: string; manifest: string }> };
    const manifest = (pack: string) => {
      const entry = idx.packs.find((p) => p.pack === pack);
      if (!entry) throw new Error(`library: the index lists no ${pack}`);
      return json(entry.manifest) as Promise<{ items: LibraryItem[] }>;
    };
    const [chars, moves] = await Promise.all([manifest(CHARACTERS_PACK), manifest(MOVES_PACK)]);
    const out: Catalogue = { characters: new Map(), moves: new Map(), dances: new Map() };
    for (const it of chars.items) if (it.kind === 'character' && typeof it.meta?.character === 'string') out.characters.set(it.meta.character, it);
    for (const it of moves.items) {
      if (it.kind !== 'animation' || typeof it.meta?.clip !== 'string') continue;
      const ch = it.meta.character;
      if (typeof ch === 'string') { if (!out.moves.has(ch)) out.moves.set(ch, new Map()); out.moves.get(ch)!.set(it.meta.clip, it); }
      else out.dances.set(it.meta.clip, it);
    }
    return out;
  })();
  opened = { index, catalogue };
  catalogue.catch(() => { if (opened?.catalogue === catalogue) opened = null; });
  return catalogue;
}

const plain = (name: string) => name.replace(/^mixamorig:?/, '');

/** A character from the library: its own copy of the body, so any number can play at once. */
export async function loadCharacter(id: string): Promise<LibraryCharacter> {
  const item = (await openLibrary()).characters.get(id);
  if (!item) throw new Error(`library: no character ${id}${id === 'bull' ? ' (the bull is the COBI kit: cobi-kit.ts)' : ''}`);
  const root = cloneSkinned((await file(item.url)).scene);
  root.name = id;
  const bones: Record<string, THREE.Bone> = {};
  root.traverse((o) => { if ((o as THREE.Bone).isBone) bones[plain(o.name)] = o as THREE.Bone; if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return { id, root, bones, meta: item.meta };
}

/** The names of the moves a character has (its own and the baked ones) and of the dances. */
export async function clipNames(id: string): Promise<{ moves: string[]; dances: string[] }> {
  const c = await openLibrary();
  return { moves: [...(c.moves.get(id)?.keys() ?? [])], dances: [...c.dances.keys()] };
}

/** One of a character's moves as the library holds it (null when it has none): play it on that character. */
export async function loadClip(characterId: string, clip: string): Promise<THREE.AnimationClip | null> {
  const item = (await openLibrary()).moves.get(characterId)?.get(clip);
  if (!item) return null;
  const source = (await file(item.url)).animations[0];
  if (!source) return null;
  const out = source.clone();
  out.name = clip;
  return out;
}

/** Keeps the tracks for bones this root has (a 41-bone ape has no pinky fingers to move). */
function fit(clip: THREE.AnimationClip, root: THREE.Object3D): THREE.AnimationClip {
  const have = new Set<string>();
  root.traverse((o) => { if ((o as THREE.Bone).isBone) have.add(o.name); });
  clip.tracks = clip.tracks.filter((t) => have.has(t.name.slice(0, t.name.lastIndexOf('.'))));
  return clip;
}

// ── The dances' retarget: rest-based, the way the worlds play them ──

interface Rest { q: THREE.Quaternion; p: THREE.Vector3; parentQ: THREE.Quaternion; parentScale: number; height: number }
const rests = new WeakMap<THREE.Object3D, Rest | null>();

/** The hips' rest on a skeleton: rotation, position, its parent's world rotation and scale, its height over the root. */
function captureRest(root: THREE.Object3D): Rest | null {
  if (rests.has(root)) return rests.get(root)!;
  let hips: THREE.Object3D | null = null;
  root.traverse((o) => { if (!hips && (o as THREE.Bone).isBone && o.name === 'mixamorigHips') hips = o; });
  const h = hips as THREE.Object3D | null;
  if (!h || !h.parent) { rests.set(root, null); return null; }
  root.updateMatrixWorld(true);
  const parentQ = new THREE.Quaternion(), parentS = new THREE.Vector3(), w = new THREE.Vector3(), r = new THREE.Vector3();
  h.parent.getWorldQuaternion(parentQ); h.parent.getWorldScale(parentS); h.getWorldPosition(w); root.getWorldPosition(r);
  const rest = { q: h.quaternion.clone(), p: h.position.clone(), parentQ, parentScale: parentS.y, height: w.y - r.y };
  rests.set(root, rest);
  return rest;
}

/** A clip authored on `ref` played on `target`: bone rotations as they are, the hips carried between the two frames and scaled by the hips' heights. */
function retarget(clip: THREE.AnimationClip, ref: THREE.Object3D, target: THREE.Object3D): THREE.AnimationClip {
  const rr = captureRest(ref), rt = captureRest(target);
  if (!rr || !rt) return fit(clip.clone(), target);
  const delta = rt.parentQ.clone().invert().multiply(rr.parentQ), deltaInv = delta.clone().invert(), rrInv = rr.q.clone().invert();
  const unit = rt.parentScale > 1e-6 ? rr.parentScale / rt.parentScale : 1, scale = rr.height > 0.01 ? rt.height / rr.height : 1;
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.'), bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    if (bone !== 'mixamorigHips') { if (prop === 'quaternion') tracks.push(t.clone()); continue; }
    if (prop === 'quaternion') {
      const v = Float32Array.from(t.values), q = new THREE.Quaternion();
      for (let i = 0; i < v.length; i += 4) { q.set(v[i], v[i + 1], v[i + 2], v[i + 3]).multiply(rrInv).multiply(deltaInv).multiply(rt.q).premultiply(delta); v[i] = q.x; v[i + 1] = q.y; v[i + 2] = q.z; v[i + 3] = q.w; }
      tracks.push(new THREE.QuaternionKeyframeTrack(t.name, Array.from(t.times), Array.from(v)));
    } else if (prop === 'position') {
      const v = Float32Array.from(t.values), p = new THREE.Vector3();
      for (let i = 0; i < v.length; i += 3) { p.set(v[i], v[i + 1], v[i + 2]).sub(rr.p).applyQuaternion(delta).multiplyScalar(unit * scale).add(rt.p); v[i] = p.x; v[i + 1] = p.y; v[i + 2] = p.z; }
      tracks.push(new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(v)));
    }
  }
  return fit(new THREE.AnimationClip(clip.name, clip.duration, tracks), target);
}

/** One of the dances retargeted onto a character (any root on the shared skeleton). */
export async function loadDance(name: string, target: THREE.Object3D): Promise<THREE.AnimationClip | null> {
  const item = (await openLibrary()).dances.get(name);
  if (!item || typeof item.meta.retarget !== 'string') return null;
  const [dance, ref] = await Promise.all([file(item.url), file(item.meta.retarget)]);
  const source = dance.animations[0];
  if (!source) return null;
  const clip = retarget(source, ref.scene, target);
  clip.name = name;
  return clip;
}

/**
 * The named clips ready for a character, by name, for the Animator (beyondplay-anim.ts): its moves as they are, the
 * dances retargeted onto it; a name it has neither of is left out (the Animator then ignores that state).
 */
export async function clipsFor(character: Animatable, names: string[]): Promise<Record<string, THREE.AnimationClip>> {
  const out: Record<string, THREE.AnimationClip> = {};
  await Promise.all(names.map(async (name) => {
    const move = await loadClip(character.id, name);
    const clip = move ? fit(move, character.root) : await loadDance(name, character.root);
    if (clip) out[name] = clip;
  }));
  return out;
}
