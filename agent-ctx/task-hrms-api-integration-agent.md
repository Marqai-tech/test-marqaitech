# Task: Update HRMS React components to connect to real API

## Summary

Updated two HRMS components to replace hardcoded mock data with real API integration using `@tanstack/react-query`, while preserving the existing visual design and adding loading states, error handling, and toast notifications.

## Changes Made

### 1. `src/components/hrms/ai-interview.tsx`

**Imports Added:**
- `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`
- `getInterviews`, `createInterview`, `getCandidates` from `@/lib/api`
- `useAppStore` from `@/store/app-store`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `DialogDescription` from `@/components/ui/dialog`
- `Input`, `Label` from `@/components/ui/`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
- `Skeleton` from `@/components/ui/skeleton`
- `useToast` from `@/hooks/use-toast`
- `Loader2` from lucide-react

**Features Added:**
- Fetches interviews from API using `useQuery` with `getInterviews({})`
- Fetches candidates from API using `useQuery` with `getCandidates({ limit: 50 })`
- Replaced `CANDIDATE_SCORES` with real candidate data using `aiScore`, `skillMatch`, `cultureFitScore` fields
- Replaced `EVALUATION_RADAR_DATA` with data derived from selected candidate's AI scores
- Added "Schedule Interview" dialog that creates interviews via `createInterview()` mutation
- Added `INTERVIEW_TYPES` and `TRANSCRIPT_EXCERPT` with TODO comments (kept static)
- Added loading skeletons for candidate list and radar chart
- Added error handling with fallback messages
- Added "Recent Interviews" section showing API-fetched interviews
- Overall score computed as average of available AI scores

### 2. `src/components/hrms/settings.tsx`

**Imports Added:**
- `useMutation`, `useQueryClient` from `@tanstack/react-query`
- `updateEmployee` from `@/lib/api`
- `useToast` from `@/hooks/use-toast`
- `Skeleton` from `@/components/ui/skeleton`
- `Loader2` from lucide-react

**Features Added:**
- Profile form state initialized from Zustand store via lazy `useState` initializer
- "Save Changes" button calls `updateEmployee()` mutation with form data
- Success/error toast notifications on save
- Loading spinner on save button during mutation
- Error message display on failed mutation
- Notifications tab: kept as local state with TODO comment
- Theme tab: kept as-is (dark mode toggle via Zustand store)
- API Keys tab: kept as static display with TODO comment
- Integrations tab: kept as static display with TODO comment
- Removed `useEffect` for form initialization (used lazy initializer instead to avoid lint error)

## Lint Status
Both files pass `bun run lint` cleanly with zero errors or warnings.
