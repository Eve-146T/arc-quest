#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export TMPDIR="$PWD/.scratch"
mkdir -p "$TMPDIR" android/build/classes android/build/dex android/build/generated
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/home/user1/android-sdk}}"
BUILD_TOOLS="$SDK/build-tools/35.0.0"
PLATFORM="$SDK/platforms/android-35/android.jar"
if [ "${ARC_RELEASE:-0}" = "1" ]; then
    : "${KEYSTORE_FILE:?Set KEYSTORE_FILE for a signed release}"
    : "${KEYSTORE_PASSWORD:?Set KEYSTORE_PASSWORD for a signed release}"
    : "${KEY_ALIAS:?Set KEY_ALIAS for a signed release}"
    : "${KEY_PASSWORD:?Set KEY_PASSWORD for a signed release}"
    [ "${ARC_DEBUG:-0}" != "1" ] && [ "${ARC_REVIEW:-0}" != "1" ] || { echo 'Release signing cannot use debug/review mode.' >&2; exit 1; }
fi
node scripts/build.mjs
# Avoid stale classes and APKs after source files are removed or signing mode changes.
rm -rf android/build/classes android/build/dex android/build/generated
mkdir -p android/build/classes android/build/dex android/build/generated
rm -f android/build/arc-quest.apk
"$BUILD_TOOLS/aapt2" compile --dir android/res -o android/build/resources.zip
DEBUG_FLAG=()
if [ "${ARC_DEBUG:-0}" = "1" ]; then DEBUG_FLAG=(--debug-mode); fi
"$BUILD_TOOLS/aapt2" link "${DEBUG_FLAG[@]}" -o android/build/resources.apk -I "$PLATFORM" --manifest android/AndroidManifest.xml --java android/build/generated --min-sdk-version 26 --target-sdk-version 35 -A dist android/build/resources.zip
javac --release 8 -classpath "$PLATFORM" -d android/build/classes android/src/org/arcquest/game/*.java android/build/generated/org/arcquest/game/R.java
jar cf android/build/classes.jar -C android/build/classes .
"$BUILD_TOOLS/d8" --lib "$PLATFORM" --min-api 26 --output android/build/dex android/build/classes.jar
cp android/build/resources.apk android/build/unsigned.apk
(cd android/build/dex && zip -q ../unsigned.apk classes.dex)
"$BUILD_TOOLS/zipalign" -f 4 android/build/unsigned.apk android/build/arc-quest-unsigned.apk
if [ "${ARC_DEBUG:-0}" = "1" ] || [ "${ARC_REVIEW:-0}" = "1" ]; then
    # This key is only for local review and CI debug artifacts, never tagged releases.
    if [ ! -f android/build/review.keystore ]; then
        keytool -genkeypair -keystore android/build/review.keystore -storepass android -keypass android -alias review -keyalg RSA -keysize 2048 -validity 3650 -dname "CN=ARC Quest Local Review" >/dev/null 2>&1
    fi
    export KEYSTORE_FILE="$PWD/android/build/review.keystore" KEYSTORE_PASSWORD=android KEY_ALIAS=review KEY_PASSWORD=android
fi
if [ -n "${KEYSTORE_FILE:-}" ]; then
    : "${KEYSTORE_PASSWORD:?Missing keystore password}" "${KEY_ALIAS:?Missing key alias}" "${KEY_PASSWORD:?Missing key password}"
    "$BUILD_TOOLS/apksigner" sign --ks "$KEYSTORE_FILE" --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEY_PASSWORD --ks-key-alias "$KEY_ALIAS" --out android/build/arc-quest.apk android/build/arc-quest-unsigned.apk
    "$BUILD_TOOLS/apksigner" verify android/build/arc-quest.apk
    ls -lh android/build/arc-quest.apk
else
    echo 'Unsigned APK: android/build/arc-quest-unsigned.apk. Use ARC_REVIEW=1 for an installable local review build.'
fi
