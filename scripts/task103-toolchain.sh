#!/bin/bash
# Task 103: reinstall Flutter + Android toolchain (sandbox was reset)
exec > /home/z/my-project/scripts/task103-toolchain.log 2>&1
set -x
mkdir -p /home/z/toolchain && cd /home/z/toolchain

echo "=== [1/5] Flutter SDK ==="
if [ ! -x /home/z/flutter/bin/flutter ]; then
  URL=$(curl -s https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
h=d['current_release']['stable']
r=[x for x in d['releases'] if x['hash']==h][0]
print('https://storage.googleapis.com/flutter_infra_release/releases/'+r['archive'])
")
  echo "Flutter URL: $URL"
  curl -sL -o flutter.tar.xz "$URL"
  tar xf flutter.tar.xz -C /home/z/ && rm -f flutter.tar.xz
fi
export PATH=/home/z/flutter/bin:$PATH
flutter --version || exit 1
flutter config --no-analytics >/dev/null 2>&1

echo "=== [2/5] JDK 17 ==="
if [ ! -d /home/z/jdk-17 ]; then
  curl -sL -o jdk.tar.gz "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_linux_hotspot_17.0.13_11.tar.gz"
  tar xf jdk.tar.gz -C /home/z/ && rm -f jdk.tar.gz
  JDIR=$(ls -d /home/z/jdk-17* | head -1); ln -sfn "$JDIR" /home/z/jdk-17
fi
export JAVA_HOME=/home/z/jdk-17
$JAVA_HOME/bin/java -version || exit 1

echo "=== [3/5] Android cmdline-tools ==="
mkdir -p /home/z/android-sdk/cmdline-tools
if [ ! -x /home/z/android-sdk/cmdline-tools/latest/bin/sdkmanager ]; then
  curl -sL -o cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  python3 -c "import zipfile; zipfile.ZipFile('cmdtools.zip').extractall('/home/z/android-sdk/cmdline-tools')"
  mv /home/z/android-sdk/cmdline-tools/cmdline-tools /home/z/android-sdk/cmdline-tools/latest
  rm -f cmdtools.zip
fi
export ANDROID_HOME=/home/z/android-sdk
SDKM=$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager

echo "=== [4/5] SDK packages ==="
yes | $SDKM --licenses >/dev/null 2>&1
$SDKM "platform-tools" "platforms;android-36" "build-tools;36.0.0" >/dev/null 2>&1
$SDKM --list_installed 2>/dev/null | head -20

echo "=== [5/5] NDK (version Flutter wants) ==="
NDKV=$(rg -o "static String get ndkVersion => '([^']+)'" -r '$1' /home/z/flutter/packages/flutter_tools/gradle/src/main/kotlin/FlutterExtension.kt 2>/dev/null || rg -o "ndkVersion\s*=\s*\"([0-9.]+)\"" -r '$1' /home/z/flutter/packages/flutter_tools/gradle/src/main/groovy/flutter.groovy 2>/dev/null | head -1)
echo "Flutter wants NDK: $NDKV"
if [ -n "$NDKV" ] && [ ! -d "$ANDROID_HOME/ndk/$NDKV" ]; then
  yes | $SDKM "ndk;$NDKV" >/dev/null 2>&1
fi
ls $ANDROID_HOME/ndk/ 2>/dev/null

echo "=== DONE: toolchain ready ==="
flutter doctor 2>&1 | head -12
