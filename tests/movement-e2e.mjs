import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.MAPLES_TEST_BASE_URL || 'http://127.0.0.1:4173';
const out = path.resolve('artifacts');
fs.mkdirSync(out, { recursive: true });
let previewProcess = null;

async function isServerUp() {
  try { return (await fetch(baseUrl, { signal: AbortSignal.timeout(900) })).ok; }
  catch { return false; }
}

async function ensurePreview() {
  if (await isServerUp()) return;
  if (!fs.existsSync(path.resolve('dist/index.html'))) execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
  const url = new URL(baseUrl);
  previewProcess = spawn('npm', ['run', 'preview', '--', '--host', url.hostname, '--port', url.port || '4173'], { stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 100; i++) {
    if (await isServerUp()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Could not start Vite preview for movement tests');
}

async function readyGame(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__MAPLES_GAME__));
  await page.waitForFunction(() => document.querySelector('#enter-btn')?.dataset.ready === 'true', null, { timeout: 30000 });
  await page.locator('#enter-btn').click();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const g = window.__MAPLES_GAME__;
    g._updateEnemies = () => {};
    g._updateEncounter = () => {};
    for (const enemy of g.enemies) enemy.root.visible = false;
  });
}

async function resetMovement(page) {
  await page.evaluate(() => {
    const g = window.__MAPLES_GAME__;
    g.cameraYaw = Math.PI;
    g.cameraPitch = .28;
    g.player.setPosition(0, 0, 0);
    g.player.velocity.set(0, 0, 0);
    g.player.state = 'idle';
    g.player.stateTime = 0;
    g.player.facing = Math.PI;
    g.player.root.rotation.y = Math.PI;
  });
  await page.waitForTimeout(80);
}

async function samplePlayer(page) {
  return page.evaluate(() => {
    const p = window.__MAPLES_GAME__.player;
    const visualYaw = p.facing + (p.assetVisual?.rotation.y || 0);
    return {
      x: p.position.x, z: p.position.z, facing: p.facing,
      assetRotationY: p.assetVisual?.rotation.y ?? null,
      visualForward: { x: Math.sin(visualYaw), z: Math.cos(visualYaw) },
      animation: p.assetAnimator?.key ?? null,
    };
  });
}

function displacement(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len, distance: Math.hypot(dx, dz) };
}
function dot(a, b) { return a.x * b.x + a.z * b.z; }
function boxHealth(box) { return box && box.width > 0 && box.height > 0; }
async function waitForDistance(page, from, distance = .45) {
  await page.waitForFunction(({ x, z, distance }) => {
    const p = window.__MAPLES_GAME__.player.position;
    return Math.hypot(p.x - x, p.z - z) >= distance;
  }, { x: from.x, z: from.z, distance }, { timeout: 15000 });
}

await ensurePreview();
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const report = { desktop: {}, mobile: {} };

