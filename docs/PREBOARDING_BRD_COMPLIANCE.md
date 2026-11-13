# Preboarding & Onboarding BRD — Implementation Compliance Matrix

> Audit date: 12 Nov 2026 · Repo: `main` @ this commit · Live: `https://3boxes-hrms-beta.vercel.app` (tenant `test-marqaitech`)
> Source document: `HRMS_Preboarding_Onboarding_Module.docx` (Business Requirement Document, 28 pages)
> Method: three independent code audits (HR screens / candidate portal / data model) + live API + browser verification, then gap fixes in this same commit.

**Verdict:** The end-to-end pipeline (offer accepted → convert → preboarding → candidate wizard → document verification → readiness → joining formalities → provisional employee → BGV → activation with Employee ID) is **implemented and live**, and the HR-side screens match the BRD closely. The audit also found real gaps, the largest of which — the **candidate 9-step portal wizard UI** — was **built in this commit**. The remaining known gaps are listed in §4 and are scoped for a follow-up cycle.

---

## 1. Section 2 — Lifecycle & critical business rule

| BRD requirement | Status | Evidence / notes |
|---|---|---|
| Candidate must NOT auto-become employee on offer acceptance (§2.1) | **PASS (primary flow)** | `convert-to-draft` creates preboarding record + provisional onboarding; employee created only via Employee Creation after joining confirmation (`api/preboarding/brd/employee-creation`), activated only at BGV approve (`api/onboarding/bgv` sets status `active_employee`) |
| DOJ verified before employee creation | **PASS** | Employee Creation POST requires joining confirmed OR actual DOJ (route lines ~167-169) |
| ⚠ Legacy `/api/recruitment/convert` creates an ACTIVE employee without accepted-offer check | **KNOWN GAP** | `src/lib/onboarding-cascade.ts:104-121` — direct-convert path violates §2.1; UI uses the compliant path, but the endpoint must be gated or removed (follow-up) |

## 2. Section 3 — Role-based access

| BRD requirement | Status | Evidence |
|---|---|---|
| Backend/API-level permission enforcement | **PASS** | Every `api/preboarding/brd/*` route gates on `HR_ROLES` (`src/lib/preboarding.ts:13`); candidate portal uses separate `kind:'candidate'` JWT |
| Recruiters/Managers/Interviewers excluded from preboarding data | **PASS** | Not in `HR_ROLES`; profile API 403s |
| Bank & statutory NOT visible to unauthorized roles | **PASS (hardened this commit)** | Server-side masking added: `maskSensitivePortalDetails()` in `api/preboarding/brd/candidate/[id]` — account/PAN/UAN/PF/ESI masked at API level (previously UI-only) |
| Audit trail readable only by authorized roles | **FIXED this commit** | `GET /api/audit` previously had NO role check — now gated to HR/Admin/Finance roles |
| Separate candidate portal identity | **PASS** | `CandidatePortalUser` + candidate-kind JWT |
| HR Executive / Finance / IT granular roles | **PARTIAL** | `hr_executive` role does not exist as a distinct role in the system; Finance gate exists for audit only — noted as follow-up |

## 3. Section 4 — Sidebar structure (9 screens)

| BRD screen | Sidebar entry | Route | Page implemented |
|---|---|---|---|
| 1. Preboarding Dashboard | ✅ (was) | `/preboarding` | ✅ |
| 2. Preboarding Candidates | ✅ **ADDED this commit** | `/preboarding/candidates` | ✅ (existed, unlinked) |
| 3. Candidate Details | via list row → profile | `/preboarding/candidates/[id]` | ✅ (BRD allows tab-style) |
| 4. Document Management | ✅ **ADDED this commit** | `/preboarding/documents` | ✅ |
| 5. Verification & Approvals | ✅ **ADDED this commit** | `/preboarding/verification` | ✅ |
| 6. Joining Readiness | ✅ **ADDED this commit** | `/preboarding/readiness` | ✅ |
| 7. Joining Formalities | ✅ **ADDED this commit** | `/preboarding/joining-formalities` | ✅ |
| 8. Preboarding Activity & History | ✅ **ADDED this commit** | `/preboarding/activity` | ✅ |
| 9. Preboarding Settings | ✅ (was) | `/preboarding/settings` | ✅ |
| (bonus) Employee Creation | ✅ **ADDED this commit** | `/preboarding/employee-creation` | ✅ |
| (bonus) Preboarding Reports | ✅ (was) | `/preboarding/reports` | ✅ |

The stub `/preboarding/tasks` entry was removed from the sidebar.

## 4. Section 5.1 — Preboarding Dashboard

