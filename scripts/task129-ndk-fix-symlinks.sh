#!/bin/bash
# Task 129 — repair the NDK symlinks that python's zipfile extraction killed.
# (Recurring gotcha: Task 127/128 — python zipfile.extract does NOT preserve
# zip symlinks; each becomes a tiny TEXT file whose content is the link target.
# Executables get an argv[0]-preserving bash wrapper (the clang/lld drivers are
# multi-call dispatchers and NEED the original argv[0]); shared libraries get
# REAL COPIES (dlopen does not understand wrappers).)
set -e
NDK=${1:-/tmp/my-project/android-ndk/28.2.13676358/toolchains/llvm/prebuilt/linux-x86_64}
log() { echo "[ndk-fix $(date +%H:%M:%S)] $*"; }

if [ ! -d "$NDK/bin" ]; then
  echo "FATAL: $NDK/bin not found"; exit 1
fi

fixed=0
for dir in "$NDK/bin" "$NDK/lib"; do
  [ -d "$dir" ] || continue
  while IFS= read -r f; do
    sz=$(stat -c%s "$f")
    [ "$sz" -le 64 ] || continue
    target=$(cat "$f")
    case "$target" in
      */*) full_target="$target" ;;
      *)  full_target="$(dirname "$f")/$target" ;;
    esac
    if [ ! -f "$full_target" ]; then
      log "SKIP $(basename "$f") → target '$target' missing"
      continue
    fi
    case "$target" in
      *.so|*.so.*)
        cp -f "$full_target" "$f"
        log "copied $(basename "$f") ← $target"
        ;;
      *)
        printf '#!/bin/bash\nexec -a "$0" "%s" "$@"\n' "$full_target" > "$f"
        chmod +x "$f"
        log "wrapper $(basename "$f") → $target"
        ;;
    esac
    fixed=$((fixed+1))
  done < <(find "$dir" -maxdepth 1 -type f -size -65c)
done
log "$fixed symlink files repaired"

# verify the compiler probe + linker dispatch actually work
export PATH="$NDK/bin:$PATH"
clang --version | head -1
echo 'int main(){return 0;}' > /tmp/probe.c
clang -target aarch64-linux-android24 -c /tmp/probe.c -o /tmp/probe.o && echo "clang aarch64 probe OK"
ld.lld --version | head -1
log "done"
