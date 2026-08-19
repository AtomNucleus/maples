import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const baseUrl='http://127.0.0.1:4173';
const env={...process.env,MAPLES_TEST_BASE_URL:baseUrl};
function run(c,a){return new Promise((res,rej)=>{const p=spawn(c,a,{stdio:'inherit',env,shell:false});p.on('error',rej);p.on('exit',code=>code===0?res():rej(new Error(`${c} ${a.join(' ')} failed ${code}`)));});}
async function waitServer(){for(let i=0;i<100;i++){try{const r=await fetch(baseUrl,{signal:AbortSignal.timeout(900)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('preview unavailable');}
await run('npm',['run','build']);await run('npx',['playwright-core','install','chromium']);
const preview=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173'],{stdio:'inherit',env,shell:false,detached:true});let browser;
try{await waitServer();browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});const page=await browser.newPage({viewport:{width:1280,height:720}});await page.goto(baseUrl,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('#enter-btn')?.dataset.ready==='true',null,{timeout:30000});await page.locator('#enter-btn').click();await page.waitForTimeout(150);await page.evaluate(()=>{const g=window.__MAPLES_GAME__;g._updateEnemies=()=>{};g._updateEncounter=()=>{};for(const e of g.enemies)e.root.visible=false;});
async function reset(){await page.evaluate(()=>{const g=window.__MAPLES_GAME__;g.cameraYaw=Math.PI;g.player.setPosition(0,0,0);g.player.velocity.set(0,0,0);g.player.state='idle';g.player.stateTime=0;g.player.facing=Math.PI;g.player.root.rotation.y=Math.PI;});await page.waitForTimeout(80);}
async function move(key,predicate,label){await reset();await page.keyboard.down(key);await page.waitForFunction(predicate,null,{timeout:10000});const s=await page.evaluate(()=>{const p=window.__MAPLES_GAME__.player;const yaw=p.facing+(p.assetVisual?.rotation.y||0);return{x:p.position.x,z:p.position.z,animation:p.assetAnimator?.key,visualForward:{x:Math.sin(yaw),z:Math.cos(yaw)},assetYaw:p.assetVisual?.rotation.y??null};});await page.keyboard.up(key);console.log(label,JSON.stringify(s));return s;}
let s=await move('KeyW',()=>window.__MAPLES_GAME__.player.position.z<-.5,'W');assert.ok(Math.abs(s.x)<.3);assert.ok(['walk','run'].includes(s.animation));assert.ok(s.visualForward.z<-.85,`W visual ${JSON.stringify(s.visualForward)}`);
s=await move('KeyD',()=>window.__MAPLES_GAME__.player.position.x>.5,'D');assert.ok(Math.abs(s.z)<.35);
s=await move('KeyA',()=>window.__MAPLES_GAME__.player.position.x<-.5,'A');assert.ok(Math.abs(s.z)<.35);
console.log('netlify-stage: desktop-direction PASS');}
finally{await browser?.close();try{process.kill(-preview.pid,'SIGTERM');}catch{preview.kill('SIGTERM');}}
