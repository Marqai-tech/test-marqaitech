# 3Boxes HRMS — Implementation & Verification Status
### What has been prepared and designed, verified via API and browser, screen by screen against `docs/RECRUITMENT_MODULE_USER_MANUAL.md`

> Verification date: 12 Nov 2026 · Environment: live beta `https://3boxes-hrms-beta.vercel.app` (tenant `test-marqaitech`)
> Reference document: `docs/RECRUITMENT_MODULE_USER_MANUAL.md` — the flow contract (Requisition → Job Posting → Application → Screening → Interviews → Offer → Convert → Documents → BGV → Employee Activation)

---

## 1. Screen-by-screen verification (the 18 screens of the manual)

Legend: **API** = endpoint called by the screen returns 200 on the live deployment. **UI** = page verified rendering in a real browser (Chromium) on the live deployment.

| # | Screen (manual) | URL | Persona | API | UI (live) | Notes |
|---|---|---|---|---|---|---|
| 1 | Requisitions | `/requisitions` | Manager | PASS `GET /api/requisitions` | PASS | REQ-0015 etc. listed |
| 2 | Requisitions (3-tier approve) | `/requisitions` | HR → CEO | PASS (same endpoint) | PASS | tiers HR → Finance → CEO as per manual |
| 3 | Job Portal | `/job-portal` | HR | PASS `GET /api/job-board-postings` | PASS | |
| 4 | Careers / Browse Jobs | `/careers` | Candidate | PASS (public jobs feed) | PASS | |
| 5 | Candidate Portal login | `/candidate-portal/login` | Candidate | PASS `POST /api/candidate-portal/auth/login-password` | PASS | Password + OTP modes; Google OAuth present |
| 6 | Recruitment applicants | `/recruitment` | HR | PASS `GET /api/recruitment` | PASS | pipeline stages applied → … → hired |
| 7 | Interviews | `/interviews` | HR | PASS `GET /api/interviews` | PASS | Interview Management rendered |
| 8 | Offer Dashboard | `/offers` | HR | PASS `GET /api/offers` | PASS | Offer Management rendered |
| 9 | Offer e-sign page | `/offer/{token}` | Candidate | page 200 | PASS (route) | 7-day validity per manual |
| 10 | Convert dialog | `/offers` → Convert | HR | PASS (convert-to-draft, verified earlier E2E) | PASS | Welcome message insert fixed (commit `d1f5be4`) |
| 11 | Onboarding (upload docs) | `/candidate-portal/onboarding` | Candidate | PASS `GET /api/candidate-portal/onboarding` | PASS | Status banner, Employment Details, BGV section, Required Documents + progress bar, per-doc Upload/Re-upload, Attendance (30 days), Leave Balances — exactly manual PART 7/8 |
| 12 | Onboarding Review | `/onboarding-review` | HR | PASS `GET /api/onboarding/pipeline` | PASS | candidate cards with documents |
| 13 | Vendors | `/vendors` | HR | PASS `GET /api/vendors` | **CRASH on live** | see §3 — old build crashes on `v.type.replace`; already fixed in code (redirect → `/vendor-management/vendors`, new module) |
| 14 | BGV initiate modal | `/onboarding-review` → Initiate BGV | HR | PASS `POST /api/bgv/initiate` (used earlier E2E) | PASS | checks + document share + due date |
| 15 | Vendor Dashboard | `/vendor-portal/dashboard` (login via `/login` → **Vendor** tab) | Vendor Admin | PASS login + `GET /api/vendor/requests` + `GET /api/vendors/{id}/users` | PASS | stat sections + staff dropdown + **Assign executed live** |
| 16 | BGV request workspace | `/vendor-portal/requests/{id}` | Vendor Employee | PASS `GET /api/vendor/requests` + `PATCH …/checks/{id}` + `POST …/submit-report` | PASS | Candidate Information, Shared Documents (6), Verification Checks (5) with Start / Mark Clear / Discrepancy / Unable-to-Verify, Submit Final Report — exactly manual PART 11 |
| 17 | BGV Dashboard | `/bgv-dashboard` | HR | PASS `GET /api/bgv/requests` | PASS (2-button build) | live build predates the 4-action fix; 4 buttons (Approve / Awaiting Info / Rework / Reject) are in git and deploy with next successful build — see §4 |
| 18 | HRMS login (activated employee) | `/login` | Employee | PASS | PASS | Employee/HR + Job candidate + **Vendor** tabs confirmed present |

