// PLATFORM-OWNED. Do not edit: the validator refuses a game whose copy differs from the template's,
// and the hosted build keeps the platform's copy anyway.
// Synced from Beyond-Network-AI/beyondplay-games library/characters/crowd-copy.ts by scripts/sync-crowd-copy.mjs.
//   commit  00b31d543a06346fa8b673a88cb15ff40adbab6d
//   sha256  ef5dd8cb8f059be02f0724c060e6f37f9a20dea3e668d78cfc5a50e43ef15bb1  (of the source file; template/src/crowd-copy.SOURCE.json records the same)
// To change it: edit it in the games repository, commit there, then run
//   npm run sync-library -- <path to that checkout>
// ---- synced copy: everything below is the games repository's file, its one import renamed to the template's file ----
// The crowd copy: a dressed avatar drawn in ONE draw call. Every skinned mesh of a built avatar (a COBI bull's body,
// eyes and parts; an avatar-kit avatar's body and clothes; a library character's parts), all on one set of bones, is
// merged into one skinned mesh with one material, so another player costs one call instead of one per part (Longhorn's
// people's squad, against the phone's budget of 60; the founder's choice, 27 November; the creators' kit has it too).
// It is made in the player's browser from the parts already built: nothing is stored or fetched.
//
// WHAT IS KEPT: every triangle and every bone weight (nothing is simplified; the bones, the clips and the attachment
// points are the avatar's own, so a game drives the copy exactly as it drove the avatar); each part's colour, its
// roughness and metal (its ORM map times its material's numbers: the gold fur's and the leather's shine), its glow
// (emissive map, colour and intensity: the Laser and Triggered eyes) and its normal map. Each is painted into an atlas
// (colour SIZE px, the others SIZE/2 px): the body (the part with the largest colour map) takes a quarter of each, every
// other part a sixteenth. A tile is padded with its own picture's edge, so no neighbour's colour bleeds into it when the
// texture is sampled small (the streaks on the first baked crew bulls).
// WHAT IS LOST: texture detail (at SIZE 1024 the body's 1024 px fur is drawn at 512, a part's 512 at 256), a soft edge
// where a part is see-through (the whole copy cuts out at alpha 0.5 instead), each part's own normal scale. A mesh that
// is not skinned (a rigid item on a bone) is not merged: it stays as it was, drawn on its own.
//
// The glow is ADDED to the material's emissive colour (onBeforeCompile) instead of multiplied by it, so a game that
// flashes a hit through material.emissive (Longhorn's BullView) lights the whole copy, as it lights a whole avatar.
//
//   mergeAvatarMeshes(meshes)  the core: these skinned meshes into one, in their place
//   crowdCopyOf(root)          any avatar: its visible skinned meshes (an avatar-kit Avatar's root, a character's root)
//   crowdCopy(bull)            a COBI bull (cobi.ts), released once copied (Longhorn)
// Each answers null, and leaves the avatar as it was, when a part cannot be copied exactly: a part on other bones or in
// another rest pose, a repeating texture (coordinates outside 0..1), a texture a canvas cannot draw, separate
// roughness and metal maps, a material that is not a standard one, more than 13 meshes. Vertex colours (the wardrobe's
// clothes) are carried over as they are. A copy shows the avatar as it
// was when copied (dress it first); its release() frees what the copy made.
import * as THREE from 'three';
import { cullSphere, type CobiBull } from './cobi-kit';

export interface CrowdCopyOptions {
  /** the colour atlas's side in px (a power of two; the other atlases are half); default 1024 */
  size?: number;
  /** awaited between the heavy steps (a background build passes one that waits for the next frame) */
  yieldTo?: () => Promise<void>;
  /** give the copy a culling sphere (cobi.ts cullSphere) instead of switching frustum culling off */
  cull?: boolean;
}

