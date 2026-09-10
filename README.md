<img align="left" width="80" height="80"
src="public/assets/icon-192.png" alt="ARC Quest">

# ARC Quest

25 puzzle games. 183 levels. Figure out the rules as you go.

An offline Android app. Version 0.1 · `org.arcquest.game`.

[Android APK](https://apps.muxu.click/d/ihdu86z4)

## Screenshots

<p align="center">
  <img src="docs/screenshots/sandbox.png" width="22%" alt="Choose a puzzle in sandbox">
  <img src="docs/screenshots/levels.png" width="22%" alt="Visual level grid with gold backgrounds">
  <img src="docs/screenshots/game.png" width="22%" alt="FT09 puzzle">
  <img src="docs/screenshots/complete.png" width="22%" alt="A completed level over the board">
</p>

## Gameplay

- **Sandbox:** choose any level. Match the human action count for gold.
- **Benchmark:** play all 25 games in order. Every action counts.
- Tap the board, swipe, or use the buttons. Each game has its own controls.
- Earn gold everywhere to reveal diamonds for matching or beating public level records.

No account, ads or gameplay server. Progress stays on your device.

## Build

```sh
npm ci
npm run dev
```

Build an installable review APK with `ARC_REVIEW=1 scripts/build-android.sh`. GitHub Actions checks every change and uploads a debug APK; `v*` tags build signed releases once the Eve signing secrets are configured.

[Development](docs/DEVELOPMENT.md) · [Verification](VERIFICATION.md)

## Credits & licenses

Original games and engine by the [ARC Prize Foundation](https://arcprize.org/), under the [MIT license](public/licenses/ARC-MIT.txt). [Fredoka](public/licenses/Fredoka-OFL.txt) by Milena Brandão. Diamond records from [ARC3.Games](https://arc3.games/). Interface inspired by [Cube Run](https://github.com/Eve-146T/cube-run).

Scores are local practice results, not official leaderboard submissions.
