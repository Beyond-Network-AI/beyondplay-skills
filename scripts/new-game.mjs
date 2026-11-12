// Scaffold a new game from the template:
//   npm run new-game <slug> "Display Name" [-- --starter runner]
// The result is a complete, playable game in games/<slug>/ that builds and
// passes every check as scaffolded: Tap Timing, or a genre starter laid over
// the template (starters/<name>/: its engine, scene, shell, check driver,
// sounds and music). Replace the engine and the shell with your game; keep
// their shape.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT, SLUG_RE } from './kit.mjs';

const args = process.argv.slice(2);
const flag = args.indexOf('--starter');
const starter = flag >= 0 ? args.splice(flag, 2)[1] : null;
const slug = args[0];
const name = args[1] ?? slug;
const STARTERS = join(KIT_ROOT, 'starters');
const starters = existsSync(STARTERS) ? readdirSync(STARTERS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
if (!slug || !SLUG_RE.test(slug) || (flag >= 0 && !starters.includes(starter))) {
  console.error(`usage: npm run new-game <slug> "Display Name" [-- --starter ${starters.join('|') || '<name>'}]   (slug: lowercase letters, digits and dashes, 3 to 41 characters)`);
  process.exit(2);
}
const dest = join(KIT_ROOT, 'games', slug);
if (existsSync(dest)) {
  console.error(`games/${slug} already exists`);
  process.exit(2);
}

// The template's own build output (if someone built it in place) is never part of a new game.
cpSync(join(KIT_ROOT, 'template'), dest, { recursive: true, filter: (src) => src !== join(KIT_ROOT, 'template', 'dist') });
// A genre starter replaces the starter files and adds its own (scene, sounds, music).
const CREDIT_LINES = 'CREDITS.library.md';
if (starter) cpSync(join(STARTERS, starter), dest, { recursive: true, filter: (src) => !src.endsWith(CREDIT_LINES) && !src.endsWith('starter.json') });
const libraryCredits = starter && existsSync(join(STARTERS, starter, CREDIT_LINES)) ? readFileSync(join(STARTERS, starter, CREDIT_LINES), 'utf8').trim() : '';

const idx = join(dest, 'index.html');
writeFileSync(idx, readFileSync(idx, 'utf8').replace('<title>BeyondPlay</title>', `<title>${name}</title>`));

// Listing text. The submit step passes these fields to the MCP's set_metadata.
writeFileSync(join(dest, 'publish.config.json'), JSON.stringify({
  slug,
  name,
  tagline: '',
  description: '',
  tags: [],
  ageRating: '9+',
  visibility: 'unlisted',
}, null, 2) + '\n');

// Every asset and track the game ships is named here with its source and licence.
writeFileSync(join(dest, 'CREDITS.md'), `# Credits for ${name}

Every asset and audio track in this game is listed here with its source and
licence. The creator attests to this list on submission. Allowed: your own
work, public domain (CC0), or a licence that permits commercial games.

| Asset | Author | Source | Licence |
|---|---|---|---|
| (none yet: the scaffold draws everything in code${libraryCredits ? '; its sounds, music and character are from the asset library, below' : ' and makes no sound'}) | | | |
${libraryCredits ? `\n## Library assets\n\n${libraryCredits}\n` : ''}`);

// Art sources: a 512 x 512 icon (required to publish) and a 1920 x 1080 banner
// (optional). Draw on the canvas, then render with npm run render-icon / render-banner.
const assetsDir = join(dest, 'assets');
mkdirSync(assetsDir, { recursive: true });
const artStub = (id, w, h, label, script) => `<!doctype html>
<html><head><meta charset="UTF-8"><style>*{margin:0;padding:0}body{width:${w}px;height:${h}px}
#${id}{position:relative;width:${w}px;height:${h}px;background:#0b0f1a;overflow:hidden}
h1{position:absolute;left:${Math.round(w * 0.06)}px;top:50%;transform:translateY(-50%);
   font:700 ${Math.round(h * 0.16)}px Georgia,serif;color:#eaf2ff}</style></head>
<body><div id="${id}"><canvas width="${w}" height="${h}"></canvas><h1>${name}</h1></div>
<!-- ${label}: draw the game's identity on the canvas, then run
     npm run ${script} -- games/${slug} -->
</body></html>
`;
writeFileSync(join(assetsDir, 'icon-source.html'), artStub('icon', 512, 512, 'App icon (512 x 512)', 'render-icon'));
writeFileSync(join(assetsDir, 'banner-source.html'), artStub('banner', 1920, 1080, 'Banner (1920 x 1080)', 'render-banner'));

console.log(`scaffolded games/${slug}`);
console.log(`next:  replace src/game.ts (engine) and src/App.tsx (shell); keep src/beyondplay.config.ts honest about how it duels;`);
console.log(`       teach smoke.driver.mjs how to play your game (the checks use it); list every asset in CREDITS.md`);
console.log(`check: npm run ladder -- games/${slug}`);
console.log(`art:   edit assets/icon-source.html, then npm run render-icon -- games/${slug}`);
console.log(`ship:  npm run pack -- games/${slug}, then follow skills/beyondplay-game/references/submit.md`);
