import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.MAPLES_TEST_BASE_URL || 'http://127.0.0.1:4173';
let previewProcess = null;

async function isServerUp() {
  try { return (await fetch(baseUrl, { signal: AbortSignal.timeout(900) })).ok; }
  catch { return false; }
}

async function ensurePreview() {
  if (await isServerUp()) return;
  if (!fs.existsSync('dist/index.html')) execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
  const url = new URL(baseUrl);
  previewProcess = spawn('npm', ['run', 'preview', '--', '--host', url.hostname, '--port', url.port || '4173'], { stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 100; i++) {
    if (await isServerUp()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Could not start Vite preview for narrow HUD test');
}

await ensurePreview();
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});

try {
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__MAPLES_GAME__));

  const layout = await page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r ? { x: r.x, width: r.width, right: r.right } : null;
    };
    return { topbar: rect('.topbar'), quest: rect('.quest'), viewport: innerWidth };
  });

  assert.ok(layout.topbar && layout.quest, 'top HUD panels must exist at 320px');
  assert.ok(layout.topbar.x >= 0, 'character HUD must stay inside the left viewport edge');
  assert.ok(layout.quest.right <= layout.viewport, 'quest HUD must stay inside the right viewport edge');
  assert.ok(layout.topbar.right + 6 <= layout.quest.x,
    `320px HUD panels must keep at least a 6px gap; got ${JSON.stringify(layout)}`);

  console.log('hud-narrow-e2e: PASS', JSON.stringify(layout));
  await context.close();
} finally {
  await browser.close();
  if (previewProcess) previewProcess.kill('SIGTERM');
}
