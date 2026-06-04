# Task: Convert Popup Modals to Embedded Inline CRUD Forms

## Summary
Converted all 3 module pages from popup/modal-based CRUD operations to embedded inline forms as specified.

## Changes Made

### 1. Employees Page (`/src/app/(dashboard)/employees/page.tsx`)
- **Removed**: Add/Edit employee popup modal (`showModal` state → `showForm`)
- **Removed**: Delete confirmation popup modal
- **Added**: Embedded form that expands below the header with `id="crud-form"` and `border-l-4 border-l-blue-500` styling
- **Added**: Inline delete confirmation - row expands to show red confirmation with employee name, Confirm/Cancel buttons
- **Added**: `handleOpenAddForm()`, `handleOpenEditForm()`, `handleCancelForm()` functions
- **Added**: Auto-scroll to form on open via `scrollIntoView()`
- **Kept**: All 6 form sections (Personal, Address, Employment, Bank, Salary, Emergency Contact)
- **Kept**: Search, filters, pagination, status badges, avatar initials

### 2. Leave Page (`/src/app/(dashboard)/leave/page.tsx`)
- **Removed**: Apply Leave popup modal (`showModal` → `showForm`)
- **Removed**: Approve/Reject popup modal (`actionModal` → `actionRowId` + `actionType`)
- **Added**: Embedded Apply Leave form below header with `border-l-4 border-l-amber-500` styling
- **Added**: Inline approve/reject - when approve/reject button is clicked, the row expands to show colored panel with comment field and Confirm/Cancel buttons
- **Added**: `handleOpenApplyForm()`, `handleCancelForm()`, `handleOpenAction()`, `handleCancelAction()`
- **Added**: Auto-scroll to form on open
- **Kept**: Tabs (My Leaves, Team Leaves, Leave Balances)
- **Kept**: Leave balance cards with progress bars

### 3. Recruitment Page (`/src/app/(dashboard)/recruitment/page.tsx`)
- **Removed**: Post Job popup modal (`showJobModal` → `showJobForm`)
- **Removed**: Apply popup modal (`showAppModal` → `showAppForm`)
- **Added**: Embedded Post/Edit Job form with `border-l-4 border-l-violet-500` styling
- **Added**: Embedded Application form with `border-l-4 border-l-blue-500` styling
- **Added**: Edit and Delete functionality for job postings (previously only Create existed)
  - Inline delete confirmation on job card
  - Edit button opens embedded form pre-populated with job data
- **Added**: Edit application status inline - both in job card expanded view and applications table
  - Click edit icon → status becomes dropdown with Save/Cancel buttons
- **Added**: `handleOpenAddJobForm()`, `handleOpenEditJobForm()`, `handleCancelJobForm()`, `handleSaveJob()`, `handleDeleteJob()`, `handleOpenApplyForm()`, `handleCancelAppForm()`, `handleOpenAppEdit()`, `handleCancelAppEdit()`, `handleSaveAppStatus()`
- **Kept**: Tabs (Job Postings, Applications)
- **Kept**: Job card expand/collapse for details

### 4. API Route Added: `/src/app/api/recruitment/[id]/route.ts`
- **GET**: Fetch single job posting with full details
- **PUT**: Update job posting (for Edit functionality)
- **PATCH**: Update job posting or application status (dual-purpose)
- **DELETE**: Delete job posting and its applications

### 5. API Route Updated: `/src/app/api/recruitment/route.ts`
- **Added**: `action: 'apply'` handling in POST to create job applications
- **Updated**: GET response includes more application fields (candidateEmail, candidatePhone, source, rating, etc.)

## Design Patterns Applied
- All forms use `nexus-card border-l-4 border-l-{color}` styling
- Forms expand below the header with smooth scroll-into-view
- Delete confirmations are inline row expansions with red background
- Form state uses `showForm` boolean + `editingId` for tracking edit mode
- Delete state uses `deleteConfirmId` for inline confirmation tracking
- No popup/modals/overlays remain in any of the 3 pages