| Item | Status |
|---|---|
| 10 metric cards (Total Preboarding → Did Not Join, exact BRD labels) | **PASS** — all 10, each navigates to filtered candidate list |
| Pipeline stepper (Offer Accepted → … → Joined) | **PASS** |
| Widgets: Upcoming Joiners, Pending Documents, Verification Queue, Joining Readiness, Department-wise Joiners, Delayed Activities | **PASS** (6) |
| Widgets: Recruiter-wise Handover, Joining Trends | **PASS — Part 6** — Recruiter-wise Handover table (Total/Active/Joined/Docs-pending per recruiter) + 6-month Joining Trends chart (joined vs expected) on the dashboard |
| Filters: Department, Preboarding Status, Verification Status, Joining Date, Recruiter | **PASS** (5) |
| Filters: Company, Branch, Employment Type | **PASS — Part 6** — dashboard filter row + candidates list client-side filters (`?company=&branch=&employmentType=`); `PreboardingCandidate.companyId/branchId` columns populated at BRD 5.3 initiation |
| Quick actions (all 7) | **PASS** |

## 5. Section 5.2 — Candidates List

| Item | Status |
|---|---|
| All 14 columns incl. `PRE-YYYY-NNNN` IDs | **PASS** |
| Search by Name / Preboarding ID / Job Title + filters (Job Title, Department, Joining Date, Status, Recruiter) | **PASS** |
| Search by Candidate ID | **MISSING** (follow-up) |
| Actions: View, Send Reminder, Update Joining Date (reason enforced), Mark Joining Confirmed, Return for Correction, Cancel Preboarding (reason enforced) | **PASS** |
| Action: Edit | **MISSING** (follow-up) |
| Server-side rules: unique preboarding ID, duplicate prevention, reason-mandatory actions, joining-date-change notification | **PASS** (dup prevention scoped to candidate+email; per-offer dedup is follow-up) |

## 6. Section 5.3 — Initiation

| Item | Status |
|---|---|
| Initiation via Convert dialog on accepted offers (`/offers` → Convert → `/api/onboarding/convert-to-draft`) | **PASS** |
| Fields: Joining Date, Department, Designation, Employment Type, CTC, Work Location, Company Email, Reporting Manager | **PASS** |
| Dedicated initiation screen with Offer Details / HR Details / Checklist / Communication toggle / Remarks | **PASS — Part 5** — `/preboarding/initiation` (sidebar entry + offers-page "Initiate" deep link + dashboard quick action) |
| Actions: Save as Draft, Send Candidate Invitation, Cancel Initiation | **PASS — Part 5** — `POST /api/preboarding/brd/initiation` (save-draft / send-invitation / cancel); one active initiation per offer enforced by partial unique index; invitation creates PreboardingCandidate + docs inside ONE `$transaction` |
| Server-side accepted-offer verification on the endpoint | **PASS — Part 5** — both `/api/preboarding/brd/initiation` (strict: offer must be `accepted`) and `/api/onboarding/convert-to-draft` (offer path strict; application path accepts an accepted offer or `hired` application) |

## 7. Section 5.4 — Candidate Portal (New Joiner View) — **BUILT THIS COMMIT**

The previous status doc incorrectly claimed `/candidate-portal/preboarding` existed — the directory was empty and the backend wizard APIs (PUT save-per-section, POST submit) had **no UI consumer**. This commit ships the full wizard.

| BRD item | Status |
|---|---|
| Separate mobile-responsive candidate portal (not full HRMS) | **PASS** |
| Header: company logo, company name (from Company table), candidate name, Help/Contact HR (live HR admin lookup), Logout | **PASS** |
| Dashboard strip: joining date, job title, completion %, remaining tasks count, document verification status, HR contact | **PASS** |
| 9-step stepper: Welcome → Personal → Address → Family & Emergency → Education & Experience → Bank & Statutory → Document Upload → Review & Declaration → Submit to HR | **PASS** |
| Per-step status: Not Started / In Progress / Submitted / Approved / Rejected (Correction Required) | **PASS** (chip per step; derived from savedAt / portalSubmittedAt / declaration / document statuses) |
| Save progress & resume later | **PASS** (PUT per section, server-side `portalDetails`) |
| Read-only after submit; reopened when HR returns for correction (correctionNote banner) | **PASS** (server-enforced 409 + UI lock) |
| Declaration signature (typed full name) + submit | **PASS** (POST submit with declaration validation) |

### 7.1 Wizard form coverage (BRD 5.5–5.7)

