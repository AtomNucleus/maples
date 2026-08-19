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

  await context.close();
  console.log('VISUAL STAGE BOOT LOCOMOTION PASS');
} finally {
  await browser.close();
}
