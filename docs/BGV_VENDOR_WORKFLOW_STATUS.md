# Vendor BGV workflow — implementation status, verification evidence and handover

> Cycle: 12 Nov 2026. Builds on commit `171e629` (the 16-mock-screen feature drop)
> and the follow-up repair/feature commits `400398f`, `d6eaa77`, `edc289d`.
> Live environment: `https://3boxes-hrms-beta.vercel.app` (tenant DB `tenant_test_marqaitech`).
> Authoritative brief: `ZAI-IMPLEMENTATION-PROMPT.md` (see repo root / upload bundle).

## 1. What this cycle changed (concise change summary)

### 1.1 Repairs to the previous session's feature commit (`400398f`)
The `171e629` feature commit shipped 7 files with real defects — one of them
**broke the production build on Vercel** (`BUILD_UTILS_SPAWN_1`):

| File | Defect | Effect | Fix |
|---|---|---|---|
| `src/app/vendor-portal/team/page.tsx` | `FiBan` is not exported by `react-icons/fi` | **Vercel build failed** — webpack statically rejects the unknown export | `FiSlash` |
| `src/app/vendor-portal/requests/[id]/page.tsx` | `completedCount` referenced inside `ReportTab` but defined in the parent component | ReferenceError when the Report tab rendered the "checks incomplete" hint | computed locally in `ReportTab` |
| same | dead hidden `<button onClick={() => save(c, false) && void 0} hidden />` | TS2801 noise + dead code | removed |
| same | `data.assignments.map` without a guard | crash when `assignments` missing | `(data.assignments \|\| []).map` |
| `src/components/preboarding/BgvPanel.tsx` | `selDocsFinal` never defined | ReferenceError when initiating BGV | replaced with derived `selectedDocIds` |
| same | `selDocs.length` where `selDocs` defaults to `null` | **TypeError crash of the HR Initiate panel on render** | `selectedDocIds.length` |
| same | `JSX.Element` annotation | TS2503 | `ReactNode` |
| `src/app/api/bgv/requests/[id]/approve/route.ts` | `user` possibly null after create-fallback | orphan-row writes possible | explicit guard aborts with 500 before any dependent write |
| same | `Notification.tenantId` is a required column | create would fail | guarded on `auth.tenantId` |
| `src/app/api/vendor/requests/[id]/checks/[checkId]/route.ts` | `.includes()` on `as const` tuples | TS2345 | `as readonly string[]` casts |
| `src/app/api/vendor/requests/[id]/submit-report/route.ts` | unsafe `as` cast after transaction | TS2352 | nullable cast + explicit `!report.id` guard |
| `src/lib/bgv.ts` | generic on untyped `$queryRawUnsafe` | TS2347 | result-side cast |

### 1.2 New: vendor password recovery (mock screen 04 — account recovery)
- `POST /api/vendor/auth/forgot-password` — neutral no-leak responses; 32-byte
  single-use token; DB stores SHA-256 hash + 60-minute expiry; honest delivery
  reporting (`delivered` flag) + audit rows (`VENDOR_PASSWORD_RESET_REQUESTED`,
  `VENDOR_PASSWORD_RESET_EMAIL_FAILED`).
- `GET /api/vendor/auth/reset-info?token=` — masked-email preview for the reset
  screen; distinct `INVALID_TOKEN` / `EXPIRED_TOKEN` / `PENDING_INVITE` /
  `ACCOUNT_DISABLED` states.
- `POST /api/vendor/auth/reset-password` — atomic single-use consumption
  (`UPDATE … WHERE hash AND not expired AND status='active' RETURNING id`),
  same password policy as activation (min 8 chars, letters + numbers),
  disabled accounts can never reset.
- Pages: `/vendor/forgot-password`, `/vendor/reset-password` (same visual
  language as the activation screen), plus a **Forgot password?** link on the
  Vendor login tab.
- Schema: `VendorUser.passwordResetHash`, `VendorUser.passwordResetExpiresAt`
  (additive — synced to platform + all tenant DBs at build time by
  `scripts/schema-sync.js` + `scripts/tenant-schema-sync.js`).

### 1.3 New: vendor portal Notification Center (brief supporting state)
- `GET /api/vendor/notifications` — the caller's own feed (recipient = their
  work email), 50 newest, with case number / candidate, email queue state and
  unread count; `POST` marks the feed seen (`VendorUser.notificationsSeenAt`).
