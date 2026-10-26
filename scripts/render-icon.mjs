// Render a game's icon: screenshots the 512 x 512 #icon element in
// games/<slug>/assets/icon-source.html to games/<slug>/assets/icon.png, the
// file the submit step uploads with set_icon (kind "icon"). Required to publish.
//   npm run render-icon -- games/<slug>
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveGame } from './kit.mjs';
import { launch } from './smoke-driver.mjs';

const { gameDir } = resolveGame(process.argv[2], { usage: 'usage: npm run render-icon -- games/<slug>' });
const src = join(gameDir, 'assets', 'icon-source.html');
if (!existsSync(src)) {
  console.error(`no ${src}; create one (a 512 x 512 #icon element) first`);
  process.exit(1);
}
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.goto(pathToFileURL(src).href);
await page.waitForTimeout(250);
const out = join(gameDir, 'assets', 'icon.png');
await page.locator('#icon').screenshot({ path: out, type: 'png' });
await browser.close();
console.log(`wrote ${out}`);
