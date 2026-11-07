# Player items: the player's own bull in your game

Phase two of the capability model. A game can ask the platform for the items
a player holds in one collection and use them for how a run looks and sounds:
the bull the player runs as, a trail, a sound, a greeting, the name on the end
card. The game never sees a wallet, a chain, a contract or a balance; the
platform keeps the snapshot and hands over items.

## The three rules

1. **Look and sound only.** Items and traits change how a run looks and
   sounds, never how it plays: no stats, lives, loadouts, unlocks, starts or
   multipliers from an item or a trait. Nothing the simulation reads comes
   from an item. The reviewer checks this (`GAME_ITEM_GATING`, review tier);
   the validator points at the listing-tier smell: the string `player.items`
   or `PlayerItem` in `src/game.ts` (`GAME_ITEM_IN_SIMULATION`).
2. **Every player gets a bull.** The answer is `null` for most plays (the feed
   plays signed out). Fall back to the collection's default item silently; no
   copy about linking a wallet anywhere in a game, and nothing that invites
   buying, linking or renting.
3. **One declared collection.** `uses: ['player.items:cobi']` in the config;
   the request names the same slug. The host answers `denied` for a
   collection the manifest does not declare.

## 1. Declare the collection

```ts
// src/beyondplay.config.ts
export const game = defineSoloGame({ challenge, uses: ['share', 'player.items:cobi'] });
```

The manifest carries the entry verbatim; the game page says "uses your COBI
bulls" and the reviewer sees the exact list. A bare `'player.items'` declares
no collection and the validator refuses it (`GAME_CAPABILITY_UNDECLARED`).

## 2. Request the items, fall back to the default

Always in `src/App.tsx` (the shell), never in `src/game.ts` (the simulation).

```ts
import { request } from './beyondplay-platform';
import type { PlayerItem } from './beyondplay-platform';

// The collection's default item, as get_contract serves it in capabilities[].default
// for 'cobi'. Copy it here so the game renders the same bull with no host answer.
const DEFAULT_BULL: PlayerItem = {
  id: 'cobi:default', collection: 'cobi', tokenId: null, name: 'COBI',
  image: 'https://assets.beyondplay.xyz/cobi/default/image.webp',
  traits: { Fur: 'Robot', Hooves: 'Classic', Eyes: 'Sunglasses', Horns: 'Upward', Clothes: 'Black Jeans' },
  model: {
    kind: 'kit', kit: 'cobi/v2', base: 'https://assets.beyondplay.xyz/cobi/kit/v2/phone/',
    clips: 'https://assets.beyondplay.xyz/cobi/kit/v2/anim-bull.glb', clipNames: ['idle', 'walk', 'run', 'jump'],
    skeleton: 'mixamo-65', height: 1.9, facing: '+z', feetAt: 0,
  },
  borrowed: false,
};

// null: signed out, no wallet, opted out, or not allowed to ask. []: holds nothing.
// Either way the default bull runs; the player's first item runs when there is one.
const items = await request('player.items', { collection: 'cobi' }).catch(() => null);
const bull = items?.[0] ?? DEFAULT_BULL;
```

Take the default's exact values from `get_contract` (`capabilities[].default`
for the collection) rather than from this page; the platform may change which
bull is the default, and a new kit version is a new path.

## 3. Load a kit bull (3D games)

`src/cobi-kit.ts` (platform-owned, ships with the template) assembles any
bull from the kit the platform serves. It needs only `three`, which the kit
already depends on. Load after the first frame so the feed card is already
playing.

```ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CobiKit } from './cobi-kit';

async function mountBull(scene: THREE.Scene, item: PlayerItem) {
  if (item.model?.kind !== 'kit') return null;          // a baked model loads with GLTFLoader from item.model.url
  const kit = await CobiKit.load(item.model.base, { tokens: false, kit: item.model.kit });
  const bull = await kit.build(item.traits);             // the traits the platform handed over; no token table
  bull.root.position.y = -item.model.feetAt;             // feet on the ground; the bull faces item.model.facing
  scene.add(bull.root);

  const clips = (await new GLTFLoader().loadAsync(item.model.clips)).animations;
  const mixer = new THREE.AnimationMixer(bull.root);
  const run = clips.find((c) => c.name === 'run') ?? clips[0];
  if (run) mixer.clipAction(run).play();

  return {
    update: (dt: number) => mixer.update(dt),            // from the render loop; never from the simulation
    release: () => { scene.remove(bull.root); bull.release(); },  // on game over, or when swapping bulls
  };
}
```

`CobiKit.load` refuses a base whose manifest names a kit other than
`item.model.kit`, so a stale default never loads the wrong parts. Call
`release()` when the run ends or the bull leaves the scene; the kit frees what
no other bull uses. A game that shows one bull is lighter than one that
bundles a model; a game that shows fourteen is not.

## 4. The image path (2D games)

A 2D game needs no three.js. `item.image` is the item's picture on the
platform's asset host: draw it as the avatar on the end card, a portrait in
the corner, or the face of a token on the board. `item.name` is the display
name ('Cobi #5759') for a greeting or the end card.

```ts
const face = new Image();
face.src = bull.image;                                  // assets.beyondplay.xyz, allowed by the CSP
face.onload = () => ctx.drawImage(face, x, y, 64, 64);
```

## The shape

```ts
interface PlayerItem {
  id: string;                 // 'cobi:5759'
  collection: string;         // 'cobi'
  tokenId: string;            // '5759'
  name: string;               // 'Cobi #5759'
  image: string;              // https://assets.beyondplay.xyz/cobi/images/5759.webp
  traits: Record<string, string>;   // { Fur: 'Gold', Horns: 'Fire', Eyes: 'Laser', ... }
  model?: { kind: 'kit'; kit: string; base: string; clips: string; clipNames: string[]; skeleton: string; height: number; facing: string; feetAt: number }
        | { kind: 'baked'; url: string };
  borrowed: boolean;          // true when the platform lent it; it looks the same
  until?: string;             // when a borrowed item goes back
  quantity?: number;          // ERC-1155 collections
}
```

The types are in `src/beyondplay-platform.ts`: `PlayerItem`, `ItemModel`
(`KitModel | BakedModel`), `PlayerItemsParams`, and the companions
`PlayerStats` (`request('player.stats')`) and `PlayerFriend`
(`request('player.friends')`).

## The CSP

A game that declares any `player.*` capability is served with an enumerated
CSP: it can only reach the platform's hosts (`*.beyondplay.xyz`, which
includes `assets.beyondplay.xyz`). No chain RPC, no third-party host, whatever
the source says. The validator's allowed hosts already match.

## What is not allowed

- A trait or an item deciding speed, lives, a loadout, a start position, a
  score multiplier or an unlock. Gold bulls run the same course at the same
  speed as the default bull.
- Anything from `player.items` in `src/game.ts`, or any value derived from an
  item reaching the simulation (`GAME_ITEM_IN_SIMULATION`).
- Copy about wallets, linking, buying, renting or marketplaces; a different
  empty state for players without items. The default bull, silently.
- A game asking for more than the one collection it declared, reading a chain,
  a wallet or a marketplace, or loading an item image from anywhere but the
  platform's asset host (`GAME_WALLET_GATING`, `GAME_EXTERNAL_REQUEST`).
- Items in the duel seed: a duel must replay the same for both players.
