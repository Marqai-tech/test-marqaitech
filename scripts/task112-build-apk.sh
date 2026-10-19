#!/bin/bash
# Task 112 — release APK build, attempt 2 (line-buffered output, hard cap)
export PATH="$PATH:/home/z/flutter/bin"
export JAVA_HOME=/home/z/jdk-17
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
