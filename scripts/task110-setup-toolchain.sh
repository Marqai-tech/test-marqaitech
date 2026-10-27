#!/bin/bash
# Task 110b — rebuild Flutter/Android toolchain after sandbox reset.
# Installs: Flutter 3.47.7 (pin), Temurin JDK 17, Android SDK (cmdline-tools,
# platform-tools, android-36, build-tools 36.0.0, NDK 28.2.13676358, cmake 3.22.1),
# then prunes NDK to arm64-only to save disk. Idempotent-ish; logs to stdout.
set -x
export DEBIAN_FRONTEND=noninteractive

BASE=/home/z
TMP=$BASE/my-project/scripts/tmp
mkdir -p "$TMP"
cd "$TMP"

log() { echo "[toolchain $(date +%H:%M:%S)] $*"; }

# ── 1. Flutter ──────────────────────────────────────────────────────────
if [ ! -x "$BASE/flutter/bin/flutter" ]; then
  log "downloading flutter releases manifest"
  curl -s -m 30 -o releases.json https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json
  FLUTTER_PATH=$(python3 - <<'PY'
import json
d = json.load(open('releases.json'))
stable_hash = d.get('current_release', {}).get('stable')
rel = [r for r in d['releases'] if r.get('hash') == stable_hash]
pin = [r for r in d['releases'] if r.get('version') == '3.47.7' and r.get('channel') == 'stable']
r = (pin or rel)[0]
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

# ── 3. Android SDK ──────────────────────────────────────────────────────
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
log "installing SDK components (this is the long step)"
"$SDKM" --install "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;28.2.13676358" "cmake;3.22.1" >/dev/null 2>&1
log "sdk components done"

# ── 4. NDK prune to arm64-only (disk war) ───────────────────────────────
NDK_DIR=$(ls -d "$ANDROID_HOME/ndk/28.2.13676358" 2>/dev/null || true)
if [ -n "$NDK_DIR" ]; then
  log "pruning NDK non-arm64"
  SYS="$NDK_DIR/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib"
  for abi in armv7-a i686 x86_64; do rm -rf "$SYS/$abi"; done
  CLANGLIB="$NDK_DIR/toolchains/llvm/prebuilt/linux-x86_64/lib/clang"
  find "$CLANGLIB" -maxdepth 3 -type d \( -name "armv7a-android" -o -name "i686-android" -o -name "x86_64-android" -o -name "arm-linux-androideabi" -o -name "i686-linux-android" -o -name "x86_64-linux-android" \) -exec rm -rf {} + 2>/dev/null || true
  rm -rf "$NDK_DIR/sources" "$NDK_DIR/shader-tools" "$NDK_DIR/simpleperf"
fi
log "NDK pruned"

# ── 5. Flutter env setup ────────────────────────────────────────────────
export PUB_CACHE="$BASE/.pub-cache"
"$BASE/flutter/bin/flutter" config --android-sdk "$ANDROID_HOME" --no-cli-animations
yes | "$BASE/flutter/bin/flutter" doctor --android-licenses >/dev/null 2>&1 || true
"$BASE/flutter/bin/flutter" precache --android >/dev/null 2>&1 || true
log "flutter doctor:"
"$BASE/flutter/bin/flutter" doctor -v 2>&1 | grep -E "^\[|Flutter|Android SDK" | head -12
log "TOOLCHAIN READY"
df -h /home/z | tail -1