- Page `/vendor-portal/notifications` — event labels + icons, status chips
  (sent / failed / queued), failed-delivery explanation, case deep links,
  loading / empty / error states.
- `VendorPortalBell` header component with unread badge (60 s refresh) wired
  into the dashboard, Team and case-workspace headers.
- Underlying events (already recorded by the feature commit): `bgv_initiated`,
  `assigned`, `reassigned`, `reassigned_previous`, `rework_required`,
  `awaiting_information`, `report_submitted(+admin mirror)`, `approved`,
  `rejected`, `employee_activated`, invite sent/resent/reactivated.

### 1.4 Fix from live E2E (`edc289d`)
- `BgvPanel` now receives the candidate's `bgvStatus` and shows a settled-state
  notice ("already cleared / failed — most recent case BGV-…") instead of an
  initiation form that the server would reject with 409.

## 2. Exact routes (final URLs)

| Area | Route | Access |
|---|---|---|
| Vendor login | `/login` → **Vendor** tab | public (email/password) |
| Vendor password recovery | `/vendor/forgot-password`, `/vendor/reset-password?token=…` | public, token-gated |
| Vendor activation | `/vendor/set-password?token=…` | public, invite token |
| Vendor admin dashboard | `/vendor-portal/dashboard` | `vendor_admin` |
| Vendor admin team | `/vendor-portal/team` | `vendor_admin` |
| Vendor employee cases | `/vendor-portal/dashboard` (employee view) | `vendor_employee` |
| Case workspace | `/vendor-portal/requests/{id}` | assigned employee + same-company admin |
| **Notification Center** | `/vendor-portal/notifications` | active vendor users |
| HR BGV dashboard | `/bgv-dashboard` | HR roles |
| HR initiation | `/preboarding/documents` → candidate workspace → BGV panel | HR roles |
| Candidate preboarding wizard | `/candidate-portal/preboarding` | candidate |

APIs (all role/tenant-checked server-side):
`/api/vendor/auth/{login,set-password,invite-info,forgot-password,reset-info,reset-password}`,
`/api/vendors/[id]/{invite-admin,invite-employee,users,users/[userId]}`,
`/api/bgv/initiate`, `/api/bgv/requests`, `/api/bgv/requests/[id]`
(`/review`, `/approve`, `/reject`, `/report-pdf`),
`/api/bgv/evidence/[id]/file`, `/api/bgv/shared-documents/[id]/file`,
`/api/vendor/requests`, `/api/vendor/requests/[id]/assign`,
`/api/vendor/requests/[id]/checks/[checkId]` (+`/evidence`),
`/api/vendor/requests/[id]/submit-report`, `/api/vendor/notifications`.

## 3. Permission matrix (enforced server-side on every API + file route)

| Action | HR | Vendor admin | Vendor employee | Candidate |
|---|---|---|---|---|
| Add vendor / invite admin | Y | — | — | — |
| Invite employee (vendor_employee role only) | — | Y (own company) | — | — |
| Resend / cancel invite, disable / reactivate staff | — | Y (own company) | — | — |
| Initiate BGV (vendor, checks, documents, due date) | Y | — | — | — |
| See unassigned queue | — | Y (own company) | — | — |
| Assign / reassign case | — | Y (own company, active employee, reason required on reassign) | — | — |
| Open case / see shared documents | Y (review surfaces) | Y (own company) | assigned employee only | own documents only |
| Update checks / upload evidence | — | monitor only | assigned employee only | — |
| Save draft / submit report | — | monitor | assigned employee only | — |
| Download standard PDF / vendor PDF | Y (submitted versions) | Y (own company) | Y (own case) | via existing HR policy |
| See draft findings before submission | — (progress-only, draft-privacy enforced in serialization) | own company drafts | own drafts | — |
| Approve / rework / reject | Y (HR role + reason required for rework/reject) | — | — | — |
| Vendor approves BGV by editing a result | — | **never** (Clear ≠ approval) | — | — |
| Password self-recovery | n/a (existing flow) | Y | Y | existing flow |

Statuses stay separate: candidate/employment/joining/BGV; BGV approval updates
the linked workflow once (employee activation) and never alters employment
type, joining status or attendance access.

