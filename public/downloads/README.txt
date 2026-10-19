3 Boxes HRMS — Android APK releases.

3boxes-hrms-mobile-v<version>.apk   — versioned release (web login page links this)
3boxes-hrms-mobile.apk              — "always latest" alias for in-app updaters
index.html                          — download page (linked from the web login page)

Current release: v1.2.0 (versionCode 12) — Task 112 DYNAMIC SCREENS release:
profile, settings, notifications, employee directory, attendance report and
the home check-in/break/leave tabs are now LIVE-data screens (design set
02/03/04/05/16/17/18/19/87), plus self-service profile photo change
(PATCH /api/auth/me) and the my-leave-balance API. Upgrades cleanly over
v1.1.0 and v1.0.9 (same permanent signing key, hrms_app/android/
key.properties + app/release-key.jks) — no uninstall needed. Users on
v1.0.8-or-older still need the one-time uninstall (signature migration).
Built from hrms_app/ with flutter build apk --release --target-platform android-arm64.