/** the tiles on a 4 x 4 grid: the body's 2 x 2, then twelve single tiles */
const BODY_TILE = [0, 0, 2, 2] as const;
const PART_TILES: readonly (readonly [number, number, number, number])[] = [
  [2, 0, 1, 1], [3, 0, 1, 1], [2, 1, 1, 1], [3, 1, 1, 1],
  [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1], [3, 2, 1, 1],
  [0, 3, 1, 1], [1, 3, 1, 1], [2, 3, 1, 1], [3, 3, 1, 1],
];
/** the most meshes a copy takes (the body and PART_TILES) */
export const CROWD_MAX_MESHES = 1 + PART_TILES.length;
/** texture coordinates this far outside 0..1 still count as inside (export rounding) */
const UV_SLACK = 0.002;

type Img = CanvasImageSource & { width: number; height: number };
type Canvas2D = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function canvas(size: number): { c: Canvas2D; g: Ctx2D } {
  let c: Canvas2D | null = null, g: Ctx2D | null = null;
  // (an OffscreenCanvas where it draws in 2D; a page canvas where it does not, as on older iPhones)
  if (typeof OffscreenCanvas !== 'undefined') { c = new OffscreenCanvas(size, size); g = c.getContext('2d') as Ctx2D | null; }
  if (!g && typeof document !== 'undefined') { c = Object.assign(document.createElement('canvas'), { width: size, height: size }); g = c.getContext('2d') as Ctx2D | null; }
  if (!c || !g) throw new Error('crowd copy: no 2D canvas');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  return { c, g };
}

/** a texture's picture, when it is one a canvas can draw (a bitmap, an image or a canvas; not a compressed or a data
 *  texture) */
function picture(t: THREE.Texture | null | undefined): Img | null {
  const i = t?.image as Img | undefined;
  if (!i || !((i.width ?? 0) > 0 && (i.height ?? 0) > 0)) return null;
  const drawable = (typeof ImageBitmap !== 'undefined' && i instanceof ImageBitmap) || (typeof HTMLImageElement !== 'undefined' && i instanceof HTMLImageElement)
    || (typeof HTMLCanvasElement !== 'undefined' && i instanceof HTMLCanvasElement) || (typeof OffscreenCanvas !== 'undefined' && i instanceof OffscreenCanvas);
  return drawable ? i : null;
}

/** an sRGB colour for a canvas fill from a linear THREE colour times k (clamped to 0..1) */
function fill(c: THREE.Color, k = 1): string {
  const x = c.clone().multiplyScalar(k);
  x.r = Math.min(1, x.r); x.g = Math.min(1, x.g); x.b = Math.min(1, x.b);
  return '#' + x.getHexString();
}

interface Tile { x: number; y: number; w: number; h: number }
/** a tile's rectangle in px on an atlas of side `size`, and its padded inside */
function rects(t: readonly [number, number, number, number], size: number): { outer: Tile; inner: Tile } {
  const u = size / 4, pad = Math.max(2, size / 128);
  const outer = { x: t[0] * u, y: t[1] * u, w: t[2] * u, h: t[3] * u };
  return { outer, inner: { x: outer.x + pad, y: outer.y + pad, w: outer.w - 2 * pad, h: outer.h - 2 * pad } };
}

/** draw `img` into tile `r`: stretched over the whole tile first (its edge fills the padding), then into the inside */
function paint(g: Ctx2D, img: Img, r: { outer: Tile; inner: Tile }): void {
  g.drawImage(img, r.outer.x, r.outer.y, r.outer.w, r.outer.h);
  g.drawImage(img, r.inner.x, r.inner.y, r.inner.w, r.inner.h);
}
/** multiply tile `t` by colour `col` (the tile comes out opaque: a see-through part's alpha is put back after) */
function tint(g: Ctx2D, t: Tile, col: string): void {
  if (col === '#ffffff') return;
  g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(t.x, t.y, t.w, t.h);
  g.globalCompositeOperation = 'source-over';
}

function atlasTexture(c: Canvas2D, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement);
  t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** the material's part we read: one MeshStandardMaterial per mesh (null: not copyable) */
function standard(m: THREE.SkinnedMesh): THREE.MeshStandardMaterial | null {
  if (Array.isArray(m.material)) return null;
  const mat = m.material as THREE.MeshStandardMaterial;
  return mat && mat.isMeshStandardMaterial ? mat : null;
}

