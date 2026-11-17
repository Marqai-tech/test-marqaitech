#!/usr/bin/env python3
"""Task 110b — register + approve the deployment change request (GOVERNANCE.md §1)."""
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

description = """Task 110b (user-reported follow-up): Android APK download chain and stale-install fix.

WHAT CHANGES (web + mobile release):
1. Mobile app (Flutter v1.0.9, versionCode 10):
   - REMOVES the "Download latest app (APK)" button + update banner from the mobile sign-in
     screen (user request: downloads from the app login page kept failing/404ing). The web
     login page becomes the ONLY APK download source. Version footer + connection check kept.
   - In-app update dialogs (home + settings) now prefer the workspace-reported versioned APK URL.
   - PERMANENT RELEASE SIGNING KEY (android/key.properties + app/release-key.jks, committed):
     every previous build was signed with a sandbox-generated debug keystore that changed on
     each toolchain rebuild, so Android silently refused update installs on user devices
     ("App not installed") and phones kept running old erroring builds. One-time uninstall of
     older installs is required for this release; explained on the web login page.
2. Web login page: APK link now points to the versioned file
   /downloads/3boxes-hrms-mobile-v1.0.9.apk; install instructions add the one-time
   uninstall-first step; dead PWA-install state (beforeinstallprompt handler) removed.
3. /downloads/index.html download center: v1.0.9 badge, versioned APK link, uninstall note.
4. /api/public/app-version (src/lib/app-version.ts): 1.0.9 (10) + versioned apkUrl + release notes.
5. /api/mobile-app/apk route FIXED: was NextResponse.redirect('/relative') which 500s on every
   host (Next requires absolute URLs) — now host-aware absolute 307 redirect to the APK.
6. public/downloads: versioned v1.0.9 APK (21,044,460 bytes, arm64) committed; unversioned
   filename kept as "always latest" alias for v1.0.8 in-app updaters; README updated.

WHY: user reported (a) 404 downloading from the mobile login page, (b) modules still erroring
after "installing the latest" — root-caused to signature-mismatched updates that never installed
plus a broken redirect route; this release removes the in-app download vector, pins a stable
signing identity, and versions the downloadable filename.

VERIFICATION DONE: flutter analyze 0 errors; 10/10 tests; aapt2 versionCode 10 / versionName
1.0.9; apksigner cert 590a456e25afaf79948bcb516b6edbd3d7da0706d735d7fc8fa212409dc3749c; AOT
strings confirm download button removed + web-login-page hint present."""

cr = post_json(f"{PLATFORM}/api/super-admin/change-requests",
               {"title": "Task 110b: mobile v1.0.9 (10) — permanent signing key, in-app download removed (web login page is sole APK source), versioned APK + fixed redirect route",
                "description": description, "area": "deploy"})
print(json.dumps(cr)[:400])
rid = (cr.get("request") or cr).get("id")
if not rid:
    print("NO_CR_ID"); sys.exit(3)
ap = patch_json(f"{PLATFORM}/api/super-admin/change-requests/{rid}", {"action": "approve"}, token)
print("approve:", json.dumps(ap)[:200])
print("CR_ID:", rid)
