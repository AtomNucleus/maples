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
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensurePreview() {
  if (await isServerUp()) return;
  if (!fs.existsSync(path.resolve('dist/index.html'))) execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
  const url = new URL(baseUrl);
  previewProcess = spawn('npm', ['run', 'preview', '--', '--host', url.hostname, '--port', url.port || '4173'], { stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 60; i++) {
    if (await isServerUp()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Could not start Vite preview for movement tests');
}

async function readyGame(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__MAPLES_GAME__));
  await page.waitForFunction(() => document.querySelector('#enter-btn')?.dataset.ready === 'true', null, { timeout: 25000 });
  await page.locator('#enter-btn').click();
  await page.waitForTimeout(180);
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
      x: p.position.x,
      z: p.position.z,
      facing: p.facing,
      assetRotationY: p.assetVisual?.rotation.y ?? null,
      visualForward: { x: Math.sin(visualYaw), z: Math.cos(visualYaw) },
      animation: p.assetAnimator?.key ?? null,
    };
  });
}

function displacement(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len, distance: Math.hypot(dx, dz) };
}
function dot(a, b) { return a.x * b.x + a.z * b.z; }
async function waitForDistance(page, from, distance, timeout = 5000) {
  await page.waitForFunction(({ x, z, distance }) => {
    const p = window.__MAPLES_GAME__.player.position;
    return Math.hypot(p.x - x, p.z - z) >= distance;
  }, { x: from.x, z: from.z, distance }, { timeout });
}

await ensurePreview();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const report = { desktop: {}, mobile: {} };
try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await desktop.newPage();
  await readyGame(page);

  await resetMovement(page);
  let before = await samplePlayer(page);
  await page.keyboard.down('KeyW');
  await waitForDistance(page, before, 1.35);
  let after = await samplePlayer(page);
  await page.keyboard.up('KeyW');
  let d = displacement(before, after);
  report.desktop.forward = { before, after, displacement: d };
  assert.ok(d.z < -0.92 && Math.abs(d.x) < .2, `W should move away from the camera at yaw PI, got (${d.x.toFixed(3)}, ${d.z.toFixed(3)})`);
  assert.ok(dot(d, after.visualForward) > .9, 'hero visual must face the same direction it is moving');
  assert.ok(Math.abs(after.assetRotationY ?? 99) < .08, `Rowan visual yaw drifted too far from +Z: ${after.assetRotationY}`);
  assert.ok(['walk', 'run'].includes(after.animation), `forward movement should play walk/run, got ${after.animation}`);

  await resetMovement(page);
  before = await samplePlayer(page);
  await page.keyboard.down('KeyD');
  await waitForDistance(page, before, 1.0);
  after = await samplePlayer(page);
  await page.keyboard.up('KeyD');
  d = displacement(before, after);
  report.desktop.right = { before, after, displacement: d };
  assert.ok(d.x > .9 && Math.abs(d.z) < .3, `D should move screen-right at yaw PI, got (${d.x.toFixed(3)}, ${d.z.toFixed(3)})`);

  await resetMovement(page);
  before = await samplePlayer(page);
  await page.keyboard.down('KeyA');
  await waitForDistance(page, before, 1.0);
  after = await samplePlayer(page);
  await page.keyboard.up('KeyA');
  d = displacement(before, after);
  report.desktop.left = { before, after, displacement: d };
  assert.ok(d.x < -.9 && Math.abs(d.z) < .3, `A should move screen-left at yaw PI, got (${d.x.toFixed(3)}, ${d.z.toFixed(3)})`);
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const mp = await mobile.newPage();
  await readyGame(mp);
  const joystick = mp.locator('#joystick');
  const box = await joystick.boundingBox();
  assert.ok(box, 'mobile joystick should be visible and measurable');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await resetMovement(mp);
  before = await samplePlayer(mp);
  await mp.mouse.move(cx, cy); await mp.mouse.down(); await mp.mouse.move(cx + box.width * .28, cy, { steps: 2 });
  await waitForDistance(mp, before, .9);
  after = await samplePlayer(mp); await mp.mouse.up();
  d = displacement(before, after);
  report.mobile.right = { before, after, displacement: d };
  assert.ok(d.x > .88 && Math.abs(d.z) < .35, `joystick-right should move screen-right, got (${d.x.toFixed(3)}, ${d.z.toFixed(3)})`);

  await resetMovement(mp);
  before = await samplePlayer(mp);
  await mp.mouse.move(cx, cy); await mp.mouse.down(); await mp.mouse.move(cx, cy - box.height * .28, { steps: 2 });
  await waitForDistance(mp, before, 1.1);
  after = await samplePlayer(mp); await mp.mouse.up();
  d = displacement(before, after);
  report.mobile.forward = { before, after, displacement: d };
  assert.ok(d.z < -.88 && Math.abs(d.x) < .35, `joystick-up should move camera-forward, got (${d.x.toFixed(3)}, ${d.z.toFixed(3)})`);
  assert.ok(dot(d, after.visualForward) > .9, 'hero visual must face joystick-forward movement');
  await mobile.close();

  fs.writeFileSync(path.join(out, 'movement-report.json'), JSON.stringify(report, null, 2));
  console.log('movement-e2e: PASS');
} finally {
  await browser.close();
  if (previewProcess) previewProcess.kill('SIGTERM');
}
