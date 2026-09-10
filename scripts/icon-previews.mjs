// Raster exports share exactly the Android vector geometry; masks only affect the preview.
import {chromium} from '@playwright/test';
import {readFile, mkdir, copyFile} from 'node:fs/promises';
const browser = await chromium.launch({headless: true, args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || '/home/user1/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'});
try {
  const page = await browser.newPage({deviceScaleFactor: 1}), svg = await readFile('public/assets/icon.svg', 'utf8');
  for (const size of [192, 512]) {
    await page.setViewportSize({width: size, height: size});
    await page.setContent(`<style>body{margin:0}svg{display:block;width:100%;height:100%}</style>${svg}`);
    await page.screenshot({path: `public/assets/icon-${size}.png`});
  }
  await copyFile('public/assets/icon-192.png', 'android/res/drawable/icon.png');
  await page.setViewportSize({width: 800, height: 260});
  await page.setContent(`<style>body{margin:0;background:#ffe4f3;display:flex;gap:32px;padding:32px;font:16px sans-serif;color:#2b1f5e;text-align:center}.icon{width:160px;height:160px;margin-bottom:16px;overflow:hidden}.icon svg{width:100%;height:100%;display:block}.circle{border-radius:50%}.squircle{clip-path:path('M 80 0 C 148 0 160 12 160 80 C 160 148 148 160 80 160 C 12 160 0 148 0 80 C 0 12 12 0 80 0')}.round{border-radius:32px}.themed{border-radius:50%}.themed path{fill:#eee6ff}.themed rect{fill:#625573}</style>${[['circle','Circle'],['squircle','Squircle'],['round','Rounded square'],['themed','Themed']].map(([cls,label])=>`<div><div class="icon ${cls}">${svg}</div>${label}</div>`).join('')}`);
  await mkdir('test-results', {recursive:true});
  await page.screenshot({path: 'test-results/icon-shapes.png'});
} finally {await browser.close();}
