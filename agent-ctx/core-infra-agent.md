# Core Infrastructure Files - Task: core-infra

## Summary
Created and updated all core infrastructure files for NEXUS HRMS application.

## Files Created/Updated

### 1. `src/lib/store.ts` - Zustand Store
- Updated from `useAppStore` to `useHRMSStore` matching the spec
- Added `homeView`, `selectModule`, `selectModuleWithSubItem`, `goHome`, `setCurrentCompanyId` 
- Added `getDashboardModule` helper function
- Type `ModuleKey` with all 27 module keys

### 2. `src/lib/api.ts` - API Helpers (unchanged)
- Already had correct `apiGet`, `apiPost`, `apiPut`, `apiDelete` with JSON handling and error catching

### 3. `src/middleware.ts` - NextAuth Middleware
- Updated to use `withAuth` from `next-auth/middleware` (compatible with Next.js 16 build)
- Matcher excludes api, login, _next/static, _next/image, favicon.ico

### 4. `src/app/api/auth/[...nextauth]/route.ts` - NextAuth
- Credentials provider with bcryptjs password comparison
- JWT session strategy
- Role, companyId, name added to JWT token and passed to session.user
- Login: admin@nexushrms.com / admin123 works

### 5. `src/app/api/seed/route.ts` - Comprehensive Seed (unchanged)
- Already had comprehensive seed data matching all spec requirements
- Includes: SubscriptionPlans, Tenant, Companies, Branches, Departments, Designations, Grades, Shifts, LeaveTypes, Employees, Users, Requisitions, Jobs, Candidates, Interviews, Offers, Projects with Tasks/Milestones, Salary Structures/Components, Payroll Run/Transactions, Review Cycles/Reviews, Goals, Courses/Enrollments, Exit Requests, Tickets, Clients, Vendors, SubVendors, Holidays, Notifications, Audit Logs

### 6. `src/app/api/employees/route.ts` - Employee API (unchanged)
- GET: List with companyId, page, limit, search, department, status
- POST: Create employee

### 7. `src/app/api/companies/route.ts` - Company API (unchanged)
- GET: List companies with branches, departments, employee count
- POST: Create company

### 8. `src/app/layout.tsx` - Root Layout
- Inter font, dark theme, Providers wrapper (SessionProvider + ThemeProvider + Toaster)

### 9. `src/components/providers.tsx` - Client Providers
- Wraps SessionProvider, ThemeProvider, Toaster (fixes Server Component build error)

### 10. `src/app/page.tsx` - Main Entry
- Uses `useSession` from next-auth/react
- Shows LoginScreen when not authenticated, HRMSLayout when authenticated
- Loading spinner while checking session

### 11. Placeholder Components (16 new files created)
- projects.tsx, performance.tsx, training.tsx, exit-workflow.tsx
- client-portal.tsx, vendor-portal.tsx, subvendor-portal.tsx, helpdesk.tsx
- ai-chatbot.tsx, workflow-engine.tsx, audit-compliance.tsx, analytics.tsx
- self-service.tsx, profile.tsx, settings.tsx, module-home.tsx

### 12. Updated Existing Components
- `login-screen.tsx`: Changed to named export `export function LoginScreen()`
- `hrms-layout.tsx`: Changed to named export `export function HRMSLayout()`, uses `useHRMSStore`
- `sidebar.tsx`: Updated to use `useHRMSStore`, `selectModule`, `sidebarOpen`/`setSidebarOpen`
- `header.tsx`: Updated to use `useHRMSStore`, `setCurrentCompanyId`, Building2 icon from lucide

## Build Status
✅ Build passes successfully (`npx next build`)
✅ All routes compile without errors
✅ Prisma schema pushed to database
