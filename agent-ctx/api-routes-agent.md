# Task: Create API Routes for NEXUS HRMS

## Summary
Created all 27 API route files for the NEXUS HRMS platform as specified.

## Files Created

### Subscriptions & Billing
1. `src/app/api/subscriptions/plans/route.ts` - GET (list plans), POST (create plan, super_admin only)
2. `src/app/api/subscriptions/route.ts` - GET (list by tenant), POST (assign subscription to tenant)

### Tenant Management
3. `src/app/api/tenants/route.ts` - GET (list all, super_admin only), POST (create tenant with admin user)
4. `src/app/api/tenants/[id]/route.ts` - GET (detail), PATCH (approve/suspend/reactivate)

### Client Management
5. `src/app/api/clients/route.ts` - GET (list with company), POST (create)
6. `src/app/api/clients/[id]/route.ts` - GET (detail with projects), PUT (update), DELETE (soft delete)

### Vendor Management
7. `src/app/api/vendors/route.ts` - GET (list with hierarchy), POST (create vendor/sub-vendor)
8. `src/app/api/vendors/[id]/route.ts` - GET (detail), PUT (update), DELETE (soft delete)

### Project Management
9. `src/app/api/projects/route.ts` - GET (list with relations), POST (create)
10. `src/app/api/projects/[id]/route.ts` - GET (detail), PUT (update), PATCH (status)
11. `src/app/api/projects/[id]/tasks/route.ts` - GET (list), POST (create task)
12. `src/app/api/projects/[id]/allocations/route.ts` - GET (list), POST (allocate employee)

### Ticket System
13. `src/app/api/tickets/route.ts` - GET (list), POST (create with auto TK-0001 ID)
14. `src/app/api/tickets/[id]/route.ts` - GET (detail with comments), PATCH (status/assign/resolve), PUT (update)
15. `src/app/api/tickets/[id]/comments/route.ts` - GET (list), POST (add comment)

### Manpower Requisition
16. `src/app/api/requisitions/route.ts` - GET (list), POST (create with auto REQ-0001 ID)
17. `src/app/api/requisitions/[id]/route.ts` - GET (detail), PATCH (approve/reject)

### Offer Management
18. `src/app/api/offers/route.ts` - GET (list), POST (create)
19. `src/app/api/offers/[id]/route.ts` - GET (detail), PATCH (approve/send/accept/reject/withdraw)

### Salary Structures
20. `src/app/api/salary-structures/route.ts` - GET (list with components), POST (create with components)
21. `src/app/api/salary-structures/[id]/route.ts` - GET (detail), PUT (update), PATCH (add/update/remove components)

### FNF Settlement
22. `src/app/api/fnf/route.ts` - GET (list), POST (create with auto total calculation)
23. `src/app/api/fnf/[id]/route.ts` - GET (detail), PATCH (approve/pay)

### Workflow Engine
24. `src/app/api/workflows/route.ts` - GET (list definitions), POST (create definition)
25. `src/app/api/workflows/[id]/route.ts` - GET (detail with steps), PUT (update)
26. `src/app/api/workflows/instances/route.ts` - GET (list instances), POST (start workflow)
27. `src/app/api/workflows/instances/[id]/route.ts` - GET (detail with approvals), PATCH (approve/reject step)

## Patterns Used
- CORS headers via `corsHeaders()` on all responses
- OPTIONS handler for CORS preflight
- JWT verification via `verifyToken` / `getTokenFromHeaders`
- Audit log entries on all write operations
- Notifications on status changes
- Proper HTTP status codes (201 for create, 404 for not found, etc.)
- Pagination support on list endpoints
- Soft delete pattern for clients/vendors
- Auto-generated IDs for tickets (TK-0001) and requisitions (REQ-0001)

## Lint Status
All new files pass ESLint. Pre-existing errors in other files remain.
