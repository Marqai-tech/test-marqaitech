# Task 4-a + 4-b: Preboarding Dashboard & Preboarding Candidates List

Agent: preboarding-ui-agent
Date: 2026 (session)
Status: COMPLETE — typecheck clean, ESLint clean (0 errors / 0 warnings on both files)

## Files written (only these two)

1. `src/app/(dashboard)/preboarding/page.tsx` (887 lines, REPLACED existing content)
   - Preboarding Dashboard per BRD 5.1, Figure 2 layout.
   - Header: teal accent bar + "Preboarding Dashboard" + subtitle + static period select (Last 7/30/90 Days, All Time) + Refresh (re-fetches, toast).
   - Metric cards: 2 rows of 5, every card clickable → `router.push('/preboarding/candidates?...')`:
     - Total Preboarding → no filter; Upcoming Joiners → `?stage=initiated`; Joining This Week → no filter; Documents Pending → `?filter=documents_pending`; Verification Pending → `?filter=verification_pending`; Documents Rejected → `?filter=documents_pending`; Joining Readiness Pending → `?readiness=Not Ready`; Joining Confirmed → `?readiness=Ready`; Joining Completed → `?stage=joined`; Did Not Join → `?stage=did_not_join`.
     - Colors: teal/emerald/amber/violet/slate/red only (no indigo/blue).
   - Pipeline stepper: 6 nodes Offer Accepted → Initiated → Details Pending → Verification → Ready to Join → Joined. Counts from `metrics.stageCounts` (initiated/details_pending/verification/ready_to_join/joined); Offer Accepted node shows `metrics.totalPreboarding`. Color-coded circles + connector lines.
   - 6-widget 2-col grid: Upcoming Joiners (next 6 future joiningDate, rows link `/preboarding/candidates/<id>`, View All → `/preboarding/candidates`); Pending Documents (flattened docs status pending/rejected, up to 8, amber/red chips, View All → `/preboarding/documents`); Verification Queue (CSS conic-gradient donut: approved emerald / submitted violet / rejected red / pending amber + legend, View All → `/preboarding/verification`); Joining Readiness (avg readinessPercent + progress bar + Ready/Not Ready counts, View All → `/preboarding/readiness`); Department-wise Joiners (top 5 upcoming-only CSS width bars, View All → `/preboarding/candidates`); Delayed Activities (joiningDate past & stage not joined/did_not_join/cancelled, computed client-side with days-overdue, View All → `/preboarding/joining-formalities`).
   - Quick Actions bar (7 buttons): Initiate Preboarding→/offers, View Candidates→/preboarding/candidates, Verify Documents→/preboarding/verification, Send Reminder→/preboarding/candidates?filter=remind, Update Joining Date→/preboarding/joining-formalities, Mark Joining Confirmed→/preboarding/joining-formalities, View Joining Readiness→/preboarding/readiness.
   - Filters row: Department / Preboarding Status / Verification Status / Joining date range (visual) / Recruiter → Apply pushes to `/preboarding/candidates?department=&stage=&verification=&dateRange=&recruiter=`.
   - Loading: skeleton pulse; Error: alert box with Retry; Empty: CTA card to /offers.

2. `src/app/(dashboard)/preboarding/candidates/page.tsx` (1112 lines, NEW)
   - `default export` wraps `CandidatesContent` (which calls `useSearchParams`) in `<Suspense>` with skeleton fallback.
   - URL params read at mount: `stage, search, department, readiness, filter, verification, dateRange, recruiter` (the extra three make the dashboard Filters row work end-to-end).
   - Header: title + count badge + subtitle + Refresh (spinner while refreshing).
   - Metric mini-cards (5): Total Preboarding (clears filters), Upcoming Joiners (toggles upcomingOnly), Documents Pending (toggles filter=documents_pending), Verification Pending (toggles filter=verification_pending), Joining Confirmed (toggles confirmedOnly) — active card highlighted with teal ring.
   - Toolbar: live search (name/email/preboardingId), Job Title, Department, Joining Date (Any/This week/This month/Overdue), Status (7 stages), Recruiter, Clear, "N Results (M active)".
   - Table: `min-w-[1200px]` in `overflow-x-auto`; columns: checkbox, Preboarding ID, Candidate ID (links `/candidates/<id>`), Candidate Name+email, Job Title, Department, Company, Recruiter, Joining Date, Offer Status, Document Status, Verification Status, Joining Readiness (chip + %), Preboarding Status (stage chip per spec colors), Actions.
   - Actions: fixed-positioned kebab menu (avoids clipping by table overflow container, closes via transparent overlay, flips up near viewport bottom): View Profile, Send Reminder, Update Joining Date (modal: date + mandatory reason), Mark Joining Confirmed (disabled when already joined/confirmed), Return for Correction (modal: mandatory note), Cancel Preboarding (modal: mandatory reason; hidden when stage==='joined').
   - PATCH endpoint `/api/preboarding/brd/candidate/<id>` bodies: `{action:'send-reminder'}`, `{action:'update-joining-date', joiningDate, reason}`, `{action:'confirm-joining'}`, `{action:'return-for-correction', note}`, `{action:'cancel', reason}`, `{action:'assign-hr', hrAssignedTo}`. Toast on success/error + refetch after each action.
   - Bulk: checkbox select (header = visible page), floating bottom bar with count, Send Reminder, Assign HR (modal), Cancel (reason modal), clear.
   - Pagination: client-side 10/page, numbered buttons + prev/next, "Showing X–Y of N".
   - Bottom info bar: "N candidates expected to join in next 7 days • M documents pending submission" + green "Initiate Preboarding" → /offers.
   - Empty state differentiates filtered-empty (Clear Filters) vs no-data (Initiate CTA).

## Verification

- `npx tsc --noEmit -p tsconfig.json | grep preboarding` → no output (clean).
- `npx eslint` on both files → 0 problems.
- Lint-compliance notes (React 19 eslint-plugin-react-hooks rules used in this repo):
  - `react-hooks/set-state-in-effect`: fetch invoked via `queueMicrotask(() => fetchData())` inside `useEffect` — same pattern as `(dashboard)/referrals/page.tsx`.
  - `react-hooks/purity`: no `Date.now()` in render — "now" is captured into `nowMs` state inside `fetchData` and used in date-based useMemo derivations.

## Contract assumptions

- Data source (both pages): `GET /api/preboarding/brd/pipeline` returns `{ candidates: [...], metrics: {...}, total }`. Candidate fields verified against the actual route + `src/lib/preboarding.ts`:
  - `documentStatus`: 'Pending' | 'Completed'; `verificationStatus`: 'Pending' | 'In Review' | 'Verified' | 'Rejected'; `joiningReadiness`: 'Ready' | 'Not Ready'; `stage` ∈ initiated|details_pending|verification|ready_to_join|joined|did_not_join|cancelled; `documents[].status` ∈ pending|submitted|approved|rejected.
  - `candidateId` is the offerId (string, may be null) — linked to `/candidates/<id>`; links may 404 for null/invalid ids but render gracefully.
- Candidates list page filters entirely client-side (endpoint already returns up to 300 rows; its own stage/search/department/readiness query params are unused to keep client filtering canonical).
- `metrics.stageCounts` includes only non-terminal + terminal stages as defined in `STAGE_LABELS`; missing keys default to 0.
- Modal pattern is plain JSX (`fixed inset-0 bg-black/40` overlay + white rounded card) per task spec — no shadcn Dialog.
- Dashboard "Last 30 Days" period select and filters-row date-range select are visual (single data endpoint has no period param); filters row navigates to the candidates page with query params.
