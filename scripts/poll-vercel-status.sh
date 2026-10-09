#!/bin/bash
# Poll Vercel deployment statuses for commit $1 on Marqaitech/3-Boxes-HRMS
cd /home/z/my-project
TOKEN=$(git config --get remote.marqai.url | sed -E 's|https://||; s|@github\.com.*||' | awk -F: '{print $NF}')
SHA="${1:-5c243f78}"
REPO="Marqaitech/3-Boxes-HRMS"
MAX=20   # 20 x 25s = ~8.3 min max
for i in $(seq 1 $MAX); do
  OUT=$(curl -s -H "Authorization: token $TOKEN" "https://api.github.com/repos/$REPO/commits/$SHA/status")
  STATE=$(echo "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('state'))" 2>/dev/null)
  echo "[$(date +%H:%M:%S)] poll $i — combined: $STATE"
  echo "$OUT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for s in d.get('statuses',[]):
    print('   -', s['context'], '=>', s['state'], '|', (s.get('description') or '')[:70])
" 2>/dev/null
  if [ "$STATE" = "success" ] || [ "$STATE" = "failure" ]; then
    # only exit on failure, or on success when BOTH contexts have reported
    N=$(echo "$OUT" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('statuses',[])))" 2>/dev/null)
    if [ "$STATE" = "failure" ]; then echo "RESULT: FAILURE"; exit 1; fi
    if [ "$N" -ge 2 ]; then echo "RESULT: SUCCESS (both projects)"; exit 0; fi
  fi
  sleep 25
done
echo "RESULT: TIMEOUT — check manually"
exit 2
