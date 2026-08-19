import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const baseUrl='http://127.0.0.1:4173';
const env={...process.env,MAPLES_TEST_BASE_URL:baseUrl};
function run(c,a){return new Promise((res,rej)=>{const p=spawn(c,a,{stdio:'inherit',env,shell:false});p.on('error',rej);p.on('exit',code=>code===0?res():rej(new Error(`${c} failed ${code}`)));});}
async function waitServer(){for(let i=0;i<80;i++){try{const r=await fetch(baseUrl,{signal:AbortSignal.timeout(900)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('preview unavailable');}
function displacement(a,b){const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;return{x:dx/len,z:dz/len,distance:Math.hypot(dx,dz)};}
await run('npm',['run','build']);await run('npx',['playwright-core','install','chromium']);
const preview=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173'],{stdio:'inherit',env,shell:false,detached:true});let browser;
try{await waitServer();browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});const page=await browser.newPage({viewport:{width:1280,height:720}});await page.goto(baseUrl,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('#enter-btn')?.dataset.ready==='true',null,{timeout:25000});await page.locator('#enter-btn').click();await page.waitForTimeout(180);await page.evaluate(()=>{const g=window.__MAPLES_GAME__;g._updateEnemies=()=>{};g._updateEncounter=()=>{};for(const e of g.enemies)e.root.visible=false;});
async function reset(){await page.evaluate(()=>{const g=window.__MAPLES_GAME__;g.cameraYaw=Math.PI;g.player.setPosition(0,0,0);g.player.velocity.set(0,0,0);g.player.state='idle';g.player.stateTime=0;g.player.facing=Math.PI;g.player.root.rotation.y=Math.PI;});await page.waitForTimeout(80);}
async function sample(){return page.evaluate(()=>({x:window.__MAPLES_GAME__.player.position.x,z:window.__MAPLES_GAME__.player.position.z,animation:window.__MAPLES_GAME__.player.assetAnimator?.key??null}));}
await reset();let before=await sample();await page.keyboard.down('KeyW');await page.waitForTimeout(520);await page.keyboard.up('KeyW');await page.waitForTimeout(90);let after=await sample();let d=displacement(before,after);assert.ok(d.distance>1.25);assert.ok(d.z<-.92&&Math.abs(d.x)<.2,`W ${JSON.stringify(d)}`);assert.ok(['walk','run'].includes(after.animation),`anim ${after.animation}`);
await reset();before=await sample();await page.keyboard.down('KeyD');await page.waitForTimeout(420);await page.keyboard.up('KeyD');await page.waitForTimeout(80);after=await sample();d=displacement(before,after);assert.ok(d.distance>.9);assert.ok(d.x>.9&&Math.abs(d.z)<.3,`D ${JSON.stringify(d)}`);
await reset();before=await sample();await page.keyboard.down('KeyA');await page.waitForTimeout(420);await page.keyboard.up('KeyA');await page.waitForTimeout(80);after=await sample();d=displacement(before,after);assert.ok(d.x<-.9&&Math.abs(d.z)<.3,`A ${JSON.stringify(d)}`);console.log('netlify-stage: desktop-movement PASS');}
finally{await browser?.close();try{process.kill(-preview.pid,'SIGTERM');}catch{preview.kill('SIGTERM');}}
