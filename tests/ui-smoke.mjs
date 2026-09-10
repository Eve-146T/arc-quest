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
  window.AndroidGame = {haptic() {}, exportScore(json) {window.exportedScore = JSON.parse(json);}, launchReady() {window.launchWasReady = !document.querySelector('#home').hidden;}};
  // Hold start requests long enough to inspect loading and cancellation reliably.
  const EngineWorker = window.Worker;
  window.Worker = class extends EngineWorker {
    constructor(...args) {
      super(...args);
      let heldReady, released = false;
      this.addEventListener('message', e => {
        if (e.data.type === 'ready' && !released) {heldReady = e.data; e.stopImmediatePropagation();}
      });
      window.releaseEngineReady = () => {released = true; if (heldReady) this.dispatchEvent(new MessageEvent('message', {data: heldReady}));};
    }
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
  await page.reload(); await expect(page.locator('#home')).toBeVisible({timeout:90000});
  await page.waitForFunction(() => window.launchWasReady);
  assert.equal(await page.evaluate(() => window.arcMetrics.boot.readyMs), undefined, 'Menu opens without waiting for the game engine');
  await expect(page.locator('#launch-start,#launch')).toHaveCount(0);
  await expect(page.locator('#onboarding')).toBeHidden();
  await expect(page.locator('.theme-toggle')).toHaveCount(0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('arc-settings')).dark), undefined);
  assert.equal(await page.locator('body').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(255, 228, 243)');
  // Credits and licenses remain inside the app, preserving the parent's scroll and handlers.
  await page.click('#about');
  await expect(page.locator('#detail-body')).toContainText('actions from earlier attempts are left out');
  await page.locator('#show-credits').scrollIntoViewIfNeeded();
  const infoScroll = await page.locator('#detail-body').evaluate(e => e.scrollTop);
  const documentToken = await page.evaluate(() => window.documentToken = Math.random());
  await page.click('#show-credits');
  await expect(page.locator('.credits-copy')).not.toHaveAttribute('aria-busy');
  const fixedBack = await page.locator('#detail-back').boundingBox();
  await page.locator('#detail-body').evaluate(e => e.scrollTop = e.scrollHeight);
  assert.ok(await page.locator('#detail-body').evaluate(e => e.scrollTop > 0));
  assert.equal((await page.locator('#detail-back').boundingBox()).y, fixedBack.y);
  await page.click('a[href="./licenses/ARC-MIT.txt"]');
  await expect(page.locator('.license-copy')).toContainText('MIT License');
  await page.locator('#detail-body').evaluate(e => e.scrollTop = e.scrollHeight);
  assert.ok(await page.locator('#detail-body').evaluate(e => e.scrollTop > 0));
  await page.evaluate(() => window.arcBack());
  await expect(page.locator('#detail-title')).toHaveText('Credits & licenses');
  await page.click('#detail-back');
  await expect(page.locator('#detail-title')).toHaveText('How it works');
  assert.equal(await page.locator('#detail-body').evaluate(e => e.scrollTop), infoScroll);
  assert.equal(await page.evaluate(() => window.documentToken), documentToken);
  await page.click('#replay-intro');
  await page.click('#onboard-next'); await page.click('#onboard-next');
  await expect(page.locator('.art-score')).toBeVisible();
  const scoreBars = await page.locator('.bar-row b').evaluateAll(bars => bars.map(b => b.offsetWidth));
  assert.ok(scoreBars[1] > scoreBars[0], 'Eight actions earns a longer efficiency bar than ten');
  // Every looping illustration has a matching start/end pose, with no reset jump.
  for (const introPage of [0, 1, 2]) {
    const continuous = await page.evaluate(async index => {
      const {onboarding} = await import('/ui/intro.js'); onboarding(index);
      return [...document.querySelectorAll('.mini-board i,.finger .tip,.bar-row b')].every(e => {
        const animation = e.getAnimations()[0]; animation.pause();
        const {delay, duration} = animation.effect.getTiming();
        animation.currentTime = delay; const first = getComputedStyle(e).transform;
        animation.currentTime = delay + duration; return first === getComputedStyle(e).transform;
      });
    }, introPage);
    assert.ok(continuous, `Intro page ${introPage + 1} should loop continuously`);
  }
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [568, 320], [844, 390]]) {
    await page.setViewportSize({width, height});
    for (let index = 0; index < 4; index++) {
      await page.evaluate(async i => (await import('/ui/intro.js')).onboarding(i), index);
      await page.waitForTimeout(400);
      const clipped = await page.locator('.page h2,.page p,.page .art,.onboard-nav,#intro-go').evaluateAll(elements => elements.some(e => {
        const r = e.getBoundingClientRect(); return r.x < -.5 || r.y < -.5 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5;
      }));
      assert.equal(clipped, false, `Intro ${index + 1} fits ${width}×${height}`);
      await page.screenshot({path: `test-results/intro-${index + 1}-${width}x${height}.png`});
    }
  }
  await page.setViewportSize({width: 360, height: 640});
  await page.click('#intro-go');
  await page.click('[data-mode="run"]'); await page.click('#about'); await page.click('#replay-intro');
  await page.click('#onboard-skip'); await expect(page.locator('[data-pick]')).toHaveCount(0); await page.click('#intro-go');
  await expect(page.locator('button[data-mode="run"]')).toHaveAttribute('aria-selected', 'true');
  await page.click('[data-mode="sandbox"]');
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
  await expect(page.locator('#loading-preview')).toHaveAttribute('style', /ls20\/1.png/);
  for (const [width, height] of [[320,568], [568,320]]) {
    await page.setViewportSize({width,height});
    const box = await page.locator('.loading-sheet').boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, 'Puzzle loader fits the viewport');
    await page.waitForTimeout(250);
    await page.screenshot({path:`test-results/loading-${width}x${height}.png`});
  }
  await page.setViewportSize({width:360,height:640});
  await page.evaluate(() => window.arcBack());
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#detail-title')).toHaveText('LS20');
  await page.evaluate(() => window.releaseEngineReady());
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
  await page.click('#detail-back'); await page.click('[data-mode="run"]');
  const captionPositions = await page.evaluate(async () => {
    const counter = document.querySelector('#run-score'), label = counter.nextElementSibling;
    await document.fonts.ready;
    return ['0.0', '1.1', '8.8', '11.1', '88.8', '100.0'].map(value => {
      counter.textContent = value;
      const r = label.getBoundingClientRect(); return [r.x, r.y];
    });
  });
  assert.ok(captionPositions.every(p => p[0] === captionPositions[0][0] && p[1] === captionPositions[0][1]), 'Completion caption must not shift with its digits');
  await page.click('[data-mode="sandbox"]');
  // Exact FT09 record replay also exercises packed-frame animation and the result overlay.
  await page.click('[data-game="ft09"]');
  await page.click('[data-level="0"]'); await expect(page.locator('#loading')).toBeHidden({timeout: 90000});
  const beforeInvalid = await page.locator('#board').evaluate(c => c.toDataURL());
  for (const [x,y] of [[0,0],[63,63],[10,10],[32,32]]) {
    const r = await page.locator('#board').boundingBox();
    await page.touchscreen.tap(r.x + (x + .5) / 64 * r.width, r.y + (y + .5) / 64 * r.height);
  }
  await expect(page.locator('#actions')).toHaveText('0');
  assert.equal(await page.locator('#board').evaluate(c => c.toDataURL()), beforeInvalid);
  const solution = [[36, 36], [36, 44], [52, 44], [36, 52]];
  for (let i = 0; i < solution.length; i++) {
    const [x, y] = solution[i], r = await page.locator('#board').boundingBox();
    await page.touchscreen.tap(r.x + (x + .5) / 64 * r.width, r.y + (y + .5) / 64 * r.height);
    await expect(page.locator('#actions')).toHaveText(String(i + 1));
  }
  await expect(page.locator('#game-dialog')).toBeVisible();
  await expect(page.locator('#game-dialog')).toHaveClass(/gold/);
  assert.deepEqual(errors, []);
  console.log('PASS: automatic startup, stable completion caption, FT09 hit testing, credits/license navigation and scrolling, seamless intro loops in five layouts, sandbox scores, 700ms counters, loading cancellation, touch gameplay and completion.');
} catch (e) {
  await page.screenshot({path: 'test-results/ui-smoke-failure.png'}); throw e;
} finally {await browser.close();}
