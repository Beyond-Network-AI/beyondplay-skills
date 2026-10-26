// Render a game's banner: screenshots the 1920 x 1080 #banner element in
// games/<slug>/assets/banner-source.html to games/<slug>/assets/banner.jpg,
// the file the submit step uploads with set_icon (kind "banner"). Optional;
// the platform shows it on the game page and in link previews.
//   npm run render-banner -- games/<slug>
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveGame } from './kit.mjs';
import { launch } from './smoke-driver.mjs';

const { gameDir } = resolveGame(process.argv[2], { usage: 'usage: npm run render-banner -- games/<slug>' });
const src = join(gameDir, 'assets', 'banner-source.html');
if (!existsSync(src)) {
  console.error(`no ${src}; create one (a 1920 x 1080 #banner element) first`);
  process.exit(1);
}
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(src).href);
await page.waitForTimeout(250);
const out = join(gameDir, 'assets', 'banner.jpg');
await page.locator('#banner').screenshot({ path: out, type: 'jpeg', quality: 90 });
await browser.close();
console.log(`wrote ${out}`);
