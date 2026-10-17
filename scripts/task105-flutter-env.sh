#!/bin/bash
# Task 105 — restore Flutter/Android toolchain env (sandbox reset wiped PATH only;
# the SDK files under /home/z survived).
export Flutter_HOME=/home/z/flutter
export PATH=/home/z/flutter/bin:/home/z/android-sdk/cmdline-tools/latest/bin:/home/z/android-sdk/platform-tools:$PATH
export ANDROID_HOME=/home/z/android-sdk
export ANDROID_SDK_ROOT=/home/z/android-sdk
export JAVA_HOME=/home/z/jdk-17.0.13+11
export PATH=$JAVA_HOME/bin:$PATH
export PUB_CACHE=/home/z/.pub-cache
"$@"
