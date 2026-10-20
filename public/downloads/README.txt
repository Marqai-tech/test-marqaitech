3 Boxes HRMS — Android APK releases.

3boxes-hrms-mobile-v<version>.apk   — versioned release (web login page links this)
3boxes-hrms-mobile.apk              — "always latest" alias for in-app updaters
index.html                          — download page (linked from the web login page)

Current release: v1.4.2 (versionCode 16) — Task 116 PROJECTS TYPE-CAST CRASH
release: kills the "type 'List<dynamic>' is not a subtype of type
'List<ProjectTaskModel>'" error on the Projects module (project Overview) —
all JSON collection parsing is now shape-agnostic (utils/json_safe.dart), so
any unexpected server payload degrades to empty sections instead of module
errors. Regression-tested against captured LIVE + demo payloads and
adversarial shapes (hrms_app/test/project_payload_regression_test.dart).
Upgrades cleanly over v1.4.1 / v1.4.0 / v1.3.0 (same permanent signing key,
hrms_app/android/key.properties + app/release-key.jks) — no uninstall
needed. Users on v1.0.8-or-older still need the one-time uninstall
(signature migration). Built from hrms_app/ with flutter build apk
--release --target-platform android-arm64.
