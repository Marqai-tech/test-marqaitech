#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# 3Boxes HRMS — Deploy Guard (Task 109 governance)
#
# The ONLY permitted way to run a CLI deploy. Verifies an APPROVED
# super-admin change request before deploying, and marks it implemented
# with the deployed commit after success.
#
# Usage:
#   CR_ID=cmvxxx ./scripts/deploy-release.sh demo      # demo host
#   CR_ID=cmvxxx ./scripts/deploy-release.sh prod      # LIVE (CLI prod deploy)
#   CR_ID=cmvxxx ./scripts/deploy-release.sh verify    # just check the CR
#
# Required env:
#   CR_ID            — super-admin change request id (status must be approved)
#   SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD — super admin login
#   PLATFORM_URL     — https://3boxeshrms.com (default)
#
# Policy: see GOVERNANCE.md. Pushes to GitHub must carry `CR:<CR_ID>` in
# the commit message — the script extracts the HEAD sha automatically.
# ══════════════════════════════════════════════════════════════════════
set -euo pipefail

CR_ID="${CR_ID:-}"
TARGET="${1:-verify}"
PLATFORM_URL="${PLATFORM_URL:-https://3boxeshrms.com}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@3boxeshrms.com}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-}"

if [ -z "$CR_ID" ] || [ -z "$SUPER_ADMIN_PASSWORD" ]; then
  echo "✗ Refusing to deploy: CR_ID and SUPER_ADMIN_PASSWORD are required."
  echo "  Every code deployment needs an approved super-admin change request (GOVERNANCE.md)."
  exit 1
fi

command -v python3 >/dev/null 2>&1 || { echo "✗ python3 required"; exit 1; }

CR_STATUS=$(python3 - "$PLATFORM_URL" "$CR_ID" "$SUPER_ADMIN_EMAIL" "$SUPER_ADMIN_PASSWORD" <<'PYEOF'
import json, sys, urllib.request

platform_url, cr_id, email, password = sys.argv[1:5]

def post_json(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

def get_json(url, token):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

login = post_json(f'{platform_url}/api/auth/login', {'email': email, 'password': password})
token = login.get('token')
if not token:
    print('LOGIN_FAILED'); sys.exit(2)
cr = get_json(f'{platform_url}/api/super-admin/change-requests/{cr_id}', token).get('request') or {}
status = cr.get('status')
print(status or 'NOT_FOUND')
PYEOF
) || CR_STATUS="CHECK_FAILED"

echo "change-request $CR_ID status: $CR_STATUS"
case "$CR_STATUS" in
  approved|implemented) : ;;
  *) echo "✗ DEPLOY BLOCKED — change request is not approved (GOVERNANCE.md §1)."; exit 1 ;;
esac

[ "$TARGET" = "verify" ] && { echo "✓ CR verified — deployment authorized."; exit 0; }

HEAD_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")
if [ "$TARGET" = "demo" ]; then
  VERCEL="${VERCEL:-/home/z/node_modules/.bin/vercel}"
  "$VERCEL" deploy --prod --yes --token "${VERCEL_TOKEN:?VERCEL_TOKEN required}"
elif [ "$TARGET" = "prod" ]; then
  VERCEL="${VERCEL:-/home/z/node_modules/.bin/vercel}"
  "$VERCEL" deploy --prod --yes --token "${VERCEL_TOKEN:?VERCEL_TOKEN required}"
else
  echo "✗ Unknown target: $TARGET (use demo | prod | verify)"; exit 1
fi

echo "✓ Deploy finished — marking CR implemented (commit ${HEAD_SHA:0:10})…"
python3 - "$PLATFORM_URL" "$CR_ID" "$SUPER_ADMIN_EMAIL" "$SUPER_ADMIN_PASSWORD" "$HEAD_SHA" <<'PYEOF'
import json, sys, urllib.request

platform_url, cr_id, email, password, sha = sys.argv[1:6]

def post_json(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

token = post_json(f'{platform_url}/api/auth/login', {'email': email, 'password': password}).get('token')
req = urllib.request.Request(
    f'{platform_url}/api/super-admin/change-requests/{cr_id}',
    data=json.dumps({'action': 'implement', 'deployCommit': sha}).encode(),
    headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'}, method='PATCH')
print('implement status:', urllib.request.urlopen(req, timeout=30).status)
PYEOF
echo "✓ Governance loop closed."
