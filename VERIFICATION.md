# Verification

Verified 2026-09-10. Android version **1.0**, versionCode **4**, package **arc.quest**. The original checkout is preserved in the root commit, titled `Save current ARC Quest state`.

The README revision renames the Android package to `arc.quest` and licenses the original app code under AGPL-3.0-only, with the full license included in the APK's Credits screen. Third-party licenses are retained. Debug/review packaging and the WebView smoke test pass after the rename; the device evidence below was captured with the prior package ID. Android treats the renamed package as a separate installation, so existing saves remain in the old app.

Previous 0.1 review build: [Android APK](https://apps.muxu.click/d/vskrqnhg). The repository remains private. [Android launch recording](https://apps.muxu.click/d/v736svdi). [Adaptive icon shapes](https://apps.muxu.click/d/2hdy6d2y). [Intro finale](https://apps.muxu.click/d/3y33xa94).

## Current behavior

- Sandbox is the first tab and the default for new players. Every game and level is available there. Benchmark only allows the first unfinished game; completed games open their scorecards.
- Level selection, lab help, info and scorecards use full screens with a back button. Restart and sandbox completion are native modal overlays over the board, with focus containment and Escape/hardware-back dismissal. Completion shows actions and a personal best, with no star system. The in-game sandbox lab button is removed.
- Info explains the Sandbox/Benchmark retry difference, action-efficiency scoring, completion percentage and GitHub bug reporting. Credits and local license documents open as nested app screens, preserving scroll position and button handlers on return. The optional four-page intro uses the same wording; its third page compares efficiency, with the 8-action player's 115% bar longer than the 10-action human's 100% bar. The final page has a celebratory animated icon and one “Got it. Let’s go!” button, preserving the selected home tab. Illustrations loop with matching start/end poses, respect reduced motion, and fit all five tested narrow/landscape sizes.
- Each sandbox level has its own initial-board preview. All ten levels of LF52 fit without scrolling at every tested size. The three-column picker shows board previews, level numbers, best action counts and per-level action-efficiency percentages (0% until cleared, 100% at the human count, up to 115%). Gold is only the background color; there are no gold labels or stars on tiles. Uncleared status remains in accessible labels. A numerical gold target appears only after a completed attempt above that target.
- Removed per-game corner counters and percentages, redundant cleared/gold prose and the picker explanation. Benchmark progress reads “% complete” and means levels cleared / 183. In-game “game score” is the official action-efficiency score, not completion or rank.
- The home trophy stays hidden until a full run is completed. Partial/deleted runs never become records. Completed records survive run deletion.
- Red trash controls ask for confirmation. A benchmark retry adds one action; a sandbox retry starts a new attempt. Blue/white sound and haptic toggles use distinct on/off icons and persist.
- The settings bar uses 42px buttons with consistent 10px icon padding. The info button has its raised background again, without shaking. Dark mode and its saved preference are removed. The Android shell always starts with the light background; original game pixels remain unchanged.
- Navigation fades take 110ms, tab transitions 160–180ms, and the home counters take 700ms. The completion number has a fixed-width slot, keeping “% complete” stationary throughout the count-up. The old staggered card entrance is removed; the logo moves gently and reduced-motion preferences are respected. The viewport margin/overflow reset is restored.
- FT09 taps are filtered before sending an action when they miss the game’s `Hkx`/`NTi` target sprites. The bridge supplies a cached hit mask using the original camera and sprite lookup. Background/HUD taps leave the board, action count and history unchanged in both modes. Raw engine actions and replay of existing histories are preserved.
- Every level launch shows its own puzzle preview as nine animated pieces over the current screen until the first board is ready. The loader fits both portrait and landscape and adds no minimum display time. Home is never exposed between picker and game; cancelling the load ignores late engine results.
- Android is the only supported app. PWA metadata, service-worker caching, web publishing smoke tests and browser export/haptic fallbacks are removed. A local Chromium harness remains for testing the bundled WebView UI.
- Navigation, home/level/scorecard views, intro, settings/feedback and board rendering/input are split into focused modules under `public/ui/`; CSS is split by screen. The app controller retains session/progress ownership, and the small Android activity retains lifecycle/asset/native bridge responsibilities. Upstream game classes were reviewed as vendor code and left intact.
- Native launch is the only startup animation. It stays over the app only until menu metadata, fonts and the first home frame are ready, then fades out in 180ms. The engine initializes in parallel while the menu, level browser and Info are already usable. The Tap to Start screen and automatic intro are removed; Show intro remains available in Info. The four-piece icon slides, turns and assembles in 580ms and its foreground stays inside the adaptive-icon safe area. Circle, squircle, rounded-square and themed previews are checked. A cold-start recording verifies automatic entry to home. On the Moto G7 Power, menu readiness was 569ms from page navigation while the engine took 10.0s in the background; native process startup is additional. The previously blocking engine wait is removed from launch, not from the first game if opened immediately. Android 8–11 use the same animated artwork in a native cover; that fallback is build-checked but was not exercised on an older device.
- App suspension clears gestures, finishes finite UI animations and redraws the final engine frame. Stable Android layout flags prevent system-bar resizing during app switching.

## Public diamond records

Source: [ARC3.Games](https://arc3.games/) and its [public API](https://arc3.games/api/), retrieved 2026-09-08. It supplies shortest recorded action sequences per level, keyed by exact game version.

- **76 / 183 levels** have public records for the bundled versions; all 76 sequences were replayed successfully against the unmodified engines.
- **107 levels** have no matching public entry. Their target is explicitly `null`; they cannot receive a diamond from this snapshot. Targets are never fabricated or substituted from another game version.
- Match or beat a recorded count to qualify. Diamonds appear only after all 183 sandbox levels have gold; earlier personal bests are included automatically.
- These are community records, not proofs of mathematical optimality. The source/date and counts ship offline in `public/diamonds.json`. Replay sequences stay in ignored test evidence.
- `uv run scripts/update-diamonds.py` refreshes the snapshot; it handles API rate limits and resumes cached reads. Delete its ignored fetch cache to refresh every level from scratch. `uv run tests/leaderboard_replay.py` checks the resulting sequences.

## Checks passed

| Check | Evidence |
| --- | --- |
| JavaScript syntax and whitespace | `node --check` on changed modules; `bash -n scripts/build-android.sh`; `git diff --check` |
| Scoring and progress rules | `npm test`: 1,000 official scoring fixtures, benchmark ordering, complete-only records, version matching, hidden/retroactive diamond awards, current-attempt ratings, and every new sandbox percentage compared with the official per-level fixture results |
| WebView UI integration | `npm run test:ui`: controls, swipe versus tap, restart/result overlays, blocked underlying inputs, cancel/confirm restart, next-game restriction, nested back, conditional gold targets, settings, record visibility, diamond unlock and native score-export payload |
| Full game | FT09: six levels, 75 actions, 100% official game score, played through the WebView UI harness |
| Layouts | `node tests/layouts.mjs`: every one of 25 games at 320×568, 360×640, 390×844, 568×320 and 844×390, including the extra target pill, every control and restart-overlay bounds. All ten picker cards fit. Initial board pixels are identical across viewport changes. The WebView harness also checks larger displays. |
| Public records | `uv run tests/leaderboard_replay.py`: all 76 retrieved solutions clear the expected level in exactly the recorded count |
| Android device | Moto G7 Power, Android 15, 360×760 CSS viewport: real touches, light-only settings, restart-overlay cancel/confirm, absent in-game lab, info, credits touch scrolling, nested license back navigation, intro score bars, hardware back, and app-switch board pixels/layout; no JavaScript errors |
| Loading/animation regression | `node tests/ui-smoke.mjs`: menu startup with the engine deliberately held back, no Tap to Start or automatic intro, a stationary completion caption, ignored FT09 background taps, nested credits/license scrolling and preserved navigation, seamless intro loops and all four pages in five layouts, conditional targets and scores, cold/warm loaders, cancel without a late game jump, 700ms counter timing, real animated FT09 clear, touch-click deduplication and accessibility activation |
| Engine parity and level entry | 825 reference states across all 25 games match pixels and scores; all 183 sandbox levels open directly, including valid target masks on all six FT09 levels |
| Packaging | JDK 17, platform/build-tools 35: debug and release-mode review APKs; the latter has WebView debugging disabled |

Device checks use a debug APK, back up local storage and restore it afterward. Evidence is in ignored `test-results/`; exactly four README screenshots are committed in `docs/screenshots/`. Progress used for screenshot examples and the complete-run/diamond UI tests is explicitly seeded fixture data. FT09 gameplay and public-record replay checks execute real engines.

## Scope

No upstream games, baselines, palette or scoring modules were changed. The bridge only adds FT09 hit-region metadata; its action and scoring paths remain intact. Per-level thumbnails were rendered from all 183 original initial frames with the same reset/seed convention as sandbox. The 25-game parity and 183-level entry checks were rerun for this bridge change.

The Android app is a bundled WebView/Python WebAssembly game, requiring Android 8+ and a current System WebView. Scores are local practice, not official submissions. This verifies the public game set only.

## CI

[GitHub Actions](https://github.com/Eve-146T/arc-quest/actions) regenerates the official scoring fixtures, runs Node checks and the WebView smoke test, then builds and uploads an Android debug APK named with the manifest version (`arc-quest-1.0-debug`) for branches/PRs. Release tags run the same checks, require the four Eve signing secrets, verify the shared signing certificate and create a GitHub release. The workflow uses the playbook's action majors, JDK 17 and Android SDK 35. The existing AAPT2/Java builder is retained because this is a WebView app, not the libGDX reference app.

No signing secrets or release tags were added; no visibility change or F-Droid submission was made. The release job is configured but cannot be exercised with the shared Eve key until its secrets are supplied. Local review builds use the existing ignored review key. Unsigned/default builds and explicit release signing are separate, so CI cannot accidentally publish a review-signed release.


## Local portrait and listing preparation

Version `1.0`, code `4`, locks the `arc.quest` activity to portrait. The proposed fastlane listing contains editable English title/descriptions, `changelogs/4.txt`, the 512px icon and exactly four portrait captures. The metadata validator passes, and the disabled local F-Droid draft passes the current official metadata JSON schema. This validates structure, not F-Droid acceptance or reproducibility. The user-edited metadata is included in the version 1.0 preparation commit. No F-Droid submission has been made. Remaining release work is recorded in `docs/RELEASE-PREPARATION.md`.


`tests/android-portrait.mjs` passed on the Moto G7 Power: home, level browser, gameplay and Info remained 360×760 with user rotation set to 0, 1 and 3. Puzzle pixels stayed unchanged. The test restored rotation settings and app saves. Debug and release-mode portrait APKs build successfully; native manifest inspection reports `screenOrientation=1` (portrait). Evidence is in `test-results/portrait/`.

## F-Droid source-build preparation (1.0.1 / code 5)

- Built Pyodide 0.29.3/CPython 3.13.2, NumPy 2.2.5 and pydantic-core 2.41.5 from pinned upstream sources. The four pure Python dependency wheels also come from their pinned source recipes. `scripts/build-runtime.sh` completed locally.
- Verified the newly vendored engine/scoring `.py` files against the pinned upstream installations. Game sources remain unchanged and are checked against their recorded SHA-256 hashes when packaging.
- Both the initial source-built runtime and the final runtime with normalized compiler paths passed all 825 reference states across 25 games, checking frames, actions, state, completion and scoring. The final WebView UI smoke test passed, including credits navigation, FT09 hit testing, startup and intro layout/animations. Node scoring/progress tests passed.
- The runtime packager produced byte-identical archives across independent invocations. No local home paths remain in the compiled extension binaries.
- Two local APK builds, including one invoked with a different timezone, passed `apksigcopier compare --unsigned` against a review-signed build. Fixed dex timestamps/permissions, removed ZIP uid/gid metadata, and preserved alignment during signing. This local check uses the review certificate; verification against the published Eve-signed release is a separate release check.
- Current fdroiddata schema, `fdroid lint` and YAML formatting checks passed for the prepared recipe. Current fdroidserver source scanning passed with zero findings after the recipe's removals, without scanignore/scandelete exceptions. Removed inputs are the previously bundled runtime archives and unused upstream test fixtures; production runtime binaries are compiled after scanning.
- Store metadata validates for 1.0.1/code 5, with the existing four screenshots. README copy and prior deletions remain unchanged.
- Independent GitHub source-build verification, publication of 1.0.1 and the actual F-Droid build/submission pipeline are still pending at this commit. The local recipe stays disabled until the published release commit can be inserted.

### Independent runtime-build corrections

- GitHub source compilation succeeded after adding `libltdl-dev`.
- Independent output comparison exposed filesystem-dependent Emscripten port link order and build paths in CPython, NumPy configuration and the pydantic-core SBOM. The build now sorts ports, fixes CPython's compiled prefix and normalizes generated metadata while recalculating wheel RECORD checksums. The lock file excludes unused test archives.
- A clean local CPython rebuild passed. All 825 reference states across 25 games and the complete WebView UI suite passed with the rebuilt runtime.
- The loader is rebuilt on cached runs so its build ID tracks the current WebAssembly. Independent CI comparison and F-Droid release/submission remain pending until their actual results are recorded.

### Published source-built release 1.0.1

- Independent source build: GitHub Actions run `34516555805` passed, including exact comparison of every generated runtime asset against the committed files.
- Release tag `v1.0.1` points to `f108dca`; tagged workflow `34518007066` passed and published `arc-quest-v1.0.1.apk`.
- The downloaded release APK has Eve's expected SHA-256 signing certificate `2fe09f50180d92e3b3204992ffc9a8c598087b9a7bac0b12d3f23a1e3687fd7f`.
- `apksigcopier compare --unsigned` passed for the independent CI APK against both the local review-signed APK and the published Eve-signed APK.
- The enabled F-Droid recipe pins the full released commit. Its schema, formatting and local F-Droid lint checks pass. F-Droid's own pipeline and maintainer acceptance are tracked separately.
