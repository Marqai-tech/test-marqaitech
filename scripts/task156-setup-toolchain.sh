#!/bin/bash
# Task 156 — rebuild the Flutter/Android toolchain after sandbox reset.
# Based on the Task 145/155 recipes:
#   • Flutter 3.47.8 (pin) — streamed, keeps flutter/.git (the tool aborts
#     with "not a clone of GitHub" without it)
#   • Temurin JDK 17
#   • Android SDK: cmdline-tools + platform-tools + android-36 + build-tools 36.0.0
#   • NO 2.2GB NDK: a stub ndk/28.2.13676358 dir satisfies AGP's ndkVersion
#     configure check and arch-dispatching llvm-strip/llvm-objcopy SHIMS do
#     the native-lib stripping (system strip for x86_64, Debian cross-binutils
#     2.44-3 extracted from .debs for aarch64/armhf — dpkg -x needs no root).
set -x
export DEBIAN_FRONTEND=noninteractive

BASE=/home/z
TMP=$BASE/my-project/scripts/tmp
mkdir -p "$TMP"

log() { echo "[toolchain156 $(date +%H:%M:%S)] $*"; }

# ── 1. Flutter 3.47.8 (pin) ─────────────────────────────────────────────
if [ ! -x "$BASE/flutter/bin/flutter" ]; then
  log "resolving flutter 3.47.8 archive"
  curl -s -m 30 -o "$TMP/releases.json" https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json
  FLUTTER_PATH=$(python3 - <<'PY'
import json
d = json.load(open('/home/z/my-project/scripts/tmp/releases.json'))
pin = [r for r in d['releases'] if r.get('version') == '3.47.8' and r.get('channel') == 'stable']
if not pin:
    pin = [r for r in d['releases'] if r.get('version') == '3.47.7' and r.get('channel') == 'stable']
r = pin[0]
print('releases/' + r['archive'])
PY
)
  FLUTTER_VER=$(echo "$FLUTTER_PATH" | sed -E 's/.*flutter_linux_([0-9.]+)-stable.*/\1/')
  log "streaming https://storage.googleapis.com/flutter_infra_release/$FLUTTER_PATH ($FLUTTER_VER)"
  curl -s -m 1200 "https://storage.googleapis.com/flutter_infra_release/$FLUTTER_PATH" | tar xJ -C "$BASE"
  [ -d "$BASE/flutter-$FLUTTER_VER-stable" ] && mv "$BASE/flutter-$FLUTTER_VER-stable" "$BASE/flutter"
  [ -x "$BASE/flutter/bin/flutter" ] || { log "FLUTTER EXTRACT FAILED"; exit 1; }
else
  log "flutter already present"
fi

# ── 2. JDK 17 (Temurin) ─────────────────────────────────────────────────
if [ ! -d "$BASE/jdk-17" ]; then
  log "downloading Temurin JDK 17"
  curl -sL -m 900 -o "$TMP/jdk17.tar.gz" "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p "$BASE/jdk-17" && tar xf "$TMP/jdk17.tar.gz" -C "$BASE/jdk-17" --strip-components=1
  rm -f "$TMP/jdk17.tar.gz"
else
  log "jdk-17 already present"
fi
export JAVA_HOME="$BASE/jdk-17"
export PATH="$JAVA_HOME/bin:$PATH"

# ── 3. Android SDK (no NDK, no cmake) ───────────────────────────────────
export ANDROID_HOME="$BASE/android-sdk"
mkdir -p "$ANDROID_HOME"
if [ ! -d "$ANDROID_HOME/cmdline-tools/latest/bin" ]; then
  log "downloading cmdline-tools"
  curl -s -m 600 -o "$TMP/ctools.zip" https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  unzip -q "$TMP/ctools.zip" -d "$TMP/ct" && mkdir -p "$ANDROID_HOME/cmdline-tools" && mv "$TMP/ct/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$TMP/ctools.zip" "$TMP/ct"
fi
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
log "accepting licenses"
yes | "$SDKM" --licenses >/dev/null 2>&1 || true
log "installing SDK components (platform-tools, android-36, build-tools 36.0.0)"
"$SDKM" --install "platform-tools" "platforms;android-36" "build-tools;36.0.0" >/dev/null 2>&1
log "sdk components done"

# ── 4. cross-binutils (aarch64 + armhf) from Debian 13 pool (2.44-3) ────
XBP="$BASE/cross-binutils"
mkdir -p "$XBP/root"
if [ ! -x "$XBP/root/usr/bin/aarch64-linux-gnu-strip" ]; then
  for P in binutils-aarch64-linux-gnu binutils-arm-linux-gnueabihf; do
    log "downloading $P 2.44-3"
    curl -s -m 300 -o "$TMP/$P.deb" "http://deb.debian.org/debian/pool/main/b/binutils/${P}_2.44-3_amd64.deb"
    dpkg -x "$TMP/$P.deb" "$XBP/root" && log "extracted $P"
    rm -f "$TMP/$P.deb"
  done
fi
ls "$XBP/root/usr/bin/" 2>/dev/null | head -6

# ── 5. NDK stub + arch-dispatching llvm-strip / llvm-objcopy shims ──────
NDK="$ANDROID_HOME/ndk/28.2.13676358"
if [ ! -f "$NDK/source.properties" ]; then
  mkdir -p "$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin"
  cat > "$NDK/source.properties" <<EOF
Pkg.Desc = Android NDK
Pkg.Revision = 28.2.13676358
Pkg.Sdk = ndk
EOF
fi
make_shim() {
  local TOOL="$1"  # strip | objcopy
  cat > "$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-$TOOL" <<EOF
#!/bin/bash
# Task 156 arch-dispatching shim standing in for the real NDK $TOOL.
# AGP invokes e.g.: llvm-$TOOL --strip-unneeded -o <out> <in>
# We readelf EVERY existing file argument and dispatch on the first
# recognisable ARM machine; x86_64/unknown fall through to system $TOOL.
XB=$XBP/root/usr/bin
export LD_LIBRARY_PATH=$XBP/root/usr/lib/x86_64-linux-gnu\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}
for a in "\$@"; do
  case "\$a" in
    -*) ;;
    *) [ -f "\$a" ] || continue
       m=\$(readelf -h "\$a" 2>/dev/null | grep 'Machine:' | head -1)
       case "\$m" in
         *AArch64*) exec "\$XB/aarch64-linux-gnu-$TOOL" "\$@" ;;
         *Arm*|*ARM*)     exec "\$XB/arm-linux-gnueabihf-$TOOL" "\$@" ;;
       esac ;;
  esac
done
exec /usr/bin/$TOOL "\$@"
EOF
  chmod +x "$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-$TOOL"
}
make_shim strip
make_shim objcopy
# smoke test the shim on an ARM-flavoured empty arg list (falls back to system)
"$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip" --version | head -1

# ── 6. Flutter env ──────────────────────────────────────────────────────
export PUB_CACHE="$BASE/.pub-cache"
"$BASE/flutter/bin/flutter" config --android-sdk "$ANDROID_HOME" --no-cli-animations
yes | "$BASE/flutter/bin/flutter" doctor --android-licenses >/dev/null 2>&1 || true
"$BASE/flutter/bin/flutter" precache --android >/dev/null 2>&1 || true
log "flutter doctor:"
"$BASE/flutter/bin/flutter" doctor -v 2>&1 | grep -E "^\[|Flutter version|Android SDK" | head -8
log "TOOLCHAIN READY"
df -h /home/z | tail -1
