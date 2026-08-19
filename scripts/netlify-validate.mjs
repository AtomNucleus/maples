import { spawn } from 'node:child_process';
import fs from 'node:fs';

function runCapture(command, args, env = process.env) {
  return new Promise(resolve => {
    const chunks = [];
    const child = spawn(command, args, { env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { process.stdout.write(data); chunks.push(String(data)); });
    child.stderr.on('data', data => { process.stderr.write(data); chunks.push(String(data)); });
    child.on('error', error => resolve({ ok: false, code: -1, output: String(error) }));
    child.on('exit', code => resolve({ ok: code === 0, code, output: chunks.join('').slice(-20000) }));
  });
}

const report = { generatedAt: new Date().toISOString() };
report.build = await runCapture('npm', ['run', 'build']);
if (report.build.ok) report.chromium = await runCapture('npx', ['playwright-core', 'install', 'chromium']);
if (report.build.ok && report.chromium?.ok) {
  report.movement = await runCapture('npm', ['run', 'test:movement'], { ...process.env, MAPLES_TEST_BASE_URL: 'http://127.0.0.1:4173' });
}
report.pass = Boolean(report.build?.ok && report.chromium?.ok && report.movement?.ok);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/validation.json', JSON.stringify(report, null, 2));
console.log(`diagnostic movement result: ${report.pass ? 'PASS' : 'FAIL'}`);
