// Four deliberately selected README views. Fixture saves use an isolated profile.
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,rm} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_PATH||'/home/user1/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
 const manifest=JSON.parse(await readFile('public/games.json')),ft=manifest.find(g=>g.id==='ft09');
 await page.goto(process.env.BASE_URL||'http://localhost:4173');
 await page.evaluate(({baseline})=>{localStorage.setItem('arc-settings',JSON.stringify({onboarded:true,mode:'sandbox',haptic:true,sound:false}));localStorage.setItem('arc-sandbox-v1',JSON.stringify({ft09:{0:4,1:7,2:baseline[2]+4},ls20:{0:13}}));},ft);
 await page.reload();await expect(page.locator('#home')).toBeVisible({timeout:90000});await mkdir('docs/screenshots',{recursive:true});
 const shot=async name=>{await page.screenshot({path:`docs/screenshots/${name}.png`});};
 await shot('sandbox');await page.click('[data-game="ft09"]');await expect(page.locator('[data-level] img').first()).toBeVisible();await shot('levels');
 await page.click('#detail-back');await page.click('[data-game="ft09"]');await page.click('[data-level="3"]');await expect(page.locator('#game')).toBeVisible({timeout:90000});await shot('game');
 await page.click('#back');await page.click('#detail-back');await page.click('[data-game="ft09"]');await page.click('[data-level="0"]');await expect(page.locator('#game')).toBeVisible();
 const sequence=JSON.parse(await readFile('test-results/leaderboard-sequences.json')).ft09[0];
 for(let i=0;i<sequence.length;i++){const [x,y]=sequence[i],r=await page.locator('#board').boundingBox();await page.touchscreen.tap(r.x+(x+.5)/64*r.width,r.y+(y+.5)/64*r.height);await expect(page.locator('#actions')).toHaveText(String(i+1));}
 await expect(page.locator('#game-dialog')).toBeVisible();await shot('complete');
 for(const name of ['benchmark','diamond','gold','info','score'])await rm(`docs/screenshots/${name}.png`,{force:true});
 console.log('Saved four screenshots: sandbox, level grid, gameplay, completed level.');
}finally{await browser.close();}
