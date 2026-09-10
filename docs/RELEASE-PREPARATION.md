# Releases and F-Droid

The repository is public at [Eve-146T/arc-quest](https://github.com/Eve-146T/arc-quest).
[Version 1.0.1](https://github.com/Eve-146T/arc-quest/releases/tag/v1.0.1) is published
with an Eve-signed APK (version code 5). Its runtime builds from pinned sources,
and independent GitHub/local APK builds passed signature-copy reproducibility
checks. The original version 1.0 release remains available unchanged.

## Store listing

The user-edited listing is in `fastlane/metadata/android/en-US/`: title, short and
full descriptions, versioned changelogs, the 512px icon and exactly four portrait
screenshots. The README and its deletions are preserved. Run
`node scripts/check-metadata.mjs` to validate the listing without modifying it.

The screenshots show Sandbox, the level browser, FT09 gameplay and a completed
level. Boards are real engine renders; saved-progress examples are seeded
fixtures, as recorded in `VERIFICATION.md`.

## Release identity

- Package: `arc.quest`.
- License: `AGPL-3.0-only`; third-party components retain their own licenses.
- APK name: `arc-quest-v<version>.apk`.
- Eve signing certificate SHA-256:
  `2fe09f50180d92e3b3204992ffc9a8c598087b9a7bac0b12d3f23a1e3687fd7f`.

Release tags must match `android:versionName`. Signing secrets are configured in
GitHub Actions. The release workflow first builds the runtime from pinned sources,
checks it against the bundled assets, builds the APK and signs that artifact.
It then creates the GitHub release. Published tags and assets are not replaced.

## F-Droid

The recipe lives in `fdroid/arc.quest.yml`. This app uses a Java/AAPT2/D8 build at
the repository root, with `output` selecting the unsigned APK; there is no Gradle
`app/` subproject. The recipe must point at a released commit's full SHA, with
matching version/code and a downloadable signed APK.

[Runtime build documentation](RUNTIME-BUILD.md) records the pinned source path.
F-Droid removes committed runtime binaries before scanning and rebuilds them.
Its recipe uses no scanner exceptions. Source schema/lint, the actual F-Droid
build and APK signature-copy verification must pass before inclusion is ready.
F-Droid maintainers control acceptance and when the app appears in the catalogue.
