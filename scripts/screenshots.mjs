// Capture README examples in an isolated browser profile. No device saves are touched.
import {chromium} from '@playwright/test';
import {readFile,mkdir,copyFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.CHROMIUM_PATH||'/home/user1/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await page.goto(process.env.BASE_URL||'http://localhost:4173');
 await page.evaluate(()=>{localStorage.setItem('arc-settings',JSON.stringify({onboarded:true,mode:'sandbox',haptic:true,sound:false}));localStorage.setItem('arc-sandbox-v1',JSON.stringify({ls20:{0:13,1:130,2:39}}));});
 await page.reload();await page.click('#launch-start');await mkdir('docs/screenshots',{recursive:true});
 const shot=async name=>{if(await page.locator('#home').isVisible())await page.locator('#home-scroll').evaluate(e=>e.scrollTop=0);await page.waitForTimeout(750);await page.screenshot({path:`docs/screenshots/${name}.png`});};
 await shot('sandbox');await page.click('[data-game="ls20"]');await shot('levels');await page.click('#detail-back');await page.click('#about');await shot('info');await page.click('#detail-back');
 await page.click('button[data-mode="run"]');await page.click('#continue-run');await page.waitForSelector('#game:not([hidden])',{timeout:90000});await page.waitForTimeout(500);
 for(let i=0;i<6;i++){await page.locator('[data-action="4"]').tap();await page.waitForTimeout(100);}
 await shot('game');await page.click('#live-score');await shot('score');await page.click('#detail-back');await page.click('#back');await shot('benchmark');
 // Unlock example uses clearly reproducible fixture progress; no leaderboard submission.
 const games=JSON.parse(await readFile('public/games.json','utf8')),records=JSON.parse(await readFile('public/diamonds.json','utf8'));
 await page.evaluate(({games,records})=>{localStorage.setItem('arc-sandbox-v1',JSON.stringify(Object.fromEntries(games.map(g=>[g.id,Object.fromEntries(g.baseline.map((n,i)=>[i,Math.min(n,records.games[g.id].recordActions[i]??n)]))]))));localStorage.setItem('arc-settings',JSON.stringify({onboarded:true,mode:'sandbox',haptic:true,sound:false}));},{games,records});
 await page.reload();await page.click('#launch-start');await page.click('[data-game="ft09"]');await shot('diamond');
 await copyFile('test-results/sandbox-cleared.png','docs/screenshots/gold.png');
 console.log('Saved 8 README screenshots');
}finally{await browser.close();}
