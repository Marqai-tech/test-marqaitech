#!/bin/bash
# Task 156 — poll Vercel deploy status for the pushed commit on BOTH projects.
COMMIT="1296f4a7"
for i in $(seq 1 40); do
  echo "--- poll $i $(date -u +%H:%M:%S) ---"
  curl -s "https://api.vercel.com/v6/deployments?limit=8&teamId=${VERCEL_TEAM_ID}" -H "Authorization: Bearer ${VERCEL_TOKEN}" >/dev/null 2>&1 || true
  # GitHub commit status is the source of truth used by prior tasks
  ST1=$(curl -s "https://api.github.com/repos/maheshkpreddy/nexus-hrms/commits/${COMMIT}/status" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('state'), (d.get('statuses') or [{}])[0].get('context',''), (d.get('statuses') or [{}])[0].get('description','')[:80])" 2>/dev/null)
  echo "github status: $ST1"
  STATE=$(echo "$ST1" | awk '{print $1}')
  if [ "$STATE" = "success" ]; then echo "DEPLOY SUCCESS"; exit 0; fi
  if [ "$STATE" = "failure" ] || [ "$STATE" = "error" ]; then echo "DEPLOY FAILED"; exit 1; fi
  sleep 30
done
echo "TIMEOUT waiting for deploy"
exit 2