/** How mesh `m` sits on skeleton `base`: its bone indices in the base's order, and the one matrix D that carries its
 *  bind space into the base's (base.boneInverses[b]^-1 times its own inverse, the same for every joint it uses: a part
 *  loaded with its own copy of the skeleton, cobi.ts shareSkeleton's test). Null when it is not on the same bones (a
 *  bone the base lacks) or not in the same rest pose (a different D for some joint). */
function onBase(m: THREE.SkinnedMesh, base: THREE.Skeleton): { index: number[]; D: THREE.Matrix4 } | null {
  const sk = m.skeleton;
  if (sk === base) return { index: base.bones.map((_, j) => j), D: new THREE.Matrix4() };
  const index = sk.bones.map((b) => base.bones.indexOf(b));
  const si = m.geometry.getAttribute('skinIndex'), sw = m.geometry.getAttribute('skinWeight');
  const used = new Set<number>();
  for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > 0) used.add(si.getComponent(i, c));
  let D: THREE.Matrix4 | null = null;
  const t = new THREE.Matrix4();
  for (const j of used) {
    const b = index[j];
    if (b === undefined || b < 0 || !sk.boneInverses[j]) return null;
    t.copy(base.boneInverses[b]).invert().multiply(sk.boneInverses[j]);
    if (!D) { D = t.clone(); continue; }
    for (let k = 0; k < 16; k++) if (Math.abs(t.elements[k] - D.elements[k]) > 1e-4 * (1 + Math.abs(D.elements[k]))) return null;
  }
  // (a joint it never uses may lack a place on the base: its weight is 0, so any index will do)
  return D ? { index: index.map((b) => Math.max(0, b)), D } : null;
}

/** A merged copy: the one mesh, and how to free what was made for it. */
export interface CrowdMesh {
  /** the merged mesh, in the first part's place (the same parent and transform), on the avatar's own bones */
  mesh: THREE.SkinnedMesh;
  /** free the copy's geometry, material, atlases and skeleton object (once; the avatar's own things are not touched) */
  release(): void;
}

/**
 * Merge `meshes` (one avatar's skinned meshes, on one set of bones) into one (see the header): the copy joins the first
 * one's parent, and they leave theirs. Null, and nothing changed, when they cannot be copied exactly.
 */
