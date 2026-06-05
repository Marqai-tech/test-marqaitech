# Task 5: Functional Recruitment, Onboarding & Exit Workflow Modules

## Summary
Updated all three HRMS workflow modules from static/hardcoded data to fully functional components that fetch from API routes, with proper state management, loading/error states, and interactive CRUD operations.

## Changes Made

### 1. Recruitment Module (`src/components/hrms/recruitment.tsx`)
- **Replaced all hardcoded data** with API calls via `useEffect` + `apiGet('/recruitment', { companyId, include: 'all' })`
- **Added TypeScript interfaces** for Requisition, Job, Candidate, Interview, Offer, RecruitmentStats
- **New Requisition dialog** is now functional: collects title, department, priority, openings → POSTs to `/api/recruitment` with `type: 'requisition'`
- **Candidate status updates**: Inline Select dropdown in Actions column → PUTs to `/api/recruitment` with `type: 'candidate'` + `recruiterStatus`
- **Interview scheduling dialog**: Select candidate, job, type, date → POSTs to `/api/recruitment` with `type: 'interview'`
- **Offer creation dialog**: Select candidate, job, salary, start date → POSTs to `/api/recruitment` with `type: 'offer'`
- **Offer Accept/Reject**: Buttons on pending offers → PUTs to `/api/recruitment` with `type: 'offer'` + status
- **Stats from API**: Displays `stats.totalRequisitions`, `stats.openJobs`, `stats.totalCandidates`, `stats.pendingOffers`
- **Loading state**: Spinner with "Loading recruitment data..."
- **Error state**: Error message with Retry button
- **Empty states**: "No requisitions found", "No candidates found", etc.
- **All data refreshes after mutations** via `fetchData()` re-call

### 2. Onboarding Module (`src/components/hrms/onboarding.tsx`)
- **Replaced all hardcoded data** with API calls via `apiGet('/onboarding', { companyId })`
- **Added TypeScript interfaces** for OnboardingRecord, EmployeeInfo, OnboardingStats
- **Checklist toggle is functional**: Each checkbox → PUTs to `/api/onboarding` with `id` + individual field name (e.g., `{ id, documentCollected: true }`)
- **Progress calculation**: Dynamically computed from actual checklist field values in the record (13 boolean fields)
- **"Start Onboarding" button**: Dialog with employee ID input → POSTs to `/api/onboarding` with `{ companyId, employeeId }`
- **Record selector**: Dropdown to switch between employees when viewing checklist
- **Pre-onboarding tab**: Shows all records with progress bars
- **In-progress tab**: Cards with progress bars and "Update Checklist" buttons
- **Completed tab**: Shows completed records with duration calculation
- **Category-based progress**: Documents, Verification, IT Setup, Compliance, Training, HR categories
- **Loading/error/empty states** with toast notifications
- **Employee detail dialog**: Shows pipeline status with checkmarks for completed stages

### 3. Exit Workflow Module (`src/components/hrms/exit-workflow.tsx`)
- **Replaced all hardcoded data** with API calls via `apiGet('/exit-workflow', { companyId })`
- **Added TypeScript interfaces** for ExitRequest, EmployeeInfo, ExitStats
- **"Submit Resignation" dialog is functional**: Employee ID, type, reason, dates → POSTs to `/api/exit-workflow`
- **Clearance checklist is functional**: Each checkbox → PUTs to `/api/exit-workflow` with `id` + field name (knowledgeTransfer, projectHandover, assetCleared, itAccessRevoked, payrollFnf, exitInterviewDone, relievingLetterIssued)
- **Approve/Reject buttons**: 
  - Pending → Approve (status: 'approved') or Reject (status: 'completed')
  - Approved → Start Process (status: 'in_progress')
  - In Progress + 100% clearance → Complete (status: 'completed')
- **Stats from API**: pending, inProgress, completed, total
- **Alumni tab**: Shows completed exit requests with relieving letter status
- **Loading/error/empty states** with toast notifications
- **Removed FNF and Exit Interviews tabs** as those don't have corresponding API routes (data was purely static)

## Technical Details
- All components use `useHRMSStore().currentCompanyId` for company context
- All use `useToast()` from `@/hooks/use-toast` for success/error notifications
- All use `apiGet`, `apiPost`, `apiPut` from `@/lib/api`
- All maintain the existing dark theme (slate-900 bg, emerald accents)
- All maintain existing UI structure, tabs, icons, colors
- Proper loading spinners with Loader2 icon
- Proper error handling with try/catch and user-facing messages
- Data refreshes after every successful mutation
