# Demo Data Consistency Update - Work Record

## Task ID: demo-data-consistency-001
## Agent: Demo Data Consistency Agent
## Date: 2025-03-05

## Summary
Updated demo data across all 26 API route files to be comprehensive, consistent, and realistic. All demo data now uses the same company, department, branch, and employee IDs across all routes.

## Reference Data Used Consistently
- Company: { id: 'comp-1', name: 'Nexus Technologies', code: 'NEXUS' }
- Departments: dept-1 through dept-7 (Engineering, HR, Design, Finance, Marketing, Sales, Operations)
- Branches: branch-1 (Hyderabad HQ), branch-2 (Bangalore Office), branch-3 (Mumbai Office)
- Employees: demo-1 through demo-10 (Rajesh Kumar, Priya Sharma, Amit Patel, Sneha Reddy, Vikram Singh, Ananya Gupta, Kiran Nair, Deepa Iyer, Arjun Menon, Meera Joshi)

## Files Modified (26 total)

### Core Entity Routes
1. **employees/route.ts** - Added demo-9 (Arjun Menon) and demo-10 (Meera Joshi), updated emails to @nexustech.com, added reportingManager field
2. **departments/route.ts** - Already consistent, no changes needed
3. **branches/route.ts** - Fixed "Mumbai Branch" to "Mumbai Office", removed branch-4 (Delhi NCR)
4. **companies/route.ts** - Updated employee count to 10, branches to 3
5. **dashboard/route.ts** - Replaced generic d1-d6 IDs with dept-1-dept-7, updated stats to match 10 employees, added realistic activities/notifications with consistent names

### HR Routes
6. **payroll/route.ts** - Expanded from 5 to 10 records (all employees), INR amounts
7. **leaves/route.ts** - Expanded from 4 to 7 records, added approvers with consistent names
8. **attendance/route.ts** - Expanded from 4 to 10 records (all employees), added check-out times
9. **shifts/route.ts** - Replaced demo-co with comp-1, demo-emp1/2 with demo-1/2 etc, updated company name, added General Shift, added members to all shifts
10. **onboarding/route.ts** - Replaced demo-emp1/2/3 with demo-5/8 (probationary/new employees), expanded from 5 to 7 records

### Recruitment Routes
11. **candidates/route.ts** - Replaced demo-c1/2/3/4 with cand-1-7, updated job references from demo-job-1/2/3 to job-1/2/3/4/5/6, Indian phone numbers, INR salaries
12. **interviews/route.ts** - Updated candidate/job references, expanded from 4 to 6 records, nexustech.com meeting links
13. **jobs/route.ts** - Replaced demo-co with comp-1, updated salary to INR (lakhs), Indian locations, expanded from 4 to 6 records

### Finance Routes
14. **expenses/route.ts** - Replaced demo-emp1/2/3/4 with demo-1/4/5/6/8, INR amounts, expanded from 4 to 6 records
15. **assets/route.ts** - Expanded from 4 to 8 records (all employees with assets), added monitor and more devices
16. **vendors/route.ts** - Replaced demo-co with comp-1, Indian phone numbers, .in domains, expanded from 4 to 6 records
17. **clients/route.ts** - Replaced demo-co with comp-1, Indian phone numbers, .in domains, expanded from 4 to 6 records

### Operations Routes
18. **travel/route.ts** - Replaced demo-emp1/2/3/4 with demo-1/2/4/6/8, INR amounts, Indian/international destinations, expanded from 4 to 5 records
19. **tickets/route.ts** - Replaced demo-emp1/2/3/4 and demo-emp-it1 etc with demo-1/2/3/4/5/6/7/8/9/10, expanded from 5 to 7 records
20. **compliance/route.ts** - Replaced demo-co with comp-1, expanded from 5 to 7 records with Indian-specific items (POSH training)
21. **workflows/route.ts** - Replaced demo-co with comp-1, demo-emp1/2/3/4 with demo-6/8/9/10, updated all IDs consistently

### Engagement Routes
22. **learning/route.ts** - Replaced demo-emp1/2/3/4 with demo-1/2/3/4/5/6/9, expanded from 5 to 8 records
23. **goals/route.ts** - Replaced demo-emp1/2/3/4 with demo-1/2/6/8/9/10, expanded from 5 to 7 records
24. **surveys/route.ts** - Replaced demo-co with comp-1, expanded from 3 to 4 surveys, updated response counts to match 10 employees
25. **notifications/route.ts** - Expanded from 5 to 8 notifications, updated actionUrl paths to match new IDs, INR amounts
26. **audit/route.ts** - Expanded from 5 to 7 log entries, consistent names and emails with @nexustech.com domain

## Key Changes
- All `demo-co` / `demo-company` references → `comp-1` / `Nexus Technologies`
- All `demo-emp1`/`demo-emp2` etc. → `demo-1`/`demo-2` through `demo-10`
- All US-centric data (US phone numbers, $ amounts, US cities) → India-centric (INR, Indian phone numbers, Indian cities)
- Added employees demo-9 (Arjun Menon, Operations Manager) and demo-10 (Meera Joshi, Senior Accountant)
- All emails updated from @nexushrms.com / @example.com to @nexustech.com
- Minimum 5-8 records per entity (most have 6-10)
- Fixed branch-3 name from "Mumbai Branch" to "Mumbai Office"
- Removed branch-4 (Delhi NCR) not in reference data
