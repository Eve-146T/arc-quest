import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const games=JSON.parse(await readFile('public/games.json'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_PATH||'/home/user1/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block',isMobile:true,hasTouch:true});
const page=await context.newPage(),errors=[],report=[],pixels=new Map();page.on('pageerror',e=>errors.push(e.message));
async function bounds(selector,width,height){
 const rects=await page.locator(selector).evaluateAll(elements=>elements.filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {id:e.id||e.getAttribute('aria-label'),x:r.x,y:r.y,w:r.width,h:r.height};}));
 for(const r of rects)assert.ok(r.x>=-.5&&r.y>=-.5&&r.x+r.w<=width+.5&&r.y+r.h<=height+.5,`${width}x${height}: ${JSON.stringify(r)}`);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth),'viewport overflow');
}
try{
 await page.goto(process.env.BASE_URL||'http://localhost:4173');await page.evaluate(games=>{localStorage.setItem('arc-settings',JSON.stringify({onboarded:true,mode:'sandbox'}));localStorage.setItem('arc-sandbox-v1',JSON.stringify(Object.fromEntries(games.map(g=>[g.id,{0:g.baseline[0]+1}]))));},games);await page.reload();await page.click('#launch-start');
 for(const [width,height] of [[320,568],[360,640],[390,844],[568,320],[844,390]]){
  await page.setViewportSize({width,height});
  for(const g of games){
   await page.click(`[data-game="${g.id}"]`);await bounds('#detail-back,[data-level]',width,height);
   const last=page.locator('[data-level]').last();assert.ok(await last.isVisible());
   await page.click('[data-level="0"]');await expect(page.locator('#game')).toBeVisible({timeout:90000});await expect(page.locator('#playing-name')).toHaveText(g.id.toUpperCase());
   await bounds('#game .top-bar button,#board,.stats .pill,#controls button,#level-dots',width,height);await expect(page.locator('#mode-badge')).toBeHidden();
   const frame=await page.locator('#board').evaluate(c=>c.toDataURL());if(pixels.has(g.id))assert.equal(frame,pixels.get(g.id),'Viewport must not change puzzle pixels');else pixels.set(g.id,frame);
   await page.click('[data-action="0"]');await expect(page.locator('#game-dialog')).toBeVisible();await bounds('#game-dialog,#game-dialog button',width,height);await page.keyboard.press('Escape');await expect(page.locator('#game-dialog')).toBeHidden();
   await page.click('#back');await page.click('#detail-back');
  }
  report.push({width,height,games:games.length});console.log('PASS',width,height,'all 25 games');
 }
 // A real clear remains an overlay, blocks keyboard actions, and dismisses back to the picker.
 const sequence=JSON.parse(await readFile('test-results/leaderboard-sequences.json')).ft09[0];
 for(const [width,height] of [[320,568],[568,320]]){
  await page.setViewportSize({width,height});await page.click('[data-game="ft09"]');await page.click('[data-level="0"]');await expect(page.locator('#game')).toBeVisible();
  for(const [x,y] of sequence){const r=await page.locator('#board').boundingBox();await page.touchscreen.tap(r.x+(x+.5)/64*r.width,r.y+(y+.5)/64*r.height);}
  await expect(page.locator('#game-dialog')).toBeVisible();await expect(page.locator('#game')).toBeVisible();await bounds('#game-dialog,#game-dialog button',width,height);await expect(page.locator('#game-dialog use[href="#star"]')).toHaveCount(0);
  const before=await page.locator('#actions').textContent();await page.keyboard.press('r');await expect(page.locator('#actions')).toHaveText(before);
  await page.screenshot({path:`test-results/result-${width}x${height}.png`});await page.keyboard.press('Escape');await expect(page.locator('#detail-title')).toHaveText('FT09');await page.click('#detail-back');
 }
 assert.deepEqual(errors,[]);await writeFile('test-results/layout-report.json',JSON.stringify({passed:true,report,errors},null,2));
}catch(e){await page.screenshot({path:'test-results/layout-failure.png'});throw e;}finally{await browser.close();}
