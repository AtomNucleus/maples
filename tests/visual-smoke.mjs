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

await page.goto('http://127.0.0.1:4173/?quality=high&capture=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__MAPLES_GAME__));
await page.waitForFunction(() => {
  const g = window.__MAPLES_GAME__;
  return g.assetVisualManager?.ready && g.assetVisualManager?.heroReady &&
    g.enemies.filter(e => e.assetVisual).length >= 5 &&
    g.environmentAssetManager?.ready && g.environmentAssetManager?.count >= 14;
}, null, { timeout: 20000 });
await page.waitForTimeout(500);
notes.boot = await page.evaluate(() => {
  const g = window.__MAPLES_GAME__;
  return {
    quality: g.quality,
    enemies: g.enemies.length,
    importedEnemies: g.enemies.filter(e => e.assetVisual).length,
    heroImported: Boolean(g.player.assetVisual),
    heroAnimation: g.player.assetAnimator?.key ?? null,
    enemyKinds: g.enemies.filter(e => e.assetVisual).map(e => e.assetKind),
    assetFailures: [...(g.assetVisualManager?.failures || [])],
    environmentReady: Boolean(g.environmentAssetManager?.ready),
    environmentPieces: g.environmentAssetManager?.count ?? 0,
    environmentFailures: [...(g.environmentAssetManager?.failures || [])],
    sceneChildren: g.scene.children.length,
    renderer: g.renderer.info.render
  };
});
if (notes.boot.enemies < 5) errors.push(`Expected at least 5 enemies, got ${notes.boot.enemies}`);
if (notes.boot.importedEnemies < 5) errors.push(`Expected 5 imported enemy visuals, got ${notes.boot.importedEnemies}`);
if (!notes.boot.heroImported) errors.push('Rowan imported Knight GLB did not attach');
if (notes.boot.assetFailures.length) errors.push(`Asset load failures: ${notes.boot.assetFailures.join('; ')}`);
if (!notes.boot.environmentReady || notes.boot.environmentPieces < 14) errors.push(`Environment asset layer incomplete: ${notes.boot.environmentPieces} pieces`);
if (notes.boot.environmentFailures.length) errors.push(`Environment asset failures: ${notes.boot.environmentFailures.join('; ')}`);
if (notes.boot.quality !== 'high') errors.push(`Expected high showcase quality, got ${notes.boot.quality}`);
await page.screenshot({ path: path.join(out, '01-intro.png') });

await page.locator('#enter-btn').click();
await page.waitForTimeout(450);

// Stage an enemy directly in the authentic melee arc so the capture is deterministic.
await page.evaluate(() => {
  const g = window.__MAPLES_GAME__;
  g.cameraYaw = Math.PI;
  g.player.setPosition(0, 0, 5.2);
  const e = g.enemies.find(x => !x.dead && !x.isBoss);
  e.position.set(0, 0, 3.55);
  e.state = 'idle'; e.stateTime = 0;
});
await page.keyboard.down('w'); await page.waitForTimeout(100); await page.keyboard.up('w');
await page.mouse.click(640, 360);
await page.waitForTimeout(155);
notes.melee = await page.evaluate(() => ({
  playerAnimation: window.__MAPLES_GAME__.player.assetAnimator?.key ?? null
}));
if (!String(notes.melee.playerAnimation).startsWith('attack')) errors.push(`Imported player rig did not enter attack animation: ${notes.melee.playerAnimation}`);
await page.screenshot({ path: path.join(out, '02-melee-impact.png') });
await page.waitForTimeout(300);
await page.mouse.click(640, 360);
await page.waitForTimeout(230);
await page.mouse.click(640, 360);
await page.waitForTimeout(520);
await page.screenshot({ path: path.join(out, '03-combo-finisher.png') });

// Spell capture.
await page.evaluate(() => {
  const g = window.__MAPLES_GAME__;
  g.player.state = 'idle'; g.player.stateTime = 0; g.player.setPosition(0,0,5.2); g.player.facing = Math.PI; g.player.root.rotation.y = Math.PI;
  const target = g.enemies.find(x => !x.dead && !x.isBoss);
  if (target) { target.position.set(0, 0, 1.7); target.state = 'idle'; target.stateTime = 0; }
});
await page.keyboard.press('q');
await page.waitForTimeout(170);
notes.spell = await page.evaluate(() => ({ playerAnimation: window.__MAPLES_GAME__.player.assetAnimator?.key ?? null }));
if (notes.spell.playerAnimation !== 'cast') errors.push(`Imported player rig did not enter cast animation: ${notes.spell.playerAnimation}`);
await page.waitForTimeout(65);
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
await page.waitForFunction(() => Boolean(window.__MAPLES_GAME__.boss?.assetVisual), null, { timeout: 15000 });
await page.waitForTimeout(550);
notes.boss = await page.evaluate(() => {
  const boss = window.__MAPLES_GAME__.boss;
  return { spawned: Boolean(boss), imported: Boolean(boss?.assetVisual), kind: boss?.assetKind ?? null, hp: boss?.hp ?? null, animation: boss?.assetAnimator?.key ?? null };
});
if (!notes.boss.spawned) errors.push('Boss did not spawn');
if (!notes.boss.imported || notes.boss.kind !== 'demon') errors.push('Imported Thornmaw demon visual did not attach');
await page.screenshot({ path: path.join(out, '05-boss-reveal.png') });
await page.waitForTimeout(500);

await context.close();

// Mobile layout + asset-load smoke test.
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
await mp.waitForFunction(() => {
  const g = window.__MAPLES_GAME__;
  return Boolean(g.player.assetVisual) && Boolean(g.environmentAssetManager?.ready);
}, null, { timeout: 15000 });
await mp.waitForTimeout(400);
notes.mobile = await mp.evaluate(() => ({
  controls: getComputedStyle(document.querySelector('#mobile-controls')).display,
  quality: window.__MAPLES_GAME__.quality,
  heroImported: Boolean(window.__MAPLES_GAME__.player.assetVisual),
  environmentPieces: window.__MAPLES_GAME__.environmentAssetManager?.count ?? 0,
  failures: [
    ...(window.__MAPLES_GAME__.assetVisualManager?.failures || []),
    ...(window.__MAPLES_GAME__.environmentAssetManager?.failures || [])
  ]
}));
if (notes.mobile.controls === 'none') errors.push('Mobile controls are hidden on touch viewport');
if (!notes.mobile.heroImported) errors.push('Imported Rowan visual failed on mobile');
if (notes.mobile.environmentPieces < 14) errors.push(`Mobile environment asset layer incomplete: ${notes.mobile.environmentPieces}`);
if (notes.mobile.failures.length) errors.push(`Mobile asset failures: ${notes.mobile.failures.join('; ')}`);
await mp.screenshot({ path: path.join(out, '06-mobile.png') });
await mobile.close();
await browser.close();

fs.writeFileSync(path.join(out, 'visual-report.json'), JSON.stringify({ errors, notes }, null, 2));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify(notes, null, 2));