| BRD section | Fields implemented | Validations |
|---|---|---|
| 5.5 Personal | First/Middle/Last, DOB, Gender, Email, Mobile, Alt Mobile, Nationality, Marital Status | name-not-numeric, email format, phone country code, DOB eligibility (14+) — client + server required-fields |
| 5.5 Address | Permanent (L1/L2/Country/State/City/PIN) + Current with **Same as Permanent auto-populate** | PIN format, required checks |
| 5.5 Emergency/Family | Name, Relation, Mobile, Alt Number, Address + Father/Mother/Spouse | required checks |
| 5.6 Education | Multi-record: Qualification, Specialization, Institution, University/Board, Start/End Year, %/CGPA + fresher flag | end ≥ start year |
| 5.6 Previous Employment | Multi-record: Company, Designation, Type, DOJ, LWD, Total Exp, Reason | LWD ≥ DOJ |
| 5.6 Current Employment | Currently Employed, Company, Designation, Notice Period, LWD, Buyout | — |
| 5.7 Bank | Holder, Bank, Account, **Confirm (match check)**, IFSC (regex), Branch, Type | PAN/IFSC/UAN formats client-side |
| 5.7 Statutory | PAN, UAN, PF, ESI (Aadhaar only as document, NOT universal mandatory — per BRD) | server-side masking on HR view |
| Profile photo upload; education certificate per-record upload; prev-employment doc uploads | **MISSING** (docs upload via Document Upload step; per-record file slots are follow-up) |

## 8. Section 5.8 — Document Management

