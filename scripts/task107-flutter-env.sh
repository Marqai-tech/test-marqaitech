#!/bin/bash
# Task 107 — restore Flutter/Android toolchain env (sandbox reset; full rebuild).
export Flutter_HOME=/home/z/flutter
export PATH=/home/z/flutter/bin:/home/z/android-sdk/cmdline-tools/latest/bin:/home/z/android-sdk/platform-tools:$PATH
export ANDROID_HOME=/home/z/android-sdk
export ANDROID_SDK_ROOT=/home/z/android-sdk
# Auto-detect the JDK (sandbox resets swap in different jdk-17.x builds).
export JAVA_HOME=$(ls -d /home/z/jdk-17* 2>/dev/null | head -1)
export PATH=$JAVA_HOME/bin:$PATH
export PUB_CACHE=/home/z/.pub-cache
"$@"
