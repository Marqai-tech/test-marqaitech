#!/bin/bash
# Task 127 — rebuild the /tmp Flutter+Android toolchain after the sandbox reset
# (Task 125 manual: worklog "TOOLCHAIN REINSTALL"). Installs:
#   /tmp/flutter           (3.47.7 stable pin)
#   /tmp/jdk-17.0.20.1+1   (Temurin 17)
#   /tmp/android-sdk       (cmdline-tools, platform-tools, android-36,
#                           build-tools 36.0.0, cmake 3.22.1, NDK r28c selective)
#   /tmp/pub-cache
# gradle-home SURVIVED at /tmp/my-project/gradle-home — no gradle download.
# Stages are idempotent; run in foreground chunks (nohup gets reaped).
set -e
export DEBIAN_FRONTEND=noninteractive
STAGE=${1:-all}
log() { echo "[toolchain127 $(date +%H:%M:%S)] $*"; }

# ── stage 1: JDK 17 ────────────────────────────────────────────────────────
if [ "$STAGE" = "all" ] || [ "$STAGE" = "jdk" ]; then
  if [ ! -x /tmp/jdk-17.0.20.1+1/bin/java ]; then
    log "downloading Temurin JDK 17.0.20.1"
    curl -sL -m 600 -o /tmp/jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
    mkdir -p /tmp/jdk-tmp && tar xf /tmp/jdk17.tar.gz -C /tmp/jdk-tmp --strip-components=1
    rm -rf /tmp/jdk-17.0.20.1+1 && mv /tmp/jdk-tmp /tmp/jdk-17.0.20.1+1 && rm -f /tmp/jdk17.tar.gz
  fi
  log "jdk: $(/tmp/jdk-17.0.20.1+1/bin/java -version 2>&1 | head -1)"
fi

# ── stage 2: Flutter 3.47.7 ────────────────────────────────────────────────
if [ "$STAGE" = "all" ] || [ "$STAGE" = "flutter" ]; then
  if [ ! -x /tmp/flutter/bin/flutter ]; then
    log "resolving flutter 3.47.7 archive path"
    curl -s -m 30 -o /tmp/releases.json https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json
    FLUTTER_PATH=$(python3 - <<'PY'
import json
d = json.load(open('/tmp/releases.json'))
pin = [r for r in d['releases'] if r.get('version') == '3.47.7' and r.get('channel') == 'stable']
print('releases/' + (pin or [r for r in d['releases'] if r.get('hash') == d['current_release']['stable']])[0]['archive'])
PY
)
    log "flutter archive: $FLUTTER_PATH"
    curl -s -C - -m 900 -o /tmp/flutter.tar.xz "https://storage.googleapis.com/flutter_infra_release/$FLUTTER_PATH"
    log "downloaded $(du -h /tmp/flutter.tar.xz | cut -f1), extracting"
    tar xf /tmp/flutter.tar.xz -C /tmp
    FLUTTER_DIR=$(tar tf /tmp/flutter.tar.xz | head -1 | cut -d/ -f1)
    mv "/tmp/$FLUTTER_DIR" /tmp/flutter && rm -f /tmp/flutter.tar.xz /tmp/releases.json
    git config --global --add safe.directory /tmp/flutter 2>/dev/null || true
  fi
  log "flutter version check (first run pre-caches dart sdk)"
  /tmp/flutter/bin/flutter --version || true
fi

