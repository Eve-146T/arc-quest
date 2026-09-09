# Repository Guidelines

## Project Structure & Module Organization

- `public/` contains the mobile UI (`index.html`, `app.js`, `style.css`), worker (`engine-worker.js`), Python adapter (`bridge.py`), and bundled assets/runtime.
- `vendor/environments/` holds the original ARC-AGI-3 sources. `public/games.json` pins versions, baselines, and checksums.
- `android/` contains the Java WebView shell, manifest, and resources.
- `scripts/` handles serving, bundling, asset preparation, and APK builds.
- `tests/` contains scoring, parity, sandbox level-entry, WebView UI, and Android checks. Generated evidence belongs in `test-results/`; build outputs belong in `dist/` and `android/build/`.

## Build, Test, and Development Commands

Prefer `uv` for Python. Never write to `/tmp/`; configure workspace scratch paths before running tools:

```sh
mkdir -p .scratch test-results
export TMPDIR="$PWD/.scratch"
export UV_CACHE_DIR="$PWD/.cache/uv"
export MPLCONFIGDIR="$PWD/.cache/matplotlib"
```

- `npm ci` and `uv sync --group test`: install locked dependencies.
- `npm run dev`: serve the game at `http://localhost:4173`.
- `npm run build`: bundle Android WebView assets in `dist/` (not a web release).
- `uv run scripts/prepare.py`: rebuild bundled engine sources, runtime dependencies, and previews; downloads may require networking.
- `ARC_REVIEW=1 scripts/build-android.sh`: build and sign a review `android/build/arc-quest.apk`. Requires Java, Android platform/build-tools 35, and `zip`; configure `ANDROID_SDK_ROOT`.

## Coding Style & Naming Conventions

Use four-space indentation for Python/Java and two spaces for expanded JavaScript. Preserve surrounding formatting; avoid unrelated reformatting. Use camelCase for JavaScript/Java functions, snake_case for Python, and descriptive filenames. JavaScript uses ES modules. No formatter or linter is configured; use `node --check` for changed JavaScript.

## Testing Guidelines

Node’s test runner executes `tests/*.test.mjs`; Playwright exercises the Android WebView UI in a local harness. Generate fixtures before testing (`tests/android.mjs` needs a debug build, `ARC_DEBUG=1 scripts/build-android.sh`, installed on a USB-connected phone):

```sh
uv run tests/native_fixtures.py
uv run --group test tests/solve_ft09.py
npm test
node tests/parity.mjs
node tests/levels.mjs
npm run test:ui
node tests/android.mjs
```

Keep the development server running for WebView UI tests; configure their Chromium executable paths. Adapter changes must preserve reference pixels, actions, and scores. UI changes should cover touch, narrow/landscape layouts, persistence, and offline reload. Keep solvers outside shipped assets. Record evidence and limitations in `VERIFICATION.md`.

## Commit & Pull Request Guidelines

Use concise imperative subjects, such as `Fix retry action counting`. PRs should explain behavior changes, link relevant issues, and report checks. Include screenshots for UI changes. Publish review artifacts with `drop apk android/build/arc-quest.apk` and include the URL.

## Engine Integrity

Keep upstream games and scoring modules unmodified. Implement adaptations in the bridge and UI; preserve licenses, palette, baselines, and local-practice labeling. Never commit signing keys or generated caches.
