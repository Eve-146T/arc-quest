// Requires the debug APK on an Android phone. Restores rotation settings and app saves.
import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium, expect} from '@playwright/test';

const adb = (...args) => execFileSync(process.env.ADB || `${process.env.ANDROID_SDK_ROOT || '/home/user1/android-sdk'}/platform-tools/adb`, args, {encoding: 'utf8'}).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
adb('shell', 'am', 'start', '-n', 'arc.quest/.MainActivity');
let socket;
for (let attempt = 0; attempt < 80; attempt++) {
  let pid = '';
  try {pid = adb('shell', 'pidof', 'arc.quest').split(/\s+/)[0];}
  catch (error) {if (error.status !== 1) throw error;}
  if (pid && adb('shell', 'cat', '/proc/net/unix').includes(`webview_devtools_remote_${pid}`)) {socket = `webview_devtools_remote_${pid}`; break;}
  await sleep(250);
}
assert.ok(socket, 'Install an arc.quest debug APK before testing');
adb('forward', 'tcp:9224', `localabstract:${socket}`);
const browser = await chromium.connectOverCDP('http://localhost:9224');
const page = browser.contexts()[0].pages()[0];
await expect(page.locator('#home')).toBeVisible({timeout: 120000});
const saved = await page.evaluate(() => ({...localStorage}));
const rotation = Object.fromEntries(['accelerometer_rotation', 'user_rotation'].map(key => [key, adb('shell', 'settings', 'get', 'system', key)]));
const report = {package: 'arc.quest', device: adb('shell', 'getprop', 'ro.product.model'), screens: []};
await mkdir('test-results/portrait', {recursive: true});
await writeFile('test-results/portrait/backup.json', JSON.stringify({saved, rotation}, null, 2));
async function rotations(screen) {
  for (const value of ['0', '1', '3']) {
    adb('shell', 'settings', 'put', 'system', 'user_rotation', value);
    await sleep(650);
    const dimensions = await page.evaluate(() => [innerWidth, innerHeight]);
    assert.ok(dimensions[0] < dimensions[1], `${screen} must stay portrait with user_rotation=${value}`);
    report.screens.push({screen, userRotation: Number(value), dimensions});
  }
}
try {
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  await rotations('home');
  await page.click('button[data-mode="sandbox"]');
  await page.click('[data-game="ls20"]');
  await rotations('level browser');
  await page.click('[data-level="0"]');
  await expect(page.locator('#game')).toBeVisible({timeout: 120000});
  const board = await page.locator('#board').evaluate(canvas => canvas.toDataURL());
  await rotations('game');
  assert.equal(await page.locator('#board').evaluate(canvas => canvas.toDataURL()), board, 'Rotation must preserve puzzle pixels');
  await page.screenshot({path: 'test-results/portrait/game.png'});
  await page.click('#back'); await page.click('#detail-back'); await page.click('#about');
  await rotations('info');
  await expect(page.locator('#detail-back')).toBeVisible();
  assert.deepEqual(await page.evaluate(() => arcMetrics.errors), []);
  report.passed = true;
  await writeFile('test-results/portrait/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const [key, value] of Object.entries(rotation)) {
    if (value === 'null') adb('shell', 'settings', 'delete', 'system', key);
    else adb('shell', 'settings', 'put', 'system', key, value);
  }
  await page.evaluate(data => {localStorage.clear(); for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);}, saved);
  await browser.close();
  adb('shell', 'am', 'force-stop', 'arc.quest');
  adb('shell', 'am', 'start', '-n', 'arc.quest/.MainActivity');
}
