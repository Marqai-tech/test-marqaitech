# 3Boxes HRMS — Candidate→Employee Journey: Session Progress & Handover

> Session date: 13 Nov 2026 · Repo: `Marqai-tech/test-marqaitech` (main) · Live: `https://3boxes-hrms-beta.vercel.app`
> Workflow: work divided into 10 parts; each part = implement → commit → push → deploy to Vercel → verify READY. All progress below is **pushed to GitHub and deployed** — a new session can continue from the deployed state.

---

## ✅ COMPLETED THIS SESSION (6 commits, all deployed or deploying)

### Part 1 — BGV submit-report failure: FIXED
- **Root cause** (found by prior session, verified this session): `pg_advisory_xact_lock()` returns `void`; the Neon HTTP driver cannot deserialize a void column → every report submission failed with "Failed to deserialize column of type void". Fixed in commit `7bda4ad` (CTE wrapping the lock so the outer SELECT returns an int).
- Second fix `822907f`: HR report view never selected the `snapshot` column → HR saw empty check lists after submission.
- This session: verified the full rework cycle live (HR `rework_required` → vendor resubmit → **report v2, 201, PDF ready**), verified double-click protection (parallel submits → clean 409 ×2), then **removed the TEMP diagnostic** (`ff25b3a`).
- Test data note: case `bgv-1794542921962-u2g0ta` (E2E BGV Runner) went through a rework cycle and is now `submitted_for_hr_review` with report v2 — awaiting HR decision on `/bgv-dashboard`.

### Part 2 — Candidate portal tabbed shell (mock screens visual language) — `2a72bd1`
- New `src/components/candidate-portal/CandidatePortalNav.tsx`: dark-navy top bar — Applications / Interviews / Offers / **Preboarding (state-driven)** / Resume Builder / Browse Jobs + bell with unread dot + user menu + logout.
- **Preboarding tab only renders when HR has initiated preboarding** (mock 03 hides it; mock 04+ shows it active) — driven by new `GET /api/candidate-portal/portal-state` (profile, active preboarding record, accepted-offers-awaiting-HR, unread count). Offer↔application linkage uses `jobPostingId`+email (Offer model has no applicationId).
- New `GET/POST /api/candidate-portal/messages` (feed + mark-all-read; `message` column preferred, `body` fallback) + `/candidate-portal/notifications` Notification Center page.
- All portal pages (dashboard, interviews, offers, settings, preboarding wizard) switched to the shared nav.

### Part 3 — Portal states 01–03 — `b9c83f6`
- **Mock 01**: welcome band (initials avatar, name, most-relevant application) above Application Overview.
- **Mock 02 (Review Offer)**: inline offer-letter iframe preview, "I have read the offer terms" checkbox **gating the Accept button**, info banner "Accepting the offer does not activate employee access. HR will initiate preboarding."
- **Mock 03 (Awaiting HR)**: state card with offer summary (Accepted date, "Awaiting HR initiation" pill, View accepted offer CTA) + What's-next stepper (Offer accepted ✓ / HR initiates preboarding / Complete joining information). Hidden once preboarding is initiated.

