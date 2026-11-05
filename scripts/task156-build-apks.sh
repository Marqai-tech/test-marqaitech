#!/bin/bash
# Task 156 — build BOTH Android editions at versionCode 37:
#   1) NATIVE  (hrms_app/)   v1.9.0 (37) → 3boxes-hrms-native-v1.9.0.apk
#      (+ alias 3boxes-hrms-native.apk)  — PhonePe-style violet AI dock build
#   2) LITE   (mobile-app/)  v1.8.1 (37) → 3boxes-hrms-mobile-v1.8.1.apk
#      (+ refresh alias 3boxes-hrms-mobile.apk)
# Chunked execution (gradle resumes incrementally inside /tmp workspace):
#   bash scripts/task156-build-apks.sh setup-native|chunk-native|finalize-native
#   bash scripts/task156-build-apks.sh setup-shell |chunk-shell |finalize-shell
set -e
log() { echo "[build156 $(date +%H:%M:%S)] $*"; }

export JAVA_HOME=/home/z/jdk-17
export PUB_CACHE=/home/z/.pub-cache
export GRADLE_USER_HOME=/tmp/my-project/gradle-home
export ANDROID_HOME=/home/z/android-sdk
export ANDROID_SDK_ROOT=/home/z/android-sdk
export PATH=$JAVA_HOME/bin:/home/z/flutter/bin:$PATH
mkdir -p /tmp/my-project/jtmp

WS=/tmp/my-project
REPO=/home/z/my-project/3-Boxes-HRMS
DL=$REPO/public/downloads
NATIVE_OUT=$DL/3boxes-hrms-native-v1.9.0.apk
NATIVE_ALIAS=$DL/3boxes-hrms-native.apk
SHELL_OUT=$DL/3boxes-hrms-mobile-v1.8.1.apk
SHELL_ALIAS=$DL/3boxes-hrms-mobile.apk

# ── shared: constrain gradle memory inside the build workspace ──────────
constrain_gradle() {
  local gp="$1/android/gradle.properties"
  sed -i 's/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m -Djava.io.tmpdir=\/tmp\/my-project\/jtmp/' "$gp"
  grep -q "org.gradle.jvmargs" "$gp" || echo 'org.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m -Djava.io.tmpdir=/tmp/my-project/jtmp' >> "$gp"
  # stop AGP from trying to auto-download SDK/NDK bits (stub NDK is in place)
  grep -q "android.builder.sdkDownload" "$gp" || echo 'android.builder.sdkDownload=false' >> "$gp"
  # Task 156 — 3.9GB sandbox: single-JVM no-daemon build (most predictable)
  grep -q "org.gradle.daemon" "$gp" || printf '\n# Task 156 — single-JVM no-daemon build (OOM-safe on the 3.9GB sandbox)\norg.gradle.daemon=false\nkotlin.daemon.jvmargs=-Xmx320m\n' >> "$gp"
}

# ── shared: chunked assembleRelease ─────────────────────────────────────
run_chunk() {
  local appdir="$1" tag="$2"
  cd "$appdir"
  # gradlew is gitignored — use the directly-downloaded distribution that
  # matches each app's gradle-wrapper.properties.
  if [ "$tag" = native ]; then
    GRADLE=/tmp/my-project/gradle-dist/gradle-9.3.1/bin/gradle
  else
    GRADLE=/tmp/my-project/gradle-dist/gradle-9.1.0/bin/gradle
  fi
  [ -x "$GRADLE" ] || GRADLE=$(ls $GRADLE_USER_HOME/wrapper/dists/gradle-*/[0-9a-z]*/gradle-*/bin/gradle 2>/dev/null | head -1)
  log "gradle: $GRADLE"
  cd "$appdir/android"
  # re-apply defensive patch if a fresh pub get replaced file_picker
  FP=$(ls -d $PUB_CACHE/hosted/pub.dev/file_picker-8*/android/build.gradle 2>/dev/null | sort | tail -1)
  if [ -n "$FP" ] && grep -q "compileSdk 34" "$FP"; then
    sed -i 's/compileSdk 34/compileSdk 36/' "$FP"
    log "file_picker compileSdk patched ($FP)"
  fi
  set +e
  timeout 540 $GRADLE assembleRelease \
    -Ptarget=lib/main.dart \
    -Pdart-obfuscation=false \
    -Ptrack-widget-creation=false \
    -Ptree-shake-icons=true \
    -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease \
    >> $WS/gradle-build156-$tag.log 2>&1
  RC=$?
  set -e
  if [ -f "$appdir/build/app/outputs/flutter-apk/app-release.apk" ] || [ -f "$appdir/android/app/build/outputs/apk/release/app-release.apk" ]; then
    log "BUILD DONE ($tag) — APK present"
  elif [ $RC -eq 124 ]; then
    log "chunk timed out at 540s ($tag) — re-run the same chunk to resume"
  else
    log "gradle rc=$RC ($tag) — tail of log:"
    tail -30 $WS/gradle-build156-$tag.log
    exit 1
  fi
  tail -3 $WS/gradle-build156-$tag.log
}

