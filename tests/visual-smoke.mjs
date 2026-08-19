import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('artifacts');
fs.mkdirSync(out, { recursive: true });
const errors = [];
const notes = {};
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  recordVideo: { dir: path.join(out, 'video'), size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(`console: ${msg.text()}`); });

await page.goto('http://127.0.0.1:4173/?quality=high&capture=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__MAPLES_GAME__));
await page.waitForFunction(() => {
  const g = window.__MAPLES_GAME__;
  return g.assetVisualManager?.ready && g.assetVisualManager?.heroReady &&
    g.enemies.filter(e => e.assetVisual).length >= 5 &&
    g.environmentAssetManager?.ready && g.environmentAssetManager?.count >= 14 &&
    g.natureAssetManager?.ready && g.natureAssetManager?.count >= 70 &&
    g.animationPolishManager?.ready && document.querySelector('#enter-btn')?.dataset.ready === 'true';
}, null, { timeout: 60000 });

notes.boot = await page.evaluate(() => {
  const g = window.__MAPLES_GAME__;
  return {
    quality: g.quality,
    importedEnemies: g.enemies.filter(e => e.assetVisual).length,
    heroImported: Boolean(g.player.assetVisual),
    assetFailures: [...(g.assetVisualManager?.failures || [])],
    environmentPieces: g.environmentAssetManager?.count ?? 0,
    environmentFailures: [...(g.environmentAssetManager?.failures || [])],
    naturePieces: g.natureAssetManager?.count ?? 0,
    natureFailures: [...(g.natureAssetManager?.failures || [])],
    animationPolishReady: Boolean(g.animationPolishManager?.ready),
  };
});
if (notes.boot.quality !== 'high') errors.push(`Expected high quality, got ${notes.boot.quality}`);
if (notes.boot.importedEnemies < 5) errors.push(`Expected 5 imported enemies, got ${notes.boot.importedEnemies}`);
if (!notes.boot.heroImported) errors.push('Rowan imported Knight GLB did not attach');
if (notes.boot.assetFailures.length) errors.push(`Asset failures: ${notes.boot.assetFailures.join('; ')}`);
if (notes.boot.environmentPieces < 14 || notes.boot.environmentFailures.length) errors.push('Environment asset layer incomplete');
if (notes.boot.naturePieces < 70 || notes.boot.natureFailures.length) errors.push('Nature asset layer incomplete');
if (!notes.boot.animationPolishReady) errors.push('Animation polish director did not install');
await page.screenshot({ path: path.join(out, '01-intro.png') });

await page.locator('#enter-btn').click();
await page.waitForFunction(() => window.__MAPLES_GAME__.animationPolishManager?.playerReady, null, { timeout: 30000 });

// Run beyond one complete high-speed stride so the distance-driven footstep event is deterministic even under SwiftShader.
const locomotionStart = await page.evaluate(() => ({ x: window.__MAPLES_GAME__.player.position.x, z: window.__MAPLES_GAME__.player.position.z }));
await page.keyboard.down('KeyW');
await page.waitForFunction(({ x, z }) => {
  const p = window.__MAPLES_GAME__.player.position;
  return Math.hypot(p.x - x, p.z - z) >= 1.7;
}, locomotionStart, { timeout: 90000 });
notes.locomotion = await page.evaluate(() => {
  const g = window.__MAPLES_GAME__;
  return {
    animation: g.player.assetAnimator?.key ?? null,
    speed: g.player.speed,
    playerReady: Boolean(g.animationPolishManager?.playerReady),
    trailReady: Boolean(g.animationPolishManager?.trailReady),
    secondaryMotionReady: Boolean(g.animationPolishManager?.secondaryMotionReady),
    footstepEvents: g.animationPolishManager?.footstepEvents ?? 0,
  };
});
await page.keyboard.up('KeyW');
await page.screenshot({ path: path.join(out, '01b-locomotion.png') });
if (!['walk', 'run'].includes(notes.locomotion.animation)) errors.push(`Locomotion animation missing: ${notes.locomotion.animation}`);
if (!notes.locomotion.trailReady) errors.push('Rowan sword was not resolved for motion trail');
if (!notes.locomotion.secondaryMotionReady) errors.push('Cape/hair secondary motion was not resolved');
if (notes.locomotion.footstepEvents < 1) errors.push(`Expected a footstep after 1.7m, got ${notes.locomotion.footstepEvents}`);

await page.evaluate(() => {
  const g = window.__MAPLES_GAME__;
  g.cameraYaw = Math.PI;
  g.player.setPosition(0, 0, 5.2); g.player.velocity.set(0,0,0);
  g.player.state = 'idle'; g.player.stateTime = 0; g.player.comboDeadline = 0;
  const e = g.enemies.find(x => !x.dead && !x.isBoss && x.assetVisual);
  e.position.set(0, 0, 3.45); e.state = 'idle'; e.stateTime = 0; e.velocity.set(0,0,0);
});
await page.waitForTimeout(80);
await page.mouse.click(640, 360);
await page.waitForFunction(() => {
  const g = window.__MAPLES_GAME__, p = g.player;
  return p.state === 'attack' && p.comboIndex === 0 && p.attackEventFired &&
    g.animationPolishManager?.trailActive && (g.animationPolishManager?.trailSamples ?? 0) >= 2;
}, null, { timeout: 30000 });
notes.melee = await page.evaluate(() => ({
  animation: window.__MAPLES_GAME__.player.assetAnimator?.key,
  samples: window.__MAPLES_GAME__.animationPolishManager?.trailSamples ?? 0,
}));
if (notes.melee.animation !== 'attack0') errors.push(`Expected attack0, got ${notes.melee.animation}`);
await page.screenshot({ path: path.join(out, '02-melee-impact.png') });

for (const expectedCombo of [1, 2]) {
  await page.waitForFunction(() => window.__MAPLES_GAME__.player.state === 'idle', null, { timeout: 30000 });
  await page.mouse.click(640, 360);
  await page.waitForFunction(index => {
    const g = window.__MAPLES_GAME__, p = g.player;
    return p.state === 'attack' && p.comboIndex === index && p.attackEventFired &&
      g.animationPolishManager?.trailActive && (g.animationPolishManager?.trailSamples ?? 0) >= 2;
  }, expectedCombo, { timeout: 30000 });
  if (expectedCombo === 2) {
    notes.finisher = await page.evaluate(() => ({
      animation: window.__MAPLES_GAME__.player.assetAnimator?.key,
      samples: window.__MAPLES_GAME__.animationPolishManager?.trailSamples ?? 0,
    }));
    await page.screenshot({ path: path.join(out, '03-combo-finisher.png') });
  }
}
if (notes.finisher?.animation !== 'attack2') errors.push(`Expected attack2 finisher, got ${notes.finisher?.animation}`);

await page.waitForFunction(() => window.__MAPLES_GAME__.player.state === 'idle', null, { timeout: 30000 });
await page.evaluate(() => {
  const g = window.__MAPLES_GAME__;
  g.player.setPosition(0,0,5.2); g.player.facing = Math.PI; g.player.root.rotation.y = Math.PI;
  g.player.mana = g.player.maxMana; g.spellCooldown = 0;
  const target = g.enemies.find(x => !x.dead && !x.isBoss && x.assetVisual);
  if (target) { target.position.set(0,0,-2.3); target.state='idle'; target.stateTime=0; target.velocity.set(0,0,0); }
});
await page.keyboard.press('KeyQ');
await page.waitForFunction(() => {
  const g = window.__MAPLES_GAME__;
  return g.player.state === 'cast' && g.projectiles.length > 0;
}, null, { timeout: 30000 });
notes.spell = await page.evaluate(() => ({ animation: window.__MAPLES_GAME__.player.assetAnimator?.key, projectiles: window.__MAPLES_GAME__.projectiles.length }));
if (notes.spell.animation !== 'cast') errors.push(`Expected cast animation, got ${notes.spell.animation}`);
await page.screenshot({ path: path.join(out, '04-ember-lance.png') });

await page.evaluate(() => {
  const g = window.__MAPLES_GAME__;
  g.kills = g.objectiveKills; g.bossPending = true; g.bossTimer = .03;
  g.player.setPosition(0,0,-6.3); g.player.facing = Math.PI; g.player.root.rotation.y = Math.PI; g.cameraYaw = Math.PI;
});
await page.waitForFunction(() => {
  const g = window.__MAPLES_GAME__;
  return Boolean(g.boss?.assetVisual) && g.boss.state === 'spawn' && g.bossRevealTimer > 0 && g.animationPolishManager?.bossPolished;
}, null, { timeout: 90000 });
notes.boss = await page.evaluate(() => ({
  imported: Boolean(window.__MAPLES_GAME__.boss?.assetVisual), kind: window.__MAPLES_GAME__.boss?.assetKind,
  animation: window.__MAPLES_GAME__.boss?.assetAnimator?.key, polished: Boolean(window.__MAPLES_GAME__.animationPolishManager?.bossPolished),
}));
if (!notes.boss.imported || notes.boss.kind !== 'demon' || !notes.boss.polished) errors.push('Thornmaw imported/polished state failed');
await page.screenshot({ path: path.join(out, '05-boss-reveal.png') });
await context.close();

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const mp = await mobile.newPage();
mp.on('pageerror', error => errors.push(`mobile pageerror: ${error.message}`));
await mp.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await mp.waitForFunction(() => {
  const g = window.__MAPLES_GAME__;
  return Boolean(g?.player?.assetVisual) && g.environmentAssetManager?.ready && g.natureAssetManager?.ready &&
    g.animationPolishManager?.ready && document.querySelector('#enter-btn')?.dataset.ready === 'true';
}, null, { timeout: 90000 });
notes.mobile = await mp.evaluate(() => ({
  controls: getComputedStyle(document.querySelector('#mobile-controls')).display,
  heroImported: Boolean(window.__MAPLES_GAME__.player.assetVisual),
  environmentPieces: window.__MAPLES_GAME__.environmentAssetManager?.count ?? 0,
  naturePieces: window.__MAPLES_GAME__.natureAssetManager?.count ?? 0,
  animationPolishReady: Boolean(window.__MAPLES_GAME__.animationPolishManager?.ready),
}));
if (notes.mobile.controls === 'none') errors.push('Mobile controls are hidden');
if (!notes.mobile.heroImported || notes.mobile.environmentPieces < 14 || notes.mobile.naturePieces < 35 || !notes.mobile.animationPolishReady) errors.push('Mobile showcase boot incomplete');
await mp.screenshot({ path: path.join(out, '06-mobile.png') });
await mobile.close();
await browser.close();

fs.writeFileSync(path.join(out, 'visual-report.json'), JSON.stringify({ errors, notes }, null, 2));
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('visual-smoke: PASS');
console.log(JSON.stringify(notes, null, 2));
