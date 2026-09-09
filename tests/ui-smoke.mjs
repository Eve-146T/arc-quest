// Chromium exercises the bundled WebView UI; it is not a supported app distribution.
import {chromium, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('test-results', {recursive: true});
const browser = await chromium.launch({headless: true, args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || '/home/user1/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'});
const page = await browser.newPage({viewport: {width: 360, height: 640}, isMobile: true, hasTouch: true, serviceWorkers: 'block'});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  window.AndroidGame = {haptic() {}, exportScore(json) {window.exportedScore = JSON.parse(json);}};
  // Hold start requests long enough to inspect loading and cancellation reliably.
  const EngineWorker = window.Worker;
  window.Worker = class extends EngineWorker {
    postMessage(data) {if (data.type === 'start') setTimeout(() => super.postMessage(data), 450); else super.postMessage(data);}
  };
});
try {
  const url = process.env.BASE_URL || 'http://localhost:4173';
  for (let i = 0; ; i++) {try {await page.goto(url); break;} catch (e) {if (i === 20) throw e; await page.waitForTimeout(100);}}
  await page.evaluate(() => {
    localStorage.setItem('arc-settings', JSON.stringify({onboarded: true, mode: 'sandbox', dark: true}));
    localStorage.setItem('arc-sandbox-v1', JSON.stringify({ls20: {0: 23, 1: 100}}));
  });
  await page.reload(); await page.click('#launch-start');
  await expect(page.locator('.theme-toggle')).toHaveCount(0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('arc-settings')).dark), undefined);
  assert.equal(await page.locator('body').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(255, 228, 243)');
  await page.click('[data-game="ls20"]');
  await expect(page.locator('[data-level="0"] .tile-score')).toContainText('91.5%');
  await expect(page.locator('[data-level="1"] .tile-score')).toContainText('115.0%');
  await expect(page.locator('[data-level="2"] .tile-score')).toContainText('0.0%');
  await expect(page.locator('[data-level="2"]')).not.toContainText('actions for gold');
  // Cold or warm, level entry never exposes home and back cancels without a late jump.
  await page.click('[data-level="0"]');
  await expect(page.locator('#loading')).toBeVisible();
  await expect(page.locator('#home')).toBeHidden();
  await expect(page.locator('#detail')).toBeVisible();
  assert.equal(await page.locator('#app').evaluate(e => e.inert), true);
  await page.evaluate(() => window.arcBack());
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#detail-title')).toHaveText('LS20');
  await page.waitForFunction(() => window.arcMetrics.boot.readyMs != null, null, {timeout: 90000});
  await page.waitForTimeout(700);
  await expect(page.locator('#game')).toBeHidden();
  await page.click('[data-level="0"]');
  await expect(page.locator('#loading')).toBeVisible();
  await expect(page.locator('#home')).toBeHidden();
  await page.screenshot({path: 'test-results/ui-smoke-loading.png'});
  await expect(page.locator('#game')).toBeVisible({timeout: 90000});
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('[data-action="4"]').tap();
  await expect(page.locator('#actions')).toHaveText('1');
  await page.locator('[data-action="4"]').evaluate(b => b.dispatchEvent(new PointerEvent('click', {bubbles: true, pointerType: 'touch', detail: 0})));
  await expect(page.locator('#actions')).toHaveText('1');
  await page.locator('[data-action="4"]').evaluate(b => b.click());
  await expect(page.locator('#actions')).toHaveText('2');
  await page.click('#back');
  await expect(page.locator('#detail-title')).toHaveText('LS20');
  await page.screenshot({path: 'test-results/ui-smoke-levels.png'});
  // Check the count-up's pace independently of worker and layout timing.
  const counts = await page.evaluate(async () => {
    const {countUp} = await import('/ui/feedback.js');
    const raf = window.requestAnimationFrame, now = performance.now.bind(performance);
    let tick, time = 0;
    window.requestAnimationFrame = cb => {tick = cb; return 1;};
    performance.now = () => time;
    try {
      const el = document.createElement('b'); countUp(el, 100, 1);
      time = 180; tick(time); const early = Number(el.textContent);
      time = 700; tick(time); return [early, Number(el.textContent)];
    } finally {window.requestAnimationFrame = raf; performance.now = now;}
  });
  assert.ok(counts[0] > 0 && counts[0] < 100, 'Count-up should still be running at 180ms');
  assert.equal(counts[1], 100);
  // Exact FT09 record replay also exercises packed-frame animation and the result overlay.
  await page.click('#detail-back'); await page.click('[data-game="ft09"]');
  await page.click('[data-level="0"]'); await expect(page.locator('#loading')).toBeHidden({timeout: 90000});
  const solution = [[36, 36], [36, 44], [52, 44], [36, 52]];
  for (let i = 0; i < solution.length; i++) {
    const [x, y] = solution[i], r = await page.locator('#board').boundingBox();
    await page.touchscreen.tap(r.x + (x + .5) / 64 * r.width, r.y + (y + .5) / 64 * r.height);
    await expect(page.locator('#actions')).toHaveText(String(i + 1));
  }
  await expect(page.locator('#game-dialog')).toBeVisible();
  await expect(page.locator('#game-dialog')).toHaveClass(/gold/);
  assert.deepEqual(errors, []);
  console.log('PASS: light-only settings, sandbox scores, 700ms counters, cold/warm loading, cancellation, animated touch gameplay and completion.');
} catch (e) {
  await page.screenshot({path: 'test-results/ui-smoke-failure.png'}); throw e;
} finally {await browser.close();}