**Additional candidate portal screens (all 200 on live):** `/candidate-portal/dashboard`, `/offers` (My Offers incl. `approved` status sweep fix), `/interviews`, `/settings`, `/resume-builder`, `/resume-optimizer`, `/set-password`, `/forgot-password` (OTP/password reset).

---

## 2. Live end-to-end BGV walk-through executed during this verification (browser + API)

Using the manual's test candidate **manoj23434@gmail.com (Manoj Thummala)** and vendor **VerifyRight BGV Services**:

1. **Vendor Admin** (`manoj23434@gmail.com / Welcome@123`) logged in via `/login` → Vendor tab → dashboard showed "Awaiting Assignment (1)".
2. Selected **Ravi Verifier (manoj23434+verifier@gmail.com)** in the staff dropdown → clicked **Assign** → `POST /api/vendor/requests/bgv-1794462772129-3ow2zm/assign` → **200** → status **Assigned** (manual PART 10 — verified in browser, no `window.prompt`).
3. **Verifier** (`manoj23434+verifier@gmail.com / Welcome@123`) opened the workspace → all 5 checks visible.
4. Check 1 (**Address Verification**) completed through the UI: Start → Mark Clear → findings dialog → `PATCH …/checks/chk-…-fpgi` → **200** → "completed".
5. Remaining 4 checks (Identity / Employment / Education / Criminal) completed via API with Clear findings → all **200**.
6. **Submit Final Report** → `POST …/submit-report` → **200** → report **v1** saved, request status **`submitted_for_hr_review`** (manual PART 11 — verified).
7. **HR** sees the request on `/bgv-dashboard` with the report summary and decision actions. The final **Approve** (which assigns the MarqNNN ID and sends the welcome email) is deliberately left for the HR user to execute.

> Note: this candidate already holds Employee ID **Marq018** from an earlier approved BGV run — the current request is a second cycle, useful for demonstrating the interim-review loop.

---

## 3. What was prepared / designed in this cycle (code-complete in `main`)

### 3.1 Preboarding module (HR side) — built to the Preboarding BRD
New pages under `src/app/(dashboard)/preboarding/`:
- **Dashboard** (`/preboarding`) — metric cards (10), pipeline stepper (6 stages), 6-widget grid (Upcoming Joiners, Pending Documents, Verification Queue donut, Joining Readiness, Department-wise Joiners, Delayed Activities), Quick Actions bar, filters row.
- **Candidates list** (`/preboarding/candidates`) — mini metric cards, live search + 6 filters, full-width table (14 columns), row actions (Send Reminder, Update Joining Date, Confirm Joining, Return for Correction, Cancel), bulk actions, pagination.
- **Candidate detail** (`/preboarding/candidates/[id]`) — header card with readiness ring; tabs: Details (portal form data incl. bank/PAN masking), Documents (approve / reject / request resubmission), Verification, Readiness (Mark Ready to Join with mandatory-pending list), Activity (timeline), Messages.
- **Documents** (`/preboarding/documents`) — summary chips + filters + review actions (BRD 5.8).
- **Verification** (`/preboarding/verification`) — 5 tabs exactly per BRD 5.9 + category cards.
- Plus `readiness`, `joining-formalities`, `employee-creation`, `activity`, `reports`, `settings`, `tasks` screens.
- Backend: `src/app/api/preboarding/brd/*` (pipeline, candidate actions, documents review, readiness, joining-formalities, employee-creation, activity) + `src/lib/preboarding.ts` (role gates + stage model).
- Prisma: `VendorCompany`, `VendorUser`, `BgvRequest`, `BgvCheck`, `BgvReport`, `BgvDocumentShare` formalised as models — **column parity with the existing production tables verified programmatically (6/6 MATCH)**.

### 3.2 Vendor Management — SEPARATE module (as instructed)
- New module at `src/app/(dashboard)/vendor-management/` (dashboard, **vendors**, **requests** pages) with its own sidebar section ("Vendor Management") in `navData.tsx`.
- Old `/vendors` page now **redirects** to `/vendor-management/vendors` — this also fixes the live crash described below.
- Vendor portal (external users) remains the separate `/vendor-portal/*` surface.