| Item | Status |
|---|---|
| Candidate upload/re-upload per assigned document with status chips | **PASS** (wizard step 7 + `/candidate-portal/onboarding`) |
| HR screens: `/preboarding/documents` + `/preboarding/verification` (preview, approve, reject with mandatory remarks, request resubmission) | **PASS** |
| Approved documents locked | **PASS + hardened** — HR re-review 409 (existing) + **candidate upload now 409 server-side on approved docs (FIXED this commit)** |
| File type whitelist PDF/JPG/JPEG/PNG | **FIXED this commit** — server-side MIME whitelist on both upload routes (was client-only and allowed .doc/.docx) |
| 10MB limit | **PASS** (client + server) |
| Version history for resubmitted documents | **PASS — Part 7** — re-upload archives the current file into `OnboardingDocumentVersion` (v1, v2, …); HR sees the version badge + history list with View/Download per archived version (`/file?version=N`); nothing is silently overwritten |
| Document ID/Number, Issue/Expiry dates, expired-doc flagging, duplicate detection, malware scan | **PARTIAL — Part 7**: Document number + issue/expiry dates collected at upload (candidate) and editable by HR (`update_metadata`); EXPIRED flag shown to HR and candidate; duplicate detection server-side (same SHA-256 file content or same document number on another of the candidate's documents → 409). **Malware/AV scan NOT implemented** — no AV integration configured (fileHash computed as a hook point); noted as remaining config |
| Notify candidate on correction/rejection | **PASS** (CandidateMessage + best-effort email) |

## 9. Section 5.9 — Verification & Approval

| Item | Status |
|---|---|
| 5 tabs (exact BRD labels) | **PASS** |
| Approve / Reject (remarks mandatory, server-enforced) / Request Resubmission | **PASS** |
| Return for Correction (reopens wizard) | **ADDED this commit** (verification screen + server action existed) |
| Request Additional Information, Escalate to HR Admin | **MISSING** (follow-up) |
| Approval recorded with user ID + timestamp | **PASS** (audit log rows) |
| No Ready-to-Join with incomplete mandatory verification | **PASS** (readiness gate 409) |

## 10. Section 5.10 — Joining Readiness

| Item | Status |
|---|---|
| All 15 checklist items (exact BRD names) | **PASS** |
| Readiness metric (completed/total, %, pending items) | **PASS** |
| Mark Ready to Join with mandatory-pending gate (server 409 listing items) | **PASS** |
| Update Joining Date, Send Reminder, View Checklist | **PASS** |
| Assign Task / Request Approval | **UI-only** (visual modal / toast — no backend; follow-up) |

## 11. Section 5.11 — Joining Confirmation & Formalities

| Item | Status |
|---|---|
| Confirm Joined (actual DOJ + reporting time/location + remarks, server-validated) | **PASS — FIXED this commit**: UI was sending `action:'confirm'`/`'dnj'` while the API expects `'confirm-joined'`/`'did-not-join'` — the mapping bug meant Confirm Joined / Did Not Join from this screen always failed. Fixed with an explicit API_ACTION map. |
| Did Not Join (reason mandatory, blocks if employee exists, closes as no-show, no employee record) | **PASS** |
| Postpone (revised date + reason, candidate notified) | **PASS** |
| Cancel Joining (reason mandatory) | **PASS** |
| Send Joining Confirmation | **ADDED this commit** (`send-confirmation` action: candidate message + email + audit + UI button) |
| Reporting Time / Location / HR Remarks fields | **PASS** |
| Work Location / Employment Type / Manager / Department display | **MISSING** (in API payload, not displayed — follow-up) |
| No-show HR-Admin review step + offer status update + recruitment notification | **PARTIAL** (audit-note only — follow-up) |

## 12. Section 6 — Employee Creation (the bridge)

| Item | Status |
|---|---|
| Screen `/preboarding/employee-creation` with Sections A (candidate auto-fill), B (employment), C (payroll: CTC/currency/bank/PAN masked), E (documents) | **PASS** (A/C/E strong; B partial) |
| Section B: Company/Branch/Grade/Shift/Probation Period+End | **MISSING** (employeeStatus=probation hardcoded, confirmationDueDate null — follow-up) |
| Section C: Salary structure/HRA breakup/Pay Frequency/UAN/Effective Date | **MISSING** (follow-up) |
| Section D: Access & Permissions profile | **MISSING** (company email + login activation text only — follow-up) |
| Validate Details | **PASS** (POST validate enforces BRD 6.3 hard rules) |
| Approve and Create Employee | **PASS** |
| Save Draft | **UI-only** (localStorage) |
| Submit for HR Approval → Draft→Under Review→Pending Payroll→Authorized→Created lifecycle | **MISSING** — no approval state machine (follow-up; payroll approval configurable per BRD) |
| Employee ID format | **DIVERGENT by design**: provisional `PROV-*` at creation, formal `MarqNNN` at BGV approve (matches production welcome-email flow, not BRD's `EMP-2025-0001` example — accepted; documented) |
| Transactional creation (BRD 6.3 #12) | **MISSING** — sequential raw SQL, partial-record risk (follow-up) |
| Employee links Candidate/Application/Offer/Preboarding IDs (BRD 6.3 #11) | **MISSING** — only PreboardingCandidate.employeeId back-link exists (follow-up) |
| Duplicate employee prevention, dept/designation validity | **PASS** (server-enforced) |

## 13. Onboarding phase (Figure 1.2)

| Item | Status |
|---|---|
| Onboarding tasks/checklist with templates, progress API | **PASS** |
| Attendance + leave visible to provisional/active employee in portal | **PASS** |
| Declaration signed at submit; policy acknowledgement module exists | **PASS** |
| Day 7/30/60/90 follow-ups + escalation | **MISSING** (template offsets −3…+14 only; reminders cron exists but not scheduled — follow-up) |
| Orientation/training events | **PARTIAL** (task category only) |

## 14. Notifications

| Trigger | Status |
|---|---|
| Document correction/rejection → candidate | **PASS** |
| Joining date change → candidate | **PASS** (stakeholder fan-out is follow-up) |
| Ready-to-join, joining confirmed → candidate | **PASS** |
| Joining confirmation sent | **ADDED this commit** |
| Employee created / BGV approved welcome email with Employee ID | **PASS** |
| Preboarding initiation → HR exec | **PARTIAL** (audit-only on one path) |
| `onboarding.*` event catalog | **NOT DISPATCHED** (dead catalog — follow-up) |

---

## 15. Remaining gap backlog (priority order)

1. ~~**Employee-creation approval workflow** (BRD 6.2 state machine + optional payroll step) + `$transaction` atomicity + Employee↔Candidate link columns (BRD 6.3 #11/#12)~~ **DONE** — `EmployeeCreationRequest` state machine + atomic authorize (commit d9b3253)
2. ~~**Initiation screen** (BRD 5.3) with Offer/HR/Checklist/Communication sections, Save-as-Draft, Send Invitation, server-side accepted-offer gate~~ **DONE** — `/preboarding/initiation` + `POST /api/preboarding/brd/initiation` (this commit)
3. ~~**Dashboard gaps** (Recruiter-wise Handover + Joining Trends widgets; Company/Branch/Employment-type filters)~~ **DONE** — widgets + filters shipped (Part 6)
4. ~~**Document module hardening**: version history, issue/expiry + expired flag, duplicate detection, doc-number/category fields~~ **DONE** (Part 7) — malware/AV scan remains unconfigured (no integration)
5. **Escalate to HR Admin / Request Additional Info** actions (5.9)
6. **Day 7/30/60/90 milestones** + schedule the onboarding-reminders cron + "Onboarding Completed" state
7. ~~Legacy `/api/recruitment/convert` gate (§2.1 violation) or removal~~ **DONE** (commit a0c1172); `/api/onboarding/convert-to-draft` gated too (this commit)
8. Candidate ID search + Edit row action (5.2), per-record document slots (5.6), notification fan-out to stakeholders

## 16. Security fixes shipped in this commit

- `GET /api/audit` — role gate added (was readable by ANY authenticated user)
- Candidate upload routes (`upload`, `upload-v2`) — approved-document lock (409) + PDF/JPG/PNG MIME whitelist, server-side
- `GET /api/preboarding/brd/candidate/[id]` — server-side masking of bank account / confirm / PAN / UAN / PF / ESI (was UI-only, bypassable via API)
