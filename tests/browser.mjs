import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const BASE=process.env.BASE_URL||'http://localhost:4173';
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:'/home/user1/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function actionCount(n){await expect(page.locator('#actions')).toHaveText(String(n));}
async function gameOpen(id){await expect(page.locator('#game')).toBeVisible({timeout:90000});await expect(page.locator('#playing-name')).toHaveText(id.toUpperCase());}
async function openRun(id){await page.click(`[data-game="${id}"]`);await gameOpen(id);}
async function openSandbox(id,level){await page.click(`[data-game="${id}"]`);await page.click(`[data-level="${level}"]`);await gameOpen(id);}
async function start(){await page.goto(BASE);await page.evaluate(()=>document.fonts.ready);await expect(page.locator('#launch')).toBeVisible();await page.click('#launch-start');}
async function swipe(dx,dy){const r=await page.locator('#board').boundingBox();const cdp=await context.newCDPSession(page);const x=r.x+r.width/2,y=r.y+r.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
const lastAction=id=>page.evaluate(id=>JSON.parse(localStorage.getItem('arc-run-v2')).games[id].history.at(-1),id);
const solution=JSON.parse(await readFile('test-results/ft09-solution.json','utf8'));
try{
 // First launch: the launch screen, the four intro pages, and the mode choice.
 await start();await page.screenshot({path:'test-results/launch.png'});await expect(page.locator('#onboarding')).toBeVisible();
 for(let i=0;i<3;i++){await expect(page.locator('#onboard-dots i.on')).toHaveCount(1);await page.click('#onboard-next');}
 await expect(page.locator('[data-pick="run"]')).toBeVisible();await page.screenshot({path:'test-results/onboarding.png'});await page.click('[data-pick="run"]');
 await expect(page.locator('#home')).toBeVisible();await expect(page.locator('.game-card')).toHaveCount(25);await expect(page.locator('#continue-run')).toHaveText(/START RUN/);await page.screenshot({path:'test-results/home.png'});
 // Benchmark run: hardware-like touch inputs, reset in the control row, swipes, back, restore.
 await page.click('#continue-run');await gameOpen('ls20');await actionCount(0);
 for(let i=0;i<12;i++)await page.locator('[data-action="4"]').tap();await actionCount(12);
 await page.locator('[data-action="0"]').tap();await actionCount(13);assert.deepEqual(await lastAction('ls20'),{id:0});
 await swipe(-80,0);await actionCount(14);assert.deepEqual(await lastAction('ls20'),{id:3});
 await page.click('#back');await expect(page.locator('#home')).toBeVisible();await expect(page.locator('[data-game="ls20"]')).toHaveClass(/active/);await expect(page.locator('#continue-run')).toHaveText(/CONTINUE RUN/);
 await page.reload();await expect(page.locator('#launch')).toBeVisible();await page.click('#launch-start');await expect(page.locator('#home')).toBeVisible();
 await page.click('#continue-run');await gameOpen('ls20');await actionCount(14);await page.screenshot({path:'test-results/game.png'});
 const latency=await page.evaluate(()=>window.arcMetrics.latencies);
 await page.click('#back');
 // Games with both a d-pad and board clicks: a swipe is a move, a tap is a click at that cell.
 await openRun('dc22');await swipe(-80,0);await actionCount(1);assert.deepEqual(await lastAction('dc22'),{id:3});
 await swipe(0,80);await actionCount(2);assert.deepEqual(await lastAction('dc22'),{id:2});
 {const r=await page.locator('#board').boundingBox();await page.touchscreen.tap(r.x+(10.5/64)*r.width,r.y+(20.5/64)*r.height);await actionCount(3);assert.deepEqual(await lastAction('dc22'),{id:6,x:10,y:20});}
 await page.click('#back');
 // Left/right only: vertical swipes are ignored, horizontal swipes move.
 await openRun('bp35');await swipe(0,-80);await page.waitForTimeout(300);await actionCount(0);await swipe(80,0);await actionCount(1);assert.deepEqual(await lastAction('bp35'),{id:4});await page.click('#back');
 // Game over shows the board overlay; tapping it retries for one action.
 await openRun('tu93');const seq=[4,3,4,3,1,2];
 for(let i=0;i<70;i++){if(await page.locator('#game-over').isVisible())break;await page.locator(`[data-action="${seq[i%6]}"]`).tap();await actionCount(i+1);}
 await expect(page.locator('#game-over')).toBeVisible();await page.screenshot({path:'test-results/game-over.png'});const beforeRetry=Number(await page.locator('#actions').textContent());await page.locator('#game-over').tap();await actionCount(beforeRetry+1);await expect(page.locator('#game-over')).toBeHidden();await page.click('#back');
 // Complete FT09 inside the run: win sheet, scorecard, badge on the card, export.
 await openRun('ft09');await actionCount(0);
 for(let i=0;i<solution.length;i++){const a=solution[i],r=await page.locator('#board').boundingBox();await page.touchscreen.tap(r.x+(a.x+.5)/64*r.width,r.y+(a.y+.5)/64*r.height);await actionCount(i+1);}
 await expect(page.getByRole('heading',{name:'Game complete!'})).toBeVisible();await page.screenshot({path:'test-results/win.png'});await page.click('#see-run');await page.screenshot({path:'test-results/scorecard.png'});await expect(page.locator('.score-big')).toContainText('100.0');
 const download=page.waitForEvent('download');await page.click('#export');const file=await download;await file.saveAs('test-results/exported-scorecard.json');
 const report=JSON.parse(await readFile('test-results/exported-scorecard.json','utf8'));const ft=report.currentRun.games.find(g=>g.game_id.startsWith('ft09'));assert.equal(ft.current.levels_completed,6);assert.equal(ft.current.actions,75);
 await page.locator('.close-button').click();await page.click('#back');await expect(page.locator('[data-game="ft09"]')).toHaveClass(/done/);await expect(page.locator('[data-game="ft09"] .badge')).toContainText('100%');
 // Run score is the average across 25 games; a won game opens its scorecard instead of replaying.
 await expect(page.locator('#run-score')).toHaveText((100/25).toFixed(1));await page.click('[data-game="ft09"]');await expect(page.getByRole('heading',{name:'FT09 scorecard'})).toBeVisible();await page.locator('.close-button').click();
 // Reset the run: it is archived as the best run and everything starts over.
 await page.click('#reset-run');await page.screenshot({path:'test-results/reset-run.png'});await page.click('#do-reset');await expect(page.locator('#continue-run')).toHaveText(/START RUN/);await expect(page.locator('.hero-best')).toContainText((100/25).toFixed(1));await expect(page.locator('[data-game="ft09"]')).not.toHaveClass(/done/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('arc-runs-v1')).length),1);
 // Sandbox: jump to a level, clear it, get gold, see it on the card and in the picker.
 await page.click('[data-mode="sandbox"]');await expect(page.locator('#hero')).toHaveClass(/sandbox/);await page.screenshot({path:'test-results/home-sandbox.png'});
 await openSandbox('ls20',2);await expect(page.locator('#target-value')).toHaveText('73');await expect(page.locator('#level-dots i.here')).toHaveCount(1);await page.locator('[data-action="4"]').tap();await actionCount(1);await page.locator('[data-action="0"]').tap();await actionCount(0);await page.click('#back');
 await openSandbox('ft09',0);const human=await page.evaluate(()=>Number(document.querySelector('#target-value').textContent));
 for(let i=0;i<solution.length;i++){if(await page.locator('#dialog').evaluate(d=>d.open))break;const a=solution[i],r=await page.locator('#board').boundingBox();await page.touchscreen.tap(r.x+(a.x+.5)/64*r.width,r.y+(a.y+.5)/64*r.height);await actionCount(i+1);}
 await expect(page.getByRole('heading',{name:/Gold!|Level cleared!/})).toBeVisible();await page.screenshot({path:'test-results/sandbox-cleared.png'});const used=Number(await page.locator('#dialog .score-big').evaluate(e=>e.firstChild.textContent));assert.ok(used<=human,'solver run should be gold');
 await page.click('#next');await gameOpen('ft09');await expect(page.locator('#level-dots i.here')).toHaveCount(1);await page.click('#back');
 await expect(page.locator('[data-game="ft09"] .badge')).toHaveText('1/6');await expect(page.locator('#sandbox-count')).toHaveText('1');await page.click('[data-game="ft09"]');await expect(page.locator('[data-level="0"]')).toHaveClass(/gold/);await page.screenshot({path:'test-results/level-picker.png'});await page.locator('.close-button').click();
 await page.click('#next-level');await gameOpen('ls20');await expect(page.locator('#target-value')).toHaveText('22');await page.click('#back');
 await page.click('[data-mode="run"]');
 // Narrow portrait, landscape, tablet, desktop: no scrolling, clipped controls or overflow.
 const layouts=[];
 for(const [width,height]of [[320,568],[360,640],[360,760],[390,844],[430,932],[844,390],[768,1024],[1440,900]]){
  await page.setViewportSize({width,height});await page.screenshot({path:`test-results/home-${width}x${height}.png`});
  const home=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,buttons:[...document.querySelectorAll('#home .top-bar button, #home .bottom-bar button, .mode-switch button, #hero button')].map(x=>{const r=x.getBoundingClientRect();return {label:x.getAttribute('aria-label')||x.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height}})}));assert.ok(home.w<=width+1);assert.ok(home.h<=height+1);for(const r of home.buttons){assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=width+1&&r.y+r.h<=height+1,`${width}x${height} ${JSON.stringify(r)}`);}
  await openRun('ar25');const r=await page.locator('#board').boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=width&&r.y+r.height<=height);for(const b of await page.locator('[data-action]').all()){const c=await b.boundingBox();assert.ok(c.x>=0&&c.y>=0&&c.x+c.width<=width+1&&c.y+c.height<=height+1,`control overflow ${width}x${height}`);}await page.screenshot({path:`test-results/game-${width}x${height}.png`});await page.click('#back');layouts.push(`${width}x${height}`);
  await page.click('#about');await page.locator('.close-button').click();
 }
 // Full cold reload with networking disabled after service-worker install.
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await context.setOffline(true);await page.reload();await page.click('#launch-start');await openRun('ls20');await expect(page.locator('#board')).toBeVisible();await context.setOffline(false);
 assert.deepEqual(errors,[]);const result={passed:true,layouts,completeGame:'FT09: all six levels, 75 actions, 100% RHAE',checks:['launch and intro','mode choice','rapid touch','reset in controls','swipe','swipe vs click in mixed games','game-over overlay','back to home','saved replay after reload','run win + badge + average','reset run archived as best','sandbox level entry','sandbox gold clear + next level','level picker','25-game grid','score export','offline cold start'],errors,latency};console.log(JSON.stringify(result,null,2));await writeFile('test-results/browser-report.json',JSON.stringify(result,null,2));
}finally{await browser.close();}
