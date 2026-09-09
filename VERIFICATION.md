# Verification

Verified 2026-09-09. The original checkout is preserved in commit `6dd0b23`.

Review builds: [web](https://apps.muxu.click/d/9qgcg8e8) · [Android APK](https://apps.muxu.click/d/qwzp7wzw).

## Current behavior

- Sandbox is the first tab and the default for new players. Every game and level is available there. Benchmark only allows the first unfinished game; completed games open their scorecards.
- Level selection, lab help, info and scorecards use full screens with a back button. Restart and sandbox completion are native modal overlays over the board, with focus containment and Escape/hardware-back dismissal. Completion shows actions and a personal best, with no star system. The in-game sandbox lab button is removed.
- Each sandbox level has its own initial-board preview. All ten levels of LF52 fit without scrolling at every tested size. The three-column picker shows large previews, level numbers and best action counts. Gold is only the background color; there are no gold labels or stars on tiles. Uncleared status remains in accessible labels. A numerical gold target appears only after a completed attempt above that target.
- Removed per-game corner counters and percentages, redundant cleared/gold prose and the picker explanation. Benchmark progress reads “% complete” and means levels cleared / 183. In-game “game score” is the official action-efficiency score, not completion or rank.
- The home trophy stays hidden until a full run is completed. Partial/deleted runs never become records. Completed records survive run deletion.
- Red trash controls ask for confirmation. A benchmark retry adds one action; a sandbox retry starts a new attempt. Blue/white sound and haptic toggles use distinct on/off icons and persist.
- The settings bar uses 42px buttons with consistent 10px icon padding. The info button has its raised background again, without shaking. A persistent dark-mode toggle sits beside haptics; theme changes leave the original game palette unchanged.
- Navigation fades take 110ms, tab transitions 160–180ms. The old staggered card entrance is removed; the logo moves gently and reduced-motion preferences are respected. The viewport margin/overflow reset is restored.
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
| JavaScript syntax and whitespace | `node --check` on changed modules; `git diff --check` |
| Scoring and progress rules | `npm test`: 1,000 official scoring fixtures, benchmark ordering, complete-only records, version matching, hidden/retroactive diamond awards and current-attempt ratings |
| Touch browser integration | `npm run test:browser`: controls, swipe versus tap, restart/result overlays, blocked underlying inputs, cancel/confirm restart, dark-mode reload persistence, next-game restriction, nested back, conditional gold targets, settings, record visibility, diamond unlock, export and offline cold reload |
| Full game | FT09: six levels, 75 actions, 100% official game score, played through the browser |
| Layouts | `node tests/layouts.mjs`: every one of 25 games at 320×568, 360×640, 390×844, 568×320 and 844×390, including the extra target pill, every control and restart-overlay bounds. All ten picker cards fit. Initial board pixels are identical across theme/viewport changes. General browser checks also cover tablet and desktop. |
| Public records | `uv run tests/leaderboard_replay.py`: all 76 retrieved solutions clear the expected level in exactly the recorded count |
| Android device | Moto G7 Power, Android 15, 360×760 CSS viewport: real touches, dark mode, restart-overlay cancel/confirm, absent in-game lab, info, hardware back, and app-switch board pixels/layout; no JavaScript errors |
| Packaging | Offline static build and signed Android APK; release build has WebView debugging disabled |

Device checks use a debug APK, back up local storage and restore it afterward. Evidence is in ignored `test-results/`; exactly four README screenshots are committed in `docs/screenshots/`. Progress used for screenshot examples and the complete-run/diamond UI tests is explicitly seeded fixture data. FT09 gameplay and public-record replay checks execute real engines.

## Scope

No upstream games, baselines, palette, bridge or scoring modules were changed. Per-level thumbnails were rendered from all 183 original initial frames with the same reset/seed convention as sandbox. The baseline commit contains the earlier 25-game parity and 183-level entry checks; those engines are unchanged in this revision.

The Android app is a bundled WebView/Python WebAssembly game, requiring Android 8+ and a current System WebView. Web offline play requires one successful cache installation. Scores are local practice, not official submissions. This verifies the public game set only.
