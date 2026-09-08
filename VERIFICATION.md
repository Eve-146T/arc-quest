# Verification — 7 September 2026

## Original game and grading parity

- **25 / 25 original public environments**, **183 levels**, pinned by version and SHA-256 in `public/games.json` (unchanged by this revision; only precompiled bytecode was added next to the sources).
- **825 differential states**: the browser WebAssembly runtime matched the installed official Python SDK on final pixel frames, game states, completed levels, action counts, resets, per-level action totals, per-level scores, and game score (`node tests/parity.mjs`, run again after the bytecode change).
- **5 / 5 scoring unit tests** (`npm test`).
- **183 / 183 sandbox level entries** (`node tests/levels.mjs`): every level of every game opens directly through the bridge, renders a 64 × 64 frame in state NOT_FINISHED at that level index, differs from level 1’s first frame, and a reset stays on that level.
- **FT09 complete playthrough** in the benchmark run: six levels, **75 actions**, **100%**, exported scorecard verified. The same solver clears FT09 level 1 in the sandbox under the human count (gold). The solver is test-only and never shipped.
- Original `arcengine` files, all 25 game sources, and the SDK’s scoring/model modules are bundled unchanged. Sandbox entry uses the engine’s own `set_level` followed by a level reset; benchmark runs still use the official `Scorecard`.

## Loading time

Measured on the Moto G7 Power inside the app (`arcMetrics.boot`), engine worker start to `ready`:

- Before: **18.3 s** (Python runtime 9.3 s, packages 2.8 s, bridge imports 6.2 s), then 0.8 to 1.3 s to open each game for the first time.
- After: **10.0 s** to ready, all 25 game modules pre-imported in idle time right after, later game opens **median 0.39 s, max 0.62 s** measured around a real tap (which itself includes about 0.2 s of `adb` input latency). The remaining boot is WebAssembly compilation and interpreter start, which cannot be cached in the WebView.
- What changed: precompiled `.pyc` bytecode (unchecked-hash) shipped inside `engine.zip`, the pure-Python wheels, and the 147 stdlib modules a boot touches; wheels and archive fetched in parallel with the runtime; games imported one per idle macrotask after `ready`. Download grows by 4.6 MB (17.7 → 22.3 MB), cached by the service worker after the first visit.
- The engine now boots from the launch screen. On a first run the intro takes longer than the boot; in the sweep the first game opened 8.8 s after the launch screen appeared, 2.8 s of which was waiting for the engine after the intro was tapped through quickly. On later runs the launch screen’s progress bar shows the warm-up, and a game tapped before it finishes shows the loading sheet for the remainder.
- Desktop Chromium (headless, median of 6): ready 2.99 s → 1.35 s; first cold open of the largest game (ka59) 98 ms → 24 ms.

## Interface (this revision)

- Launch screen: an animated 6 × 6 puzzle that keeps recolouring itself, the logo, and a breathing “TAP TO START”, with the engine progress bar underneath.
- First-run intro: four pages (what the games are, controls, scoring, mode choice) with animated illustrations, dots, skip, and a back key that steps back a page. Replayable from the info sheet.
- Modes: **Benchmark** (one run, official grading, continue from the hero card, reset-and-archive with confirmation, best past run shown) and **Sandbox** (level picker per game, free resets, attempt counter, human target, gold at or under the human count, cleared/gold totals in the hero). Cards show a segment per level; won games and fully gold games get badges.
- Removed text: the level pill in the game header and the level/count captions on cards; the segment bars carry that. The launcher icon is now an adaptive icon (background, foreground and monochrome layers), so the launcher no longer masks the old square into a shrunken circle.
- Animations: staggered card pop-in, hero score count-up, confetti on cleared levels and wins, sliding mode switch, sheet pop-in, a periodic wiggle on the info chip, page transitions in the intro. All respect reduced-motion.

## Browser integration (`npm run test:browser`, Chromium, 390 × 844 touch)

Passed: launch and intro, mode choice, rapid touch input with no dropped or doubled actions, reset in the control row costing one action, swipe on a d-pad game, swipe versus click in a mixed game (dc22), vertical swipes ignored in a left/right-only game (bp35), game-over overlay and retry (tu93), back to home and run restore after reload, the FT09 win with badge and 4.0% run average, resetting the run archives it as the best run, sandbox level entry with target and level marker, sandbox gold clear with next-level and the “next uncleared” hero button, the level picker, score export, and a cold offline reload after service-worker caching. No JavaScript errors.

All home and game controls fit without page scrolling at 320 × 568, 360 × 640, 360 × 760, 390 × 844, 430 × 932, 844 × 390 (landscape), 768 × 1024, and 1440 × 900, checked with the game that has the most controls (ar25).

## Physical device sweep (`node tests/android.mjs`)

- Device: **Moto G7 Power**, Android 15, 360 × 760 CSS viewport at 2× density, Android System WebView.
- From a cleared state with real taps: launch screen, the four intro pages, benchmark chosen; then **25 / 25 games passed** with the same per-game control checks as before (each d-pad button, action 5, undo, swipes, taps at exact cells, long press, ignored gestures, five rapid taps, reset, back), no unexpected or missing actions, no JavaScript errors.
- Sandbox on the device: mode switch, LS20 level 3 opened from the picker with target 73, attempt counter, free reset. Hardware back leaves a game, then leaves the app from home. A second launch skips the intro and restores the last mode.
- The phone was shared with another agent that twice launched a different app over ARC Quest during the sweep; the sweep now re-foregrounds ARC Quest before each step, and the WebView state survived both interruptions.
- Screenshots of every game and screen are in `test-results/android/`. The published APK disables WebView inspection; the sweep used a debug build.

## Packaging and limits

The Android artifact is a self-contained WebView application with a bundled WebAssembly/Python worker, not a native rewrite of ARC’s engines. Its assets load from an intercepted local HTTPS origin. Android 8+ with a current System WebView is required. The APK (15 MB) has no gameplay server dependency and uses a local review signing key.

Sandbox levels start from the engine’s clean copy of that level; games whose later levels depend on state carried from earlier levels are played as the engine presents them from a level reset. Benchmark scores are **local practice scores**, not official leaderboard submissions. Differential tests cover all environments’ sampled states; a full winning path was verified for FT09, not all 183 levels. No claim is made about undisclosed/private ARC-AGI-3 games.
