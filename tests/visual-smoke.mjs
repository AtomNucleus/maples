import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('artifacts');
fs.mkdirSync(out, { recursive: true });
const errors = [];
const notes = {};

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  recordVideo: { dir: path.join(out, 'video'), size: { width: 1280, height: 720 } }
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
page.on('console', msg => {
  if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(`console: ${msg.text()}`);
});

await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__MAPLES_GAME__));
await page.waitForTimeout(1600);
notes.boot = await page.evaluate(() => ({
  quality: window.__MAPLES_GAME__.quality,
  enemies: window.__MAPLES_GAME__.enemies.length,
  sceneChildren: window.__MAPLES_GAME__.scene.children.length,
  renderer: window.__MAPLES_GAME__.renderer.info.render
}));
if (notes.boot.enemies < 5) errors.push(`Expected at least 5 enemies, got ${notes.boot.enemies}`);
await page.screenshot({ path: path.join(out, '01-intro.png') });

await page.locator('#enter-btn').click();
await page.waitForTimeout(450);

// Stage an enemy directly in the authentic melee arc so the capture is deterministic.
await page.evaluate(() => {
  const g = window.__MAPLES_GAME__;
  g.cameraYaw = Math.PI;
  g.player.setPosition(0, 0, 5.2);
  const e = g.enemies.find(x => !x.dead && !x.isBoss);
  e.position.set(0, 0, 2.9);
  e.state = 'idle'; e.stateTime = 0;
});
await page.keyboard.down('w'); await page.waitForTimeout(100); await page.keyboard.up('w');
await page.mouse.click(640, 360);
await page.waitForTimeout(155);
await page.screenshot({ path: path.join(out, '02-melee-impact.png') });
await page.waitForTimeout(300);
await page.mouse.click(640, 360);
await page.waitForTimeout(165);
await page.mouse.click(640, 360);
await page.waitForTimeout(220);
await page.screenshot({ path: path.join(out, '03-combo-finisher.png') });

// Spell capture.
await page.evaluate(() => {
  const g = window.__MAPLES_GAME__;
  g.player.state = 'idle'; g.player.stateTime = 0; g.player.facing = Math.PI; g.player.root.rotation.y = Math.PI;
  const target = g.enemies.find(x => !x.dead && !x.isBoss);
  if (target) { target.position.set(0, 0, -1.2); target.state = 'idle'; target.stateTime = 0; }
});
await page.keyboard.press('q');
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(out, '04-ember-lance.png') });
await page.waitForTimeout(450);

// Jump encounter to the boss reveal after proving the normal combat loop.
await page.evaluate(() => {
  const g = window.__MAPLES_GAME__;
  g.kills = g.objectiveKills;
  g.bossPending = true; g.bossTimer = .03;
  g.player.setPosition(0, 0, -6.3); g.player.facing = Math.PI; g.player.root.rotation.y = Math.PI;
  g.cameraYaw = Math.PI;
});
await page.waitForTimeout(900);
notes.boss = await page.evaluate(() => ({ spawned: Boolean(window.__MAPLES_GAME__.boss), hp: window.__MAPLES_GAME__.boss?.hp ?? null }));
if (!notes.boss.spawned) errors.push('Boss did not spawn');
await page.screenshot({ path: path.join(out, '05-boss-reveal.png') });
await page.waitForTimeout(500);

await context.close();

// Mobile layout smoke test.
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1
});
const mp = await mobile.newPage();
mp.on('pageerror', error => errors.push(`mobile pageerror: ${error.message}`));
await mp.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await mp.waitForFunction(() => Boolean(window.__MAPLES_GAME__));
await mp.waitForTimeout(900);
notes.mobileControls = await mp.locator('#mobile-controls').evaluate(el => getComputedStyle(el).display);
if (notes.mobileControls === 'none') errors.push('Mobile controls are hidden on touch viewport');
await mp.screenshot({ path: path.join(out, '06-mobile.png') });
await mobile.close();
await browser.close();

fs.writeFileSync(path.join(out, 'visual-report.json'), JSON.stringify({ errors, notes }, null, 2));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify(notes, null, 2));
