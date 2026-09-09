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

The game runs at `http://localhost:4173`. `npm run build` produces the offline web bundle in `dist/`.

## Android

```sh
ANDROID_SDK_ROOT=/path/to/android-sdk scripts/build-android.sh
```

Requires Java, Android platform 35, build-tools 35.0.0 and `zip`. The output is `android/build/arc-quest.apk`, signed with an ignored local review key. Android 8+ with a current System WebView is required.

## Checks

Keep the development server running for browser tests.

```sh
uv run tests/native_fixtures.py
uv run --group test tests/solve_ft09.py
npm test
node tests/parity.mjs
node tests/levels.mjs
npm run test:browser
node tests/layouts.mjs
```

Set `CHROMIUM_PATH` if Chromium is installed somewhere other than the default in `tests/browser.mjs`. `ARC_DEBUG=1 scripts/build-android.sh` builds an inspectable APK for the connected-device checks in `tests/android.mjs`. Those checks back up and restore local storage.

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
