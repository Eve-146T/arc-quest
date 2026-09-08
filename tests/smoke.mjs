import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:'/home/user1/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
page.on('console',m=>console.log('console',m.type(),m.text().slice(0,700)));page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
await page.goto('http://localhost:4173');await page.screenshot({path:'test-results/home.png'});await page.click('[data-game="ls20"]');await page.waitForSelector('#game:not([hidden])',{timeout:60000});await page.screenshot({path:'test-results/game.png'});await page.locator('[data-action="1"]').dispatchEvent('pointerdown',{pointerId:1});await page.waitForTimeout(1000);console.log('metrics',await page.evaluate(()=>window.arcMetrics));console.log('actions',await page.locator('#actions').textContent());await browser.close();
