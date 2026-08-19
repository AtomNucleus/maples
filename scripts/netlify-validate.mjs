import { spawn } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = 'http://127.0.0.1:4173';
const env = { ...process.env, MAPLES_TEST_BASE_URL: baseUrl };
const report = { generatedAt: new Date().toISOString(), build: null, browserInstall: null, movement: null, visual: null };

function run(command, args, options = {}) {
  return new Promise(resolve => {
    const chunks = [];
    const child = spawn(command, args, {
      env: options.env || env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', data => { process.stdout.write(data); chunks.push(String(data)); });
    child.stderr.on('data', data => { process.stderr.write(data); chunks.push(String(data)); });
    child.on('error', error => resolve({ ok: false, code: -1, output: String(error) }));
    child.on('exit', code => resolve({ ok: code === 0, code, output: chunks.join('').slice(-12000) }));
  });
}

async function waitForPreview() {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(900) });
      if (response.ok) return true;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

console.log('Netlify validation diagnostic: production build');
report.build = await run('npm', ['run', 'build']);
if (!report.build.ok) {
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/validation.json', JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log('Netlify validation diagnostic: install Chromium with playwright-core');
report.browserInstall = await run('npx', ['playwright-core', 'install', 'chromium']);

let preview = null;
if (report.browserInstall.ok) {
  preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
    stdio: 'inherit',
    env,
    shell: false,
  });
  if (await waitForPreview()) {
    console.log('Netlify validation diagnostic: movement regressions');
    report.movement = await run('npm', ['run', 'test:movement']);
    console.log('Netlify validation diagnostic: visual/gameplay smoke regressions');
    report.visual = await run('npm', ['run', 'test:visual']);
  } else {
    report.movement = { ok: false, code: -1, output: 'Vite preview did not become ready' };
    report.visual = { ok: false, code: -1, output: 'Vite preview did not become ready' };
  }
}

preview?.kill('SIGTERM');
report.pass = Boolean(report.build?.ok && report.browserInstall?.ok && report.movement?.ok && report.visual?.ok);
fs.writeFileSync('dist/validation.json', JSON.stringify(report, null, 2));
console.log(`Netlify validation diagnostic complete: ${report.pass ? 'PASS' : 'FAIL'}`);
