import { spawn } from 'node:child_process';
const baseUrl='http://127.0.0.1:4173';const env={...process.env,MAPLES_TEST_BASE_URL:baseUrl};
function run(c,a){return new Promise((res,rej)=>{const p=spawn(c,a,{stdio:'inherit',env,shell:false});p.on('error',rej);p.on('exit',code=>code===0?res():rej(new Error(`${c} ${a.join(' ')} exited ${code}`)));});}
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(baseUrl,{signal:AbortSignal.timeout(900)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('preview unavailable');}
await run('npm',['run','build']);await run('npx',['playwright-core','install','chromium']);const p=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173'],{stdio:'inherit',env,shell:false,detached:true});try{await ready();await run('npm',['run','test:movement']);console.log('FINAL MOVEMENT SUITE PASS');}finally{try{process.kill(-p.pid,'SIGTERM');}catch{p.kill('SIGTERM');}}
