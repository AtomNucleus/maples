import { spawn } from 'node:child_process';

const env = { ...process.env };

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env, shell: false });
    child.on('error', reject);
    child.on('exit', code => code === 0
      ? resolve()
      : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));
  });
}

await run('npm', ['run', 'build']);
await run('npm', ['run', 'test:movement:unit']);
console.log('MOVEMENT UNIT PASS');
