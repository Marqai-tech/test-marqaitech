#!/bin/bash
# Task 145 — rebuild Flutter/Android toolchain after sandbox reset (LEAN variant).
# Same as task110 but SKIPS NDK + cmake (Task 142 proved all plugins are JVM-only
# and build.gradle.kts no longer references an ndkVersion — the 2GB NDK download
# is pure waste for this build). Installs: Flutter 3.47.7 (pin), Temurin JDK 17,
# Android SDK (cmdline-tools, platform-tools, android-36, build-tools 36.0.0).
set -x
export DEBIAN_FRONTEND=noninteractive

BASE=/home/z
TMP=$BASE/my-project/scripts/tmp
mkdir -p "$TMP"
cd "$TMP"

log() { echo "[toolchain145 $(date +%H:%M:%S)] $*"; }

# ── 1. Flutter 3.47.7 (pin) ─────────────────────────────────────────────
if [ ! -x "$BASE/flutter/bin/flutter" ]; then
  log "downloading flutter releases manifest"
  curl -s -m 30 -o releases.json https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json
  FLUTTER_PATH=$(python3 - <<'PY'
import json
d = json.load(open('releases.json'))
pin = [r for r in d['releases'] if r.get('version') == '3.47.7' and r.get('channel') == 'stable']
r = pin[0]
print('releases/' + r['archive'])
PY
)
  FLUTTER_VER=$(echo "$FLUTTER_PATH" | sed -E 's/.*flutter_linux_([0-9.]+)-stable.*/\1/')
  log "flutter archive: $FLUTTER_PATH (version $FLUTTER_VER)"
  curl -s -C - -m 900 -o flutter.tar.xz "https://storage.googleapis.com/flutter_infra_release/$FLUTTER_PATH"
  log "downloaded $(du -h flutter.tar.xz | cut -f1), extracting"
  tar xf flutter.tar.xz -C "$BASE" && mv "$BASE/flutter-$FLUTTER_VER-stable" "$BASE/flutter" 2>/dev/null || true
  rm -f flutter.tar.xz
else
  log "flutter already present"
fi

# ── 2. JDK 17 (Temurin) ─────────────────────────────────────────────────
if [ ! -d "$BASE/jdk-17" ]; then
  log "downloading Temurin JDK 17"
  curl -sL -C - -m 600 -o jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p "$BASE/jdk-17" && tar xf jdk17.tar.gz -C "$BASE/jdk-17" --strip-components=1
  rm -f jdk17.tar.gz
else
  log "jdk-17 already present"
fi
export JAVA_HOME="$BASE/jdk-17"
export PATH="$JAVA_HOME/bin:$PATH"

# ── 3. Android SDK (NO ndk, NO cmake — JVM-only plugins) ────────────────
export ANDROID_HOME="$BASE/android-sdk"
mkdir -p "$ANDROID_HOME"
if [ ! -d "$ANDROID_HOME/cmdline-tools/latest/bin" ]; then
  log "downloading cmdline-tools"
  curl -s -C - -m 600 -o ctools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  unzip -q ctools.zip -d "$TMP/ct" && mkdir -p "$ANDROID_HOME/cmdline-tools" && mv "$TMP/ct/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf ctools.zip "$TMP/ct"
fi
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
log "accepting licenses"
yes | "$SDKM" --licenses >/dev/null 2>&1 || true
log "installing SDK components (platform-tools, android-36, build-tools 36.0.0)"
"$SDKM" --install "platform-tools" "platforms;android-36" "build-tools;36.0.0" >/dev/null 2>&1
log "sdk components done"

# ── 4. Flutter env setup ────────────────────────────────────────────────
export PUB_CACHE="$BASE/.pub-cache"
"$BASE/flutter/bin/flutter" config --android-sdk "$ANDROID_HOME" --no-cli-animations
yes | "$BASE/flutter/bin/flutter" doctor --android-licenses >/dev/null 2>&1 || true
"$BASE/flutter/bin/flutter" precache --android >/dev/null 2>&1 || true
log "flutter doctor:"
"$BASE/flutter/bin/flutter" doctor -v 2>&1 | grep -E "^\[|Flutter|Android SDK" | head -12
log "TOOLCHAIN READY"
df -h /home/z | tail -1
