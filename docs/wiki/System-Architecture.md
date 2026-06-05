# System Architecture

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16 |
| UI Library | React | 19 |
| Language | TypeScript | 5 |
| Styling | Tailwind CSS | 4 |
| Component Library | shadcn/ui (Radix UI) | Latest |
| State Management | Zustand | 5 |
| ORM | Prisma | 6 |
| Database | PostgreSQL (Neon) | Serverless |
| Deployment | Vercel | - |
| Package Manager | Bun | Latest |

## Architecture Overview

NEXUS HRMS follows a **three-tier architecture**:

```
┌─────────────────────────────────────────────────────┐
│                   PRESENTATION LAYER                 │
│  React Components + shadcn/ui + Tailwind CSS        │
│  Zustand Store (Global State)                        │
│  Module Components (25+ HR modules)                  │
├─────────────────────────────────────────────────────┤
│                      API LAYER                       │
│  Next.js API Routes (26 endpoints)                   │
│  Prisma ORM (Database Access)                        │
│  Demo Data Fallbacks (When DB Unavailable)           │
├─────────────────────────────────────────────────────┤
│                     DATA LAYER                       │
│  PostgreSQL (Neon Serverless)                        │
│  Prisma Schema (24 Models)                           │
│  Connection Pooling (PgBouncer)                      │
└─────────────────────────────────────────────────────┘
```

## Component Structure

```
src/
├── app/
│   ├── api/           # 26 API route handlers
│   ├── page.tsx       # Main application page
│   └── globals.css    # Global styles
├── components/
│   ├── hrms/          # 30 module components
│   └── ui/            # 40+ shadcn/ui components
├── lib/
│   ├── api.ts         # API client functions
│   ├── db.ts          # Prisma client
│   ├── types.ts       # TypeScript interfaces
│   └── utils.ts       # Utility functions
├── store/
│   └── app-store.ts   # Zustand global store
└── prisma/
    └── schema.prisma  # Database schema
```

## State Management

The application uses **Zustand** for global state management:
- **Auth State**: isAuthenticated, user, userRole
- **Company Context**: currentCompany, companies list
- **Navigation**: activeModule, sidebarOpen, sidebarCollapsed
- **Theme**: darkMode toggle

## Module Error Boundary

Each module is wrapped in a `ModuleErrorBoundary` that catches errors and displays a retry UI, preventing one module crash from affecting the entire application.
