#!/bin/bash
# Task 120 — build release APK v1.5.3+20 detached from the tool shell.
source /home/z/my-project/scripts/task107-flutter-env.sh
cd /home/z/my-project/hrms_app
flutter build apk --release --target-platform android-arm64
echo "EXIT_CODE=$?"
