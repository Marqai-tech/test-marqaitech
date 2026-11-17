#!/bin/bash
# Task 127 — build the v1.5.8 (25) release APK using the Task 125 manual:
#   - source rsynced to /tmp/my-project/hrms_app (PolarFS workspace)
#   - gradle invoked DIRECTLY from the warm gradle-home dist (gradlew is not in git)
#   - NDK on PolarFS via symlink, PUB_CACHE on PolarFS
#   - foreground chunked gradle (background nohup gets reaped by the sandbox)
set -e
log() { echo "[build127 $(date +%H:%M:%S)] $*"; }

export JAVA_HOME=/tmp/jdk-17.0.20.1+1
export PUB_CACHE=/tmp/my-project/pub-cache
export GRADLE_USER_HOME=/tmp/my-project/gradle-home
export ANDROID_HOME=/tmp/android-sdk
export ANDROID_SDK_ROOT=/tmp/android-sdk
export PATH=$JAVA_HOME/bin:/tmp/flutter/bin:$PATH

# ── 1. fresh source into the PolarFS workspace ──
log "rsync source → /tmp/my-project/hrms_app"
rsync -a --delete \
  --exclude build --exclude .dart_tool --exclude .git \
  /home/z/my-project/hrms_app/ /tmp/my-project/hrms_app/
cd /tmp/my-project/hrms_app
log "flutter pub get (workspace)"
flutter pub get 2>&1 | tail -2

# ── 2. local.properties (sdk dir + version code/name) ──
cat > android/local.properties << EOF
sdk.dir=/tmp/android-sdk
flutter.sdk=/tmp/flutter
flutter.versionName=1.5.8
flutter.versionCode=25
EOF

# ── 3. gradle build (direct dist invocation) ──
GRADLE=$(ls /tmp/my-project/gradle-home/wrapper/dists/gradle-*/[0-9a-z]*/gradle-*/bin/gradle | head -1)
log "gradle: $GRADLE"
cd /tmp/my-project/hrms_app/android
log "assembleRelease starting (arm64 release, obfuscation off)"
$GRADLE assembleRelease \
  -Ptarget-platform=android-arm64 \
  -Ptarget=lib/main.dart \
  -Pdart-obfuscation=false \
  -Ptrack-widget-creation=false \
  -Ptree-shake-icons=true \
  -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease \
  --build-cache \
  > /tmp/my-project/gradle-build127.log 2>&1
log "gradle exit ok — tail of build log:"
tail -5 /tmp/my-project/gradle-build127.log

# ── 4. artifacts ──
ls -la app/build/outputs/apk/release/
