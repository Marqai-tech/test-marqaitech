# Task: Fix UI issues and clean up module store

## Summary of Changes

### Fix 1: Admin icon alignment on home page
**File**: `/home/z/my-project/nexus-hrms/src/app/(dashboard)/dashboard/page.tsx`
- Added `items-start` to the module tiles grid: `className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 items-start"`
- This ensures the Super Admin tile (first in the filtered `visibleModules` array) appears at the top-left of the grid
- Grid items stretch horizontally to fill columns (default behavior) and align to the top vertically

### Fix 2: Fix intermittent login error (PrismaNeon connection pooling)
**File**: `/home/z/my-project/nexus-hrms/src/lib/prisma.ts`
- Added `adapter` to the global scope type alongside `prisma`
- Cached the `PrismaNeon` adapter instance in `globalForPrisma.adapter` to prevent creating a new connection pool on every serverless request
- In both development AND production, both the adapter and PrismaClient are cached in the global scope
- This fixes the "Internal server error" caused by exhausting connection limits in serverless (Vercel) environments

### Fix 3: Remove duplicate Department/Designation/Grades/CostCenters/BusinessUnits from Company module
**File**: `/home/z/my-project/nexus-hrms/src/store/moduleStore.ts`
- **Company module** sub-menus reduced to only company-specific items:
  - Companies → /company-management
  - Branches → /company-management
  - Policies → /company-management
- Removed: Departments, Designations, Grades/Bands, Cost Centers, Business Units (these were pointing to /masters, creating duplication)
- **Masters module** sub-menus expanded to include the migrated items at the top:
  - Added: Departments, Designations, Grades/Bands, Cost Centers, Business Units (all → /masters)
  - Kept all existing items: Shifts, Holidays, Leave Types, Skills, Employee Types, Training Types, Document Types, Project Types, Ticket Categories, Notification Templates, Sub Vendors
- Updated Company description from "Companies, branches, departments & policies" to "Companies, branches & policies"
- Updated Masters description from "Shifts, holidays, leave types & configuration" to "Departments, designations, shifts, holidays & configuration"

### Fix 4: Update Super Admin module sub-menus
**File**: `/home/z/my-project/nexus-hrms/src/store/moduleStore.ts`
- Updated Super Admin sub-menus from generic labels to descriptive platform-admin labels:
  - Dashboard → Platform Dashboard (/dashboard)
  - Tenants → Tenants (/company-management) (unchanged)
  - Subscriptions → Subscription Plans (/settings)
  - Added: Platform Analytics (/dashboard)
  - Audit Logs → Audit Logs (/notifications) (unchanged)
  - Added: Global Settings (/settings)
- Route kept as `/dashboard` since `/super-admin` page does not exist yet

## Lint Status
Pre-existing lint errors remain (6 errors, 17 warnings) - none introduced by these changes.