## 4. Verification evidence (this cycle, real execution)

Build & static checks (local, sandbox):
- `tsc --noEmit`: **0 errors in every file touched by the BGV feature** (was 14;
  the repo-wide 2068 pre-existing errors are outside this feature and ignored
  by the build via `next.config.ts → ignoreBuildErrors`, repo convention).
- `eslint` on all new/changed files: only the repo-convention
  `no-explicit-any` remains (same class as the rest of the codebase; no CI gate).
- Full `next build` cannot run in the 4 GB sandbox (OOM) — the authoritative
  build is Vercel's, which now passes: see below.

Deployments (Vercel API, project `3boxes-hrms`, production target):
| Commit | Deployment | Result |
|---|---|---|
| `171e629` (previous session) | `dpl_DP4RvFCxiFk1oBYPYoqauyKKRyPH` | **ERROR** — `FiBan` webpack failure |
| `82eced8` (minimal hotfix) | `dpl_8qq9tSH7Qi1vY2CCyfa1aLwQKLxr` | READY (beta green again, 6 bugs remained) |
| `400398f` (full repair) | `dpl_Bd1F618PJaTpuGN2EKSSJPgGuwV1` | READY |
| `d6eaa77` (recovery + notification center) | `dpl_41bRTeaHLKU2guStjdhW1qTircoZ` | READY |
| `edc289d` (settled-state notice) | `dpl_7FThnCAdAv6fDVXAU5Ccpq24WGcJ` | READY |

Live browser walkthrough (Chromium against the beta; screenshots under
`/tmp/render/verify-*.png`, synthetic test data only):

| # | Step (role) | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | `/login` Vendor tab → sign in `manoj23434@gmail.com` | Vendor Dashboard with filter tabs | redirect to `/vendor-portal/dashboard`, tabs render | PASS |
| 2 | Team page (admin) | renders staff rows + actions | rows + Disable/Reactivate render (FiBan crash gone) | PASS |
| 3 | `/bgv-dashboard` (HR `e2e-verify@hrmscheck.io`) | case list or explicit empty state | "No BGV cases in this view — Initiate BGV from Recruitment → Preboarding" | PASS |
| 4 | Candidate workspace → Documents tab (HR) | per-document review | approve modal → doc becomes `approved · locked` (4 docs approved live) | PASS |
| 5 | BGV panel render (HR) | form + gates | vendor select, 6 check checkboxes, doc list, Initiate disabled until vendor chosen | PASS |
| 6 | Initiate for already-cleared candidate | server blocks duplicate/settled BGV | `POST /api/bgv/initiate` → **409** "already cleared"; panel then shows the settled-state notice | PASS (guard works) |
| 7 | `/vendor/forgot-password` (public) | neutral response, no leak | neutral message card renders | PASS |
| 8 | Vendor tab shows Forgot password? link | link present | link present → recovery page | PASS |
| 9 | Notification Center (admin + employee) | own feed only | empty state correct; API scoped to caller email | PASS |
| 10 | Bell in vendor headers | link + badge | Notifications link present on dashboard header | PASS |

Not re-executed live in this cycle (already covered by the previous session's
recorded E2E in `docs/IMPLEMENTATION_STATUS.md` §2, unchanged code paths):
assignment via staff picker, check completion via `PATCH …/checks/{id}`,
report submission → v1 snapshot, HR review actions. The current tenant DB has
no BGV-eligible candidate (both E2E candidates are settled-cleared; one has no
approved documents), so a fresh initiation could not be produced without
creating new synthetic recruitment data.

## 5. Remaining limitations / notes

1. **Email delivery** depends on the configured provider (Resend / tenant
   SMTP). Recovery + notification mails report honest failures (audit rows +
   UI state) — verify provider env vars before relying on outbound mail.
2. **Vendor sessions** are short-lived JWTs; a password reset does not
   retroactively revoke existing vendor tokens (no server-side session store
   for vendor users). Disabling an account does cut API access immediately
   (status checked per request).
3. Repo-wide pre-existing issues untouched by design: 2068 legacy TS errors
   (build ignores them), `no-explicit-any` convention, deprecated `middleware`
   file convention warning on Next 16.
4. The 16-mock-screen feature was verified by the previous session; this cycle
   verified the repairs, the new recovery/notification surfaces and the
   initiation guard chain live.
