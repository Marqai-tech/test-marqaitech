3 Boxes HRMS — Android APK releases.

3boxes-hrms-mobile-v<version>.apk   — versioned release (web login page links this)
3boxes-hrms-mobile.apk              — "always latest" alias for in-app updaters
index.html                          — download page (linked from the web login page)

Current release: v1.5.0 (versionCode 17) — Task 117 COLLABORATION CHAT on
mobile: the web Collaboration → Chat module, now in the app. Room list
(direct/group/project/team/announcement types, unread badges, E2EE lock
badges), live message threads with 12s polling + pull-to-refresh, send with
optimistic error handling, older-history cursor pagination, and a New Chat
sheet (Direct/Group toggle + employee picker from the same role-scoped
/api/employees the web uses). Identity uses the signed-in EMPLOYEE id
(resolveOwnEmployeeId) for correct own-message alignment and direct-room
naming — server scoping/RBAC unchanged. Same endpoints as the web page:
/api/collaboration/chat/rooms(+/[id]/messages). Upgrades cleanly over
v1.4.2 / v1.4.1 / v1.4.0 / v1.3.0 (same permanent signing key,
hrms_app/android/key.properties + app/release-key.jks) — no uninstall
needed. Users on v1.0.8-or-older still need the one-time uninstall
(signature migration). Built from hrms_app/ with flutter build apk
--release --target-platform android-arm64.
