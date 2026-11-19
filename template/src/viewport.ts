// Viewport helpers for the shell. Game-owned helper: edit it or delete it. They read the window and fit
// a fixed logical design space to it, letterboxed, with devicePixelRatio capped at 2. Only the view uses
// them: the simulation never reads the viewport, so a player on a phone and one on a large screen
// duel on the same world.
//
// A portrait game fits one design space: fitDesign(v, { w: DESIGN_W, h: DESIGN_H }). A game that
// declares orientation 'any' gives one view space per orientation and keeps one simulation for both:
//   fitDesign(v, { portrait: { w: 390, h: 844 }, landscape: { w: 1280, h: 720 } })
import { useEffect, useState } from 'react';

export type ViewOrientation = 'portrait' | 'landscape';
/** The window in CSS pixels, its capped pixel ratio, and which way it is longer. */
export interface Viewport {
  w: number;
  h: number;
  dpr: number;
  orientation: ViewOrientation;
}
/** A logical design space, in design units. */
export interface DesignSpace {
  w: number;
  h: number;
}
/** One design space, or one per orientation. */
export type Designs = DesignSpace | { portrait: DesignSpace; landscape: DesignSpace };
/** The chosen design space and where it lands, in backing-store pixels:
 *  ctx.setTransform(scale, 0, 0, scale, offX, offY) on a canvas of round(w * dpr) x round(h * dpr). */
export interface Fit {
  design: DesignSpace;
  scale: number;
  offX: number;
  offY: number;
}

export function readViewport(): Viewport {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { w, h, dpr: Math.min(window.devicePixelRatio || 1, 2), orientation: w >= h ? 'landscape' : 'portrait' };
}

/** Letterbox the design space (the one for v's orientation, when there is one per orientation) into v, centred. */
export function fitDesign(v: Viewport, designs: Designs): Fit {
  const design = 'portrait' in designs ? designs[v.orientation] : designs;
  const scale = Math.min(v.w / design.w, v.h / design.h) * v.dpr;
  return {
    design,
    scale,
    offX: (Math.round(v.w * v.dpr) - design.w * scale) / 2,
    offY: (Math.round(v.h * v.dpr) - design.h * scale) / 2,
  };
}

/** Call cb now, then on every resize and orientation change. Returns the function that stops watching. */
export function watchViewport(cb: (v: Viewport) => void): () => void {
  const update = () => cb(readViewport());
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  return () => {
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', update);
  };
}

/** The viewport as React state, for HUD layout that changes with the shape of the screen. */
export function useViewport(): Viewport {
  const [v, setV] = useState<Viewport>(readViewport);
  useEffect(() => watchViewport(setV), []);
  return v;
}