# ── shared: finalize + verify ───────────────────────────────────────────
finalize() {
  local appdir="$1" out="$2" alias="$3" tag="$4"
  APK_SRC=""
  for c in "$appdir/build/app/outputs/flutter-apk/app-release.apk" \
           "$appdir/android/app/build/outputs/apk/release/app-release.apk"; do
    [ -f "$c" ] && APK_SRC="$c" && break
  done
  [ -n "$APK_SRC" ] || { echo "APK not built yet ($tag)"; exit 1; }
  AAPT=$(ls /home/z/android-sdk/build-tools/36.0.0/aapt2)
  APKSIGNER=$(ls /home/z/android-sdk/build-tools/36.0.0/apksigner)
  log "badging ($tag):"
  $AAPT dump badging "$APK_SRC" | grep -E "^package:|native-code:|sdkVersion|targetSdkVersion"
  log "signature ($tag):"
  $APKSIGNER verify --print-certs "$APK_SRC" | head -3
  unzip -t "$APK_SRC" >/dev/null && log "zip integrity: OK"
  cp "$APK_SRC" "$out"
  cp "$APK_SRC" "$alias"
  ls -la "$out" "$alias"
  log "finalize done ($tag)"
}

# ════════════════════ NATIVE (hrms_app) ════════════════════
case "$1" in
setup-native)
  log "rsync native source → $WS/hrms_app"
  rsync -a --delete --exclude build --exclude .dart_tool --exclude .git \
    $REPO/hrms_app/ $WS/hrms_app/
  cd $WS/hrms_app
  flutter pub get 2>&1 | tail -2
  cat > android/local.properties <<EOF
sdk.dir=/home/z/android-sdk
flutter.sdk=/home/z/flutter
flutter.versionName=1.9.0
flutter.versionCode=37
EOF
  constrain_gradle $WS/hrms_app
  log "native setup done"
  ;;
chunk-native)
  run_chunk $WS/hrms_app native
  ;;
finalize-native)
  finalize $WS/hrms_app $NATIVE_OUT $NATIVE_ALIAS native
  ;;

# ════════════════════ LITE SHELL (mobile-app) ════════════════════
setup-shell)
  log "rsync shell source → $WS/mobile-app"
  rsync -a --delete --exclude build --exclude .dart_tool --exclude .git \
    $REPO/mobile-app/ $WS/mobile-app/
  # signing: mobile-app's key files are gitignored — copy from hrms_app
  cp $REPO/hrms_app/android/key.properties $WS/mobile-app/android/key.properties
  cp $REPO/hrms_app/android/app/release-key.jks $WS/mobile-app/android/app/release-key.jks
  cd $WS/mobile-app
  flutter pub get 2>&1 | tail -2
  cat > android/local.properties <<EOF
sdk.dir=/home/z/android-sdk
flutter.sdk=/home/z/flutter
flutter.versionName=1.8.1
flutter.versionCode=37
EOF
  constrain_gradle $WS/mobile-app
  log "shell setup done"
  ;;
chunk-shell)
  run_chunk $WS/mobile-app shell
  ;;
finalize-shell)
  finalize $WS/mobile-app $SHELL_OUT $SHELL_ALIAS shell
  ;;
*) echo "usage: $0 setup-native|chunk-native|finalize-native|setup-shell|chunk-shell|finalize-shell"; exit 2 ;;
esac
