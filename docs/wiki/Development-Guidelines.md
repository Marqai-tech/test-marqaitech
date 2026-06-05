# Development Guidelines

## Code Style

- **TypeScript**: Strict mode enabled, all files must use TypeScript
- **ESLint**: Run `bun run lint` before committing
- **Formatting**: Consistent 2-space indentation
- **Imports**: Use `@/` path alias for absolute imports

## Component Development

### Module Components
All HR module components follow this pattern:
```tsx
'use client';
import React, { useState, useEffect, useCallback } from 'react';
// Import UI components from @/components/ui
// Import API functions from @/lib/api
// Import store from @/store/app-store

export function ModuleName() {
  const { currentCompany } = useAppStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const fetchData = useCallback(async () => { /* ... */ }, []);
  useEffect(() => { fetchData(); }, [fetchData]);
  
  return (
    <div className="space-y-6">
      {/* Module content */}
    </div>
  );
}
```

### UI Components
- Use shadcn/ui components from `@/components/ui/`
- Never modify shadcn/ui component internals unless necessary
- Follow the established pattern for dialogs, forms, and cards

## API Route Development

### Standard Pattern
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    // Parse query parameters
    // Query database with Prisma
    // Return JSON response
  } catch (error) {
    console.error('Entity GET error:', error);
    // Return demo data fallback
    return NextResponse.json({ data: [...demoData] });
  }
}
```

### Demo Data Requirements
- All API routes MUST have demo data fallbacks in the catch block
- Demo data should use consistent IDs (comp-1, dept-1, branch-1, demo-1, etc.)
- Minimum 5-8 records per entity
- Never use empty strings in id/name/code fields

## Git Workflow

1. Create feature branch: `git checkout -b feature/module-name`
2. Make changes and commit: `git commit -m "feat: description"`
3. Push to GitHub: `git push origin feature/module-name`
4. Merge to main via pull request
5. Vercel auto-deploys from main

## Testing

- Run lint check: `bun run lint`
- Manual testing on local dev server
- Verify on Vercel deployment before release