### Part 4 — Portal states 04–08 — `799cacc` + `f96af13`
- **Mock 04 (Journey overview)**: new default view of the Preboarding tab — "HR has initiated your preboarding" banner, SVG progress ring (N of 9), Documents status card, Need help?/Contact HR card, and the 9-step journey list (numbered circle + icon + description + per-step state: Start/In progress/Complete/Approved/Needs attention/**Locked** for Submit-to-HR until steps 1–8 done). "Continue preboarding" jumps to first incomplete step.
- **Mocks 06/07 (Documents)**: action-required amber banner listing every rejected/resubmission-requested document with HR's instructions + "Only the requested documents will return to HR review" note; amber accent borders on rows needing action.
- **Mock 08 (post-submit)**: submitted banner upgraded to 4-stage stepper (Submitted ✓ / HR review / Joining confirmation / Employee activation — advance with onboardingStatus) + "Submission does not activate employee access."
- Existing wizard steps (personal/address/family/education/bank/documents/review/submit) unchanged — they were already BRD-compliant.

### Part 5 — BRD 6.2 Employee-creation approval workflow — `d9b3253` (deploying `dpl_7PGCmhPz…`)
- New `EmployeeCreationRequest` table (schema-synced to platform + tenant DBs at build): state machine **draft → under_review → (payrollRequired? pending_payroll) → authorized → created**, terminal rejected/cancelled. Server-side transition map + role gates (HR: save-draft/submit/reject/cancel; Finance roles: payroll-approve; HR Admin/Tenant Admin: authorize).
- `authorize` re-runs ALL BRD 6.3 hard rules, then creates Employee + PreboardingCandidate link + request completion inside **one `$transaction`** (BRD 6.3 #12 — no partial records).
- New Employee columns `preboardingCandidateId`/`linkedApplicationId`/`linkedOfferId` + `PreboardingCandidate.jobApplicationId` (BRD 6.3 #11 traceability).
- API: `src/app/api/preboarding/brd/employee-creation-approval/route.ts` (GET active request + history; POST actions).
- Provisional `PROV-` id at creation; formal `MarqNNN` still issued at BGV approval (unchanged).

### Gap 6 — Legacy `/api/recruitment/convert` §2.1 gate — `a0c1172` (deploying)
- The legacy direct-convert endpoint (which created ACTIVE employees with no accepted-offer check) now rejects with 409 unless the candidate has an **accepted** offer. The compliant UI flow (convert-to-draft → preboarding) is unaffected.

---

## ⏳ REMAINING

Gaps 2-5 are DONE (deployed + verified): Gap 2 initiation screen (dpl_DMY→DiCR8Yp READY), Gap 3 widgets/filters (READY, pipeline API returns employmentType/company), Gap 4 doc hardening (live: 54 docs carry documentNumber/expiryDate/expired/fileHash), Gap 5 milestones (wired into onboarding-reminders sweep; runs on schedule — live trigger requires CRON_SECRET by design). For the next session:

**Part 10: Full E2E live verification** of the complete journey (fresh candidate → offer → accept → HR initiate → wizard → documents → rework → submit → joining confirm → BGV → activation) + screenshots of the 3 portal states + final delivery report.

## E2E verification done this session (live, beta)
| # | Test | Result |
|---|---|---|
| 1 | Vendor verifier login | 200, token OK |
| 2 | Vendor case list (both cases) | 200, statuses correct (`submitted_for_hr_review` ×2) |
| 3 | HR rework action on case 1 | 200 → `rework_required`, notifications sent |
| 4 | Vendor resubmit report v2 | **201**, PDF ready |
| 5 | Parallel double-click submit ×2 | 409 + 409 (one version, race-safe) |
| 6 | Candidate login (manoj23434@gmail.com) | 200 |
| 7 | Candidate onboarding API | 200 — job title + 6 documents |
| 8 | HR pipeline API | 200 — 7 candidates listed |
| 9 | HR candidate detail (messages) | 200 — 13 messages, `message` column works |

## Deployment ledger (Vercel project `3boxes-hrms`, production)
| Commit | Part | Deployment | State |
|---|---|---|---|
| `7bda4ad` | 1 (root cause) | dpl_124dLhDq… | READY |
| `822907f` | 1 (snapshot col) | dpl_G8WHDVFy… | READY |
| `ff25b3a` | 1 (diag removal) | dpl_Bn3ProBY… | READY |
| `2a72bd1` | 2 (portal shell) | dpl_449mW3FK… | READY |
| `6dc75f3` | (prior session BGV fix) | dpl_3hz8RnwU… | READY/QUEUED |
| `b9c83f6` | 3 (states 01–03) | dpl_J79RDiTp… | QUEUED→READY |
| `799cacc`+`f96af13` | 4 (states 04–08) | dpl_2TVZjewx… | **READY** |
| `d9b3253` | 5 (BRD 6.2) | dpl_7PGCmhPz… | **READY** |
| `a0c1172` | Gap 6 (§2.1 gate) | dpl_24kdpJBW… | **READY** |
| `8be2383` | merge + vendor My-Cases fix | dpl_5i3EX9wW… | **READY** |
| `1c20c71` | Gap 2 (BRD 5.3 Initiation screen) | dpl_DMYRpMRsRduN→superseded | READY |
| `7a4edeb` (HEAD) | Gap 3 (BRD 5.1 widgets + filters) | dpl_DiCR8Yp3a2fXg | **READY** |
| `8305f2b` | Gap 4 (BRD 5.8 doc hardening: version history, expiry, duplicates) | dpl_7WPtGbG5fuLct | **READY** |
| `c49c846`+`68fc87d` | Gap 5 (Day 7/30/60/90 milestones) + ledger docs | dpl_7WPtGbG5fuLct | **READY** |

**Live post-deploy verification (production beta):** `GET /api/candidate-portal/portal-state` returns HTTP 200 with real state-driven data — `preboarding: { PRE-2026-0001, stage: initiated, status: joined, submittedAt: 2026-11-12 }`, `awaitingHR: []`, `unreadNotifications: 13`. The Preboarding tab will therefore render for this candidate, and the journey-overview view (mock 04) is their default Preboarding screen.

Deploy command used (works from any session):
```
curl -s -X POST "https://api.vercel.com/v13/deployments?teamId=team_TPceTg1lfUwMToCxSNH64Lt0" \
  -H "Authorization: Bearer <VERCEL_TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"3boxes-hrms","target":"production","gitSource":{"type":"github","repoId":1422962694,"ref":"main"}}'
```
(repoId 1422962694 = Marqai-tech/test-marqaitech; `repoId` must be the numeric GitHub id — `repo`/`ref`-only forms fail.)

## Key accounts (test tenant `test-marqaitech`)
| Persona | Email | Password |
|---|---|---|
| Candidate | manoj23434@gmail.com | Welcome@123 |
| HR (tenant_admin) | e2e-verify@hrmscheck.io | Verify@123 |
| Vendor admin | manoj23434@gmail.com | Welcome@123 |
| Vendor verifier | manoj23434+verifier@gmail.com | Welcome@123 |

## Not verified / known limits
- **Email inbox delivery NOT claimed** — no SMTP/Resend provider is configured on the beta; emails are logged/best-effort. BgvNotification rows track queued/sent/failed honestly.
- The new BRD 6.2 workflow API is deployed but not yet exercised end-to-end live (needs a joined candidate with all docs approved; Part 10 covers this).
- Repo-conventional `no-explicit-any` lint errors remain in touched files (same pattern as 400+ existing routes; build passes via `ignoreBuildErrors`).

---

## ✅ COMPLETED BY THE FOLLOW-UP SESSION (4 commits — gaps 2–5 all closed)

> Continuation session (sandbox recycled; state recovered from GitHub). Same workflow: one part = one commit = one deploy.

### Gap 2 → Part 5 — Dedicated Initiation screen (BRD 5.3) — `1c20c71`
- `/preboarding/initiation` — sidebar entry, offers-page "Initiate" deep link, dashboard quick action. Level 1: eligible accepted offers / saved drafts / recent invitations. Level 2: Offer Details (read-only) · HR Details (joining date, dept, designation, manager, employment type, CTC, work location, company email, HR contact, **Company + Branch**) · Checklist & Required Documents (per-doc required/optional + extra items) · Communication & Remarks (email + in-app toggles).
- `POST /api/preboarding/brd/initiation`: save-draft / send-invitation / cancel. Server-side accepted-offer gate; invitation creates PreboardingCandidate + docs + portal user + HRMS user in ONE `$transaction`; unique active-initiation-per-offer index → retries are 409, never duplicates. Email sent best-effort, honestly reported.
- §2.1 gate added to `/api/onboarding/convert-to-draft` (offer path strict; application path = accepted offer or `hired`).

### Gap 3 → Part 6 — Dashboard widgets + filters (BRD 5.1) — `7a4edeb`
- Recruiter-wise Handover widget + 6-month Joining Trends (joined vs expected) on `/preboarding`; Company / Branch / Employment-type filters on the dashboard + candidates list; `PreboardingCandidate.companyId/branchId` persisted at initiation.

### Gap 4 → Part 7 — Document hardening (BRD 5.8) — `8305f2b`
- Version history (OnboardingDocumentVersion; re-upload archives prior file; HR views/downloads any version via `/file?version=N`), duplicate detection (SHA-256 content + document number → 409), document number / issue / expiry dates (candidate + HR editing), EXPIRED flagging (HR + candidate), fixed silent portal-message failure in both upload routes. **Malware scan NOT claimed** (no AV integration; fileHash is the hook).

### Gap 5 → Part 8 — Day 7/30/60/90 milestones (BRD Figure 1.2) — `c49c846`
- Milestone templates (self-healing seed) + backfill for in-flight joiners; **onboarding-reminders cron now actually scheduled** via the unified daily-tasks sweep (was never registered); "Onboarding Completed" state (progress API + /onboarding badge).

### Remaining backlog (small, documented in compliance doc §15)
- 5.9 Escalate to HR Admin / Request Additional Info actions; 5.2 Candidate-ID search + Edit row action; per-record document slots (5.6); notification fan-out; malware/AV integration; orientation/training events as first-class entities.

---

## ✅ AFTERNOON E2E ROUND — 4 user-reported issues fixed + full-journey verified (fresh test data)

Commits: `6d1a84d` (candidate docs response dropped Part 7 fields) → `0f6ee99` (rejected-doc re-upload lock exemption; joining gates on all 3 employee-creation paths via `findJoiningBlockers`; portal nav overflow fix; `.no-scrollbar` utility) → `483eb97` (milestone backfill chicken-and-egg; offers API 500-after-write). Deployments: `dpl_3Phot6BK` (6d1a84d) READY, `dpl_FTmZk5a98o` (0f6ee99) READY, `dpl_AZqA7dwFtv` (483eb97) deploying at time of writing.

**E2E results (live, production beta):** 65 checks, 57 pass. Journey completed end-to-end with fresh candidates: application + 4 consents → offer create/approve/accept → initiation → wizard (5 sections) → 5 doc uploads with metadata → declaration submit (negatives verified: 400 DECLARATION_REQUIRED / SIGNATURE_REQUIRED) → HR rejects PAN → **candidate re-uploads while submitted (200, v2)** → **all 3 joining paths blocked with 409 DOCUMENTS_NOT_APPROVED** → HR approves → readiness (positive run with reporting manager: mark-ready 200, stage ready_to_join) → confirm-joined → provisional employee → BGV → **active employee Marq022**. Nav verified visually at 780/900/1400px (agent-browser + VLM, no clipping).

**Test data:** candidate 1 `e2e.fresh.1794554661@hrmscheck.io` / `Welcome@123` (→ Marq022); candidate 2 `e2e.fresh2.1794555176@hrmscheck.io` (OTP); HR `e2e-verify@hrmscheck.io` / `Verify@123`. PAN rejection remark: "Blurry scan — please re-upload a clear copy of your PAN card."

**Still open after this round:** verify `483eb97` live once deployed (offers create/approve should return 200/201; new joiner appears in /onboarding/progress after the milestone sweep) — the E2E scripts re-run these. Feature backlog unchanged (5.9 escalate/request-info, 5.10 assign-task backend, per-record doc slots, malware/AV, email provider).
