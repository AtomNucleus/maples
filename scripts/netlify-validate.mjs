import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const baseUrl='http://127.0.0.1:4173';
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',env:process.env,shell:false});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));});}
async function waitServer(){for(let i=0;i<80;i++){try{const r=await fetch(baseUrl,{signal:AbortSignal.timeout(900)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('preview unavailable');}
await run('npm',['run','build']);
await run('npx',['playwright-core','install','chromium']);
const preview=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173'],{stdio:'inherit',env:process.env,shell:false,detached:true});
let browser;
try{
  await waitServer();
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__MAPLES_GAME__));
  await page.waitForFunction(()=>document.querySelector('#enter-btn')?.dataset.ready==='true',null,{timeout:25000});
  const state=await page.evaluate(()=>({hero:Boolean(window.__MAPLES_GAME__.player.assetVisual),rotation:window.__MAPLES_GAME__.player.assetVisual?.rotation.y??null,failures:[...(window.__MAPLES_GAME__.assetVisualManager?.failures||[])]}));
  if(!state.hero||state.rotation!==0||state.failures.length)throw new Error(`boot state invalid ${JSON.stringify(state)}`);
  console.log('netlify-stage: game-boot PASS');
}finally{
  await browser?.close();
  try{process.kill(-preview.pid,'SIGTERM');}catch{preview.kill('SIGTERM');}
}
