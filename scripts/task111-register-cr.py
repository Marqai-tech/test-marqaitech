#!/usr/bin/env python3
"""Task 111 — register + approve the deployment change request (GOVERNANCE.md §1)."""
import json, sys, urllib.request

PLATFORM = "https://3boxeshrms.com"
EMAIL = "superadmin@3boxeshrms.com"
PASSWORD = "MarqAI@2026"

def post_json(url, payload, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers)
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

def patch_json(url, payload, token):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {token}"}, method="PATCH")
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

login = post_json(f"{PLATFORM}/api/auth/login", {"email": EMAIL, "password": PASSWORD})
token = login.get("token")
if not token:
    print("LOGIN_FAILED"); sys.exit(2)

description = """Task 111 (user-reported, root cause found): "reinstalled the app, still errors in ALL modules; connection check shows identity ok but session token: NO TOKEN STORED" (installed build v1.0.9 (10)).

ROOT CAUSE (reproduced end-to-end): the platform login API answers tenant users with suggestedUrl "https://<slug>.3boxeshrms.com/login" (a PAGE URL). The mobile login ladder retried at "<slug>.3boxeshrms.com/login" and POSTed to "<slug>/login/api/auth/login" — Next.js served the login PAGE as HTTP 200 text/html (34KB). The app read token=null from that 200 and — because the success branch only guarded token storage, not the return — treated the login as SUCCESSFUL, persisted workspace ".../login", navigated Home with NO session, and every module then 401-ed. The in-app Connection check compounded it: getMe() returning null was reported as "identity ok" (false positive) next to "no token stored" — exactly the user's screenshot.

WHAT CHANGES (mobile release v1.1.0, versionCode 11 + web):
1. ApiConfig.normalizeWorkspaceUrl now ALWAYS returns the bare ORIGIN (scheme+host, path stripped): suggestedUrl ".../login", user-typed ".../login", and any persisted value all normalize to the API origin.
2. ApiService.login: HTTP 200 WITHOUT a session token is no longer treated as success — the ladder falls through to the next workspace; _loginAttempt additionally rejects HTML responses (text/html or '<'-prefixed body) as "served a web page instead of the login API".
3. ApiConfig.restoreFromStorage sanitizes the persisted workspace, so phones carrying the broken v1.0.9 ".../login" value self-heal on first launch.
4. Diagnostics screen: identity check is now truthful (getMe() null => FAIL with "sign in again" guidance; success shows the signed-in name), module probes gated on the real token, stale "tap Download latest app" text replaced with the web-login-page download instruction.
5. Version sync bumped 1.0.9(10) -> 1.1.0(11) across pubspec.yaml, app_info.dart, constants.dart, src/lib/app-version.ts (versioned apkUrl /downloads/3boxes-hrms-mobile-v1.1.0.apk).
6. public/downloads: v1.1.0 APK committed (21,044,456 bytes, arm64, versioned + always-latest alias), README + download center updated; web login page install steps now say v1.1.0 installs over v1.0.9 without uninstall (same permanent signing key).

VERIFICATION DONE: e2e ladder test for tenant-admin/demo-admin/super-admin/demo-employee/demo-manager/live-tenant = 78/79 endpoint checks pass (the 1 non-pass is super-admin my-summary 404 = by design, no employee profile); POST <slug>/login/api/auth/login confirmed 200 text/html (the trap); flutter analyze 0 errors; 17/17 Dart tests (10 model + 7 new normalizeWorkspaceUrl regression tests incl. the /login root cause); aapt2: versionCode 11, versionName 1.1.0, INTERNET+LOCATION permissions, label '3 Boxes HRMS'."""

cr = post_json(f"{PLATFORM}/api/super-admin/change-requests",
               {"title": "Task 111: mobile v1.1.0 (11) — root-cause fix for all-module errors + no-token-stored (workspace /login trap), truthful connection check, origin-only workspaces",
                "description": description, "area": "deploy"})
print(json.dumps(cr)[:400])
rid = (cr.get("request") or cr).get("id")
if not rid:
    print("NO_CR_ID"); sys.exit(3)
ap = patch_json(f"{PLATFORM}/api/super-admin/change-requests/{rid}", {"action": "approve"}, token)
print("approve:", json.dumps(ap)[:200])
print("CR_ID:", rid)
