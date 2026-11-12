// BeyondPlay store: items a game offers for B-Bucks, sold by the platform.
//
//   // src/beyondplay.config.ts
//   import { defineStore } from './beyondplay-store';
//   defineStore({ items: [
//     { id: 'trail-neon', name: 'Neon trail', blurb: 'A glowing trail behind your runner.', image: 'assets/items/trail-neon.png', price: 150 },
//   ] });
//
//   // src/App.tsx, after the first frame
//   const items = await storeItems();                  // [] where no host answers
//   if (owns('trail-neon')) renderer.setTrail('neon');
//   // on a locked item: <Price amount={item.price} onPress={() => buy(item.id).then(() => renderer.setTrail('neon')).catch(() => {})} />
//
// What the platform does: shows its own sheet with the item, its price and the
// player's balance; takes the B-Bucks when the player confirms; records that
// the player owns the item, on every device; and pays the creator their share.
// What the game does: shows what an item looks like, calls buy(id), and draws
// the item for a player who owns it. A game never sees a balance.
//
// Rules you keep: an item changes how a run looks and sounds, never how it
// plays (no lives, speed, levels, modes or boards from an item), so read owns()
// in src/App.tsx and never in src/game.ts. No prices in money, no payment
// screens, no loot boxes or mystery items, no item that expires, no countdown
// on a purchase. A game's own currency (gems, coins) is earned by playing and
// never sold. A rejected buy() is normal (the player closed the sheet, is
// signed out, or this host does not sell): catch it and carry on.
//
// PLATFORM-OWNED. Do not edit: the validator compares this file with the template.
import { can, onCapabilities, request, type StoreBuyResult, type StoreItem } from './beyondplay-platform';

const HELLO_WAIT_MS = 1500;

/** One item the game offers in the platform's store. Look and sound only. */
export interface StoreItemDecl {
  /** The game's own id for the item: lower-case letters, digits and dashes ('trail-neon'). */
  id: string;
  /** What the player sees in the platform's sheet, at most 40 characters. */
  name: string;
  /** One line about it, at most 120 characters. */
  blurb?: string;
  /** A picture of the item as it looks in the game: a png, webp or jpg inside the game ('assets/items/trail-neon.png'). */
  image?: string;
  /** The price in B-Bucks, from 50 to 2,000 (100 B-Bucks is about one US dollar). */
  price: number;
}

/** Declare the items this game offers for B-Bucks, at most 30. Call it in src/beyondplay.config.ts.
 *  The build's manifest carries the items and the 'store' capability, so the items on sale are
 *  always the ones this build can show; each is reviewed before it goes on sale, and a changed
 *  name, picture or price is reviewed again. It only records the declaration: nothing is asked of
 *  the platform here. */
export function defineStore(opts: { items: ReadonlyArray<StoreItemDecl> }): void {
  (globalThis as any).__bpStore = { items: (opts?.items ?? []).map((item) => ({ ...item })) };
}

let catalogue: StoreItem[] = [];
const listeners = new Set<(items: StoreItem[]) => void>();

/** A copy for the game: what it does to the copy never reaches the catalogue. */
const copy = (items: StoreItem[]): StoreItem[] => items.map((item) => ({ ...item }));

function publish(items: StoreItem[]): StoreItem[] {
  catalogue = copy(items);
  listeners.forEach((cb) => { try { cb(copy(catalogue)); } catch { /* a listener's own error is not the store's */ } });
  return copy(catalogue);
}

/** Resolves once the host has said hello, or after a short wait where no host answers. */
function hostReady(): Promise<void> {
  if (can('capabilities')) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    let off: () => void = () => {};
    const finish = () => { if (done) return; done = true; off(); resolve(); };
    off = onCapabilities(finish);
    if (done) off();
    setTimeout(finish, HELLO_WAIT_MS);
  });
}

/** The game's items as the platform knows them: what is on sale and what this player owns.
 *  Call it after the first frame. Never rejects: [] where no host answers (a test run, a host
 *  without a store), so the game simply shows nothing for sale. */
export async function storeItems(): Promise<StoreItem[]> {
  await hostReady();
  if (!can('store')) return publish([]);
  try {
    const answer = await request('store', { op: 'items' });
    return publish(Array.isArray(answer) ? answer : []);
  } catch {
    return publish([]);
  }
}

/** True when this player owns the item, as of the last storeItems() or buy(). */
export function owns(id: string): boolean {
  return catalogue.some((item) => item.id === id && item.owned);
}

/** One item of the catalogue as last read, or null. */
export function storeItem(id: string): StoreItem | null {
  const found = catalogue.find((item) => item.id === id);
  return found ? { ...found } : null;
}

/** Ask the platform to sell the item. The platform opens its own sheet; the promise resolves once
 *  the player owns the item (bought now, or owned already) and rejects with a CapabilityError
 *  otherwise: 'cancelled' when the player closed the sheet, 'denied' or 'unavailable' where the
 *  item cannot be sold. Call it from a press on the item, never by itself. */
export async function buy(id: string): Promise<StoreBuyResult> {
  const result = (await request('store', { op: 'buy', item: id })) as StoreBuyResult;
  publish(catalogue.map((item) => (item.id === id ? { ...item, owned: true } : item)));
  return result;
}

/** Called with the catalogue whenever it changes (after storeItems() and after a purchase).
 *  Returns an unsubscribe function. */
export function onStoreChange(cb: (items: StoreItem[]) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
