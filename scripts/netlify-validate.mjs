import { spawn } from 'node:child_process';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env, shell: false });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));
  });
}

await run('npm', ['run', 'build']);
await run('npx', ['playwright-core', 'install', 'chromium']);
console.log('netlify-stage: build+chromium PASS');
