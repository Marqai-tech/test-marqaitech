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

## ⏳ REMAINING (not started this session — for the next session)

1. **Gap 2: Dedicated Initiation screen (BRD 5.3)** — screen with Offer Details / HR Details / Checklist / Communication sections, Save-as-Draft, Send Invitation, Cancel Initiation. NOTE: Part 5's EmployeeCreationRequest table + state machine can be reused as the persistence model for initiation drafts; convert-to-draft already creates the preboarding record + seeds documents + welcome message.
2. **Gap 3: Dashboard widgets** — Recruiter-wise Handover + Joining Trends widgets on `/preboarding` dashboard; Company/Branch/Employment-type filters (data for branch/workMode/employmentType already on PreboardingCandidate).
3. **Gap 4: Document hardening** — version history (OnboardingDocument re-upload currently overwrites in place), issue/expiry dates + expired flag, duplicate detection, doc-number fields.
4. **Gap 5: Day 7/30/60/90 onboarding milestones** — task-template offsets currently −3…+14 only; reminders cron exists (`/api/cron/daily-tasks`, daily 09:00) but milestone templates need adding.
5. **Part 10: Full E2E live verification** of the complete journey (fresh candidate → offer → accept → HR initiate → wizard → documents → rework → submit → joining confirm → BGV → activation) + screenshots of the 3 portal states + final delivery report.

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
| `8be2383` (HEAD) | merge + vendor My-Cases fix | dpl_5i3EX9wW… | **READY** |

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
