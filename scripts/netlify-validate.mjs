import { spawn } from 'node:child_process';

const baseUrl = 'http://127.0.0.1:4173';
const env = { ...process.env, MAPLES_TEST_BASE_URL: baseUrl };

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: options.env || env,
      shell: false,
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function waitForPreview() {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(900) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Vite preview did not become ready');
}

console.log('Netlify validation: production build');
await run('npm', ['run', 'build']);

console.log('Netlify validation: install Playwright Chromium locally in the build environment');
await run('npx', ['playwright', 'install', 'chromium']);

console.log('Netlify validation: launch production preview');
const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
  stdio: 'inherit',
  env,
  shell: false,
});

try {
  await waitForPreview();
  console.log('Netlify validation: movement regressions');
  await run('npm', ['run', 'test:movement']);
  console.log('Netlify validation: visual/gameplay smoke regressions');
  await run('npm', ['run', 'test:visual']);
  console.log('Netlify validation: PASS');
} finally {
  preview.kill('SIGTERM');
}
