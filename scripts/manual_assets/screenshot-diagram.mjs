// screenshot-diagram.mjs — screenshot an HTML diagram element to PNG at 2x scale
// (sanctioned pipeline per pdf skill SKILL.md "Diagram Generation Strategy")
import { chromium } from 'playwright';
import path from 'path';

const [, , htmlPath, outPath, selector = '.canvas'] = process.argv;
if (!htmlPath || !outPath) { console.error('usage: node screenshot-diagram.mjs <html> <png> [selector]'); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 600 } });
await page.goto('file://' + path.resolve(htmlPath));
await page.waitForTimeout(600); // font settle
const el = page.locator(selector);
await el.screenshot({ path: outPath });
await browser.close();
console.log('saved', outPath);
