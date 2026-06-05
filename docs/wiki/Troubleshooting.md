# Troubleshooting

## Common Issues

### Login Not Working
**Problem**: Cannot log in with credentials
**Solution**: 
1. Use admin@nexushrms.com / admin123
2. If the database is down, the auth API will fall back to demo credentials
3. Clear browser cache and try again
4. Check the browser console for network errors

### SelectItem Empty Value Error
**Problem**: "A <Select.Item /> must have a value prop that is not an empty string"
**Solution**: 
1. This was caused by Radix Select controlled/uncontrolled switching
2. All Select components now use `value={field || '_none'}` pattern
3. The SelectItem component has a safety guard that generates random fallback values
4. If still occurring, check the console for [SelectItem] warnings

### Module Shows "Module Error"
**Problem**: A module crashes and shows error boundary
**Solution**: 
1. Click "Retry" button in the error boundary
2. If persists, click "Reload Page"
3. Check browser console for the specific error
4. The ModuleErrorBoundary isolates errors per module

### Demo Data Not Loading
**Problem**: Screens show empty data
**Solution**: 
1. Demo data loads automatically when the database is unavailable
2. Check if the API route is returning data (open /api/employees in browser)
3. The demo data uses consistent IDs: comp-1, dept-1 through dept-7, branch-1 through branch-3

### Vercel Deployment Fails
**Problem**: Build errors on Vercel
**Solution**: 
1. Ensure POSTGRES_URL environment variable is set in Vercel
2. Build command should be: `prisma generate && next build`
3. Check Vercel build logs for specific errors
4. Verify prisma generate runs before next build

## Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Cannot read properties of undefined (reading 'toLocaleString')" | API returned null/undefined data | Demo data fallbacks added to all routes |
| "A <Select.Item /> must have a value prop that is not an empty string" | Radix Select empty value | Use `_none` pattern, SelectItem safety guard |
| "Module Error" | Component crash | Retry/Reload, check console |
| "Network error" | API unreachable | Check network, database connection |

## FAQ

**Q: How do I add a new employee?**
A: Navigate to Employees → Click "Add Employee" → Fill in the form → Select department and branch → Click "Create Employee"

**Q: How do I process payroll?**
A: Navigate to Payroll → Click "Run Payroll" → Select month/year → Review summary → Approve and lock

**Q: How do I create a workflow?**
A: Navigate to Workflow Builder → Click "Create Workflow" → Define trigger → Add approval steps → Configure conditions → Deploy

**Q: Where can I find training materials?**
A: Navigate to Help & Training in the sidebar → Browse by category → Watch training videos, read SOPs, or access technical docs