try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await desktop.newPage();
  await readyGame(page);

  report.desktop.ui = await page.evaluate(() => {
    const rect = selector => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    return {
      topbar: rect('.topbar'),
      quest: rect('.quest'),
      skills: rect('.skills'),
      questCopyDisplay: getComputedStyle(document.querySelector('.quest-copy')).display,
      persistentHelpExists: Boolean(document.querySelector('.help')),
    };
  });
  assert.ok(boxHealth(report.desktop.ui.topbar) && report.desktop.ui.topbar.width <= 270, 'desktop character HUD must stay compact');
  assert.ok(boxHealth(report.desktop.ui.quest) && report.desktop.ui.quest.width <= 245, 'desktop quest HUD must stay compact');
  assert.ok(boxHealth(report.desktop.ui.skills) && report.desktop.ui.skills.width <= 200, 'desktop ability bar must stay compact');
  assert.equal(report.desktop.ui.questCopyDisplay, 'none', 'long quest copy must stay out of the persistent HUD');
  assert.equal(report.desktop.ui.persistentHelpExists, false, 'persistent gameplay help pill should not return');

  await resetMovement(page);
  let before = await samplePlayer(page);
  await page.keyboard.down('KeyW'); await waitForDistance(page, before); let after = await samplePlayer(page); await page.keyboard.up('KeyW');
  let d = displacement(before, after); report.desktop.forward = { before, after, displacement: d };
  assert.ok(d.z < -.92 && Math.abs(d.x) < .2, `W should move camera-forward, got ${JSON.stringify(d)}`);
  assert.ok(dot(d, after.visualForward) > .9, 'hero visual must face forward movement');
  assert.equal(after.assetRotationY, 0, 'Rowan visual must not be locally rotated 180 degrees');
  assert.ok(['walk', 'run'].includes(after.animation), `forward movement should play walk/run, got ${after.animation}`);

  await resetMovement(page);
  before = await samplePlayer(page);
  await page.keyboard.down('KeyD'); await waitForDistance(page, before); after = await samplePlayer(page); await page.keyboard.up('KeyD');
  d = displacement(before, after); report.desktop.right = { before, after, displacement: d };
  assert.ok(d.x > .9 && Math.abs(d.z) < .3, `D should move screen-right, got ${JSON.stringify(d)}`);

  await resetMovement(page);
  before = await samplePlayer(page);
  await page.keyboard.down('KeyA'); await waitForDistance(page, before); after = await samplePlayer(page); await page.keyboard.up('KeyA');
  d = displacement(before, after); report.desktop.left = { before, after, displacement: d };
  assert.ok(d.x < -.9 && Math.abs(d.z) < .3, `A should move screen-left, got ${JSON.stringify(d)}`);

  await page.evaluate(() => {
    const g = window.__MAPLES_GAME__;
    g.cameraPitch = .28;
    g.input.mouseDY = -60;
  });
  await page.waitForTimeout(80);
  report.desktop.lookUpPitch = await page.evaluate(() => window.__MAPLES_GAME__.cameraPitch);
  assert.ok(report.desktop.lookUpPitch < .28, `mouse up must look up by lowering orbit pitch; got ${report.desktop.lookUpPitch}`);

  await page.evaluate(() => {
    const g = window.__MAPLES_GAME__;
    g.cameraPitch = .28;
    g.input.mouseDY = 60;
  });
  await page.waitForTimeout(80);
  report.desktop.lookDownPitch = await page.evaluate(() => window.__MAPLES_GAME__.cameraPitch);
  assert.ok(report.desktop.lookDownPitch > .28, `mouse down must look down by raising orbit pitch; got ${report.desktop.lookDownPitch}`);
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const mp = await mobile.newPage();
  await readyGame(mp);

  report.mobile.ui = await mp.evaluate(() => {
    const rect = selector => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    return {
      topbar: rect('.topbar'),
      quest: rect('.quest'),
      joystick: rect('#joystick'),
      actions: rect('.mobile-actions'),
      questCopyDisplay: getComputedStyle(document.querySelector('.quest-copy')).display,
    };
  });
  assert.ok(boxHealth(report.mobile.ui.topbar) && report.mobile.ui.topbar.height <= 66, 'mobile character HUD must stay shallow');
  assert.ok(boxHealth(report.mobile.ui.quest) && report.mobile.ui.quest.height <= 70, 'mobile quest HUD must stay shallow');
  assert.ok(report.mobile.ui.topbar.right < report.mobile.ui.quest.x, 'mobile top HUD panels must not overlap');
  assert.equal(report.mobile.ui.questCopyDisplay, 'none', 'mobile persistent HUD must hide long quest copy');
  assert.ok(report.mobile.ui.joystick.bottom <= 844 && report.mobile.ui.actions.bottom <= 844, 'mobile controls must fit the viewport');

  const joystick = mp.locator('#joystick');
  const box = await joystick.boundingBox();
  assert.ok(box, 'mobile joystick should be visible');
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  await resetMovement(mp);
  before = await samplePlayer(mp);
  await mp.mouse.move(cx, cy); await mp.mouse.down(); await mp.mouse.move(cx + box.width * .28, cy, { steps: 3 });
  await waitForDistance(mp, before); after = await samplePlayer(mp); await mp.mouse.up();
  d = displacement(before, after); report.mobile.right = { before, after, displacement: d };
  assert.ok(d.x > .88 && Math.abs(d.z) < .35, `joystick-right should move screen-right, got ${JSON.stringify(d)}`);

  await resetMovement(mp);
  before = await samplePlayer(mp);
  await mp.mouse.move(cx, cy); await mp.mouse.down(); await mp.mouse.move(cx, cy - box.height * .28, { steps: 3 });
  await waitForDistance(mp, before); after = await samplePlayer(mp); await mp.mouse.up();
  d = displacement(before, after); report.mobile.forward = { before, after, displacement: d };
  assert.ok(d.z < -.88 && Math.abs(d.x) < .35, `joystick-up should move camera-forward, got ${JSON.stringify(d)}`);
  assert.ok(dot(d, after.visualForward) > .9, 'hero visual must face joystick-forward movement');

  await mp.setViewportSize({ width: 320, height: 568 });
  await mp.waitForTimeout(120);
  report.mobile.narrowUi = await mp.evaluate(() => {
    const rect = selector => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, width: r.width, height: r.height, right: r.right };
    };
    return { topbar: rect('.topbar'), quest: rect('.quest'), viewport: innerWidth };
  });
  assert.ok(boxHealth(report.mobile.narrowUi.topbar) && boxHealth(report.mobile.narrowUi.quest), '320px top HUD panels must remain measurable');
  assert.ok(report.mobile.narrowUi.topbar.x >= 0, '320px character HUD must stay inside the left viewport edge');
  assert.ok(report.mobile.narrowUi.quest.right <= report.mobile.narrowUi.viewport, '320px quest HUD must stay inside the right viewport edge');
  assert.ok(report.mobile.narrowUi.topbar.right + 6 <= report.mobile.narrowUi.quest.x,
    `320px HUD panels must keep at least a 6px gap; got ${JSON.stringify(report.mobile.narrowUi)}`);
  await mobile.close();

  fs.writeFileSync(path.join(out, 'movement-report.json'), JSON.stringify(report, null, 2));
  console.log('movement-e2e: PASS');
} finally {
  await browser.close();
  if (previewProcess) previewProcess.kill('SIGTERM');
}
