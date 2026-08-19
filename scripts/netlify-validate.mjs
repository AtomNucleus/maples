import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',env:process.env,shell:false});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));});}
await run('npm',['run','build']);
await run('npx',['playwright-core','install','chromium']);
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
await browser.close();
console.log('netlify-stage: chromium-launch PASS');
