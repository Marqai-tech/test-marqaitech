3 Boxes HRMS — Android APK releases.

3boxes-hrms-mobile-v<version>.apk   — versioned release (web login page links this)
3boxes-hrms-mobile.apk              — "always latest" alias for v1.0.8 in-app updaters
index.html                          — download page (linked from the web login page)

Current release: v1.0.9 (versionCode 10) — signed with the PERMANENT release
key (hrms_app/android/key.properties + app/release-key.jks). Users upgrading
from any v1.0.8-or-older install must uninstall the old app once before
installing (signature migration). Built from hrms_app/ with
flutter build apk --release --target-platform android-arm64.