export async function mergeAvatarMeshes(meshes: readonly THREE.SkinnedMesh[], opts: CrowdCopyOptions = {}): Promise<CrowdMesh | null> {
  const size = opts.size ?? 1024, half = size / 2;
  const y = opts.yieldTo;
  if (meshes.length === 0 || meshes.length > CROWD_MAX_MESHES || !meshes[0].parent || !meshes[0].skeleton) return null;
  const skel = meshes[0].skeleton;
  const mats: THREE.MeshStandardMaterial[] = [];
  const fits: { index: number[]; D: THREE.Matrix4 }[] = [];
  for (const m of meshes) {
    const mat = standard(m);
    if (!mat || !m.skeleton || m.geometry.groups.length > 1) return null;
    if (!m.geometry.getAttribute('skinIndex') || !m.geometry.getAttribute('skinWeight')) return null;
    const fit = onBase(m, skel);
    if (!fit) return null;
    fits.push(fit);
    const g = m.geometry;
    if (!g.getAttribute('normal') || !g.getAttribute('skinIndex') || !g.getAttribute('skinWeight')) return null;
    if (mat.roughnessMap && mat.metalnessMap && mat.roughnessMap !== mat.metalnessMap) return null;
    for (const t of [mat.map, mat.roughnessMap, mat.metalnessMap, mat.normalMap, mat.emissiveMap]) {
      if (!t) continue;
      if (t.channel !== 0 || !picture(t)) return null;
      t.updateMatrix();
      if (!t.matrix.equals(new THREE.Matrix3())) return null;
    }
    const uv = g.getAttribute('uv');
    if (uv) for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      if (u < -UV_SLACK || u > 1 + UV_SLACK || v < -UV_SLACK || v > 1 + UV_SLACK) return null;
    }
    mats.push(mat);
  }
  // the body: the part with the largest colour map (a bull's fur), drawn into the big tile
  let body = 0, best = -1;
  meshes.forEach((m, k) => { const p = picture(mats[k].map); const a = p ? p.width * p.height : 0; if (a > best) { best = a; body = k; } });
  const tileOf = (k: number) => (k === body ? BODY_TILE : PART_TILES[k < body ? k : k - 1]);

  // ── the atlases ──
  // vertex colours (the wardrobe's clothes are coloured per vertex, with no texture): carried over, white elsewhere
  const colourOf = (m: THREE.SkinnedMesh, k: number) => (mats[k].vertexColors ? m.geometry.getAttribute('color') ?? null : null);
  const hasColour = meshes.some((m, k) => !!colourOf(m, k));
  const glowMax = Math.max(0, ...mats.map((mat) => mat.emissiveIntensity * Math.max(mat.emissive.r, mat.emissive.g, mat.emissive.b)));
  const hasGlow = glowMax > 0, hasNormal = mats.some((mat) => !!mat.normalMap), cutout = mats.some((mat) => mat.transparent || mat.alphaTest > 0);
  const col = canvas(size), orm = canvas(half);
  const glow = hasGlow ? canvas(half) : null, nrm = hasNormal ? canvas(half) : null;
  if (glow) { glow.g.fillStyle = '#000000'; glow.g.fillRect(0, 0, half, half); }
  for (let k = 0; k < meshes.length; k++) {
    const mat = mats[k], t = tileOf(k);
    // colour: the map times the material's colour (an sRGB product: the encoding's power curve keeps it a product)
    const rc = rects(t, size), map = picture(mat.map), see = mat.transparent || mat.alphaTest > 0;
    if (map) {
      paint(col.g, map, rc);
      const c = fill(mat.color);
      if (c !== '#ffffff') {
        tint(col.g, rc.outer, c);
        // (its alpha back: 'destination-in' clears everything the picture does not cover, so only inside its own tile)
        if (see) {
          col.g.save(); col.g.beginPath(); col.g.rect(rc.outer.x, rc.outer.y, rc.outer.w, rc.outer.h); col.g.clip();
          col.g.globalCompositeOperation = 'destination-in'; paint(col.g, map, rc); col.g.restore();
        }
      }
    } else { col.g.fillStyle = fill(mat.color); col.g.fillRect(rc.outer.x, rc.outer.y, rc.outer.w, rc.outer.h); }
    // (a part drawn opaque on the avatar stays opaque: whatever its picture's alpha, the cut-out keeps it)
    if (!see) {
      col.g.globalCompositeOperation = 'destination-over'; col.g.fillStyle = '#000000';
      col.g.fillRect(rc.outer.x, rc.outer.y, rc.outer.w, rc.outer.h); col.g.globalCompositeOperation = 'source-over';
    }
    // roughness (green) and metal (blue): the ORM map times the material's numbers (linear data: a plain product)
    const rh = rects(t, half), ormMap = picture(mat.roughnessMap ?? mat.metalnessMap);
    const rgb = (r: number, g: number, b: number) => `rgb(${Math.round(r * 255)},${Math.round(Math.min(1, g) * 255)},${Math.round(Math.min(1, b) * 255)})`;
    const rough = mat.roughness, metal = mat.metalness;
    if (ormMap) {
      paint(orm.g, ormMap, rh);
      // (a map for only one of the two: the other channel is the plain number)
      if (mat.roughnessMap && !mat.metalnessMap) { tint(orm.g, rh.outer, rgb(1, rough, 0)); orm.g.globalCompositeOperation = 'lighter'; orm.g.fillStyle = rgb(0, 0, metal); orm.g.fillRect(rh.outer.x, rh.outer.y, rh.outer.w, rh.outer.h); orm.g.globalCompositeOperation = 'source-over'; }
      else if (!mat.roughnessMap && mat.metalnessMap) { tint(orm.g, rh.outer, rgb(1, 0, metal)); orm.g.globalCompositeOperation = 'lighter'; orm.g.fillStyle = rgb(0, rough, 0); orm.g.fillRect(rh.outer.x, rh.outer.y, rh.outer.w, rh.outer.h); orm.g.globalCompositeOperation = 'source-over'; }
      else tint(orm.g, rh.outer, rgb(1, rough, metal));
    } else { orm.g.fillStyle = rgb(1, rough, metal); orm.g.fillRect(rh.outer.x, rh.outer.y, rh.outer.w, rh.outer.h); }
    // glow: the emissive map times the emissive colour and intensity, over the copy's strongest (the shader's factor)
    const k2 = glowMax > 0 ? mat.emissiveIntensity / glowMax : 0;
    if (glow && k2 > 0 && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0)) {
      const em = picture(mat.emissiveMap);
      if (em) { paint(glow.g, em, rh); tint(glow.g, rh.outer, fill(mat.emissive, k2)); }
      else { glow.g.fillStyle = fill(mat.emissive, k2); glow.g.fillRect(rh.outer.x, rh.outer.y, rh.outer.w, rh.outer.h); }
    }
    // normals: the map, or flat
    if (nrm) {
      const nm = picture(mat.normalMap);
      if (nm) paint(nrm.g, nm, rh);
      else { nrm.g.fillStyle = 'rgb(128,128,255)'; nrm.g.fillRect(rh.outer.x, rh.outer.y, rh.outer.w, rh.outer.h); }
    }
    // (a part a frame: its downscaling draws are the heavy part)
    if (y) await y();
  }

  // ── the geometry: every part in the first part's bind space, its texture coordinates into its tile ──
  const base = meshes[0], M0 = base.bindMatrix.clone(), M0i = M0.clone().invert();
  let nv = 0, ni = 0;
  for (const m of meshes) { const g = m.geometry; nv += g.getAttribute('position').count; ni += g.index ? g.index.count : g.getAttribute('position').count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const cols = hasColour ? new Float32Array(nv * 3).fill(1) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const v = new THREE.Vector3(), T = new THREE.Matrix4(), N = new THREE.Matrix3();
  let o = 0, oi = 0;
  meshes.forEach((m, k) => {
    const g = m.geometry, P = g.getAttribute('position'), Nn = g.getAttribute('normal'), U = g.getAttribute('uv');
    const SI = g.getAttribute('skinIndex'), SW = g.getAttribute('skinWeight'), n = P.count;
    T.copy(M0i).multiply(fits[k].D).multiply(m.bindMatrix); N.getNormalMatrix(T);
    const bi = fits[k].index, C = cols ? colourOf(m, k) : null;
    const { inner } = rects(tileOf(k), size);
    const u0 = inner.x / size, v0 = inner.y / size, us = inner.w / size, vs = inner.h / size;
    for (let i = 0; i < n; i++) {
      const j = o + i;
      v.fromBufferAttribute(P, i).applyMatrix4(T); pos[j * 3] = v.x; pos[j * 3 + 1] = v.y; pos[j * 3 + 2] = v.z;
      v.fromBufferAttribute(Nn, i).applyMatrix3(N).normalize(); nor[j * 3] = v.x; nor[j * 3 + 1] = v.y; nor[j * 3 + 2] = v.z;
      const u = U ? Math.min(1, Math.max(0, U.getX(i))) : 0.5, w = U ? Math.min(1, Math.max(0, U.getY(i))) : 0.5;
      uvs[j * 2] = u0 + u * us; uvs[j * 2 + 1] = v0 + w * vs;
      si[j * 4] = bi[SI.getX(i)] ?? 0; si[j * 4 + 1] = bi[SI.getY(i)] ?? 0; si[j * 4 + 2] = bi[SI.getZ(i)] ?? 0; si[j * 4 + 3] = bi[SI.getW(i)] ?? 0;
      sw[j * 4] = SW.getX(i); sw[j * 4 + 1] = SW.getY(i); sw[j * 4 + 2] = SW.getZ(i); sw[j * 4 + 3] = SW.getW(i);
      if (cols && C) { cols[j * 3] = C.getX(i); cols[j * 3 + 1] = C.getY(i); cols[j * 3 + 2] = C.getZ(i); }
    }
    if (g.index) { const a = g.index; for (let i = 0; i < a.count; i++) idx[oi + i] = o + a.getX(i); oi += a.count; }
    else { for (let i = 0; i < n; i++) idx[oi + i] = o + i; oi += n; }
    o += n;
  });
  if (y) await y();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  if (cols) geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  // ── the material: the body's settings, the atlases, the glow added (not multiplied) ──
  const bm = mats[body];
  const tex: THREE.Texture[] = [atlasTexture(col.c, true), atlasTexture(orm.c, false)];
  const mat = new THREE.MeshStandardMaterial({
    name: 'crowd-copy', map: tex[0], roughnessMap: tex[1], metalnessMap: tex[1], roughness: 1, metalness: 1,
    side: mats.some((x) => x.side === THREE.DoubleSide) ? THREE.DoubleSide : bm.side, alphaTest: cutout ? 0.5 : 0,
    envMapIntensity: bm.envMapIntensity, emissive: 0x000000, vertexColors: hasColour,
  });
  if (nrm) { const t = atlasTexture(nrm.c, false); tex.push(t); mat.normalMap = t; mat.normalScale.copy(bm.normalScale); }
  if (glow) {
    const t = atlasTexture(glow.c, true); tex.push(t); mat.emissiveMap = t;
    mat.onBeforeCompile = (s) => {
      s.uniforms.crowdGlow = { value: glowMax };
      s.fragmentShader = s.fragmentShader
        .replace('void main() {', 'uniform float crowdGlow;\nvoid main() {')
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += texture2D( emissiveMap, vEmissiveMapUv ).rgb * crowdGlow;');
    };
    mat.customProgramCacheKey = () => 'crowd-copy-glow';
  }

  // ── swap: the copy on the avatar's own bones (a skeleton object of its own), the parts out of their parents ──
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = 'crowd-copy';
  base.parent!.add(mesh);
  mesh.position.copy(base.position); mesh.quaternion.copy(base.quaternion); mesh.scale.copy(base.scale);
  mesh.updateMatrixWorld(true);
  const ownSkel = new THREE.Skeleton(skel.bones, skel.boneInverses);
  mesh.bind(ownSkel, M0);
  for (const m of meshes) m.parent?.remove(m);
  mesh.frustumCulled = false;
  let freed = false;
  return {
    mesh,
    release() {
      if (freed) return; freed = true;
      geo.dispose(); mat.dispose(); for (const t of tex) t.dispose(); ownSkel.dispose();
    },
  };
}

