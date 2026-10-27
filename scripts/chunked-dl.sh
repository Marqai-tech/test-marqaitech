#!/bin/bash
# Task 142 — chunked downloader (full-stream downloads stall in this sandbox).
# Usage: chunked-dl.sh <url> <output-file> <total-size-bytes> [chunk-mb]
set -e
URL="$1"; OUT="$2"; SIZE="$3"; CHUNK="${4:-8}"
CBYTES=$((CHUNK * 1024 * 1024))
> "$OUT"
START=0
while [ "$START" -lt "$SIZE" ]; do
  END=$((START + CBYTES - 1))
  [ "$END" -ge "$SIZE" ] && END=$((SIZE - 1))
  RANGE="$START-$END"
  for attempt in 1 2 3 4 5; do
    if curl -sS --max-time 300 -r "$RANGE" "$URL" >> "$OUT" 2>/dev/null; then
      break
    fi
    echo "chunk $RANGE attempt $attempt failed, retrying..." >&2
    sleep 2
  done
  # verify chunk length
  GOT=$(( $(stat -c%s "$OUT") - START ))
  if [ "$GOT" -lt $((END - START + 1)) ]; then
    echo "chunk $RANGE incomplete (got $GOT)" >&2
    exit 1
  fi
  START=$((END + 1))
done
echo "DONE $(stat -c%s "$OUT") bytes"
