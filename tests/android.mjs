// Device regression checks using real touches, app switching and the hardware back key.
// Saved state is backed up and restored even if a check fails. Requires an installed debug APK.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const ADB=process.env.ADB||`${process.env.ANDROID_SDK_ROOT||'/home/user1/android-sdk'}/platform-tools/adb`;
const adb=(...a)=>execFileSync(ADB,a,{encoding:'utf8',maxBuffer:1<<26});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('test-results/android',{recursive:true});
async function attach(){
 let sock='';for(let i=0;i<40&&!sock;i++){const pid=adb('shell','pidof','org.arcquest.game').trim().split(/\s+/)[0],name='webview_devtools_remote_'+pid;sock=pid&&adb('shell','cat','/proc/net/unix').includes(name)?name:'';if(!sock)await sleep(250);}
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
const wait=async(predicate,ms=20000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await evaluate(predicate).catch(()=>false))return;await sleep(40);}throw Error('Timed out: '+predicate);};
const rect=async selector=>{const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getClientRects()[0];return{x:r.x,y:r.y,w:r.width,h:r.height}})()`);assert.ok(r,'missing '+selector);return r;};
const dpr=await evaluate('devicePixelRatio');
const tapAt=(x,y)=>adb('shell','input','tap',String(Math.round(x*dpr)),String(Math.round(y*dpr)));
const tap=async selector=>{const r=await rect(selector);tapAt(r.x+r.w/2,r.y+r.h/2);};
const scrollTap=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await sleep(150);await tap(selector);};
const swipeAt=(x1,y1,x2,y2,ms=120)=>adb('shell','input','swipe',...[x1,y1,x2,y2].map(v=>String(Math.round(v*dpr))),String(ms));
const shot=async file=>{await sleep(250);writeFileSync(file,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));};
const actions=()=>evaluate("Number(document.querySelector('#actions').textContent)");
const last=game=>evaluate(`JSON.parse(localStorage.getItem('arc-run-v2')).games[${JSON.stringify(game)}].history.at(-1)`);
await wait("!document.querySelector('#home').hidden",120000);
const backup=await evaluate('JSON.stringify(Object.fromEntries(Object.entries(localStorage)))');
writeFileSync('test-results/android/saved-state-backup.json',backup);
const report={device:adb('shell','getprop','ro.product.model').trim(),viewport:await evaluate('[innerWidth,innerHeight]'),checks:[]};
try{
 await evaluate("localStorage.setItem('arc-settings',JSON.stringify({onboarded:true,mode:'sandbox',sound:false,haptic:true}))");
 ws.close();({ws,send}=await launchApp());
 await wait("!document.querySelector('#home').hidden",120000);assert.equal(await evaluate("document.querySelector('#launch-start')"),null);await sleep(600);
 await scrollTap('button[data-mode="sandbox"]');
 report.startup=await evaluate('({menuReadyMs:arcMetrics.boot.menuReadyMs,engineStillLoading:arcMetrics.boot.readyMs==null})');
 assert.equal(await evaluate("document.querySelector('.theme-toggle')"),null);report.checks.push('light-only settings');
 await tap('#sandbox-help');await wait("document.querySelector('#detail-title').textContent==='Sandbox'");adb('shell','input','keyevent','KEYCODE_BACK');await wait("!document.querySelector('#home').hidden");
 await scrollTap('[data-game="ls20"]');await wait("!document.querySelector('#detail').hidden");await tap('[data-level="2"]');await wait("!document.querySelector('#game').hidden",120000);await sleep(400);
 assert.equal(await evaluate("document.querySelector('#target-value').textContent"),'73');await tap('[data-action="4"]');await wait("document.querySelector('#actions').textContent==='1'");
 await tap('[data-action="0"]');await wait("document.querySelector('#overlay-title')?.textContent==='Restart level?'");await tap('#keep-playing');await wait("!document.querySelector('#game').hidden");assert.equal(await actions(),1);
 await tap('[data-action="0"]');await wait("document.querySelector('#game-dialog').open");await tap('#do-retry');await wait("document.querySelector('#actions').textContent==='0'");report.checks.push('sandbox level entry and confirmed/cancelled trash actions');
 assert.equal(await evaluate("document.querySelector('#mode-badge').hidden"),true);
 await sleep(400);
 const before=await evaluate("({board:document.querySelector('#board').toDataURL(),width:innerWidth,height:innerHeight,rect:JSON.stringify(document.querySelector('#board').getBoundingClientRect())})");
 adb('shell','am','start','-a','android.settings.SETTINGS');await sleep(1200);await foreground();await sleep(1200);
 const after=await evaluate("({board:document.querySelector('#board').toDataURL(),width:innerWidth,height:innerHeight,rect:JSON.stringify(document.querySelector('#board').getBoundingClientRect())})");assert.deepEqual(after,before);report.checks.push('app switching preserves board pixels and layout');await shot('test-results/android/revised-game.png');
 adb('shell','input','keyevent','KEYCODE_BACK');await wait("!document.querySelector('#detail').hidden&&document.querySelector('#detail-title').textContent==='LS20'");await shot('test-results/android/revised-picker.png');
 adb('shell','input','keyevent','KEYCODE_BACK');await wait("!document.querySelector('#home').hidden");report.checks.push('hardware back: game, level picker, home');
 await tap('#about');await wait("document.querySelector('#detail-title').textContent==='How it works'");await shot('test-results/android/revised-info.png');
 await scrollTap('#show-credits');await wait("document.querySelector('.credits-copy')&&!document.querySelector('.credits-copy').hasAttribute('aria-busy')");
 swipeAt(180,620,180,230,450);await sleep(900);assert.ok(await evaluate("document.querySelector('#detail-body').scrollTop>0"),'Credits scrolls with a real swipe');
 await scrollTap('a[href="./licenses/ARC-MIT.txt"]');await wait("document.querySelector('.license-copy')?.textContent.includes('MIT License')");
 adb('shell','input','keyevent','KEYCODE_BACK');await wait("document.querySelector('#detail-title').textContent==='Credits & licenses'");
 await tap('#detail-back');await wait("document.querySelector('#detail-title').textContent==='How it works'");
 await scrollTap('#replay-intro');await wait("!document.querySelector('#onboarding').hidden");
 await tap('#onboard-next');await sleep(350);await tap('#onboard-next');await wait("!!document.querySelector('.art-score')");await sleep(1600);await shot('test-results/android/revised-intro-score.png');
 assert.ok(await evaluate("(()=>{const bars=[...document.querySelectorAll('.bar-row b')];return bars[1].offsetWidth>bars[0].offsetWidth})()"));
 await tap('#onboard-next');await wait("!!document.querySelector('#intro-go')");await tap('#intro-go');await wait("!document.querySelector('#home').hidden");
 report.checks.push('credits touch scrolling, nested license back navigation, optional intro and efficiency bars');
 await tap('button[data-mode="run"]');await sleep(600);const enabled=await evaluate("[...document.querySelectorAll('.game-card:not(:disabled)')].map(e=>e.dataset.game)");report.enabledBenchmarkCards=enabled;await shot('test-results/android/revised-benchmark.png');
 report.startup.engineReadyMs=await evaluate('arcMetrics.boot.readyMs');
 report.errors=await evaluate('arcMetrics.errors');assert.deepEqual(report.errors,[]);report.checks.push('full info page and sequential benchmark menu');report.passed=true;
 writeFileSync('test-results/android-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){
 await shot('test-results/android/failure.png');
 writeFileSync('test-results/android/failure.json',JSON.stringify(await evaluate("({title:document.querySelector('#detail-title').textContent,body:document.querySelector('#detail-body').textContent,url:location.href,errors:arcMetrics.errors})"),null,2));
 throw error;
}finally{
 await evaluate(`localStorage.clear();for(const [key,value] of Object.entries(${backup}))localStorage.setItem(key,value)`);
 ws.close();
 adb('shell','am','force-stop','org.arcquest.game');adb('shell','am','start','-n','org.arcquest.game/.MainActivity');
}
