import { spawn } from 'node:child_process';

const baseUrl = 'http://127.0.0.1:4173';
const env = { ...process.env, MAPLES_TEST_BASE_URL: baseUrl };

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env, shell: false });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`)));
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

await run('npm', ['run', 'build']);
await run('npx', ['playwright-core', 'install', 'chromium']);
const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
  stdio: 'inherit', env, shell: false, detached: true,
});
try {
  await waitForPreview();
  await run('npm', ['run', 'test:movement']);
  console.log('netlify-stage: full-movement PASS');
} finally {
  try { process.kill(-preview.pid, 'SIGTERM'); } catch { preview.kill('SIGTERM'); }
}
