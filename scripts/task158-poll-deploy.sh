#!/bin/bash
# Task 158 — poll Vercel deployment with the AI-chat sessionId marker.
cd /home/z/my-project
for i in $(seq 1 12); do
  TOKEN=$(curl -s -X POST https://nexus-hrms-demo.vercel.app/api/auth/login -H 'Content-Type: application/json' -d '{"email":"superadmin@3boxeshrms.com","password":"MarqAI@2026"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
  if [ -n "$TOKEN" ]; then
    R=$(curl -s -X POST https://nexus-hrms-demo.vercel.app/api/ai-chat -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"message":"deployment marker ping"}' | head -c 300)
    HIT=$(echo "$R" | python3 -c "import sys,json
try:
  d=json.load(sys.stdin)
  print('MARKER-HIT' if d.get('sessionId') and d.get('reply') else 'OLD-BUILD')
except Exception:
  print('TRANSITION')" 2>/dev/null)
    echo "attempt $i: $HIT"
    if [ "$HIT" = "MARKER-HIT" ]; then echo "DEPLOYED"; exit 0; fi
  else
    echo "attempt $i: no token (deploy in progress)"
  fi
  sleep 25
done
echo "NOT-DEPLOYED-YET"
