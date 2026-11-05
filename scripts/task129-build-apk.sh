#!/bin/bash
# Task 128 — build the v1.6.0 (26) release APK using the Task 125/127/128 manual.
# Chunked execution: each invocation of this script with argument "chunk" runs
# up to 540s of gradle (incremental resume works — gradle daemon + build cache
# survive between chunks); "finalize" copies + verifies the APK.
# Usage: bash scripts/task128-build-apk.sh chunk   (repeat until BUILD DONE)
#        bash scripts/task128-build-apk.sh finalize
set -e
log() { echo "[build129 $(date +%H:%M:%S)] $*"; }

export JAVA_HOME=/tmp/jdk-17.0.20.1+1
export PUB_CACHE=/tmp/my-project/pub-cache
export GRADLE_USER_HOME=/tmp/my-project/gradle-home
export ANDROID_HOME=/tmp/android-sdk
export ANDROID_SDK_ROOT=/tmp/android-sdk
export PATH=$JAVA_HOME/bin:/tmp/flutter/bin:$PATH

VERSION_NAME=1.6.0
VERSION_CODE=27
APK_OUT=/home/z/my-project/public/downloads/3boxes-hrms-mobile-v1.6.0.apk
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
sdk.dir=/tmp/android-sdk
flutter.sdk=/tmp/flutter
flutter.versionName=${VERSION_NAME}
flutter.versionCode=${VERSION_CODE}
EOF

  GRADLE=$(ls /tmp/my-project/gradle-home/wrapper/dists/gradle-*/[0-9a-z]*/gradle-*/bin/gradle | head -1)
  log "gradle: $GRADLE"
  cd /tmp/my-project/hrms_app/android
  log "assembleRelease chunk (arm64 release, 540s budget)"
  # re-apply defensive patches if a fresh pub get replaced the packages
  FP=/tmp/my-project/pub-cache/hosted/pub.dev/file_picker-8.3.7/android/build.gradle
  if [ -f "$FP" ] && grep -q "compileSdk 34" "$FP"; then
    sed -i 's/compileSdk 34/compileSdk 36/' "$FP"
    log "file_picker re-patched"
  fi
  set +e
  timeout 540 $GRADLE assembleRelease \
    -Ptarget-platform=android-arm64 \
    -Ptarget=lib/main.dart \
    -Pdart-obfuscation=false \
    -Ptrack-widget-creation=false \
    -Ptree-shake-icons=true \
    -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease \
    --build-cache \
    >> /tmp/my-project/gradle-build129.log 2>&1
  RC=$?
  set -e
  if [ -f app/build/outputs/apk/release/app-release.apk ]; then
    log "BUILD DONE — APK present"
  elif [ $RC -eq 124 ]; then
    log "chunk timed out at 540s — re-run 'chunk' to resume (incremental)"
  else
    log "gradle rc=$RC — tail of log:"
    tail -25 /tmp/my-project/gradle-build129.log
    exit 1
  fi
  tail -3 /tmp/my-project/gradle-build129.log
  exit 0
fi

if [ "$1" = "finalize" ]; then
  APK_SRC=""
  for c in /tmp/my-project/hrms_app/build/app/outputs/flutter-apk/app-release.apk \
           /tmp/my-project/hrms_app/android/app/build/outputs/apk/release/app-release.apk; do
    [ -f "$c" ] && APK_SRC="$c" && break
  done
  [ -n "$APK_SRC" ] || { echo "APK not built yet"; exit 1; }
  AAPT=$(ls /tmp/android-sdk/build-tools/36.0.0/aapt2)
  APKSIGNER=$(ls /tmp/android-sdk/build-tools/36.0.0/apksigner)
  $AAPT dump badging "$APK_SRC" | head -2
  $APKSIGNER verify --print-certs "$APK_SRC" | head -3
  cp "$APK_SRC" "$APK_OUT"
  cp "$APK_SRC" "$ALIAS_OUT"
  ls -la "$APK_OUT" "$ALIAS_OUT"
  # prune old versioned APKs (keep v1.6.0 only)
  rm -f /home/z/my-project/public/downloads/3boxes-hrms-mobile-v1.5.8.apk \
        /home/z/my-project/public/downloads/3boxes-hrms-mobile-v1.5.7.apk \
        /home/z/my-project/public/downloads/3boxes-hrms-mobile-v1.5.6.apk
  log "finalize done"
  exit 0
fi

echo "usage: $0 chunk|finalize"
exit 2
