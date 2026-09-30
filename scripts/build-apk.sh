#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
sdk_dir="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
build_tools="$sdk_dir/build-tools/36.0.0"
android_jar="$sdk_dir/platforms/android-37.0/android.jar"
java_dir="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
build_dir="$project_dir/build"
sign_dir="$project_dir/.signing"
mkdir -p "$build_dir/classes" "$build_dir/dex" "$sign_dir" "$project_dir/dist"
"$build_tools/aapt2" compile --dir "$project_dir/android/res" -o "$build_dir/resources.zip"
"$build_tools/aapt2" link -I "$android_jar" --manifest "$project_dir/android/AndroidManifest.xml" -A "$project_dir/web" -o "$build_dir/base.apk" "$build_dir/resources.zip"
"$java_dir/bin/javac" -source 8 -target 8 -Xlint:-options -classpath "$android_jar" -d "$build_dir/classes" "$project_dir"/android/src/local/fridge/dashboard/*.java
"$java_dir/bin/jar" cf "$build_dir/classes.jar" -C "$build_dir/classes" .
JAVA_HOME="$java_dir" "$build_tools/d8" --lib "$android_jar" --min-api 26 --output "$build_dir/dex" "$build_dir/classes.jar"
cp "$build_dir/base.apk" "$build_dir/unsigned.apk"
(cd "$build_dir/dex" && zip -q -j "$build_dir/unsigned.apk" classes.dex)
"$build_tools/zipalign" -f -p 4 "$build_dir/unsigned.apk" "$build_dir/aligned.apk"
if [ ! -f "$sign_dir/prototype.keystore" ]; then
 "$java_dir/bin/keytool" -genkeypair -keystore "$sign_dir/prototype.keystore" -storepass android -keypass android -alias prototype -keyalg RSA -keysize 2048 -validity 3650 -dname 'CN=Fridge Dashboard Prototype' >/dev/null 2>&1
fi
JAVA_HOME="$java_dir" "$build_tools/apksigner" sign --ks "$sign_dir/prototype.keystore" --ks-key-alias prototype --ks-pass pass:android --key-pass pass:android --out "$project_dir/dist/fridge-dashboard-prototype.apk" "$build_dir/aligned.apk"
JAVA_HOME="$java_dir" "$build_tools/apksigner" verify "$project_dir/dist/fridge-dashboard-prototype.apk"
printf 'Built: %s\n' "$project_dir/dist/fridge-dashboard-prototype.apk"
