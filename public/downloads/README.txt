3 Boxes HRMS — Android APK releases (Task 156: TWO editions).

3boxes-hrms-native-v<version>.apk   — NATIVE edition, versioned release
                                      (full Flutter UI + PhonePe-style violet
                                      AI Assistant centre dock + native AI chat)
3boxes-hrms-native.apk              — "always latest" NATIVE alias
3boxes-hrms-mobile-v<version>.apk   — LITE WebView-shell edition, versioned
                                      release (native sign-in + WebView that
                                      renders the LIVE tenant web workspace)
3boxes-hrms-mobile.apk              — "always latest" LITE alias (kept for
                                      old in-app updaters)
index.html                          — download page (linked from the web login
                                      page; lists BOTH editions)

Both editions share applicationId com.threeboxes.hrms_app + the SAME permanent
signing key (cert SHA-256 590a456e...) and ship at the SAME versionCode, so a
user can install either one and switch to the other at any time — each
installs right over the other, no uninstall needed.

Current release: NATIVE v1.9.0 (versionCode 37) — Task 156: PhonePe-style
raised violet AI Assistant centre dock (Home · Chat · [AI] · Attendance ·
Profile, always balanced 2-left / 2-right), NATIVE AI Assistant chat screen
calling the same /api/ai-chat endpoint as the web bot, in-app one-tap
"Check for updates" downloader, and a Settings "Download an app edition"
sheet offering both editions. Universal APK (armeabi-v7a + arm64-v8a +
x86_64), stripped native libs, permanent release key.

Current release: LITE v1.8.1 (versionCode 37) — Task 157: the shell's launcher
icon (which still shipped the default Flutter logo) is now the 3 Boxes HRMS
cubes logo re-coloured ROYAL BLUE, so the Lite edition is instantly
distinguishable from the Native edition's green-icon build in the device
drawer. Task 156 base: version bump of the Task 155 WebView-shell app
(onboarding carousel + native sign-in + live web workspace) so it stays
installable over/under the native 37 build and users can switch editions
freely. Same permanent key (590a456e...), universal APK, 50.4MB.

Previous release: v1.8.0 (versionCode 36) — Task 155 WebView-shell app.
Previous release: v1.7.1 (versionCode 35) — Task 145 native universal-ABI
install fix. Previous release: v1.6.6 (versionCode 33) — last v1.6.x line.
