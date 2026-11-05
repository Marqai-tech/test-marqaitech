#!/bin/bash
# Task 113 — rebuild the Flutter/Android toolchain after the sandbox reset.
# Foreground chunked installs (background processes get reaped in this sandbox).
set -e
cd /home/z

echo "=== [1/4] Temurin JDK 17 ==="
if [ ! -x /home/z/jdk-17.0.13+11/bin/javac ]; then
  curl -sSL -o jdk.tgz "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_linux_hotspot_17.0.13_11.tar.gz"
  tar xzf jdk.tgz && rm jdk.tgz
fi
/home/z/jdk-17.0.13+11/bin/javac -version && echo "JDK OK"

echo "=== [2/4] Android cmdline-tools ==="
mkdir -p /home/z/android-sdk/cmdline-tools
if [ ! -x /home/z/android-sdk/cmdline-tools/latest/bin/sdkmanager ]; then
  curl -sSL -o cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  python3 -c "import zipfile; zipfile.ZipFile('cmdtools.zip').extractall('/home/z/android-sdk/cmdline-tools')"
  mv /home/z/android-sdk/cmdline-tools/cmdline-tools /home/z/android-sdk/cmdline-tools/latest
  rm cmdtools.zip
fi
echo "cmdline-tools OK"

echo "=== [3/4] SDK packages (platform-36, build-tools 36, cmake; NO NDK yet) ==="
export ANDROID_HOME=/home/z/android-sdk
export JAVA_HOME=/home/z/jdk-17.0.13+11
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
yes | sdkmanager --licenses > /dev/null 2>&1 || true
sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools" "cmake;3.22.1" > /dev/null
echo "SDK packages OK"

echo "=== [4/4] Flutter SDK ==="
if [ ! -x /home/z/flutter/bin/flutter ]; then
  curl -sSL -o flutter.tar.xz "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.47.7-stable.tar.xz" || \
    { echo "3.47.7 not found, fetching releases JSON"; curl -sSL https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json -o rel.json; \
      URL=$(python3 -c "import json;d=json.load(open('rel.json'));h=d['current_release']['stable'];print([r['archive'] for r in d['releases'] if r['hash']==h][0])"); \
      curl -sSL -o flutter.tar.xz "https://storage.googleapis.com/flutter_infra_release/releases/$URL"; rm rel.json; }
  tar xf flutter.tar.xz && rm flutter.tar.xz
fi
echo "FLUTTER OK"
