# Task 4-c — Preboarding BRD: Candidate Details + Document Management + Verification & Approvals

## Scope
Three NEW HR-side 'use client' pages (dashboard route group; sidebar/layout untouched). No other files modified. No build/prisma/dev-server commands run.

## Files Written
1. `src/app/(dashboard)/preboarding/candidates/[id]/page.tsx` (~1600 lines)
   - Header card: initials avatar, name, preboardingId chip, email/phone, stage badge (initiated slate / details_pending amber / verification violet / ready_to_join teal / joined emerald / did_not_join red / cancelled slate), jobTitle-department-designation line, joining date, SVG readiness ring (teal, stroke-dasharray).
   - Actions top-right (contract 2 PATCH): Send Reminder, Update Joining Date (date + mandatory reason, BRD 5.2 D.7), Confirm Joining (disabled once joiningConfirmed), Return for Correction (red outline, mandatory note), Cancel Preboarding (danger, hidden when stage==='joined', mandatory reason per BRD 5.2 C) — all via single `ActionModal` union + fixed-overlay ConfirmModal, toast + refetch.
   - Tabs (client state, default details): Details | Documents | Verification | Readiness | Activity | Messages.
   - Details tab: Employment & Offer card + portalDetails sections (Personal, Address with "Same as permanent" chip, Family & Emergency, Education/Previous Employment tables, Current Employment, Bank & Statutory with BRD 5.7 masking: accountNumber → last 4 only, PAN → first 3 + dots + last char). Missing sections → "not submitted yet" muted state.
   - Documents tab (contract 4 PATCH /documents): label/type/uploaded/file/status chips (pending amber, submitted violet, approved emerald, rejected red, resubmission_requested orange) + reviewNotes; row actions View (fileUrl new tab), Approve (confirm, empty remarks), Reject (mandatory remarks), Request Resubmission (mandatory remarks); approved rows render "Approved — locked".
   - Verification tab: same table filtered to pending/submitted/resubmission_requested.
   - Readiness tab: GET /readiness?candidateId → canMarkReady/mandatoryPending; big percent + progress bar; "Mark Ready to Join" disabled-with-title-tooltip listing mandatoryPending, click attempts PATCH and surfaces server 409 error text; manual items (source==='manual') toggle Mark Complete / Mark Pending (PATCH {candidateId, requirement, status}).
   - Activity tab (lazy): GET /activity?candidateEmail → timeline (action chip + module + relative time + user).
   - Messages tab: senderRole chips + message + date. Loading skeleton, error retry, 404 state.

2. `src/app/(dashboard)/preboarding/documents/page.tsx` (BRD 5.8)
   - Header + Refresh; clickable summary count chips (All/Pending/Submitted/Approved/Rejected/Awaiting Resubmission) driven by response `counts` (verified `counts.all` exists in route).
   - Filters: search name/email/preboardingId (client-side), Status select (drives `tab` query), Document Type select (distinct documentLabel).
   - Table (min-w-[900px], overflow-x-auto): Candidate (name + preboardingId), Document (label + type), Uploaded (date + file name/size), Preview eye-button → fileUrl new tab or dash, status chip + reviewedBy/reviewedAt subline, truncated HR remarks (title attr), Actions Approve/Reject/Resubmission (+ View Profile link → /preboarding/candidates/<preboardingCandidateId>); approved rows locked. Empty/loading/error states.

3. `src/app/(dashboard)/preboarding/verification/page.tsx` (BRD 5.9)
   - Tabs EXACTLY: Pending Verification (→ tab=submitted) | Approved | Rejected | Awaiting Resubmission (→ awaiting_resubmission) | All Records.
   - Pending tab additionally fetches /api/preboarding/brd/pipeline and renders "Details pending verification: N candidates" info cards (filter: stage==='verification' && portalSubmittedAt && verificationStatus!=='Verified') with View links.
   - Verification table (candidate, document, preview, status chip + reviewedBy/reviewedAt, remarks, Approve/Reject/Resubmission modals, Profile link).
   - Approval-rules footer card (3 BRD bullets) + 3 category info cards (Personal→HR Executive verify & approve; Bank & payroll→Payroll/Finance verify; Employment & joining→HR Admin review & approve).

## Verification
- `npx tsc --noEmit -p tsconfig.json` → **zero errors** for all three files (one later full-repo run OOM'd after the reporting phase on the huge monorepo; re-ran with `NODE_OPTIONS=--max-old-space-size=8192` → completed, no matches for my paths = clean).
- `npx eslint` on the 3 files → **0 problems** after adopting the repo's established `queueMicrotask(...)` effect pattern (same as concurrent preboarding pages) to satisfy `react-hooks/set-state-in-effect`.
- Confirmed against live API routes: documents `tab` mapping (`awaiting_resubmission` = resubmission_requested|rejected), PATCH remarks enforcement, readiness GET `canMarkReady`/`mandatoryPending`, activity `candidateEmail` filter, pipeline candidate fields.

## Assumptions
- Status value for resubmission is `resubmission_requested` (API) while the tab/count key is `awaiting_resubmission`.
- `reviewedBy` rendered optionally (not guaranteed in contract 3 payload) with fallback to reviewedAt.
- Verification tab in FILE 1 excludes `rejected` docs (focused queue per spec); rejected docs remain visible in Documents tab and FILE 3 Rejected tab.
- In FILE 3, awaiting_resubmission view may include rejected docs per server filter — those rows still expose all three actions (server 409 guards re-approval of approved only).
- Approve sends `remarks: ''` (server accepts empty for approve; rejects/re-submits validated client-side AND server-side).
- Local `getAuthHeaders()` duplicated per file (per task instruction; no shared module created).
