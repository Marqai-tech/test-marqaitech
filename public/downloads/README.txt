3 Boxes HRMS — Android APK releases.

3boxes-hrms-mobile-v<version>.apk   — versioned release (web login page links this)
3boxes-hrms-mobile.apk              — "always latest" alias for in-app updaters
index.html                          — download page (linked from the web login page)

Current release: v1.1.0 (versionCode 11) — Task 111 ROOT-CAUSE FIX for
"errors in all modules + no token stored": the workspace auto-detect could
land on a /login PAGE URL, so the app "signed in" against an HTML page with
no session token. Login now always lands on the real API origin, the
connection check reports truthfully, and any persisted /login workspace
self-heals on first launch. Upgrades cleanly over v1.0.9 (same permanent
signing key, hrms_app/android/key.properties + app/release-key.jks) — no
uninstall needed for v1.0.9 users. Users on v1.0.8-or-older still need the
one-time uninstall (signature migration). Built from hrms_app/ with
flutter build apk --release --target-platform android-arm64.