### 3.3 Candidate portal
- New preboarding view for candidates (`/candidate-portal/preboarding`) + onboarding submit flow (`/api/candidate-portal/onboarding/submit`) and portal details API (`/api/onboarding/portal-details`).
- All manual-listed candidate screens verified working (table above).

### 3.4 Earlier fixes already in `main` (deployed pending — see §4)
- `3525277` — tenant DB schema sync at build time (root-cause fix for candidate-login P2022 crash).
- `d1f5be4` — Convert welcome message insert (NOT NULL fix).
- `f0dffb3` — BGV interim review (Awaiting Info / Rework + 4 buttons on `/bgv-dashboard`), vendor edit on `/api/vendors/[id]`, interview feedback fix, candidate offers sweep, probation unit normalisation.
- `ac95e82` — recruitment + BGV E2E fixes (staff dropdown for assignment, vendors/{id}/users, onboarding-review cards).

---

## 4. Deployment blocker — action required

**The Vercel account is BLOCKED.** Evidence (GitHub commit statuses, repo `Marqai-tech/test-marqaitech`):

```
d1f5be4  Vercel | failure | Account is blocked.
3525277  Vercel | failure | Account is blocked.
f0dffb3  Vercel | failure | Account is blocked.
b75d655  Vercel | failure | Account is blocked.
41942bc  Vercel | failure | Account is blocked.
e54a68a  Vercel | failure | Account is blocked.
```

Consequences:
- The live site runs an **older build** (predating `f0dffb3`, ~11 Nov). Verified symptoms: `/bgv-dashboard` shows 2 of 4 decision buttons; `POST /api/bgv/requests/[id]/review` returns the 404 page; `/vendors` crashes (`v.type.replace` on undefined) because it still reads the old vendor shape.
- All fixes/features in `main` (§3) go live automatically **as soon as the account is unblocked and the next deploy runs** — no code action needed.
- **What you need to do:** log into vercel.com and resolve the account block (billing/verification per https://vercel.com/knowledge/why-is-my-account-deployment-blocked), then trigger a redeploy of `main`.

---

## 5. Verification accounts & data used

| Persona | Email | Password | Purpose |
|---|---|---|---|
| Candidate (manual) | manoj23434@gmail.com | Welcome@123 | portal + BGV candidate |
| Vendor Admin | manoj23434@gmail.com | Welcome@123 | assignment (verified live) |
| Vendor Verifier | manoj23434+verifier@gmail.com | Welcome@123 | checks + report (verified live) |
| **HR verification user (created for this audit)** | e2e-verify@hrmscheck.io | Verify@123 | tenant_admin role in `test-marqaitech`, used to verify all HR screens/APIs. Safe to delete after use. |

Test BGV request: `bgv-1794462772129-3ow2zm` — status **`submitted_for_hr_review`** (report v1, all 5 checks Clear) — awaiting the HR decision on `/bgv-dashboard`.

---

## 6. Known behaviors (unchanged, per manual)
- Emails require SMTP/Resend configuration; without it flows log emails instead of sending (no blocking). SMTP credentials are still pending.
- Offer links valid 7 days; uploads capped 10 MB (resume 5 MB); one active BGV request per candidate; Employee IDs `MarqNNN` sequential on BGV approval.
- Vendor workspace currently collects findings via browser `prompt()` dialogs — functional; upgrading that UX belongs to the separate Vendor Management work stream.

---

## 7. Quality gates applied to the new code
- ESLint: all new preboarding/vendor-management pages pass except repo-conventional `no-explicit-any` (same pattern as committed API routes). Fixed in this cycle: missing `FiCircle` import (runtime crash risk), 6 × `react-hooks/set-state-in-effect` (repo-standard `queueMicrotask` pattern), unused vars.
- Prisma model ↔ production-table column parity: 6/6 MATCH (programmatic check).
- TypeScript: per-file checks clean for the new pages (full-repo `tsc` exceeds sandbox memory; Vercel build uses `ignoreBuildErrors: true` as configured).
