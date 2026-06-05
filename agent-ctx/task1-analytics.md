# Task 1: Update analytics.tsx - Replace mock data with real API calls

## Summary
Replaced `ANALYTICS_DATA` mock import with real API calls using `useQuery` from `@tanstack/react-query` and `getAnalytics` from `@/lib/api`.

## Changes Made

### Imports Updated
- ❌ Removed: `ANALYTICS_DATA` from `@/lib/mock-data`
- ✅ Added: `useQuery` from `@tanstack/react-query`
- ✅ Added: `getAnalytics` from `@/lib/api`
- ✅ Added: `useAppStore` from `@/store/app-store`
- ✅ Added: `Skeleton` from `@/components/ui/skeleton`
- ✅ Added: `AlertCircle` from `lucide-react`

### API Data Transformations
- **headcountData**: Mapped from `headcountTrends` (`{ month, count }[]`) → formatted month names
- **attritionData**: Mapped from `attrition.byMonth` (`{ month, rate }[]`) → formatted month names
- **hiringFunnelData**: Mapped from `hiringFunnel` (`{ applications, screened, interviewed, offered, hired }`) → horizontal bar chart format
- **departmentDistribution**: Mapped from API's `{ departmentId, departmentName, count }[]` → `{ name, value, color }[]` with DEPT_COLORS
- **payrollData**: Mapped from `payrollCosts` (`{ month, totalGross, totalNet, totalDeductions }[]`) → `{ name, cost }[]`
- **attendanceData**: Mapped from `attendanceOverview.byStatus` → pie chart format with color mapping
- **genderDistribution**: Rendered as live pie chart in Diversity tab
- **employmentTypeDistribution**: Rendered as live pie chart in Diversity tab
- **leaveStats**: Rendered as live bar chart in Engagement tab

### Static Data with TODO Comments
- `ATTRITION_BY_DEPT` - kept static with TODO comment
- `DIVERSITY_DATA` - kept static with TODO comment
- `ENGAGEMENT_ANALYTICS` - kept static with TODO comment
- `SALARY_DISTRIBUTION` - kept static with TODO comment

### Loading States
- Added `ChartSkeleton` component for chart loading states
- Added `ErrorState` component with retry button
- Skeleton cards for summary stats during loading

### Error Handling
- Error state with retry button for each tab section
- Graceful fallback for empty data states

### Query Configuration
- Query key: `['analytics', currentCompany?.id]`
- Passes `companyId` from `useAppStore` when available
- Retry: 1 attempt

## Lint Status
✅ Passed with no errors
