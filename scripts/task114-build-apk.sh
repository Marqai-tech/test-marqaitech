#!/bin/bash
# Task 114 — release APK build (line-buffered, 4GB-RAM-safe).
# Gradle resumes from its cache across chunked runs if this times out —
# just re-run the same command until BUILD_EXIT_CODE=0.
export PUB_CACHE=/home/z/.pub-cache
export JAVA_HOME=/home/z/jdk-17.0.13+11
export ANDROID_HOME=/home/z/android-sdk
export PATH=/home/z/jdk-17.0.13+11/bin:/home/z/android-sdk/cmdline-tools/latest/bin:/home/z/android-sdk/platform-tools:/home/z/flutter/bin:$PATH
export GRADLE_USER_HOME=/tmp/my-project/gradle-home
export FLUTTER_SUPPRESS_ANALYTICS=true
export FLUTTER_NO_ANALYTICS=true
export CI=true
cd /home/z/my-project/hrms_app
echo "[start $(date +%T)]"
stdbuf -oL -eL flutter build apk --release --target-platform android-arm64 --no-pub 2>&1 |
  while IFS= read -r line; do echo "[$(date +%T)] $line"; done
echo "BUILD_EXIT_CODE=$?"
echo "[end $(date +%T)]"