/**
 * The one-draw copy of the avatar under `root` (an avatar-kit Avatar's root, a library character's root): its visible
 * skinned meshes merged into one, in place; a mesh that is not skinned stays as it is. Null, and nothing changed, when
 * they cannot be copied exactly. The avatar itself is not released: release it as usual when it leaves the game, and
 * the copy with it (`release()`).
 */
export async function crowdCopyOf(root: THREE.Object3D, opts: CrowdCopyOptions = {}): Promise<CrowdMesh | null> {
  const meshes: THREE.SkinnedMesh[] = [];
  // (the root itself may be hidden while it is built; what is hidden under it is not drawn, so not copied)
  const walk = (o: THREE.Object3D): void => {
    for (const c of o.children) {
      if (!c.visible) continue;
      const m = c as THREE.SkinnedMesh;
      if (m.isSkinnedMesh && (m.geometry.getAttribute('position')?.count ?? 0) > 0) meshes.push(m);
      walk(c);
    }
  };
  walk(root);
  const c = await mergeAvatarMeshes(meshes, opts);
  if (c && opts.cull) cullSphere(root, [c.mesh]);
  return c;
}

/**
 * The one-draw copy of `bull` (see the header), or null when it cannot be copied exactly (the bull is untouched then).
 * On success `bull` must not be used again: its meshes have left its root and it has been released; use the copy,
 * which has the same root, bones, traits and missing list.
 */
export async function crowdCopy(bull: CobiBull, opts: CrowdCopyOptions = {}): Promise<CobiBull | null> {
  const meshes = bull.meshes.filter((m) => m.visible !== false && (m.geometry.getAttribute('position')?.count ?? 0) > 0);
  const c = await mergeAvatarMeshes(meshes, { ...opts, cull: false });
  if (!c) return null;
  for (const m of bull.meshes) m.parent?.remove(m);
  bull.release();
  if (opts.cull) cullSphere(bull.root, [c.mesh]);
  return { root: bull.root, meshes: [c.mesh], bones: bull.bones, traits: bull.traits, missing: bull.missing, release: c.release };
}
