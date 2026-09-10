// Local checks only: this never uploads metadata, signs an APK or creates a release.
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';

const base = new URL('../fastlane/metadata/android/en-US/', import.meta.url);
const manifest = await readFile(new URL('../android/AndroidManifest.xml', import.meta.url), 'utf8');
const versionCode = manifest.match(/android:versionCode="(\d+)"/)[1];
const versionName = manifest.match(/android:versionName="([^"]+)"/)[1];
if (process.argv[2]) assert.equal(process.argv[2], `v${versionName}`, 'Release tag must match the Android version');
assert.match(manifest, /package="arc\.quest"/);
assert.match(manifest, /android:screenOrientation="portrait"/);
for (const [file, limit] of [['title.txt', 30], ['short_description.txt', 80], ['full_description.txt', 4000], [`changelogs/${versionCode}.txt`, 500]]) {
  const text = (await readFile(new URL(file, base), 'utf8')).trim();
  assert.ok(text.length > 0 && [...text].length <= limit, `${file}: expected 1–${limit} characters`);
  if (file !== 'full_description.txt' && !file.startsWith('changelogs/')) assert.ok(!text.includes('\n'), `${file}: expected one line`);
  assert.ok(!/TODO|REPLACE_WITH/.test(text), `${file}: remove editorial placeholders from store copy`);
}
async function png(file) {
  const b = await readFile(new URL(file, base));
  assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file}: expected PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
assert.deepEqual(await png('images/icon.png'), [512, 512]);
const screenshots = (await readdir(new URL('images/phoneScreenshots/', base))).sort();
assert.deepEqual(screenshots, ['1.png', '2.png', '3.png', '4.png']);
for (const name of screenshots) {
  const [width, height] = await png(`images/phoneScreenshots/${name}`);
  assert.ok(width >= 320 && height > width, `${name}: expected a portrait screenshot at least 320px wide`);
}
console.log(`Metadata valid: ARC Quest ${versionName}, version code ${versionCode}, 512px icon, four portrait screenshots.`);
