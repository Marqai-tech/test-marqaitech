#!/bin/bash
# Task 156 — tsc error-count comparison: working tree vs git-stash baseline.
set -u
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=6144"

run_tsc() {
  npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "error TS" > "$1"
  echo "[$1] errors: $(wc -l < "$1")"
}

echo "=== 1. Working tree tsc ==="
run_tsc /tmp/task156-tsc-work.txt

echo "=== 2. Stash + baseline tsc ==="
git stash push -u -m "task156-tsc-baseline" >/dev/null 2>&1
if [ "$(git stash list | head -1)" ]; then
  run_tsc /tmp/task156-tsc-base.txt
  git stash pop >/dev/null 2>&1
  echo "stash popped; dirty files: $(git status --short | wc -l)"
else
  echo "STASH FAILED — aborting"; exit 1
fi

echo "=== 3. Diff of error signatures ==="
# normalize line numbers out so identical errors on shifted lines still match
sed -E 's/\(([0-9]+),([0-9]+)\)/(L,C)/g' /tmp/task156-tsc-work.txt | sort > /tmp/task156-work-norm.txt
sed -E 's/\(([0-9]+),([0-9]+)\)/(L,C)/g' /tmp/task156-tsc-base.txt | sort > /tmp/task156-base-norm.txt
NEW=$(comm -23 /tmp/task156-work-norm.txt /tmp/task156-base-norm.txt | wc -l)
GONE=$(comm -13 /tmp/task156-work-norm.txt /tmp/task156-base-norm.txt | wc -l)
echo "NEW error types vs baseline: $NEW"
echo "errors gone vs baseline:     $GONE"
echo "--- NEW errors (first 40) ---"
comm -23 /tmp/task156-work-norm.txt /tmp/task156-base-norm.txt | head -40
