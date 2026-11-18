# Status

What changed in the kit, newest first.

## 14 November 2026: characters and moves from the library

- `template/src/beyondplay-characters.ts` (platform-owned): `loadCharacter`, `loadClip`, `clipsFor` and `loadDance`
  load the library's rigged characters (ape, pink and green Beyonders; the bull through `cobi-kit.ts`) and their moves
  (idle, walk, run, jump, sit, sit-down, stand-up, fall, land, glide, wave, point, clap, cheer) and six dances from the
  asset host, through the library's index. It is a synced copy (`npm run sync-characters`); the `Animator` in
  `beyondplay-anim.ts` plays what it loads.
- The validator lists it as a platform-owned file a game may ship without, and its tests lock in that the library's
  characters and moves on the asset host are not external requests.
- The skill and the contract (section 5c, "Characters and moves from the library") say to search the library first
  and never copy 3D into the game.
