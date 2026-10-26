# Style and wording

Sources: the platform's visual-style, feed-ready and haptics playbooks, the
founder's feedback on the published games, palette measurements on live
frames, and the creator terms (brands, thumbnails, earnings language, AI
disclosure).

## Visual direction

- One coherent art style per game, across every screen, HUD element and
  effect. Do not mix pixel art with vector illustration, or flat design with
  3D-like renders. Pixel art draws with `imageSmoothingEnabled = false`.
- Pick a palette of 3 to 5 main colours early and reuse it everywhere. The
  shipped games measure palettes on a live frame: six-colour samples with
  average saturation near 50 percent and luma contrast near 50 read as
  exciting; 20 to 30 percent saturation read as dull to the founder.
- Typography: one display font, one body font. The template loads Averia
  Libre (display) and Geist (body); add no further fonts.
- Dark, punchy, neon-arcade reads best in the feed, but each game owns its
  look. Directions the founder has approved so far: neon arcade; comic-book
  (ink outlines baked into geometry, three-band flat colour, halftone dots,
  flat inked pickups with no glow); glossy pastel toy with a glass UI;
  sRGB-correct vivid colour with glossy reflective surfaces for the penguin
  games.
- Where a partner licence exists, the character must look like the real
  character, clearly visible and textured at phone size.
- Readable at arm's length: minimum 12 px text, a large score, no clutter.
  The founder removed HUD labels, an instruction pill and most callouts from
  a shipped game because "the game screen is a bit cluttered with text";
  callouts stay only where the player acts on them.

## Motion

- Every state change gets feedback: score pulse or counter roll, damage shake
  or flash, escalating intensity on combos, press and release on buttons,
  transitions instead of hard cuts.
- Interactions at 150 to 300 ms, transitions at 300 to 500 ms; ease-out for
  entrances, ease-in for exits.
- Intro fly-in with the logo on the same clock as the game; end card with
  character art and stats; haptics on discrete moments only.
- Sell speed with pose and lean, not by playing a run clip faster than about
  1.5x (a faster jog "looks funny").
- Pressure must be beatable by skill, with a warning and a recovery window;
  no clock-scripted deaths.
- Juice the founder has asked for: slides, flips, flying pickups, dances on a
  win.

## Screens in the feed

- No start screen, no menu gate, no pause screen in front of play. The first
  frame is the game.
- End card: final score with emphasis, a few stats, a big replay button with
  a fixed label (the feed smoke clicks it), and the duel line when a match
  exists.
- Settings and mode choices live in the HUD or on the end card. One shipped
  game removed its character picker entirely on the founder's word: "nobody
  chooses".

## Wording rules

- No instruction text anywhere: not "tap to", "swipe to", "hold to",
  "drag to", "flick to", "how to play", "instructions". Wordless icon hints
  are fine.
- No emoji in UI text unless asked.
- No third-party brand names, characters, logos or product names in the
  game, its title, description, icon or banner without a written partner
  agreement. This matches the store rule that another developer's brand may
  not appear in an app's icon or name without approval.
- A fan game made under a written partner agreement ends its description
  with the disclaimer sentence the agreement prescribes, in the form "not
  affiliated with <the rights holder>". The platform's own characters carry
  no disclaimer. Without an agreement there is no fan game.
- No earnings language and no purchase calls to action inside a game.
- Disclose AI-generated assets; do not present them as hand-made.
- No profanity in title, description or tags.

## Store metadata

- `name`: the display name. `tagline`: short and punchy (shipped examples:
  "Flick. Swish. Repeat.", "Grow. Thread. Climb.").
- `description`: what you do, why it is fun, a duel note ("same course for
  both players in a duel"), and the fan disclaimer where required.
- `tags`: four, lowercase (shipped examples: `arcade`, `sports`, `3d`,
  `reflex`, `endless`).
- Icon and banner true to gameplay: reviewers reject thumbnails that do not
  match the game and real photographs of people. The banner title must not
  cover the character.

## Open questions for the platform team

- The sources do not define a platform-wide "painted" house style; the only
  written style rules are "one coherent style per game" and the founder's
  per-game directions above.
- The sources do not state a "one style per island" rule; worlds are outside
  this skill.
- The sources do not state a "full words, no abbreviations" rule for UI text.
  The closest written rules are the no-instruction-text rule, the minimum
  text size and the founder's request for less HUD text.
