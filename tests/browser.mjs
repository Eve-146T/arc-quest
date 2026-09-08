import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const BASE=process.env.BASE_URL||'http://localhost:4173';
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_PATH||'/home/user1/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await context.newPage(), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const solution=JSON.parse(await readFile('test-results/ft09-solution.json','utf8'));
const games=JSON.parse(await readFile('public/games.json','utf8'));
const diamonds=JSON.parse(await readFile('public/diamonds.json','utf8'));
const waitMotion=()=>page.waitForTimeout(650);
async function shot(name){await waitMotion();await page.screenshot({path:`test-results/${name}.png`});}
async function count(n){await expect(page.locator('#actions')).toHaveText(String(n));}
async function gameOpen(id){await expect(page.locator('#game')).toBeVisible({timeout:90000});await expect(page.locator('#playing-name')).toHaveText(id.toUpperCase());await waitMotion();}
async function home(){for(let i=0;i<5&&!(await page.locator('#home').isVisible());i++){await page.evaluate(()=>window.arcBack());}await expect(page.locator('#home')).toBeVisible();}
async function sandbox(id,level=0){await home();await page.click('button[data-mode="sandbox"]');await page.click(`[data-game="${id}"]`);await page.click(`[data-level="${level}"]`);await gameOpen(id);}
async function reload(){await page.reload();await page.click('#launch-start');await expect(page.locator('#home')).toBeVisible();}
async function swipe(dx,dy){const r=await page.locator('#board').boundingBox(),cdp=await context.newCDPSession(page),x=r.x+r.width/2,y=r.y+r.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
async function clickCell(a){const r=await page.locator('#board').boundingBox();await page.touchscreen.tap(r.x+(a.x+.5)/64*r.width,r.y+(a.y+.5)/64*r.height);}
try{
 await page.goto(BASE);await page.click('#launch-start');await expect(page.locator('#onboarding')).toBeVisible();
 for(let i=0;i<3;i++)await page.click('#onboard-next');await page.click('[data-pick="sandbox"]');
 await expect(page.locator('.mode-switch button').first()).toHaveText('SANDBOX');await expect(page.locator('#record')).toBeHidden();await expect(page.locator('.game-card')).toHaveCount(25);await shot('home-sandbox');
 console.log('CHECKPOINT', new Date().toISOString());
 // Icon states are visually distinct and persist.
 await expect(page.locator('.sound-toggle')).toHaveAttribute('aria-pressed','false');await page.click('.sound-toggle');await expect(page.locator('.sound-toggle')).toHaveAttribute('aria-pressed','true');
 await page.click('.haptic-toggle');await expect(page.locator('.haptic-toggle use')).toHaveAttribute('href','#vibrate-off');await reload();await expect(page.locator('.sound-toggle')).toHaveAttribute('aria-pressed','true');await expect(page.locator('.haptic-toggle')).toHaveAttribute('aria-pressed','false');await page.click('.sound-toggle');
 await page.click('#sandbox-help');await expect(page.locator('#detail-title')).toHaveText('Sandbox');assert.ok(!(await page.locator('#detail-body').textContent()).includes('Diamond'));await page.click('#detail-back');
 console.log('CHECKPOINT', new Date().toISOString());
 // Benchmarks permit only the next game; the percentage explicitly counts cleared levels.
 await page.click('button[data-mode="run"]');await expect(page.locator('.game-card:disabled')).toHaveCount(24);await expect(page.locator('.game-card .badge')).toHaveCount(0);await expect(page.locator('[data-game="ls20"]')).toBeEnabled();await expect(page.locator('#hero')).toContainText('% complete');
 await page.evaluate(()=>document.querySelector('[data-game="ft09"]').click());await expect(page.locator('#home')).toBeVisible();await page.click('#continue-run');await gameOpen('ls20');
 for(let i=1;i<=12;i++){await page.locator('[data-action="4"]').tap();await count(i);}
 await page.locator('[data-action="0"]').tap();await expect(page.locator('#detail-title')).toHaveText('Restart this level?');await count(12);await page.click('#keep-playing');await count(12);
 await page.keyboard.press('r');await page.click('#do-retry');await count(13);await swipe(-70,0);await count(14);
 await page.click('#mode-badge');await expect(page.locator('#detail-title')).toHaveText('Your scores');await page.click('#detail-back');await page.click('#live-score');await expect(page.locator('#detail-body')).toContainText('action-efficiency');await shot('scorecard');await page.click('#detail-back');await shot('game');await home();
 await reload();await page.click('#continue-run');await gameOpen('ls20');await count(14);await home();await expect(page.locator('#record')).toBeHidden();
 await page.click('#reset-run');await shot('reset-run');assert.notEqual(await page.locator('#keep-run').evaluate(e=>getComputedStyle(e).color),await page.locator('#keep-run').evaluate(e=>getComputedStyle(e).backgroundColor));await page.click('#keep-run');await expect(page.locator('#continue-run')).toContainText('CONTINUE');await page.click('#reset-run');await page.click('#do-reset');await expect(page.locator('#continue-run')).toContainText('START');await expect(page.locator('#record')).toBeHidden();
 console.log('CHECKPOINT', new Date().toISOString());
 // Mixed touch controls remain functional in sandbox; board swipes and taps stay distinct.
 await sandbox('dc22');await swipe(-70,0);await count(1);await swipe(0,70);await count(2);await clickCell({x:10,y:20});await count(3);await page.click('#mode-badge');await expect(page.locator('#detail-title')).toHaveText('Sandbox');await page.click('#detail-back');await count(3);
 console.log('CHECKPOINT', new Date().toISOString());
 // App-switch interruption cancels a gesture without adding an action.
 {const r=await page.locator('#board').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();}await count(3);
 await sandbox('bp35');await swipe(0,-70);await page.waitForTimeout(150);await count(0);await swipe(70,0);await count(1);
 console.log('CHECKPOINT', new Date().toISOString());
 // Sandbox gold/result pages, explicit retry, next level and level-picker back navigation.
 await sandbox('ls20',2);await expect(page.locator('#target-value')).toHaveText('73');await page.locator('[data-action="4"]').tap();await count(1);await page.locator('[data-action="0"]').tap();await page.click('#do-retry');await count(0);
 await sandbox('ft09');for(let i=0;i<solution.length;i++){if(await page.locator('#detail').isVisible())break;await clickCell(solution[i]);await count(i+1);}
 await expect(page.locator('#detail-title')).toHaveText('Gold!');await shot('sandbox-cleared');await expect(page.locator('#game')).toBeHidden();await page.click('#next');await gameOpen('ft09');await page.click('#back');await expect(page.locator('#detail-title')).toHaveText('FT09');await expect(page.locator('[data-level="0"]')).toHaveClass(/gold/);await shot('level-picker');await home();await expect(page.locator('[data-game="ft09"] .badge')).toHaveCount(0);await expect(page.locator('#sandbox-count')).toHaveText('1');
 console.log('CHECKPOINT', new Date().toISOString());
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('arc-sandbox-v1'));s.ls20={0:23,1:123};localStorage.setItem('arc-sandbox-v1',JSON.stringify(s));});await reload();await page.click('[data-game="ls20"]');
 await expect(page.locator('[data-level="0"]')).toContainText('22 actions for gold');await expect(page.locator('[data-level="1"]')).not.toContainText('actions for gold');await expect(page.locator('[data-level="2"]')).toContainText('Not Cleared');await expect(page.locator('[data-level="2"]')).not.toContainText('actions for gold');
 assert.ok(await page.locator('[data-level] img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth===64)));await home();
 // Fixture: LS20 is complete so FT09 is the next benchmark game. FT09 itself is played for real.
 await page.evaluate(()=>{localStorage.setItem('arc-run-v2',JSON.stringify({startedAt:Date.now(),lastGame:'ls20',games:{ls20:{history:[],summary:{state:'WIN',score:100,levels_completed:7,actions:0}}}}));localStorage.setItem('arc-settings',JSON.stringify({onboarded:true,mode:'run'}));});await reload();await expect(page.locator('[data-game="ft09"]')).toBeEnabled();await expect(page.locator('[data-game="vc33"]')).toBeDisabled();await page.click('#continue-run');await gameOpen('ft09');
 for(let i=0;i<solution.length;i++){await clickCell(solution[i]);await count(i+1);}
 await expect(page.locator('#detail-title')).toHaveText('Game complete!');await page.click('#see-run');await expect(page.locator('.score-big')).toContainText('100.0');
 const download=page.waitForEvent('download');await page.click('#export');await (await download).saveAs('test-results/exported-scorecard.json');const exported=JSON.parse(await readFile('test-results/exported-scorecard.json'));assert.equal(exported.currentRun.games.find(g=>g.game_id.startsWith('ft09')).current.actions,75);
 await page.click('#detail-back');await expect(page.locator('#detail-title')).toHaveText('Game complete!');await page.click('#go-home');await expect(page.locator('[data-game="vc33"]')).toBeEnabled();await expect(page.locator('#run-score')).toHaveText((13/183*100).toFixed(1));await expect(page.locator('#record')).toBeHidden();
 console.log('CHECKPOINT', new Date().toISOString());
 // A fully completed run alone reveals the record. Every sandbox gold reveals saved diamonds.
 await page.evaluate(({games,diamonds})=>{
 const practice=Object.fromEntries(games.map(g=>[g.id,Object.fromEntries(g.baseline.map((b,i)=>[i,Math.min(b,diamonds.games[g.id].recordActions[i]??b)]))]));localStorage.setItem('arc-sandbox-v1',JSON.stringify(practice));
 const summaries=Object.fromEntries(games.map(g=>[g.id,{history:[],summary:{state:'WIN',score:80,levels_completed:g.levels,actions:100}}]));localStorage.setItem('arc-run-v2',JSON.stringify({games:summaries,startedAt:Date.now()}));
 },{games,diamonds});await reload();await expect(page.locator('#record')).toBeVisible();await expect(page.locator('#best-score')).toHaveText('80.0%');if(await page.locator('#reset-run').count())await page.click('#reset-run');
 console.log('CHECKPOINT', new Date().toISOString());
 // No actions in synthetic complete fixture: save via run-complete flow.
 if(await page.locator('#detail').isVisible())await page.click('#keep-run');await page.click('#continue-run');await expect(page.locator('#detail-title')).toHaveText('Run complete!');await page.click('#archive-run');await expect(page.locator('#best-score')).toHaveText('80.0%');await page.click('button[data-mode="sandbox"]');await page.click('[data-game="ft09"]');await expect(page.locator('[data-level="0"]')).toHaveClass(/diamond/);await shot('diamond-picker');await home();
 console.log('CHECKPOINT', new Date().toISOString());
 // Narrow/landscape layout and full-page scrolling: fixed header, no sideways overflow.
 const layouts=[];
 for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[844,390],[768,1024],[1440,900]]){
  await page.setViewportSize({width,height});await shot(`home-${width}x${height}`);
  await page.click('[data-game="lf52"]');await waitMotion();const picker=await page.locator('#detail-body').evaluate(e=>({scroll:e.scrollHeight,height:e.clientHeight}));assert.ok(picker.scroll<=picker.height+1,`picker scroll ${width}x${height}: ${JSON.stringify(picker)}`);await shot(`picker-${width}x${height}`);await page.click('#detail-back');
  await page.click('#about');const before=await page.locator('#detail-back').boundingBox();await page.locator('#detail-body').evaluate(e=>e.scrollTop=9999);const after=await page.locator('#detail-back').boundingBox();assert.equal(before.y,after.y);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(`info-${width}x${height}`);await page.keyboard.press('Escape');await expect(page.locator('#home')).toBeVisible();
  await sandbox('ar25');for(const selector of ['#board','#back','[data-action="0"]']){const r=await page.locator(selector).boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=height+1,`overflow ${selector} ${width}x${height}: ${JSON.stringify(r)}`);}await shot(`game-${width}x${height}`);await home();layouts.push(`${width}x${height}`);
 }
 console.log('CHECKPOINT', new Date().toISOString());
 // Offline reload includes the record snapshot and engine.
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await context.setOffline(true);await reload();await sandbox('ls20');await expect(page.locator('#board')).toBeVisible();await context.setOffline(false);
 assert.deepEqual(errors,[]);const report={passed:true,layouts,errors,checks:['sequential benchmark and legacy order','progress versus efficiency labels','completed records only','full pages and nested back','touch and reset confirmation','settings persistence','sandbox gold and retroactive diamonds','all ten picker levels fit','app-switch gesture cancellation','real FT09 six-level completion and score export','offline cold reload']};console.log(JSON.stringify(report,null,2));await writeFile('test-results/browser-report.json',JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:'test-results/browser-failure.png'});throw error;}finally{await browser.close();}
