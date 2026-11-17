# Vendor BGV workflow — implementation status, verification evidence and handover

> Cycle: 13 Nov 2026 (latest — see §0). Prior cycle: 12 Nov 2026 (§1+).
> Live environment: `https://3boxes-hrms-beta.vercel.app` (tenant DB `tenant_test_marqaitech`).
> Authoritative brief: `ZAI-IMPLEMENTATION-PROMPT.md` (see repo root / upload bundle).

## 0. Cycle 13 Nov 2026 — fresh full-lifecycle E2E + two fixes

The previous cycles were blocked on a missing BGV-eligible candidate. This
cycle created fresh synthetic recruitment data through the real APIs and ran
the **complete vendor BGV lifecycle live** on the beta, then fixed the two
defects it exposed.

### 0.1 What was executed (API-driven, real endpoints, synthetic data only)

Fresh candidate A (`fv-e2e-mwej4by3@bgvtest.io`, "Farah Vhora") →
`convert-to-draft` → candidate portal login → 6 documents uploaded via
`upload-v2` → HR approved all 6 → **BGV-2026-0003** initiated (5 checks, 6
shared documents, due date, instructions) → vendor admin assigned the case →
(re-assignment with reason exercised live) → investigator completed 5 checks
(**4 Clear + 1 "Unable to Verify" with required reason** — a completed result,
per the brief) + evidence uploads (PNG + PDF) → **report v1 submitted** with
optional vendor PDF → HR review → **rework_required on the criminal check**
(reason mandatory) → investigator corrected the check + new evidence →
**report v2** → HR **approved** → `approved_by_hr`, employee activation ran
(Employee ID `Marq019` issued by the existing policy chain).

### 0.2 Assertions verified live (all PASS)

| # | Assertion | Evidence |
|---|---|---|
| 1 | Fresh candidate → eligible for initiation (no settled-state block) | `POST /api/bgv/initiate` 201, case `BGV-2026-0003` |
| 2 | HR draft privacy pre-submission | `GET /api/bgv/requests/{id}` returns progress counts only — 0 findings/result fields leaked |
| 3 | Submitted snapshots visible to HR (v1: 4 Clear + Unable-to-Verify; v2: 5 Clear) | `reports[].checks` with results + findings + evidence refs |
| 4 | Version history preserved | versions `1, 2` both returned after v2 |
| 5 | Standard PDF download (HR + same-company admin) | HTTP 200, `%PDF`, ~9.4 KB |
| 6 | Evidence file download (HR) | HTTP 200 `image/png` |
| 7 | Optional vendor PDF download (HR) | HTTP 200 valid PDF via `?variant=vendor` |
| 8 | Candidate portal token cannot download vendor report | HTTP 403 |
| 9 | Vendor admin cannot edit checks (monitor only) | HTTP 403 "Vendor admins monitor cases" |
| 10 | Post-submission check edit blocked (frozen version) | HTTP 409 state-machine message |
| 11 | Duplicate submission blocked (double-click) | HTTP 409, clean message, no extra version/email |
| 12 | Rework → notification to investigator + admin, case `rework_required` | `POST …/review` 200, employee list shows rework state |
| 13 | HR approval updates linked workflow once, audit-trail + activation email | `POST …/approve` 200 "Employee ID: Marq019" |

### 0.3 Defects found and fixed (this cycle)

1. **Assignment history was empty** (`6dc75f3`) — `BgvAssignment` rows were
   only written when unassigning a previous holder, so the first assignment
   never opened a tenure row and the HR/vendor case detail returned
   `assignments: []`. Fixed to an open-interval trail: every assignment opens
   a row (reason "Initial assignment"), reassignment to a different employee
   closes the previous open row (`unassignedAt`/`unassignedById`), same-holder
   re-assign refreshes the request without duplicating rows. Verified live on
   **BGV-2026-0004** (fresh candidate B, "Arjun Nair"): first assignment →
   exactly 1 open row ("Ravi Verifier — assigned … (current)" in the UI
   History tab); same-holder re-assign → still 1 row.
2. **Vendor employee My Cases rendered permanently empty** (`8be2383`) — the
   dashboard defaulted to the `unassigned` tab, which does not exist in the
   employee tab strip, so the filter always matched zero rows while
   `GET /api/vendor/requests` correctly returned the assigned case. Employees
   now land on the Assigned tab once the session role resolves.

### 0.4 Live UI walkthrough (Chromium, synthetic data, screenshots)

| # | Screen | Result |
|---|---|---|
| 1 | `/login` → Vendor tab, admin sign-in | dashboard renders with filter tabs |
| 2 | Vendor Dashboard "All Cases" | `BGV-2026-0003` Approved, `BGV-2026-0004` Assigned, unassigned badge counts correct |
| 3 | Case workspace `/vendor-portal/requests/{id}` | candidate header, Shared Documents (6), Checks (2), History tabs |
| 4 | History tab | "No reports submitted yet." + **Assignment trail: Ravi Verifier — assigned 13/11/2026 (current)** (fix #1 visible) |
| 5 | `/bgv-dashboard` (HR) | full case list with statuses, investigators, progress %, version counts |
| 6 | HR case review (0003, expanded) | Rework-requested audit + Submitted Report v1 (05:23:14) + v2 (05:24:45) with investigator + overall findings + Approved by HR |
| 7 | Candidate portal preboarding (candidate B) | 9-step wizard, "6/6 documents approved" |
| 8 | Vendor employee dashboard | My Cases heading + assigned-case rows (after fix #2 deploy) |

### 0.5 Remaining limitations / not tested

1. **Holder-changed reassignment path** (close old row + open new row) is
   code-reviewed and typechecked but not live-executed: the tenant has only
   ONE active vendor employee, and invite activation requires the emailed
   single-use token (invite links are deliberately never returned by the API).
2. HR **Reject** path was not exercised in this cycle (approved instead);
   reject semantics are unchanged from the 12 Nov cycle and use the same
   permission-checked route family.
3. Email delivery still depends on the configured provider; notification rows
   record queued/failed honestly (no delivery evidence invented).
4. Parallel concurrent-deploy activity from another workspace continued
   during this cycle (candidate-portal BRD work on the same repo); BGV code
   paths were not touched there.


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
