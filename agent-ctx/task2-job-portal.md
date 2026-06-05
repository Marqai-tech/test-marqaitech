# Task 2: Update job-portal.tsx - Replace mock data with real API calls

## Summary
Replaced `MOCK_JOBS` mock import with real API calls using `useQuery` and `useMutation` from `@tanstack/react-query`, `getJobs` and `createCandidate` from `@/lib/api`.

## Changes Made

### Imports Updated
- ❌ Removed: `MOCK_JOBS` from `@/lib/mock-data`
- ✅ Added: `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`
- ✅ Added: `getJobs`, `createCandidate` from `@/lib/api`
- ✅ Added: `useAppStore` from `@/store/app-store`
- ✅ Added: `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `DialogTrigger` from `@/components/ui/dialog`
- ✅ Added: `Label` from `@/components/ui/label`
- ✅ Added: `Textarea` from `@/components/ui/textarea`
- ✅ Added: `Skeleton` from `@/components/ui/skeleton`
- ✅ Added: `useToast` from `@/hooks/use-toast`
- ✅ Added: `AlertCircle`, `Users`, `Calendar`, `Loader2` from `lucide-react`

### API Integration
- **Fetching jobs**: `useQuery` with key `['jobs', 'open', currentCompany?.id]` → calls `getJobs({ status: 'open', companyId: ... })`
- **Creating candidates**: `useMutation` with `createCandidate()` for both "Apply Now" dialog and "One-Click Apply"

### Data Handling
- `JobData` interface defined for type safety matching API response shape
- Jobs extracted from response using `useMemo` with handling for both `PaginatedResponse` and actual API response shapes
- **Unique locations** extracted dynamically from real job data via `useMemo`
- **Filtered jobs** computed via `useMemo` based on search query and location filter

### Apply Now Dialog
- Full application form with fields: firstName, lastName, email, phone, currentCompany, currentTitle, experience, expectedSalary, notes
- Form validation (required: firstName, lastName, email)
- Success/error toast notifications via `useToast`
- Loading state with `Loader2` spinner during submission
- Form reset on close/success

### One-Click Apply
- Uses logged-in user data from `useAppStore` for quick application
- Shows toast if user not logged in
- Uses `createCandidate` mutation with `source: 'portal'` and `status: 'applied'`
- Invalidates jobs query on success to refresh candidate counts

### Static Data with TODO Comments
- `FEATURED_JOBS` - kept static with TODO comment
- `AI_RECOMMENDATIONS` - kept static with TODO comment

### Loading States
- `JobCardSkeleton` component for job listing cards
- 4 skeleton cards shown during loading
- `Loader2` spinner on submit buttons during mutation

### Error Handling
- Error card with "Try Again" button for failed job fetches
- Empty state with clear filters button when search yields no results
- Toast notifications for application success/failure

### UI Enhancements
- Priority badges (urgent/high/medium/low) with color coding
- Status badges with dark mode support
- Applicant count and posted date display from API data
- Position fill status (filled/total) for multi-position jobs

## Lint Status
✅ Passed with no errors
