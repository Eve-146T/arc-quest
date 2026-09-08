// Real-device sweep. Every one of the 25 games is opened from the home grid (benchmark run) and driven
// with real Android touches (`adb shell input`), while CDP only observes the page. Then the launch
// screen, intro, sandbox level entry and the hardware back key are checked the same way. Requires a
// debuggable build (ARC_DEBUG=1 scripts/build-android.sh) installed on a USB-connected phone.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const ADB=process.env.ADB||`${process.env.ANDROID_SDK_ROOT||'/home/user1/android-sdk'}/platform-tools/adb`;
const adb=(...a)=>execFileSync(ADB,a,{encoding:'utf8',maxBuffer:1<<26});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('test-results/android',{recursive:true});
async function attach(){
 let sock='';for(let i=0;i<40&&!sock;i++){sock=(adb('shell','cat','/proc/net/unix').match(/webview_devtools_remote_\d+/)||[''])[0];if(!sock)await sleep(250);}
 assert.ok(sock,'WebView is not inspectable: install a debug build');adb('forward','tcp:9223','localabstract:'+sock);
 let target;for(let i=0;i<40&&!target;i++){try{target=(await(await fetch('http://localhost:9223/json')).json()).find(x=>x.type==='page'&&/ARC Quest/.test(x.title));}catch{}if(!target)await sleep(250);}
 assert.ok(target,'No ARC Quest page');
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 return {ws,send};
}
// The phone may be shared: if another app took the screen, bring ARC Quest back (its WebView survives).
const foreground=async()=>{const top=adb('shell','dumpsys','activity','activities').split('\n').find(l=>/topResumedActivity/.test(l))||'';if(!/org\.arcquest\.game/.test(top)){adb('shell','am','start','-n','org.arcquest.game/.MainActivity');await sleep(1200);return true;}return false;};
const launchApp=async()=>{adb('shell','am','force-stop','org.arcquest.game');adb('shell','am','start','-n','org.arcquest.game/.MainActivity');await sleep(2500);return attach();};
let {ws,send}=await launchApp();
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=async(predicate,ms=20000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await evaluate(predicate))return;await sleep(40);}throw Error('Timed out: '+predicate);};
const rect=async selector=>{const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()`);assert.ok(r,'missing '+selector);return r;};
const dpr=await evaluate('devicePixelRatio');
const tapAt=(x,y)=>adb('shell','input','tap',String(Math.round(x*dpr)),String(Math.round(y*dpr)));
const tap=async selector=>{const r=await rect(selector);tapAt(r.x+r.w/2,r.y+r.h/2);};
const scrollTap=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await sleep(150);await tap(selector);};
const swipeAt=(x1,y1,x2,y2,ms=120)=>adb('shell','input','swipe',...[x1,y1,x2,y2].map(v=>String(Math.round(v*dpr))),String(ms));
const shot=async file=>writeFileSync(file,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
const actions=()=>evaluate("Number(document.querySelector('#actions').textContent)");
const last=game=>evaluate(`JSON.parse(localStorage.getItem('arc-run-v2')).games[${JSON.stringify(game)}].history.at(-1)`);
const report={device:adb('shell','getprop','ro.product.model').trim(),android:adb('shell','getprop','ro.build.version.release').trim(),viewport:await evaluate('[innerWidth,innerHeight]'),dpr,games:[],errors:[]};
try{
 // Fresh state, first launch: launch screen, the intro, and picking the benchmark mode with real taps.
 await evaluate("localStorage.clear();location.reload()");await sleep(2500);
 await wait("!document.querySelector('#launch').hidden");await evaluate("window.addEventListener('error',e=>arcMetrics.errors.push('window: '+e.message))");
 const bootStart=Date.now();await shot('test-results/android/launch.png');
 await tap('#launch-start');await wait("!document.querySelector('#onboarding').hidden");await shot('test-results/android/intro.png');
 for(let i=0;i<3;i++){await tap('#onboard-next');await sleep(450);}
 await wait("document.querySelector('[data-pick=\"run\"]')");await tap('[data-pick="run"]');await wait("!document.querySelector('#home').hidden");
 await wait("document.querySelectorAll('.game-card').length===25");await shot('test-results/android/home.png');
 const games=await evaluate("[...document.querySelectorAll('.game-card')].map(b=>b.dataset.game)");
 const manifest=Object.fromEntries((await evaluate("fetch('./games.json').then(r=>r.json())")).map(g=>[g.id,g]));
 for(const game of games){
  const entry={game,available:manifest[game].actions,steps:[],ok:true};report.games.push(entry);
  const step=async(name,expect,fn)=>{await foreground();if(await evaluate("!document.querySelector('#game-over').hidden")){await tap('#game-over');await sleep(400);}const base=await actions();const t=Date.now();await fn();try{await wait(`Number(document.querySelector('#actions').textContent)===${base+expect.count}`,expect.count?6000:0);}catch{}await sleep(expect.count?60:400);const got=await actions()-base;const action=await last(game);const ok=got===expect.count&&(!expect.action||JSON.stringify(action)===JSON.stringify(expect.action));entry.steps.push({name,expected:expect,got,action,ms:Date.now()-t,ok});if(!ok)entry.ok=false;};
  await foreground();const opened=`!document.querySelector('#game').hidden&&document.querySelector('#playing-name').textContent==='${game.toUpperCase()}'`;
  let t0=Date.now();await scrollTap(`[data-game="${game}"]`);
  try{await wait(opened,120000);}catch(e){if(!await foreground())throw e;await wait("!document.querySelector('#home').hidden",5000).catch(()=>{});if(await evaluate("document.querySelector('#home').hidden"))await tap('#back');await wait("!document.querySelector('#home').hidden");t0=Date.now();await scrollTap(`[data-game="${game}"]`);await wait(opened,120000);entry.retried=true;}
  entry.openMs=Date.now()-t0;await sleep(400);
  if(report.games.length===1)report.firstOpenSinceLaunchMs=Date.now()-bootStart;
  const a=manifest[game].actions,b=await rect('#board'),cx=b.x+b.w/2,cy=b.y+b.h/2;
  for(const dir of [1,2,3,4])if(a.includes(dir))await step('dpad '+dir,{count:1,action:{id:dir}},()=>tap(`[data-action="${dir}"]`));
  if(a.includes(5))await step('action 5',{count:1,action:{id:5}},()=>tap('[data-action="5"]'));
  if(a.includes(7))await step('undo',{count:1,action:{id:7}},()=>tap('[data-action="7"]'));
  if(a.includes(3))await step('swipe left',{count:1,action:{id:3}},()=>swipeAt(cx,cy,cx-110,cy));
  if(a.includes(1))await step('swipe up',{count:1,action:{id:1}},()=>swipeAt(cx,cy,cx,cy-110));
  if(a.includes(4))await step('fast swipe right',{count:1,action:{id:4}},()=>swipeAt(cx,cy,cx+110,cy,50));
  if(!a.includes(1)&&a.includes(3))await step('vertical swipe ignored',{count:0},()=>swipeAt(cx,cy,cx,cy-110));
  if(a.includes(6)){await step('tap cell 10,20',{count:1,action:{id:6,x:10,y:20}},()=>tapAt(b.x+10.5/64*b.w,b.y+20.5/64*b.h));await step('tap cell 63,0',{count:1,action:{id:6,x:63,y:0}},()=>tapAt(b.x+63.5/64*b.w,b.y+.5/64*b.h));await step('long press is a click',{count:1,action:{id:6,x:32,y:32}},()=>swipeAt(cx,cy,cx,cy,700));}
  else await step('tap ignored without clicks',{count:0},()=>tapAt(cx,cy));
  if(a.includes(6)&&!a.some(d=>d<=4))await step('drag ignored',{count:0},()=>swipeAt(cx,cy,cx-110,cy));
  const burstPoint=a.some(d=>d<=4)?await(async()=>{const r=await rect(`[data-action="${a.find(d=>d<=4)}"]`);return{x:r.x+r.w/2,y:r.y+r.h/2};})():{x:cx,y:cy};
  await step('5 rapid taps',{count:5},async()=>{for(let i=0;i<5;i++)tapAt(burstPoint.x,burstPoint.y);await sleep(300);});
  await step('reset',{count:1,action:{id:0}},()=>tap('[data-action="0"]'));
  await shot(`test-results/android/${game}.png`);
  await foreground();await tap('#back');try{await wait("!document.querySelector('#home').hidden");}catch(e){if(!await foreground())throw e;await tap('#back');await wait("!document.querySelector('#home').hidden");}await sleep(200);
  const card=await evaluate(`document.querySelector('[data-game="${game}"]').className`);entry.card=card;if(!/active/.test(card))entry.ok=false;
  console.log(entry.ok?'PASS':'FAIL',game,`open ${entry.openMs}ms`,entry.steps.filter(s=>!s.ok).map(s=>`${s.name}: expected ${JSON.stringify(s.expected)} got ${s.got} ${JSON.stringify(s.action)}`).join('; '));
 }
 // Sandbox: switch mode, open a level from the picker, count attempt actions, reset is free.
 await tap('[data-mode="sandbox"]');await wait("document.querySelector('#hero').classList.contains('sandbox')");await shot('test-results/android/home-sandbox.png');
 await scrollTap('[data-game="ls20"]');await wait("document.querySelector('[data-level=\"2\"]')");await shot('test-results/android/level-picker.png');
 await tap('[data-level="2"]');await wait("!document.querySelector('#game').hidden",60000);await sleep(400);
 assert.equal(await evaluate("document.querySelector('#target-value').textContent"),'73');
 await tap('[data-action="4"]');await wait("Number(document.querySelector('#actions').textContent)===1");await tap('[data-action="0"]');await wait("Number(document.querySelector('#actions').textContent)===0");
 await shot('test-results/android/sandbox-game.png');report.sandbox='LS20 level 3 opened from the picker; attempt counter and free reset verified';
 // Hardware back: leaves the game, then leaves the app from the home grid.
 adb('shell','input','keyevent','KEYCODE_BACK');await wait("!document.querySelector('#home').hidden");
 report.errors=await evaluate('arcMetrics.errors');report.boot=await evaluate('arcMetrics.boot');
 adb('shell','input','keyevent','KEYCODE_BACK');await sleep(1200);report.backExits=!/org\.arcquest\.game/.test(adb('shell','dumpsys','activity','activities').split('\n').filter(l=>/topResumedActivity|ResumedActivity/.test(l)).join(' '));
 // Second launch with a saved state skips the intro and restores the mode.
 ({ws,send}=await launchApp());await wait("!document.querySelector('#launch').hidden");await tap('#launch-start');await wait("!document.querySelector('#home').hidden");report.secondLaunch='intro skipped, mode restored: '+await evaluate("document.querySelector('.mode-switch').dataset.mode");
 report.failed=report.games.filter(g=>!g.ok).map(g=>g.game);
 const latencies=report.games.flatMap(g=>g.steps.filter(s=>s.expected.count===1).map(s=>s.ms)).sort((a,b)=>a-b);report.inputToUpdateMs={median:latencies[latencies.length>>1],p95:latencies[Math.floor(latencies.length*.95)]};
 report.openMs={first:report.games[0].openMs,laterMedian:report.games.slice(1).map(g=>g.openMs).sort((a,b)=>a-b)[12],laterMax:Math.max(...report.games.slice(1).map(g=>g.openMs))};
 writeFileSync('test-results/android-report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({failed:report.failed,errors:report.errors,inputToUpdateMs:report.inputToUpdateMs,openMs:report.openMs,firstOpenSinceLaunchMs:report.firstOpenSinceLaunchMs,boot:report.boot,backExits:report.backExits,secondLaunch:report.secondLaunch}));
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);assert.ok(report.backExits,'back key should leave the app from home');
}finally{ws.close();}
