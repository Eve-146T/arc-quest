# ARC Quest

A mobile game with Cube Run’s candy colors, Fredoka lettering and raised slab buttons. It opens on an animated launch screen while the engine warms up, walks first-time players through a short intro, and then offers two ways to play all **25 original public ARC-AGI-3 games / 183 levels** with the original game rules, pixel palette, and human-baseline scoring.

The Android APK and installable web app run the same original Python environments locally inside a background WebAssembly worker. No gameplay server, account, API key, ads, or network round trips are required. The APK includes the complete runtime. The web app works offline after its first successful cache installation.

## Run

```sh
npm ci
npm run dev        # http://localhost:4173
npm run build      # dist/, self-contained static hosting
```

The runtime and game bundle are already vendored. To regenerate from the pinned sources:

```sh
uv sync
uv run scripts/prepare.py
uv run scripts/icons.py
```

Python scratch and cache locations should stay in this workspace: `TMPDIR="$PWD/.scratch" UV_CACHE_DIR="$PWD/.cache/uv"`. All browser test invocations should also set `TMPDIR` there.

## Android

```sh
ANDROID_SDK_ROOT=/path/to/android-sdk scripts/build-android.sh
```

Requires Java, SDK platform 35, build-tools 35.0.0, and `zip`. Produces `android/build/arc-quest.apk`, signed with a local review key. Android 8+ and a current Android System WebView are required. The shell uses a local HTTPS asset origin, immersive display, Android haptics, back-button handling, and the system scorecard export picker. This is a packaged local WebView game, not a network wrapper or a Kotlin rewrite of the Python engines.

## Modes

- **Benchmark**: one run at a time across all 25 games, graded with the official scorecard. The home hero shows the run score, levels and games done, a *Continue run* button that resumes the last unfinished game, and a reset chip that archives the run to your past runs (the best one is shown as *Best*) and starts everything over. Won games show their score on the card and open their scorecard instead of replaying.
- **Sandbox**: jump into any level of any game from a level picker and clear it in as few actions as you can. Resets are free; the attempt counter restarts. Matching or beating the human count earns gold. The hero shows cleared and gold totals; cards show a segment per level (gold, cleared, or not yet).

Switch modes with the toggle on the home screen. The intro can be replayed from the info sheet.

## Controls

In a game, the top-left back button returns to the grid at once (a benchmark run is kept and restored by replay). The control row shows only what the game supports: a d-pad for games that move, a yellow action button (action 5), a purple undo button (action 7), and always a blue reset button. On the board, a tap is a click at that cell in games that support clicks, and a swipe is a move in games that move; both are decided on release, so a swipe never fires a click. Game over dims the board; tap it or press reset to retry. Desktop: arrows/WASD, Space for action 5, Z for undo, R to reset, Escape for home. In the benchmark, reset costs one action and earlier attempts remain in the score. Sound and haptics are optional.

## Faithfulness and grading

The game sources, `arcengine` modules, and SDK `models.py`/`scorecard.py` are unmodified. `public/bridge.py` adapts input, records actions through the official `Scorecard`, and returns the official `EnvironmentScorecard` result. Original human baselines and game hashes are in `public/games.json`.

RHAE: `min(115, 100 × (human actions / player actions)²)` per completed level; uncompleted levels score zero. Game scores use 1-indexed level weights and are capped at the completed-level weight share. Initial start is free; retries and undo count. Game-over inputs are ignored until retry. A benchmark run’s score is the average over all 25 public games. Scores are local practice results, not official leaderboard submissions.

Inputs do not wait for animation playback. All simulation frames are calculated by the original engine. Intermediate frames are packed as bytes, displayed at at least 30 fps, and can be interrupted by the next action; the final engine state is always preserved. This changes presentation timing, not game logic or grading. Leaving a game and opening sheets are free.

## Verification

```sh
uv run tests/native_fixtures.py
uv run --with z3-solver tests/solve_ft09.py
npm test
TMPDIR="$PWD/.scratch" node tests/parity.mjs
TMPDIR="$PWD/.scratch" node tests/levels.mjs
TMPDIR="$PWD/.scratch" npm run test:browser
```

`tests/levels.mjs` opens all 183 levels directly (sandbox entry) in Node’s Pyodide and needs no server.

Run the local server before browser tests. The test launcher uses the installed Chromium path; adjust it if your browser is elsewhere. The test-only FT09 solver is outside `public/` and is never shipped.

See `VERIFICATION.md` for results and limitations. Credits, licenses, and primary research sources are also available inside the app.

Sources: [ARC-AGI-3 documentation](https://docs.arcprize.org/), [scoring methodology](https://docs.arcprize.org/methodology), [official toolkit](https://github.com/arcprize/ARC-AGI), [available games](https://docs.arcprize.org/available-games).
