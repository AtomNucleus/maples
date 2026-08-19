import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
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

  const boot = await page.evaluate(() => {
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
  assert.equal(boot.quality, 'high');
  assert.ok(boot.importedEnemies >= 5 && boot.heroImported);
  assert.equal(boot.assetFailures.length, 0);
  assert.ok(boot.environmentPieces >= 14 && boot.environmentFailures.length === 0);
  assert.ok(boot.naturePieces >= 70 && boot.natureFailures.length === 0);
  assert.ok(boot.animationPolishReady);

  await page.locator('#enter-btn').click();
  await page.waitForFunction(() => window.__MAPLES_GAME__.animationPolishManager?.playerReady, null, { timeout: 30000 });
  const start = await page.evaluate(() => ({ x: window.__MAPLES_GAME__.player.position.x, z: window.__MAPLES_GAME__.player.position.z }));
  await page.keyboard.down('KeyW');
  await page.waitForFunction(({ x, z }) => {
    const p = window.__MAPLES_GAME__.player.position;
    return Math.hypot(p.x - x, p.z - z) >= 1.7;
  }, start, { timeout: 90000 });
  const locomotion = await page.evaluate(() => {
    const g = window.__MAPLES_GAME__;
    return {
      animation: g.player.assetAnimator?.key ?? null,
      trailReady: Boolean(g.animationPolishManager?.trailReady),
      secondaryMotionReady: Boolean(g.animationPolishManager?.secondaryMotionReady),
      footstepEvents: g.animationPolishManager?.footstepEvents ?? 0,
    };
  });
  await page.keyboard.up('KeyW');
  assert.ok(['walk', 'run'].includes(locomotion.animation), `locomotion ${locomotion.animation}`);
  assert.ok(locomotion.trailReady, 'sword trail not ready');
  assert.ok(locomotion.secondaryMotionReady, 'secondary motion not ready');
  assert.ok(locomotion.footstepEvents >= 1, `footsteps ${locomotion.footstepEvents}`);

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
  assert.equal(await page.evaluate(() => window.__MAPLES_GAME__.player.assetAnimator?.key), 'attack0');

  for (const expectedCombo of [1, 2]) {
    await page.waitForFunction(() => window.__MAPLES_GAME__.player.state === 'idle', null, { timeout: 30000 });
    await page.mouse.click(640, 360);
    await page.waitForFunction(index => {
      const g = window.__MAPLES_GAME__, p = g.player;
      return p.state === 'attack' && p.comboIndex === index && p.attackEventFired &&
        g.animationPolishManager?.trailActive && (g.animationPolishManager?.trailSamples ?? 0) >= 2;
    }, expectedCombo, { timeout: 30000 });
  }
  assert.equal(await page.evaluate(() => window.__MAPLES_GAME__.player.assetAnimator?.key), 'attack2');

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
  assert.equal(await page.evaluate(() => window.__MAPLES_GAME__.player.assetAnimator?.key), 'cast');

  await context.close();
  console.log('VISUAL STAGE BOOT LOCOMOTION COMBAT SPELL PASS');
} finally {
  await browser.close();
}