# ── stage 3: Android SDK base ─────────────────────────────────────────────
if [ "$STAGE" = "all" ] || [ "$STAGE" = "sdk" ]; then
  if [ ! -x /tmp/android-sdk/cmdline-tools/latest/bin/sdkmanager ]; then
    log "installing cmdline-tools"
    mkdir -p /tmp/android-sdk/cmdline-tools
    curl -s -m 600 -o /tmp/clt.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
    python3 -c "import zipfile; zipfile.ZipFile('/tmp/clt.zip').extractall('/tmp/android-sdk/cmdline-tools')"
    mv /tmp/android-sdk/cmdline-tools/cmdline-tools /tmp/android-sdk/cmdline-tools/latest
    rm -f /tmp/clt.zip
    chmod +x /tmp/android-sdk/cmdline-tools/latest/bin/*
  fi
  export ANDROID_HOME=/tmp/android-sdk
  export JAVA_HOME=/tmp/jdk-17.0.20.1+1
  export PATH=$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH
  if [ ! -d /tmp/android-sdk/platforms/android-36 ]; then
    log "sdkmanager: platform-tools + android-36 + build-tools 36 + cmake"
    yes | sdkmanager --licenses > /dev/null 2>&1 || true
    sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "cmake;3.22.1" > /tmp/sdkmgr.log 2>&1
    tail -2 /tmp/sdkmgr.log
  fi
  log "sdk base done: $(ls /tmp/android-sdk)"
fi

# ── stage 4: NDK r28c selective extraction ────────────────────────────────
if [ "$STAGE" = "all" ] || [ "$STAGE" = "ndk" ]; then
  NDK_DIR=/tmp/android-sdk/ndk/28.2.13676358
  NDK_REAL=/tmp/my-project/android-ndk/28.2.13676358   # PolarFS — petabytes free, survives resets
  if [ ! -f "$NDK_DIR/source.properties" ]; then
    log "downloading NDK r28c zip (to PolarFS)"
    # tolerate an already-complete download (-C - returns 416 on a full file)
    curl -s -m 1200 -C - -o /tmp/my-project/ndk-r28c.zip "https://dl.google.com/android/repository/android-ndk-r28c-linux.zip" || true
    test -s /tmp/my-project/ndk-r28c.zip
    log "downloaded $(du -h /tmp/my-project/ndk-r28c.zip | cut -f1) — selective extraction (MUST include full sysroot)"
    rm -rf "$NDK_REAL" && mkdir -p "$NDK_REAL"
    python3 - <<'PY'
import zipfile
z = zipfile.ZipFile('/tmp/my-project/ndk-r28c.zip')
prefix = 'android-ndk-r28c/'
# r28c layout: the clang toolchain lives under toolchains/llvm/prebuilt/<host>/
# ({bin,lib,sysroot}) — NOT top-level bin/lib like r28b. The cmake compiler
# probe needs bin/clang + the FULL sysroot ("Check for working C compiler:
# broken" without it — Task 125 lesson).
def keep(n):
    n = n.rstrip('/')
    if not n.startswith(prefix):
        return False
    rel = n[len(prefix):]
    if rel in ('source.properties', 'NOTICE', 'NOTICE.toolchain'):
        return True
    if rel.startswith('meta/') or rel.startswith('build/'):
        return True
    if rel.startswith('toolchains/llvm/prebuilt/'):
        host = rel[len('toolchains/llvm/prebuilt/'):]
        return host == '' or host.startswith('linux-x86_64')  # full host toolchain
    if rel.startswith('prebuilt/'):
        return True  # host python/make shims (small)
    return False
for n in z.namelist():
    if keep(n):
        z.extract(n, '/tmp/my-project/ndk-extract')
PY
    mv /tmp/my-project/ndk-extract/android-ndk-r28c/* "$NDK_REAL"/ && rm -rf /tmp/my-project/ndk-extract
    chmod +x "$NDK_REAL"/toolchains/llvm/prebuilt/linux-x86_64/bin/* 2>/dev/null || true
    # verify the compiler probe target exists BEFORE dropping the zip
    test -x "$NDK_REAL/toolchains/llvm/prebuilt/linux-x86_64/bin/clang" && echo "clang OK"
    test -d "$NDK_REAL/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/aarch64-linux-android" && echo "sysroot OK"
    rm -f /tmp/my-project/ndk-r28c.zip
    mkdir -p /tmp/android-sdk/ndk && ln -sfn "$NDK_REAL" "$NDK_DIR"
  fi
  ls "$NDK_DIR" | tr '\n' ' '; echo
  log "ndk ready"
fi

# ── stage 5: pub cache + flutter artifacts ────────────────────────────────
if [ "$STAGE" = "all" ] || [ "$STAGE" = "pub" ]; then
  export JAVA_HOME=/tmp/jdk-17.0.20.1+1
  export PUB_CACHE=/tmp/my-project/pub-cache   # PolarFS — survives resets
  export PATH=$JAVA_HOME/bin:/tmp/flutter/bin:$PATH
  cd /home/z/my-project/hrms_app
  log "flutter pub get (pub cache at /tmp/pub-cache)"
  flutter pub get 2>&1 | tail -3
  # file_picker 8.3.7 needs compileSdk 36 (its own build.gradle overrides the
  # project-level bump — Task 121/125 gotcha)
  FP=/tmp/my-project/pub-cache/hosted/pub.dev/file_picker-8.3.7/android/build.gradle
  if [ -f "$FP" ] && grep -q "compileSdk 34" "$FP"; then
    sed -i 's/compileSdk 34/compileSdk 36/' "$FP"
    echo "file_picker patched" > /tmp/my-project/file_picker-patched.txt
    log "file_picker compileSdk patched"
  fi
  log "pruning flutter engine artifacts to android-arm64-release + linux-x64"
  AR=/tmp/flutter/bin/cache/artifacts/engine
  if [ -d "$AR" ]; then
    for d in "$AR"/*; do
      case "$(basename "$d")" in
        android-arm64-release|linux-x64|common) ;; # keep
        *) rm -rf "$d" ;;
      esac
    done
  fi
  log "pub stage done"
fi

log "ALL REQUESTED STAGES COMPLETE"
