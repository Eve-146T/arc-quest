#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export TMPDIR="$PWD/.scratch"
SDK="${ANDROID_SDK_ROOT:-/home/user1/android-sdk}"
BUILD_TOOLS="$SDK/build-tools/35.0.0"
PLATFORM="$SDK/platforms/android-35/android.jar"
mkdir -p android/build/classes android/build/dex android/build/generated
node scripts/build.mjs
"$BUILD_TOOLS/aapt2" compile --dir android/res -o android/build/resources.zip
DEBUG_FLAG=()
if [ "${ARC_DEBUG:-0}" = "1" ]; then DEBUG_FLAG=(--debug-mode); fi
"$BUILD_TOOLS/aapt2" link "${DEBUG_FLAG[@]}" -o android/build/resources.apk -I "$PLATFORM" --manifest android/AndroidManifest.xml --java android/build/generated --min-sdk-version 26 --target-sdk-version 35 -A dist android/build/resources.zip
javac --release 8 -classpath "$PLATFORM" -d android/build/classes android/src/org/arcquest/game/MainActivity.java android/build/generated/org/arcquest/game/R.java
jar cf android/build/classes.jar -C android/build/classes .
"$BUILD_TOOLS/d8" --lib "$PLATFORM" --min-api 26 --output android/build/dex android/build/classes.jar
cp android/build/resources.apk android/build/unsigned.apk
(cd android/build/dex && zip -q ../unsigned.apk classes.dex)
"$BUILD_TOOLS/zipalign" -f 4 android/build/unsigned.apk android/build/aligned.apk
if [ ! -f android/build/review.keystore ]; then
keytool -genkeypair -keystore android/build/review.keystore -storepass android -keypass android -alias review -keyalg RSA -keysize 2048 -validity 3650 -dname "CN=ARC Quest Local Review" >/dev/null 2>&1
fi
"$BUILD_TOOLS/apksigner" sign --ks android/build/review.keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias review --out android/build/arc-quest.apk android/build/aligned.apk
"$BUILD_TOOLS/apksigner" verify android/build/arc-quest.apk
ls -lh android/build/arc-quest.apk
