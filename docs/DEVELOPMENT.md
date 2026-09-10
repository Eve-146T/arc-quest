# Development

Use Node.js and Python through `uv`. Keep scratch files in the workspace:

```sh
mkdir -p .scratch test-results
export TMPDIR="$PWD/.scratch"
export UV_CACHE_DIR="$PWD/.cache/uv"
export MPLCONFIGDIR="$PWD/.cache/matplotlib"
npm ci
uv sync --group test
npm run dev
```

The local WebView test harness runs at `http://localhost:4173`. It is development tooling, not a supported browser app. `npm run build` bundles assets into `dist/` for the APK. There is no PWA manifest, service worker, web release or browser score-download fallback.

## Android

```sh
ANDROID_SDK_ROOT=/path/to/android-sdk ARC_REVIEW=1 scripts/build-android.sh
```

Requires JDK 17, Android platform 35, build-tools 35.0.0 and `zip`. The output is `android/build/arc-quest.apk`, signed with an ignored local review key. Android 8+ with a current System WebView is required.

## Checks

Keep the development server running for WebView UI tests.

```sh
uv run tests/native_fixtures.py
uv run --group test tests/solve_ft09.py
npm test
node tests/parity.mjs
node tests/levels.mjs
npm run test:ui
node tests/layouts.mjs
node tests/ui-smoke.mjs
```

Set `CHROMIUM_PATH` if Chromium is installed somewhere other than the default in `tests/webview.mjs`. `ARC_DEBUG=1 scripts/build-android.sh` builds an inspectable APK for the connected-device checks in `tests/android.mjs`. Those checks back up and restore local storage.

## Public diamond records

`public/diamonds.json` is an offline snapshot of the shortest recorded action sequence for each exact game version on [ARC3.Games](https://arc3.games/). These are community records, not mathematical minima. Missing records are `null` and never award diamond.

Refresh and replay-check the records:

```sh
uv run scripts/update-diamonds.py
uv run tests/leaderboard_replay.py
npm test
npm run build
```

The fetcher respects rate limits and caches its progress in `test-results/leaderboard-fetch-cache.json`; remove that file to request a fresh snapshot. Solution sequences remain outside the shipped assets. Diamond awards appear only after every sandbox level has gold, and include earlier personal bests.

## Engine integrity

Original game sources, `arcengine`, baselines and scoring modules stay unmodified. The Python bridge adapts input and sandbox level entry. `public/games.json` pins source versions and hashes. Use `uv run scripts/prepare.py` to regenerate the bundled runtime.

The official action-efficiency score averages all 25 games. Unplayed levels score zero, later levels carry more weight, and a game score is capped at its completed-level weight share. Each level can earn up to 115%; a game or full run tops out at 100%. The home benchmark percentage counts cleared levels instead. Results are local practice, not official submissions.

See [verification](../VERIFICATION.md) for evidence and limitations.

## Screenshots and level previews

`uv run scripts/level-previews.py` renders all 183 initial boards without changing engine code. `TMPDIR="$PWD/.scratch" node scripts/screenshots.mjs` captures four README examples from an isolated profile. It uses the downloaded FT09 record sequence for a real completion overlay; run the diamond updater first if that ignored replay evidence is missing.

## Modules

`public/app.js` coordinates saved progress, benchmark flow and engine sessions. `public/ui/` separates navigation/modal lifetimes, home/level/scorecard presentation, intro flow, sound/settings feedback, and board drawing/touch gestures. CSS is split by screen, with shared base rules and responsive refinements loaded in a fixed order. `LaunchScreen.java` handles the native first-frame transition using the [Android SplashScreen API](https://developer.android.com/develop/ui/views/launch/splash-screen), with a native cover on Android 8–11. The small native activity remains the Android lifecycle/asset/score-export bridge. Upstream engine files are excluded from refactoring.

## CI and signing

[Build workflow](../.github/workflows/build.yml) follows the Eve Games playbook using JDK 17, Android platform/build-tools 35 and its Node 24 action majors. This app keeps its existing AAPT2/Java build rather than importing the libGDX reference app's Gradle scaffold. Node and uv prepare the locked test dependencies; Chromium is only the WebView test harness. [setup-node](https://github.com/actions/setup-node) and [setup-uv](https://github.com/astral-sh/setup-uv) use their current documented versions.

Branches, pull requests and manual branch runs execute scoring/UI checks and upload a debug APK. `v*` tags run the same checks, require release signing, verify the shared Eve certificate, and publish `arc-quest-<tag>.apk` to a GitHub release. Prerelease tags create prereleases. Only the release job receives `contents: write`. Repository visibility is never changed by CI.

Configure `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` and `KEY_PASSWORD` before the first tag. No signing secrets are currently installed. The playbook's `setup-signing.sh` can set them when you are ready; it also pushes a release tag. Tagged builds fail if the secrets are absent; they never fall back to the review key. Bump `android/AndroidManifest.xml` versionCode/versionName before each release. No release tag or F-Droid submission is part of this change.

For local release signing, export `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` and `KEY_PASSWORD`, then run `ARC_RELEASE=1 scripts/build-android.sh`. Without signing variables or an explicit `ARC_DEBUG=1` / `ARC_REVIEW=1`, the script produces only `android/build/arc-quest-unsigned.apk`. Keys, caches and APKs are ignored by Git.

## Startup, icons and input regions

Startup launches the worker in parallel with menu metadata, renders home immediately, and signals the native splash to fade out after fonts and the WebView’s first visual frame are ready. Game engine initialization continues while the menu, level browser and Info are usable. A level opened before engine readiness shows an animated preview until its first real frame arrives; Back cancels that pending request. There is no second launch screen or start button. The intro is available from Info only.

`uv run scripts/icons.py` generates matching vector launcher, monochrome and animated splash artwork. `node scripts/icon-previews.mjs` exports the two PNG sizes and renders circle/squircle/rounded-square/themed evidence. Geometry follows the [Android adaptive-icon safe-area guidance](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive); foreground layers have no pre-baked outer mask.

FT09 exposes a cached per-level hit mask from its original camera mapping and target sprites. The UI ignores taps outside that mask. The bridge still passes raw actions through unchanged so historical replays and reference parity stay intact.

The Android manifest is the CI artifact version source: versionName `0.1`, versionCode `3`, package `org.arcquest.game`. Node/Python metadata use the corresponding semantic version `0.1.0`.
