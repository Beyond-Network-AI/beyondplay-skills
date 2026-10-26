/**
 * WebKit canvas-image hardening (platform shell). Call
 * installWebKitImageHardening() BEFORE any game code draws — the template's
 * main.tsx does this; an explicit call survives tree-shaking where a bare
 * side-effect import does not.
 *
 * Real WKWebView (the BeyondPlay app's engine on iOS) intermittently "curses"
 * HTMLImageElement decodes per page instance: the image loads, `decode()`
 * resolves, `naturalWidth` is correct — yet `createPattern` throws
 * InvalidStateError and `drawImage` silently paints NOTHING. Probe-verified
 * against production on 2026-08-10 (r3tards mayhem: white screen behind the
 * feed poster from a synchronous createPattern throw in React commit; hero
 * rendered shadow-only ~1 in 3 boots from a blanked one-shot sprite-sheet
 * bake). Chromium never exhibits it, so Playwright/Chrome batteries pass
 * while iPhones break. A canvas COPY of a cursed image is equally blank —
 * copy-based fallbacks fix the throw but not the pixels.
 *
 * Cure: on each image's first draw, pixel-probe the result. A blank paint
 * triggers a byte-level re-decode via fetch()+createImageBitmap (a separate
 * decode path WebKit doesn't break); queued draws replay with the bitmap and
 * every later draw of that element substitutes it. Healthy images pay one
 * WeakMap lookup per draw and one 8×8 probe ever.
 *
 * Known limits, accepted:
 *  - A cursed image drawn before its bitmap arrives stays blank for the
 *    fetch+decode round-trip (~100-300ms warm) — a brief pop-in, never fatal.
 *  - createPattern with a cursed image and no bitmap yet returns a pattern
 *    from a (blank) canvas copy rather than throwing — callers keep working,
 *    the texture pops in only if they re-pattern. Pattern-once callers should
 *    tolerate a null/flat pattern (all current games do).
 */

let installed = false;

type ImgState =
  | { kind: "healthy" }
  | { kind: "cursed"; bitmap: ImageBitmap | null; queue: Array<() => void> };

const imgStates = new WeakMap<HTMLImageElement, ImgState>();

export function installWebKitImageHardening(): void {
  if (installed) return;
  installed = true;

  const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  const origCreatePattern = CanvasRenderingContext2D.prototype.createPattern;
  const rawDraw = origDrawImage as unknown as (...a: unknown[]) => void;

  function drawsBlank(img: HTMLImageElement): boolean {
  try {
    const t = document.createElement("canvas");
    t.width = 8;
    t.height = 8;
    const c = t.getContext("2d");
    if (!c) return false;
    // MUST bypass the wrapper below — the patched prototype would re-enter
    // stateFor and recurse.
    rawDraw.call(c, img, 0, 0, 8, 8);
    const d = c.getImageData(0, 0, 8, 8).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return false;
    return true;
  } catch {
    return true;
  }
}

  function stateFor(img: HTMLImageElement): ImgState {
  let state = imgStates.get(img);
  if (state) return state;
  if (!drawsBlank(img)) {
    state = { kind: "healthy" };
    imgStates.set(img, state);
    return state;
  }
  const cursed: ImgState = { kind: "cursed", bitmap: null, queue: [] };
  imgStates.set(img, cursed);
  fetch(img.currentSrc || img.src)
    .then((r) => r.blob())
    .then((b) => createImageBitmap(b))
    .then((bitmap) => {
      cursed.bitmap = bitmap;
      const q = cursed.queue.splice(0);
      for (const replay of q) replay();
    })
    .catch(() => {
      /* leave blank — never fatal */
    });
  return cursed;
}

  CanvasRenderingContext2D.prototype.drawImage = function (
  this: CanvasRenderingContext2D,
  ...args: unknown[]
): void {
  const src = args[0];
  if (src instanceof HTMLImageElement && src.complete && src.naturalWidth > 0) {
    const state = stateFor(src);
    if (state.kind === "cursed") {
      const rest = args.slice(1);
      if (state.bitmap) {
        rawDraw.call(this, state.bitmap, ...rest);
        return;
      }
      state.queue.push(() => {
        if (state.bitmap) rawDraw.call(this, state.bitmap, ...rest);
      });
      return;
    }
  }
  rawDraw.call(this, ...args);
  } as typeof CanvasRenderingContext2D.prototype.drawImage;

  CanvasRenderingContext2D.prototype.createPattern = function (
  image: CanvasImageSource,
  repetition: string | null,
): CanvasPattern | null {
  if (image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0) {
    const state = stateFor(image);
    if (state.kind === "cursed" && state.bitmap) {
      return origCreatePattern.call(this, state.bitmap, repetition);
    }
  }
  try {
    return origCreatePattern.call(this, image, repetition);
  } catch (err) {
    if (image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0) {
      const copy = document.createElement("canvas");
      copy.width = image.naturalWidth;
      copy.height = image.naturalHeight;
      copy.getContext("2d")?.drawImage(image, 0, 0);
      return origCreatePattern.call(this, copy, repetition);
    }
    throw err;
  }
};

}
