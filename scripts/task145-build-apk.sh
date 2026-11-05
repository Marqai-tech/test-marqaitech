#!/bin/bash
# Task 145 — build the v1.7.1 (35) UNIVERSAL release APK.
# Fixes the Task 142 arm64-only regression: build WITHOUT --target-platform /
# ABI filters so the APK ships armeabi-v7a + arm64-v8a + x86_64 again
# (identical coverage to v1.6.6 / v1.6.7 which installed fine).
# Chunked execution: "chunk" runs up to 540s of gradle (incremental resume);
# "finalize" copies + verifies the APK.
# Usage: bash scripts/task145-build-apk.sh chunk   (repeat until BUILD DONE)
#        bash scripts/task145-build-apk.sh finalize
set -e
log() { echo "[build145 $(date +%H:%M:%S)] $*"; }

export JAVA_HOME=/home/z/jdk-17
export PUB_CACHE=/tmp/my-project/pub-cache
export GRADLE_USER_HOME=/tmp/my-project/gradle-home
export ANDROID_HOME=/home/z/android-sdk
export ANDROID_SDK_ROOT=/home/z/android-sdk
export PATH=$JAVA_HOME/bin:/home/z/flutter/bin:$PATH

VERSION_NAME=1.7.1
VERSION_CODE=35
APK_OUT=/home/z/my-project/public/downloads/3boxes-hrms-mobile-v1.7.1.apk
ALIAS_OUT=/home/z/my-project/public/downloads/3boxes-hrms-mobile.apk

if [ "$1" = "chunk" ]; then
  # ── 1. fresh source into the workspace (first chunk only does the sync) ──
  if [ ! -d /tmp/my-project/hrms_app/android ]; then
    log "rsync source → /tmp/my-project/hrms_app"
    rsync -a --delete \
      --exclude build --exclude .dart_tool --exclude .git \
      /home/z/my-project/hrms_app/ /tmp/my-project/hrms_app/
    cd /tmp/my-project/hrms_app
    log "flutter pub get (workspace)"
    flutter pub get 2>&1 | tail -2
  fi
  cd /tmp/my-project/hrms_app
  # keep local.properties authoritative
  cat > android/local.properties << EOF
sdk.dir=/home/z/android-sdk
flutter.sdk=/home/z/flutter
flutter.versionName=${VERSION_NAME}
flutter.versionCode=${VERSION_CODE}
EOF

  GRADLE=$(ls /tmp/my-project/gradle-home/wrapper/dists/gradle-*/[0-9a-z]*/gradle-*/bin/gradle | head -1)
  log "gradle: $GRADLE"
  cd /tmp/my-project/hrms_app/android
  log "assembleRelease chunk (UNIVERSAL release, 540s budget)"
  # re-apply defensive patches if a fresh pub get replaced the packages
  FP=/tmp/my-project/pub-cache/hosted/pub.dev/file_picker-8.3.7/android/build.gradle
  if [ -f "$FP" ] && grep -q "compileSdk 34" "$FP"; then
    sed -i 's/compileSdk 34/compileSdk 36/' "$FP"
    log "file_picker re-patched"
  fi
  set +e
  timeout 540 $GRADLE assembleRelease \
    -Ptarget=lib/main.dart \
    -Pdart-obfuscation=false \
    -Ptrack-widget-creation=false \
    -Ptree-shake-icons=true \
    -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease \
    --build-cache \
    >> /tmp/my-project/gradle-build145.log 2>&1
  RC=$?
  set -e
  if [ -f app/build/outputs/apk/release/app-release.apk ]; then
    log "BUILD DONE — APK present"
  elif [ $RC -eq 124 ]; then
    log "chunk timed out at 540s — re-run 'chunk' to resume (incremental)"
  else
    log "gradle rc=$RC — tail of log:"
    tail -25 /tmp/my-project/gradle-build145.log
    exit 1
  fi
  tail -3 /tmp/my-project/gradle-build145.log
  exit 0
fi

if [ "$1" = "finalize" ]; then
  APK_SRC=""
  for c in /tmp/my-project/hrms_app/build/app/outputs/flutter-apk/app-release.apk \
           /tmp/my-project/hrms_app/android/app/build/outputs/apk/release/app-release.apk; do
    [ -f "$c" ] && APK_SRC="$c" && break
  done
  [ -n "$APK_SRC" ] || { echo "APK not built yet"; exit 1; }
  AAPT=$(ls /home/z/android-sdk/build-tools/36.0.0/aapt2)
  APKSIGNER=$(ls /home/z/android-sdk/build-tools/36.0.0/apksigner)
  log "badging:"
  $AAPT dump badging "$APK_SRC" | grep -E "^package:|native-code:|sdkVersion|targetSdkVersion"
  log "signature:"
  $APKSIGNER verify --print-certs "$APK_SRC" | head -3
  unzip -t "$APK_SRC" >/dev/null && log "zip integrity: OK"
  cp "$APK_SRC" "$APK_OUT"
  cp "$APK_SRC" "$ALIAS_OUT"
  ls -la "$APK_OUT" "$ALIAS_OUT"
  # prune superseded versioned APKs (keep v1.6.6 + v1.7.1 history; drop the two broken/interim 34s)
  rm -f /home/z/my-project/public/downloads/3boxes-hrms-mobile-v1.6.7.apk \
        /home/z/my-project/public/downloads/3boxes-hrms-mobile-v1.7.0.apk
  log "finalize done"
  exit 0
fi

echo "usage: $0 chunk|finalize"
exit 2
