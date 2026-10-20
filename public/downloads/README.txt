3 Boxes HRMS — Android APK releases.

3boxes-hrms-mobile-v<version>.apk   — versioned release (web login page links this)
3boxes-hrms-mobile.apk              — "always latest" alias for in-app updaters
index.html                          — download page (linked from the web login page)

Current release: v1.3.0 (versionCode 13) — Task 113 TEAM-SCOPED DIRECTORY release:
employee directory scoped by role (employee = own department, manager = team
+ reportees, admin/HR = everyone), colorful default avatars for photo-less
records, Leave Request with live balance cards, My Attendance with Office/
Out Side mode + location bar + mock-GPS (spoofing) protection, Payroll run
summary cards, and fingerprint (biometric) login. Upgrades cleanly over
v1.2.0 / v1.1.0 / v1.0.9 (same permanent signing key, hrms_app/android/
key.properties + app/release-key.jks) — no uninstall needed. Users on
v1.0.8-or-older still need the one-time uninstall (signature migration).
Built from hrms_app/ with flutter build apk --release --target-platform android-arm64.
