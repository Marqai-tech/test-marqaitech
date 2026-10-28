# 3Boxes HRMS — Complete Production Technical Documentation

> **Version:** 1.0 | **Date:** October 2026 | **Source:** Production codebase analysis  
> **Codebase stats:** 575 API routes · 332 pages · 295 Prisma models · 40+ lib modules  
> **IMPORTANT:** This document is generated from source-code analysis of the test repository (which contains the production codebase imported). Production token was inaccessible; comparison is based on the test repo's commit history.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Application Architecture](#2-application-architecture)
3. [Project Structure and Important Files](#3-project-structure-and-important-files)
4. [Complete Module Inventory](#4-complete-module-inventory)
5. [Login and Authentication Flow](#5-login-and-authentication-flow)
6. [Super Admin Login – Detailed End-to-End Flow](#6-super-admin-login--detailed-end-to-end-flow)
7. [Other Login Types and Role-Based Access](#7-other-login-types-and-role-based-access)
8. [Role-versus-Module Permission Matrix](#8-role-versus-module-permission-matrix)
9. [Module-by-Module Technical Documentation](#9-module-by-module-technical-documentation)
10. [Complete API Inventory](#10-complete-api-inventory)
11. [Database Models and Relationships](#11-database-models-and-relationships)
12. [End-to-End Business Workflows](#12-end-to-end-business-workflows)
13. [Notifications and External Integrations](#13-notifications-and-external-integrations)
14. [Production Configuration and Deployment](#14-production-configuration-and-deployment)
15. [Production-versus-Test Comparison](#15-production-versus-test-comparison)
16. [Security Findings and Potential Risks](#16-security-findings-and-potential-risks)
17. [Known Bugs, Missing Features, and Inconsistencies](#17-known-bugs-missing-features-and-inconsistencies)
18. [Recommendations and Improvement Priorities](#18-recommendations-and-improvement-priorities)
19. [Source File Reference Index](#19-source-file-reference-index)
20. [Glossary and Technical Terms](#20-glossary-and-technical-terms)

---

## 1. Executive Summary

3Boxes HRMS is a **multi-tenant, AI-powered, enterprise HRMS platform** built on **Next.js 16 (Turbopack)** with **Prisma 7** (PostgreSQL/Neon), supporting the complete employee lifecycle from recruitment through offboarding. The application comprises **575 API endpoints**, **332 frontend pages**, **295 database models**, and **40+ library modules** organized across **36+ functional modules**.

### Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.2.7 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS, Recharts, react-hot-toast |
| Backend | Next.js API Routes (serverless), Prisma 7.8 ORM |
| Database | PostgreSQL (Neon serverless) — platform DB + per-tenant isolated DBs |
| Auth | Custom JWT (jose HS256), bcryptjs (cost 12), per-tab sessionStorage shim |
| Multi-tenancy | Subdomain-based tenant detection + per-tenant PrismaClient routing |
| AI | GLM-4/GPT-4 integration via z-ai-web-dev-sdk, AI interviews, resume parsing, sentiment analysis |
| Integrations | Razorpay (payments), Shiprocket (logistics), DocuSign (e-sign), biometric devices (ZKTeco/Mantra/Suprema), eTimeOffice, Resend/Nodemailer (email) |
| Deployment | Vercel (Hobby plan), with cron jobs via Vercel Cron |

### Key Architecture Decisions

1. **Per-tab session isolation** — JWT tokens stored in sessionStorage (not cookies) via a localStorage monkey-patch shim that prevents cross-tab identity bleed.
2. **Per-tenant database isolation** — Each tenant gets its own PostgreSQL database, provisioned automatically on trial registration. The platform DB stores Tenant/User/TrialRegistration; tenant DBs store all HR data.
3. **Configuration-driven workflows** — Pipeline stages, approval chains, preboarding ladders, and onboarding checklists are all configurable per tenant via the Workflow Configuration editor, not hardcoded.
4. **Additive schema evolution** — New models are appended to the Prisma schema and provisioned via `CREATE TABLE IF NOT EXISTS` SQL scripts, avoiding destructive migrations.

---

## 2. Application Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────┐ │
│  │ Login    │  │ Dashboard│  │ Module   │  │ Candidate/Client│ │
│  │ Page     │  │ Layout   │  │ Pages    │  │ Portals         │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬─────────┘ │
│       │              │              │                │           │
│  ┌────▼──────────────▼──────────────▼────────────────▼──────┐   │
│  │              authStore (Zustand)                         │   │
│  │  token-storage.ts shim (sessionStorage + fetch inject)   │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │ Authorization: Bearer <JWT>        │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    NEXT.JS MIDDLEWARE                            │
│  1. Locale detection (NEXT_LOCALE cookie / Accept-Language)     │
│  2. Tenant slug extraction (subdomain / query / demo domain)    │
│  3. Sets x-tenant-slug + x-tenant-domain headers                │
│  4. Redirects tenant subdomain root → /login                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    API ROUTES (575 endpoints)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │
│  │ /api/auth│  │/api/empl │  │/api/pay  │  │ /api/recruit   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬────────┘ │
│       │              │              │                │          │
│  ┌────▼──────────────▼──────────────▼────────────────▼──────┐  │
│  │           tenant-db.ts (DB Router)                       │  │
│  │  getDb(request) → resolves tenant slug → PrismaClient   │  │
│  │  getPlatformDb() → platform DB (Tenant, User, etc.)     │  │
│  └────────────────────────┬────────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    DATABASE LAYER                                │
│  ┌─────────────────┐    ┌──────────────────────────────────┐   │
│  │  Platform DB    │    │  Tenant DB (per-tenant isolated) │   │
│  │  - Tenant       │    │  - Employee, Attendance, Leave   │   │
│  │  - User (super) │    │  - Payroll, Performance          │   │
│  │  - TenantDB     │    │  - Recruitment, Onboarding       │   │
│  │  - TrialReg     │    │  - Projects, Tickets, etc.       │   │
│  └─────────────────┘    └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Request Lifecycle

1. Browser loads a page → authStore hydrates from sessionStorage (token + cached user).
2. If no token → redirect to `/login`.
3. If token → dashboard layout renders; sidebar filtered by `canRoleAccessModule(role, moduleKey)`.
4. Page makes API calls → `token-storage.ts` fetch shim injects `Authorization: Bearer <token>`.
5. Middleware runs on every request → sets `x-tenant-slug` + `x-next-intl-locale` headers.
6. API route calls `getDb(request)` → resolves tenant slug → returns per-tenant PrismaClient.
7. API route verifies JWT via `verifyToken(getTokenFromHeaders(request))`.
8. API route uses `resolveCompanyScope(request)` for data scoping (all/team/self).
9. Database operation executes on the correct tenant DB.
10. Response returned to client.

---

## 3. Project Structure and Important Files

```
3boxes-hrms/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (dashboard)/              # 299 authenticated pages
│   │   │   ├── home/                 # Role-aware home page
│   │   │   ├── dashboard/            # Employee dashboard
│   │   │   ├── employees/            # Employee lifecycle (17 pages)
│   │   │   ├── attendance/           # Attendance (23 pages)
│   │   │   ├── leave/               # Leave (13 pages)
│   │   │   ├── payroll/             # Payroll (33 pages — largest)
│   │   │   ├── recruitment/         # Recruitment + workflow-config
│   │   │   ├── preboarding/         # Preboarding stage machine
│   │   │   ├── onboarding/          # Onboarding tasks + templates
│   │   │   ├── offers/              # Offer letters + e-sign
│   │   │   ├── super-admin/         # Platform admin (20 pages)
│   │   │   ├── tenant-admin/        # Tenant admin (8 pages)
│   │   │   ├── performance/         # Reviews, goals, OKRs
│   │   │   ├── learning/            # LMS (courses, paths, certs)
│   │   │   ├── projects/            # Project management
│   │   │   ├── helpdesk/            # IT/HR ticketing
│   │   │   ├── crm/                 # CRM (leads, deals, contacts)
│   │   │   ├── accounts/            # GL, AP/AR, bank reconciliation
│   │   │   ├── collaboration/       # Chat, calls, files
│   │   │   ├── marketplace/         # Wallet, EWA, insurance
│   │   │   ├── ai-interview/        # AI-powered interviews
│   │   │   ├── analytics/           # Cross-module analytics
│   │   │   ├── governance/          # Compliance reporting
│   │   │   └── ... (36+ module dirs)
│   │   ├── (public)/                # 8 public pages (landing, register)
│   │   ├── api/                     # 575 API route files
│   │   │   ├── auth/                # 10 auth endpoints
│   │   │   ├── employees/           # 27 employee API routes
│   │   │   ├── attendance/          # 37 attendance API routes
│   │   │   ├── payroll/             # 71 payroll API routes (largest)
│   │   │   ├── recruitment/         # 7 recruitment API routes
│   │   │   ├── offers/              # 11 offer API routes
│   │   │   ├── rbac/                # 9 RBAC API routes
│   │   │   ├── super-admin/         # 8 super-admin API routes
│   │   │   ├── cron/                # 11 scheduled job endpoints
│   │   │   └── ... (117 module dirs)
│   │   ├── login/page.tsx           # Login page (1391 lines)
│   │   ├── forgot-password/         # Password reset request
│   │   ├── reset-password/          # Password reset form
│   │   ├── careers/                 # Public job board
│   │   ├── candidate-portal/        # 9 candidate portal pages
│   │   ├── client-portal/           # 2 client portal pages
│   │   ├── layout.tsx               # Root layout
│   │   └── middleware.ts            # Locale + tenant detection (200 lines)
│   ├── lib/                          # 40+ library modules
│   │   ├── auth.ts                  # JWT + bcrypt (74 lines)
│   │   ├── token-storage.ts         # Per-tab session shim (191 lines)
│   │   ├── tenant-db.ts             # Multi-tenant DB router (459 lines)
│   │   ├── roleAccess.ts            # RBAC config (527 lines)
│   │   ├── companyScope.ts          # Data scope resolver
│   │   ├── auth-resolve.ts          # Two-phase user lookup
│   │   ├── managerScope.ts          # Manager team scope
│   │   ├── ecosystem-access.ts      # IDOR protection
│   │   ├── site-mode.ts             # LIVE vs DEMO detection
│   │   ├── tenant-filter.ts         # Hidden slug filtering
│   │   ├── onboarding-cascade.ts    # Conversion cascade engine
│   │   ├── recruitment-workflow.ts  # Workflow config + defaults
│   │   ├── attendance-workflow.ts   # Attendance business rules
│   │   ├── leave-workflow.ts        # Leave approval chain
│   │   ├── notification-channels.ts  # Email dispatch
│   │   ├── notification-center.ts   # Multi-channel notifications
│   │   ├── email-sender.ts          # SMTP/Resend email
│   │   ├── encryption.ts            # AES-256-GCM
│   │   ├── pii-mask.ts              # PII masking for candidates
│   │   ├── validators.ts            # Field validation utilities
│   │   ├── sanitize.ts              # XSS sanitization
│   │   ├── schema-sync.ts           # Runtime schema drift fix
│   │   └── ... (20+ more)
│   ├── store/
│   │   └── authStore.ts             # Zustand auth state (470 lines)
│   ├── hooks/
│   │   └── useSessionTimeout.ts     # Idle timeout hook
│   ├── components/
│   │   ├── Header.tsx               # Top bar with notifications
│   │   ├── Sidebar.tsx              # Role-filtered navigation
│   │   ├── RoleAccessGuard.tsx      # Module-level access guard
│   │   └── ... (20+ shared components)
│   └── middleware.ts                # Locale + tenant middleware
├── prisma/
│   ├── schema.prisma                # 8,708 lines, 295 models
│   ├── seed.ts                      # Main demo seed (74 KB)
│   ├── seed-demo.ts                 # Large demo dataset (121 KB)
│   ├── seed-payroll.ts              # Payroll fixtures (72 KB)
│   ├── tenant-schema.sql            # DDL for new tenant DBs (329 KB)
│   └── migrations/                  # Prisma migrations
├── scripts/                          # Build + maintenance scripts
│   ├── schema-sync.js               # Build-time schema provisioning
│   ├── gen-missing-tables.py        # Generate CREATE TABLE statements
│   └── ... (20+ scripts)
├── package.json                     # Dependencies + scripts
├── next.config.ts                   # Next.js config
├── vercel.json                      # Vercel deployment config
├── tailwind.config.ts               # Tailwind theme
└── .env.example                     # Environment variable reference
```

---

## 4. Complete Module Inventory

The application has **36+ functional modules** with **332 pages**. Here is the complete inventory grouped by domain:

### Core Modules

| # | Module | Pages | Purpose | Primary Roles |
|---|---|---|---|---|
| 1 | Dashboards & Home | 15 | Role-aware landing dashboard | All roles |
| 2 | Employees | 17 | Employee lifecycle (CRUD, probation, transfer, separation) | Admin, Manager |
| 3 | Attendance | 23 | Time tracking, biometric, geofence, shifts, OT, regularization | All roles |
| 4 | Leave | 13 | Leave application, approval, balance, encashment, policy | All roles |
| 5 | Payroll | 33 | Full payroll lifecycle, statutory, CTC, loans, FNF | Admin, Employee (payslips) |
| 6 | Recruitment | 8 | Job postings, candidate pipeline, analytics | Admin |
| 7 | Offers | 3 | Offer letters, tiered approval, e-sign, conversion | Admin |
| 8 | Preboarding | 4 | Stage machine (offer → Day 1) | Admin |
| 9 | Onboarding | 5 | Task checklist, templates, auto-generation | Admin, Manager |
| 10 | Performance | 5 | Reviews, goals, OKRs, 360° feedback | All roles |
| 11 | Learning/Training | 9 | LMS — courses, paths, enrollments, certifications | All roles |
| 12 | Helpdesk | 4 | IT/HR ticketing | All roles |
| 13 | Expenses | 1 | Expense claims & reimbursements | All roles |
| 14 | Travel | 5 | Business travel requests | All roles |
| 15 | Assets | 4 | Asset allocation & tracking | All roles |
| 16 | Documents | 5 | Document repository + policies + handbook | All roles |
| 17 | Grievances | 1 | Employee grievance filing | Admin, Manager |
| 18 | Timesheets | 1 | Daily/weekly time logging | Admin, Manager |

### Business Modules

| # | Module | Pages | Purpose | Primary Roles |
|---|---|---|---|---|
| 19 | Company Masters | 11 | Org setup (companies, branches, departments, designations) | Admin |
| 20 | CRM | 7 | Lead-to-deal pipeline | Admin |
| 21 | Clients | 6 | Client management, SOWs | Admin |
| 22 | Vendors & Procurement | 4 | Vendor master, POs, vendor invoices | Admin |
| 23 | Accounts/Finance | 8 | GL, AP/AR, journal entries, bank reconciliation | Admin |
| 24 | Project Management | 12 | Projects, sprints, tasks, capacity, utilization | All roles |
| 25 | Collaboration | 13 | Chat, calls, files, social feed, kanban, calendar | All roles |
| 26 | Marketplace | 8 | Wallet, EWA, loans, insurance, gifting | All roles |

### Platform Modules

| # | Module | Pages | Purpose | Primary Roles |
|---|---|---|---|---|
| 27 | Super Admin | 20 | Multi-tenant platform admin | super_admin only |
| 28 | Tenant Admin | 8 | In-tenant admin (companies, RBAC, storage) | super_admin, tenant_admin |
| 29 | AI Suite | 3 | AI assistant, AI interview, AI admin | Admin, super_admin |
| 30 | Analytics | 2 | Cross-module analytics | Admin |
| 31 | Governance | 7 | Compliance reporting, scheduled reports | Admin |
| 32 | IT Admin | 6 | Device, network, software, security | Admin |
| 33 | Notifications | 2 | In-app notification center | All roles |
| 34 | Setup & Settings | 5 | First-run wizard + global settings | Admin |
| 35 | Separation/FNF/Succession | 3 | Exit lifecycle & succession planning | Admin, Manager |
| 36 | Engagement | 1 | Employee engagement surveys | Admin, Manager |

### External Portals

| Portal | Pages | Auth System | Purpose |
|---|---|---|---|
| Careers (public) | 6 | None | Public job board |
| Candidate Portal | 9 | OTP/password/OAuth (separate) | Candidate self-service |
| Client Portal | 2 | OTP (separate) | Client invoice/project access |

---

## 5. Login and Authentication Flow

### 5.1 Overview

The authentication system uses **custom JWT tokens** (not NextAuth sessions) with **per-tab sessionStorage isolation**. There are no HTTP-only cookies on the critical path — the JWT travels exclusively via `Authorization: Bearer` headers, injected by a monkey-patched `window.fetch`.

### 5.2 Supported Login Types

| Login Type | Endpoint | Auth Method | Redirect |
|---|---|---|---|
| HRMS User (email/employee ID) | POST `/api/auth/login` | JWT (HS256) | Role-based (`/super-admin` or `/home`) |
| Candidate Portal | POST `/api/candidate-portal/auth/login-password` | JWT + OTP | `/candidate-portal/dashboard` |
| Candidate Portal OTP | POST `/api/candidate-portal/auth/request-otp` → `verify-otp` | OTP-based | `/candidate-portal/dashboard` |
| Client Portal | POST `/api/client-portal/auth/request-otp` → `verify-otp` | OTP-based | `/client-portal/dashboard` |
| Offer Acceptance (tokenized) | GET/POST `/api/offers/accept/[token]` | Access token in URL | Offer page |

### 5.3 JWT Token Creation and Verification

**File:** `src/lib/auth.ts`

```typescript
// Token creation (line 33-42)
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || '3boxes-hrms-fallback-secret');

export async function createToken(payload, expiresIn = '24h') {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

// Token verification (line 54-62)
export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch { return null; }
}
```

**Token payload:** `{ userId, email, role, tenantId }`

**TTLs:**
- Default session: `24h` (`SESSION_TOKEN_TTL`)
- Remember-me: `30d` (`REMEMBER_TOKEN_TTL`)

### 5.4 Password Hashing

**File:** `src/lib/auth.ts`

- Algorithm: **bcrypt** via `bcryptjs`
- Standard cost: **12 rounds** (~300ms/hash) — `hashPassword()`
- Fast cost: **10 rounds** (~75ms/hash) — `hashPasswordFast()` for bulk seeding
- Verification: `bcryptjs.compare(password, hashedPassword)`

### 5.5 Session Management (Per-Tab Isolation)

**File:** `src/lib/token-storage.ts`

The system uses a **monkey-patch shim** that redirects `localStorage['tb_token']` to `sessionStorage['tb_token']`, ensuring each browser tab has its own session:

1. **Default (no remember-me):** Token stored in `sessionStorage` only. Cleared when tab closes.
2. **Remember-me checked:** Token ALSO written to real `localStorage` (bypassing the shim via captured `originalSetItem`). JWT TTL extended to 30 days. Survives tab close/browser restart.
3. **Identity (`tb_user`):** Always in `sessionStorage` only — prevents cross-tab identity bleed.
4. **Fetch shim:** `window.fetch` is monkey-patched to auto-inject `Authorization: Bearer <token>` on same-origin `/api/*` calls (excluding public auth routes).

### 5.6 Login API Flow (POST `/api/auth/login`)

**File:** `src/app/api/auth/login/route.ts` (756 lines)

```
1. Parse { email, employeeId, password, rememberMe } from body
2. Detect email vs employee ID (presence of '@')
3. Block personal emails (gmail, yahoo, etc.) → 403 PERSONAL_EMAIL_BLOCKED
4. Extract tenant slug from x-tenant-slug header (set by middleware)
5. If tenant slug exists:
   a. Look up Tenant by slug
   b. Block if status ∉ {active, trial} → 403 TENANT_BLOCKED
   c. Search tenant DB first for user (by email or employee ID → userId)
   d. Fall back to platform DB for email lookup
6. If no tenant slug → search platform DB only
7. Verify password via bcrypt.compare()
8. Self-healing: if password === 'MarqAI@2026' and not recently invited → re-hash
9. Golden rules:
   - Main domain (no tenant slug) → only super_admin can log in
   - Super admin on tenant subdomain → rejected
   - Non-super-admin on wrong tenant subdomain → 403
10. Check trial expiry if tenant status = 'trial'
11. Create JWT: createToken({ userId, email, role, tenantId }, rememberMe ? '30d' : '24h')
12. Post-login async tasks (after()):
    - Update user.lastLogin
    - Create LoginActivity (action='login')
    - Auto-link Employee row by email if missing
    - Create AuditLog (action='LOGIN', module='auth')
13. Scrub hidden tenant info from response (Golden Rule)
14. Return { token, user }
15. Clear legacy cookie: Set-Cookie: tb_token=; Max-Age=0
```

### 5.7 Login Failure Scenarios

| HTTP | Code | Trigger | Message |
|---|---|---|---|
| 400 | — | Missing credentials | "Email/employee ID and password are required" |
| 403 | `PERSONAL_EMAIL_BLOCKED` | Personal email domain | "Personal email addresses are not supported..." |
| 403 | `TENANT_BLOCKED` | Tenant suspended/inactive/pending | Per-status message |
| 403 | `USE_CANDIDATE_LOGIN` | Candidate without Employee row | "This account signs in as a Candidate..." |
| 403 | `MAIN_DOMAIN_SUPER_ADMIN_ONLY` | Non-super-admin on main domain | "You do not have access to this organization..." |
| 403 | — | Super admin on tenant subdomain | "Super admins must log in from the main platform..." |
| 403 | `TRIAL_EXPIRED` | Trial period expired | "Your 15-day free trial has expired..." |
| 401 | `RECENTLY_INVITED_LOGIN_FAILED` | Wrong password within 1h of invite | "Your account was recently invited..." |
| 401 | — | Invalid password | "Invalid email, employee ID, or password" |
| 401 | — | Account deactivated | "Account is deactivated" |

### 5.8 Middleware (Locale + Tenant Detection)

**File:** `src/middleware.ts` (200 lines)

The middleware does **NOT** enforce authentication — it only sets locale and tenant context headers. Auth enforcement happens in each API route individually.

**Tenant slug extraction priority:**
1. `?tenant=` query parameter
2. Demo domain detection (known Vercel URLs → `3boxes-hrms-demo`)
3. `*.vercel.app` → empty (prevents false tenant detection)
4. `*.localhost` → sub-prefix as slug
5. `*.3boxeshrms.com` subdomain → first label
6. Generic 3+ part hostname → first label

**Headers set:**
- `x-tenant-slug` (if resolved) — drives DB routing
- `x-tenant-domain` (always) — for audit/logging
- `x-next-intl-locale` (non-API only) — for next-intl

### 5.9 Protected Route Enforcement

**Server-side:** Each API route independently:
1. `getTokenFromHeaders(request)` → extracts `Authorization: Bearer <token>`
2. `verifyToken(token)` → returns payload or null
3. Returns 401 if missing/invalid
4. Uses decoded `userId`, `role`, `tenantId` for authorization

**Client-side (dashboard layout):**
- If `!isAuthenticated && !token` → redirect to `/login`
- If self-service role + non-allowed path → redirect to `/my-profile`
- Idle timeout (30 min / 7 days with remember-me) → redirect to `/lock-screen`

### 5.10 Logout Flow

**Client (`authStore.logout`):**
1. POST `/api/auth/logout` with Bearer token
2. `clearAuthToken()` — clears sessionStorage + real localStorage
3. Remove `tb_company_ctx`, `tb_user` from all stores
4. Reset auth state

**Server (`/api/auth/logout`):**
1. Verify token
2. Update `user.lastLogout`
3. Create `LoginActivity` (action='logout')
4. Return 200 with `Set-Cookie: tb_token=; Max-Age=0`

### 5.11 Password Reset Flow

1. **Forgot password:** POST `/api/auth/forgot-password` — generates 30-minute reset token (bcrypt hashed), emails magic link. Returns 404 if email not found (per BUG_003 fix).
2. **Reset password:** POST `/api/auth/reset-password` — verifies token, enforces password policy (`validatePasswordStrength`), sets new password. Distinct error codes: `TOKEN_EXPIRED`, `TOKEN_ALREADY_USED`, `TOKEN_SUPERSEDED`, `WEAK_PASSWORD`.

---

## 6. Super Admin Login – Detailed End-to-End Flow

### Step-by-Step Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ 1. Browser   │────▶│ 2. Login Page│────▶│ 3. Submit   │────▶│ 4. /api/auth │
│ opens /login │     │ renders form │     │ credentials │     │ /login POST  │
└─────────────┘     └──────────────┘     └─────────────┘     └──────┬───────┘
                                                                    │
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────▼───────┐
│ 8. Dashboard │◀────│ 7. authStore │◀────│ 6. Redirect │◀────│ 5. JWT + 200│
│ renders      │     │ hydrates     │     │ to /super-  │     │ response    │
│ /super-admin │     │ state        │     │ admin       │     └─────────────┘
└─────────────┘     └──────────────┘     └─────────────┘
```

**Detailed steps:**

1. **Browser opens `/login`** — Next.js renders `src/app/login/page.tsx`. The page detects the hostname: if it's `3boxeshrms.com` (main domain), `isPlatformSite = true`. No tenant branding is shown.

2. **Login form renders** — Email/password inputs, "Keep me signed in" checkbox, "Sign In" button. Demo credentials button may appear on demo sites.

3. **User enters credentials** — `superadmin@3boxeshrms.com` / `MarqAI@2026`. The `handleSubmit` function (line 158) calls `useAuthStore.login(email, password, rememberMe)`.

4. **authStore.login()** (`src/store/authStore.ts` line 133):
   - POST `/api/auth/login` with `{ email, password, rememberMe }`
   - Retry once on network failure (600ms backoff)

5. **Login API** (`src/app/api/auth/login/route.ts`):
   - No tenant slug (main domain) → searches **platform DB only**
   - Finds user by email → `superadmin@3boxeshrms.com`
   - Verifies password via `bcryptjs.compare()`
   - Golden Rule 0 (line 450): main domain + no tenant slug → **only super_admin allowed** ✅
   - Creates JWT: `createToken({ userId, email, role: 'super_admin', tenantId: null }, '24h')`
   - Returns `{ token, user: { id, name, email, role: 'super_admin', tenantId: null } }`

6. **Client receives response** — authStore:
   - `persistAuthToken(token, { remember: rememberMe })` → writes to sessionStorage (+ localStorage if remember-me)
   - `scrubHiddenTenant(user)` → nulls any tenant data (super_admin has no tenant)
   - Sets `{ token, user, isAuthenticated: true }`

7. **Redirect** — Login page (line 200-205):
   ```typescript
   if (data.user.role === 'super_admin') {
     router.push('/super-admin');
   } else {
     router.push('/home');
   }
   ```

8. **Dashboard loads** — `/super-admin` page calls `/api/super-admin/dashboard` which returns platform-wide stats (total tenants, active tenants, total users, etc.).

### Super Admin vs Other Admin Roles

| Aspect | super_admin | tenant_admin | admin |
|---|---|---|---|
| DB | Platform DB only | Tenant DB | Tenant DB |
| Tenant scope | All tenants | Own tenant only | Own company only |
| Can switch tenant | ✅ (`/api/auth/switch-tenant`) | ❌ | ❌ |
| Can manage tenants | ✅ (create, suspend, configure) | ❌ | ❌ |
| Can manage RBAC | ✅ (system roles) | ✅ (tenant roles) | ❌ |
| Can access workflow config | ✅ (must scope to company) | ✅ | ✅ |
| Data scope | `all` (platform) | `all` (tenant) | `all` (company) |
| Home page | `/super-admin` | `/home` (HRAdminHome) | `/home` (HRAdminHome) |
| Module access | ALL modules | All except `super_admin` module | All except `super_admin`, `tenant_admin` |

### Security Concerns

- Super admin impersonation (`/api/auth/switch-tenant`) creates a new JWT for the target tenant_admin user. No visible "switch back" mechanism — the original super_admin token is replaced.
- No rate limiting on the login endpoint.

---

## 7. Other Login Types and Role-Based Access

### 7.1 All Roles

The system supports **5 canonical roles** plus **10 legacy roles** that are migrated on the fly:

| Canonical Role | Level | Legacy Roles Mapped To It |
|---|---|---|
| `super_admin` | 0 | — |
| `tenant_admin` | 1 | — |
| `admin` | 2 | `hr_admin`, `company_hr_admin`, `hrhead`, `recruitmenthead`, `recruiter` |
| `manager` | 3 | — |
| `employee` | 4 | `finance_admin`, `finance`, `it_admin`, `candidate`, `job_seeker` |

### 7.2 Data Scope by Role

| Role | Data Scope | What They See |
|---|---|---|
| `super_admin` | `all` (platform) | All tenants, all data |
| `tenant_admin` | `all` (tenant) | All companies within their tenant |
| `admin` | `all` (company) | All data within their company (or selected via CompanySwitcher) |
| `manager` | `team` | Own records + direct reports (via `reportingManagerId` + `DottedLineManager`) |
| `employee` | `self` | Own records only |

### 7.3 Self-Service Path Restrictions

Employees (and other self-service roles) are restricted to these paths:
- `/home`, `/dashboard`, `/modules`
- `/my-profile`, `/employees?view=self`, `/employees/dashboard`
- `/employees/update-requests`, `/employees/edit-log`, `/employees/resignation`
- `/leave`, `/attendance`, `/documents`, `/helpdesk`, `/notifications`
- `/payroll/payslips`, `/payroll/loans`
- `/performance`, `/training`, `/learning`
- `/projects`, `/timesheets`, `/travel`, `/expenses`, `/assets`
- `/grievances`, `/policies-handbook`

Denied paths include: `/company/*`, `/recruitment/*`, `/onboarding/*`, `/employees` (without `?view=self`), `/leave/leave-policy`, `/attendance/shifts`, etc.

---

## 8. Role-versus-Module Permission Matrix

| Module | super_admin | tenant_admin | admin | manager | employee |
|---|---|---|---|---|---|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Employees | ✅ | ✅ | ✅ | ✅ (team) | ✅ (self) |
| Company Masters | ✅ | ✅ | ✅ | ❌ | ❌ |
| Attendance | ✅ | ✅ | ✅ | ✅ | ✅ |
| Leave | ✅ | ✅ | ✅ | ✅ | ✅ |
| Payroll (all) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Payroll (payslips) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Recruitment | ✅ | ✅ | ✅ | ❌ | ❌ |
| Offers | ✅ | ✅ | ✅ | ❌ | ❌ |
| Preboarding | ✅ | ✅ | ✅ | ❌ | ❌ |
| Onboarding | ✅ | ✅ | ✅ | ✅ | ❌ |
| Performance | ✅ | ✅ | ✅ | ✅ | ✅ |
| Learning | ✅ | ✅ | ✅ | ✅ | ✅ |
| Helpdesk | ✅ | ✅ | ✅ | ✅ | ✅ |
| Projects | ✅ | ✅ | ✅ | ✅ | ✅ |
| Timesheets | ✅ | ✅ | ✅ | ✅ | ❌ |
| Expenses | ✅ | ✅ | ✅ | ✅ | ✅ |
| CRM | ✅ | ✅ | ✅ | ❌ | ❌ |
| Accounts | ✅ | ✅ | ✅ | ❌ | ❌ |
| Collaboration | ✅ | ✅ | ✅ | ✅ | ✅ |
| Marketplace | ✅ | ✅ | ✅ | ✅ | ✅ |
| Super Admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| Tenant Admin | ✅ | ✅ | ❌ | ❌ | ❌ |
| RBAC | ✅ | ✅ | ❌ | ❌ | ❌ |
| AI Admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| Governance | ✅ | ✅ | ✅ | ❌ | ❌ |
| Settings | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## 9. Module-by-Module Technical Documentation

> Due to the massive scope (36+ modules, 575 APIs, 332 pages), this section provides a summary of each major module. Full per-module documentation would exceed 500 pages.

### 9.1 Employee Lifecycle Module

**Pages:** 17 | **API routes:** 27 | **Key models:** `Employee`, `User`, `Department`, `Designation`, `Branch`, `Company`

The Employee module is the central hub of the HRMS. Every other module references `Employee`. Key sub-features:
- Employee CRUD with auto-generated employee codes
- Lifecycle events: probation, transfer, termination, rejoin, resignation
- Self-service update requests with tiered approval chain
- Bulk import via CSV/Excel
- Custom fields, dotted-line managers, skills, dependents, qualifications
- Credential invitation system (email invite with generated password)
- Photo upload/remove

**Key files:**
- `src/app/(dashboard)/employees/page.tsx` — Employee list
- `src/app/api/employees/route.ts` — GET/POST employees
- `src/app/api/employees/[id]/route.ts` — GET/PUT/PATCH/DELETE
- `src/lib/employee-update-request.ts` — Update request engine (field sensitivity, approval chain)
- `src/lib/companyScope.ts` — Data scope resolver (all/team/self)

### 9.2 Attendance Module

**Pages:** 23 | **API routes:** 37 | **Key models:** `Attendance`, `PunchEvent`, `Geofence`, `BiometricDevice`, `BiometricPunch`, `AttendanceRegularization`, `Shift`, `AttendancePolicyConfig`

The Attendance module handles time tracking with multiple input methods:
- Manual punch (web UI)
- Mobile punch (GPS + geofence)
- Biometric punch (ZKTeco/Mantra/Suprema devices via API)
- eTimeOffice integration (external biometric sync)
- Regularization requests with approval workflow
- Hourly permissions, gatepasses, WFH requests, overtime requests
- Shift management (fixed, flexible, rotating)
- Auto-present for management employees
- AI-powered buddy-punch detection

**Key files:**
- `src/app/api/attendance/route.ts` — GET/POST attendance
- `src/app/api/attendance/punch/route.ts` — Punch endpoint
- `src/app/api/attendance/biometric/punch/route.ts` — Biometric punch
- `src/lib/attendance-workflow.ts` — Business rules
- `src/lib/attendance-break-rules.ts` — Break calculation

### 9.3 Payroll Module

**Pages:** 33 | **API routes:** 71 | **Key models:** `PayrollRun`, `PayrollTransactionLine`, `PayrollComponent`, `CTCTemplate`, `StatutoryComponent`, `TaxSlabTable`, `Loan`, `PayrollApproval`, `PayrollAnomaly`

The Payroll module is the **largest module** (71 API routes). It supports:
- Full payroll run lifecycle (OPEN → INPUT_COLLECTION → PROCESSING → REVIEW → APPROVED → ACCOUNTING → DISBURSED → CLOSED)
- CTC calculator with component allocation
- India-specific statutory compliance (EPF, ESI, PT, TDS, LWF, gratuity)
- Multi-currency support with exchange rates
- Loans and overtime processing
- Bank payment file generation (NACH/NEFT/RTGS)
- Payroll holds and lock requests
- AI anomaly detection (net pay spike, OT spike, ghost employees)
- Separation of Duties (SoD) enforcement — calculator ≠ approver
- Full & Final (FNF) settlement with gratuity calculation

### 9.4 Recruitment → Preboarding → Onboarding Cascade

This is the **talent acquisition lifecycle** documented in the SOP:

1. **Recruitment** (8 pages, 7 API routes): Job postings → applications → screening → interviews → offers
2. **Offers** (3 pages, 11 API routes): Draft → pending_approval → approved → sent → accepted → Convert
3. **Conversion cascade** (`src/lib/onboarding-cascade.ts`): Single atomic transaction that:
   - Creates Employee record (probation status)
   - Opens Preboarding case (first enabled stage)
   - Generates Onboarding tasks (from templates or configured phases)
   - Sends notifications to IT/Admin/Finance/HR
   - Marks application as hired, decrements vacancy count
4. **Preboarding** (4 pages, 3 API routes): Stage machine (Offer Accepted → Document Collection → BGV → IT Provisioning → Asset Request → Day 1 Ready) with SLA tracking, gate enforcement (HR verification, document collection)
5. **Onboarding** (5 pages, 5 API routes): Auto-generated task checklist with 10 categories, due dates offset from joining date, template precedence rule

**Key config:** `src/lib/recruitment-workflow.ts` — `DEFAULT_RECRUITMENT_CONFIG`, `DEFAULT_PREBOARDING_CONFIG`, `DEFAULT_ONBOARDING_CONFIG` + `resolveWorkflowConfig()` for tenant/company-scoped resolution.

### 9.5 Notification System

**API routes:** 8 | **Key models:** `Notification`, `NotificationTemplate`, `NotificationDelivery`, `NotificationPreference`, `IntegrationWebhook`

Multi-channel notification dispatch:
- In-app (real-time via polling)
- Email (via `sendTenantEmail()` — Nodemailer SMTP or Resend)
- Slack/Teams (via webhook)
- SMS (template-ready, not implemented)

**Key file:** `src/lib/notification-center.ts` — `dispatchNotification()` resolves templates, preferences, and delivery channels.

---

## 10. Complete API Inventory

**Total: 575 route files across 117 module directories**

### Top 15 Modules by API Route Count

| # | Module | Routes | Purpose |
|---|---|---|---|
| 1 | `payroll` | 71 | Full payroll lifecycle + statutory + AI |
| 2 | `attendance` | 37 | Punches, biometric, geofence, regularize |
| 3 | `employees` | 27 | Employee CRUD + lifecycle events |
| 4 | `collaboration` | 21 | Chat, calls, files, GDPR, SSO |
| 5 | `admin` | 21 | Tenant DB ops, seeding, profile fixes |
| 6 | `projects` | 20 | Projects, sprints, tasks, allocations |
| 7 | `candidate-portal` | 16 | External candidate experience |
| 8 | `learning` | 15 | LMS — courses, paths, enrollments |
| 9 | `offers` | 11 | Offer letters + DocuSign e-sign |
| 10 | `cron` | 11 | Scheduled background jobs |
| 11 | `auth` | 10 | Authentication & session management |
| 12 | `ai-interview` | 10 | AI-powered interviews |
| 13 | `rbac` | 9 | Roles, permissions, modules |
| 14 | `leave` | 9 | Leave requests, balance, encashment |
| 15 | `super-admin` | 8 | Platform admin operations |

### Authentication Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Login (email/employee ID + password) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user profile |
| POST | `/api/auth/register` | Public registration |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |
| POST | `/api/auth/switch-tenant` | Super admin tenant switch |
| GET | `/api/auth/tenant-lookup` | Pre-login tenant resolution |

### Cron Job Endpoints

| Path | Purpose |
|---|---|
| `/api/cron/attendance-missing-punch` | Auto-mark missing punches |
| `/api/cron/biometric-sync` | Sync biometric device data |
| `/api/cron/leave-reminders` | Send leave pending-approval reminders |
| `/api/cron/onboarding-reminders` | Send onboarding task reminders |
| `/api/cron/probation-alerts` | Alert HR about upcoming probation ends |
| `/api/cron/policy-ack-reminders` | Remind employees to acknowledge policies |
| `/api/cron/notification-escalation` | Escalate unactioned notifications |
| `/api/cron/learning-compliance` | Check compliance training deadlines |
| `/api/cron/document-expiry` | Alert on expiring documents |
| `/api/cron/distribute-reports` | Distribute scheduled reports |
| `/api/cron/etimeoffice-biometric-sync` | Sync with eTimeOffice |

---

## 11. Database Models and Relationships

### 11.1 Overview

- **Total models:** 295
- **Database:** PostgreSQL (Neon serverless)
- **Multi-tenancy:** Platform DB + per-tenant isolated DBs
- **Schema evolution:** Additive only (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS)

### 11.2 Multi-Tenant DB Architecture

```
Platform DB (shared)
├── Tenant
│   ├── slug (unique)
│   ├── plan (starter/professional/enterprise)
│   ├── status (active/trial/expired/suspended/inactive/pending_approval)
│   └── hasOne → TenantDatabase (connection string for isolated DB)
├── User (super_admin lives here; tenant users may live here or in tenant DB)
├── TenantDatabase (isActive, connectionString, directUrl, databaseName)
├── TrialRegistration (self-service trial signup)
├── Subscription + SubscriptionPlan
├── FeatureFlag (per-tenant toggles)
└── TenantConfiguration (global tenant settings)

Tenant DB (per-tenant, isolated)
├── User (tenant-specific users)
├── Employee (central hub — 50+ relations)
├── Company → Branch → Department → Designation
├── Attendance, PunchEvent, BiometricPunch
├── LeaveRequest, LeaveBalance, LeaveType
├── PayrollRun, PayrollTransactionLine, PayrollComponent
├── JobPosting, JobApplication, Candidate, Offer
├── PreboardingCandidate, OnboardingTask
├── Project, ProjectTask, ProjectAllocation, Timesheet
├── PerformanceReview, Goal, OKR, KeyResult
├── Course, CourseEnrollment, Certificate
├── Ticket, Notification, AuditLog
└── ... (200+ more models)
```

### 11.3 Key Relationships

```
Tenant ──1:1──> TenantDatabase
       ──1:N──> Company ──1:N──> Branch / Department / Designation
                            └──1:N──> Employee ──1:N──> (50+ relations)
       ──1:N──> User ──1:1──> Employee

Employee (self-relation) ──> Employee (reportingManagerId)
Department (self-relation) ──> Department (parentDepartmentId)
Vendor (self-relation) ──> Vendor (parentVendorId)
FileNode (self-relation) ──> FileNode (parentId)
OKR (self-relation) ──> OKR (parentOkrId)
ProjectTask (self-relation) ──> ProjectTask (dependsOnId)

JobPosting ──1:N──> JobApplication ──1:N──> Interview
Offer ──1:1?──> OfferDeclineSurvey
PreboardingCandidate ──1:1?──> Employee (set on convert)
LeaveRequest ──1:N──> LeaveApprovalStep
PayrollRun ──1:N──> PayrollTransactionLine / PayrollApproval / PayrollAnomaly
```

### 11.4 Important Enums (String Columns with Documented Values)

| Field | Values |
|---|---|
| `User.role` | `super_admin`, `tenant_admin`, `admin` |
| `Employee.status` | `active`, `on_leave`, `terminated`, `resigned` |
| `Employee.employeeStatus` | `confirmed`, `probation`, `contract`, `internship`, `consultant` |
| `JobApplication.status` | `applied`, `screening`, `interview`, `offered`, `hired`, `rejected` |
| `Offer.status` | `draft`, `pending_approval`, `approved`, `sent`, `accepted`, `rejected`, `withdrawn` |
| `PreboardingCandidate.status` | `offer_accepted` → `document_collection` → `bgv` → `provisioning` → `asset_request` → `joined` → `cancelled` |
| `LeaveRequest.status` | `pending`, `approved`, `rejected`, `cancelled` |
| `Attendance.status` | `present`, `absent`, `late`, `half_day`, `holiday`, `weekend`, `on_leave` |
| `PayrollRun.runStatus` | `OPEN`, `INPUT_COLLECTION`, `PROCESSING`, `REVIEW`, `APPROVED`, `ACCOUNTING`, `DISBURSED`, `CLOSED` |
| `Timesheet.status` | `draft`, `submitted`, `approved`, `rejected`, `locked` |

---

## 12. End-to-End Business Workflows

### 12.1 Recruitment → Onboarding Cascade

```
1. HR creates Job Posting (/recruitment > Create Job)
2. Candidate applies (public /careers or /api/public/apply)
3. Application enters pipeline: applied → screening → interview → offered → hired
4. HR creates Offer (/offers > Create Offer)
5. Offer flows: draft → pending_approval → approved → sent → accepted
6. HR clicks "Convert" on accepted offer
7. Conversion cascade (src/lib/onboarding-cascade.ts):
   a. Creates Employee record (status: probation, generated employee code)
   b. Opens Preboarding case (first enabled stage)
   c. Generates Onboarding tasks (from templates or configured phases)
   d. Sends notifications to IT, Admin, Finance, HR
   e. Marks application as hired, decrements vacancy count
8. Preboarding stage machine runs:
   Offer Accepted → Document Collection → BGV → IT Provisioning → Asset Request → Day 1 Ready
   (each stage has SLA, notify roles, and optional gates)
9. Onboarding tasks complete over first 30 days
10. Employee marked fully onboarded
```

### 12.2 Leave Application Workflow

```
1. Employee applies for leave (/leave > Apply)
2. Leave request created with status: pending
3. Workflow config resolved (tenant → company → branch → department scoped)
4. Approval chain activated (tier 1: reporting manager)
5. Manager approves/rejects → tier 2 (if configured): department head / HR admin
6. On approval: leave balance decremented, notification sent to employee
7. On rejection: notification with reason sent to employee
8. Employee can cancel pending requests
```

### 12.3 Payroll Processing Workflow

```
1. HR creates PayrollRun (runType: REGULAR, period: month/year)
2. Run status: OPEN → INPUT_COLLECTION (attendance, leave, OT data collected)
3. Status: PROCESSING (transaction lines calculated per employee per component)
4. Status: REVIEW (HR reviews, can adjust)
5. Status: APPROVED (SoD-enforced: calculator ≠ approver)
6. Status: ACCOUNTING (GL entries generated, bank payment file created)
7. Status: DISBURSED (payslips generated, bank file sent)
8. Status: CLOSED (immutable; changes require PayrollLockRequest)
9. AI anomalies checked throughout (net pay spike, OT spike, ghost employees)
```

---

## 13. Notifications and External Integrations

### Notification System
- **Multi-channel:** In-app, Email (SMTP/Resend), Slack/Teams (webhooks)
- **Template-based:** `NotificationTemplate` per module + eventKey
- **Preferences:** Per-user, per-module, per-event opt-in/out
- **Actionable:** Notifications can include action buttons with tokens

### External Integrations

| Integration | Purpose | Key File |
|---|---|---|
| Razorpay | Payment collection (subscriptions) | API routes in `/api/trial/*` |
| Shiprocket | Logistics/delivery | (Referenced in earlier docs) |
| DocuSign | Offer letter e-signature | `src/app/api/offers/[id]/send-for-esign/route.ts` |
| Resend | Transactional email | `src/lib/email-sender.ts` |
| Nodemailer | SMTP email | `src/lib/email-sender.ts` |
| ZKTeco/Mantra/Suprema | Biometric attendance devices | `src/app/api/attendance/biometric/*` |
| eTimeOffice | External biometric sync | `src/lib/etimeoffice-client.ts` |
| Neon | Serverless PostgreSQL | `@prisma/adapter-neon` |
| z-ai-web-dev-sdk | AI (GLM-4/GPT-4) | Used across AI modules |

### Environment Variables

| Variable | Purpose |
|---|---|
| `POSTGRES_PRISMA_URL` | Platform DB connection (Neon pooled) |
| `POSTGRES_URL` | Fallback DB connection |
| `DATABASE_URL` | Last-resort DB connection |
| `JWT_SECRET` | JWT signing secret (HS256) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Root domain for subdomain detection |
| `NEXT_PUBLIC_SITE_MODE` | LIVE / DEMO mode override |
| `TEST_TENANT_SLUG` | Test platform tenant slug |
| `RESEND_API_KEY` | Resend email API key |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | SMTP email config |
| `DOCUSIGN_*` | DocuSign e-sign credentials |
| `BIOMETRIC_*` | Biometric device config |
| `VERCEL` | Set by Vercel runtime (affects Secure cookie flag) |

---

## 14. Production Configuration and Deployment

### Deployment: Vercel (Hobby Plan)

- **Build command:** `prisma generate && python3 scripts/gen-missing-tables.py && node scripts/schema-sync.js && next build`
- **Output:** `.next/` (Turbopack)
- **Cron jobs:** Defined in `vercel.json` — 11 scheduled endpoints
- **Environment:** Vercel environment variables (not in code)

### Build Pipeline

1. `prisma generate` — Generate Prisma Client from schema
2. `python3 scripts/gen-missing-tables.py` — Generate CREATE TABLE statements for new models
3. `node scripts/schema-sync.js` — Apply schema to platform DB (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS)
4. `next build` — Compile Next.js (Turbopack)

### Auto-Provisioning New Tenant DBs

When a trial registration is approved (`/api/trial/register` or `/api/trial/approve`):
1. `provisionTenantDatabase()` in `src/lib/tenant-db-provision.ts`
2. Connects to platform's maintenance endpoint
3. `CREATE DATABASE tenant_<sanitized_slug>`
4. Executes `prisma/tenant-schema.sql` (9,337 lines of DDL)
5. Stores connection strings in `TenantDatabase` table
6. Future requests to that tenant get a cached `PrismaClient` for the new DB

---

## 15. Production-versus-Test Comparison

**Limitation:** The production repository (`Marqaitech/3-Boxes-HRMS`) was inaccessible — the production GitHub token was rejected as "Bad credentials." All analysis is based on the **test repository** (`Marqai-tech/test-marqaitech`), which contains a commit titled "Import Marqaitech main with local HRMS fixes" that imported the production codebase.

### Known Divergence

| Aspect | Production | Test |
|---|---|---|
| Repo | `Marqaitech/3-Boxes-HRMS` | `Marqai-tech/test-marqaitech` |
| Live URL | `3boxeshrms.com` | `test-marqaitech-ontt.vercel.app` |
| Commits ahead | Unknown (token rejected) | 8+ commits ahead of import point |
| Additional fixes | Unknown | HRMS bug fixes (BUG_001-075), SOP compliance fixes, QA document |
| Demo host config | Unknown | `test-marqaitech-ontt.vercel.app` added to demo domains |

**Risk:** The test repo may have diverged from production in ways not visible without access to the production repo. Any comparison claims beyond this are unverified.

---

## 16. Security Findings and Potential Risks

### Confirmed Defects

| Severity | Finding | Location | Impact | Recommended Fix |
|---|---|---|---|---|
| **HIGH** | Hardcoded fallback JWT secret `'3boxes-hrms-fallback-secret'` | `src/lib/auth.ts:4` | If `JWT_SECRET` env var is missing, anyone with source access can forge tokens | Fail-fast in production if `JWT_SECRET` is missing |
| **HIGH** | Self-healing password reset on `MarqAI@2026` | `src/app/api/auth/login/route.ts:326` | Anyone knowing this string can reset stale-password users | Remove or rate-limit aggressively |
| **MEDIUM** | CORS `Access-Control-Allow-Origin: '*'` on all auth endpoints | All auth routes | Combined with Bearer header acceptance, allows cross-origin token use | Restrict to known origins |
| **MEDIUM** | No rate limiting on login, register, tenant-lookup, forgot-password | Auth routes | Brute-force / tenant enumeration | Add Vercel Edge rate limiting or Upstash Redis |
| **MEDIUM** | `/api/auth/register` is fully open — creates tenants + issues JWT | `src/app/api/auth/register/route.ts` | Spam tenant creation | Add email verification + rate limiting |
| **MEDIUM** | `switch-tenant` impersonation has no visible audit log | `src/app/api/auth/switch-tenant/route.ts` | Super admin actions invisible | Add audit log entry |
| **MEDIUM** | Home page routing bug — 3 consecutive `if (role === 'admin')` blocks | `src/app/(dashboard)/home/page.tsx:1510-1520` | Manager/Finance/IT/Recruiter dashboards unreachable; all fall through to EmployeeHome | Replace duplicate `admin` checks with correct role strings |
| **LOW** | Remember-me tokens in plain localStorage | `src/lib/token-storage.ts:112-117` | XSS would steal durable tokens | Acceptable tradeoff; document the risk |
| **LOW** | `/api/auth/me` doesn't cross-check JWT tenant vs `x-tenant-slug` | `src/app/api/auth/me/route.ts` | Potential horizontal tenant access | Add tenant cross-check |
| **LOW** | No middleware-level auth enforcement | `src/middleware.ts` | Each API route self-enforces; risk of forgotten checks | Consider centralized route guard |
| **LOW** | Monkey-patching `window.fetch` is fragile | `src/lib/token-storage.ts:138-176` | Third-party libs capturing fetch early bypass auth-header injection | Document the risk; test with Sentry/monitoring libs |

### Potential Risks (Require Verification)

- Cron endpoints (`/api/cron/*`) use GET method — verify they're protected with a secret token, not just obscurity
- `admin/` module's 21 routes are mostly one-off fix/migration scripts — verify they're disabled in production
- `seed/*` and `setup/*` endpoints expose data-seeding operations — verify production access

---

## 17. Known Bugs, Missing Features, and Inconsistencies

### Confirmed Bugs

| # | Bug | Location | Status |
|---|---|---|---|
| 1 | Home page routing: `if (role === 'admin')` repeated 3x — ManagerHome, FinanceHome, ITAdminHome unreachable | `src/app/(dashboard)/home/page.tsx:1510-1520` | Not fixed |
| 2 | `RecruiterHome` component defined but never routed to | `src/app/(dashboard)/home/page.tsx:783` | Not fixed |
| 3 | Two parallel leave APIs (`/api/leave/*` and `/api/leaves`) — potential inconsistency | `src/app/api/leave/` + `src/app/api/leaves/` | Known |
| 4 | `companyId` may not be resolved in onboarding cascade for company-scoped configs | `src/lib/onboarding-cascade.ts` | Needs verification |
| 5 | `PreboardingCandidate` table created at runtime via `ensureSchemaSynced` — should be in base schema | `src/app/api/preboarding/route.ts` | Short-circuited; applies at build time |

### Missing/Incomplete Features

| Feature | Status | Notes |
|---|---|---|
| Template precedence rule (override-by-match) | Incomplete | Currently "OR-fallback" not "override-by-match" per SOP |
| Email verification on registration | Not implemented | `/api/auth/register` issues JWT immediately |
| Rate limiting | Not implemented | All auth endpoints are unprotected |
| Audit logging for tenant switch | Not implemented | Super admin impersonation is unaudited |
| "Switch back" mechanism for super admin | Not implemented | After switching tenant, no documented way to return |

---

## 18. Recommendations and Improvement Priorities

### P0 — Security Critical

1. **Remove fallback JWT secret** — fail-fast in production if `JWT_SECRET` is missing
2. **Remove `MarqAI@2026` self-heal** — replace with admin-side password-reset tool
3. **Add rate limiting** to login, register, forgot-password, tenant-lookup
4. **Add email verification** before issuing JWT on registration
5. **Add audit logging** to `/api/auth/switch-tenant`

### P1 — Functional

6. **Fix home page routing bug** — replace duplicate `admin` checks with correct role strings
7. **Implement true template precedence** (override-by-match) in onboarding cascade
8. **Consolidate leave APIs** — merge `/api/leave/*` and `/api/leaves` into one
9. **Add centralized `isAdminRole()` helper** to replace scattered inline role arrays
10. **Add unit tests** for `isSelfServicePathAllowed` (security-critical path guard)

### P2 — Architecture

11. **Move `PreboardingCandidate` and other runtime-synced models** into the base Prisma schema
12. **Disable `admin/*` and `seed/*` endpoints** in production via environment check
13. **Protect cron endpoints** with a secret token
14. **Consider middleware-level auth enforcement** (centralized route guard)
15. **Add Sentry/error monitoring** for production error tracking

---

## 19. Source File Reference Index

### Authentication & Auth

| File | Lines | Purpose |
|---|---|---|
| `src/lib/auth.ts` | 74 | JWT creation/verification, password hashing |
| `src/lib/token-storage.ts` | 191 | Per-tab session storage shim |
| `src/lib/auth-resolve.ts` | ~100 | Two-phase user lookup (platform → tenant) |
| `src/store/authStore.ts` | 470 | Zustand auth state management |
| `src/middleware.ts` | 200 | Locale + tenant slug detection |
| `src/hooks/useSessionTimeout.ts` | 83 | Idle timeout (30 min / 7 days) |
| `src/app/api/auth/login/route.ts` | 756 | Login endpoint |
| `src/app/api/auth/me/route.ts` | 301 | Current user profile |
| `src/app/api/auth/logout/route.ts` | 108 | Logout endpoint |

### RBAC & Access Control

| File | Lines | Purpose |
|---|---|---|
| `src/lib/roleAccess.ts` | 527 | Role definitions, module access, path guards |
| `src/lib/companyScope.ts` | ~200 | Data scope resolver (all/team/self) |
| `src/lib/managerScope.ts` | ~80 | Manager team scope (direct + dotted reports) |
| `src/lib/ecosystem-access.ts` | ~60 | IDOR protection for vendor/client/PO |
| `src/lib/navData.tsx` | ~900+ | Sidebar navigation with role filtering |

### Database & Multi-Tenancy

| File | Lines | Purpose |
|---|---|---|
| `prisma/schema.prisma` | 8,708 | 295 models |
| `src/lib/tenant-db.ts` | 459 | Per-tenant PrismaClient router |
| `src/lib/tenant-db-provision.ts` | 394 | Auto-provision new tenant DBs |
| `src/lib/db.ts` | ~100 | Platform DB connection |
| `src/lib/schema-sync.ts` | ~50 | Runtime schema drift fix (currently disabled) |
| `prisma/tenant-schema.sql` | 9,337 | DDL for new tenant DBs |

### Key Business Logic

| File | Lines | Purpose |
|---|---|---|
| `src/lib/onboarding-cascade.ts` | 289 | Conversion cascade (offer → employee + preboarding + tasks) |
| `src/lib/recruitment-workflow.ts` | 403 | Workflow config + defaults for all 3 modules |
| `src/lib/attendance-workflow.ts` | — | Attendance business rules |
| `src/lib/leave-workflow.ts` | — | Leave approval chain |
| `src/lib/employee-update-request.ts` | 322 | Field sensitivity + approval engine |
| `src/lib/notification-center.ts` | — | Multi-channel notification dispatch |

---

## 20. Glossary and Technical Terms

| Term | Meaning |
|---|---|
| **Cascade** | The atomic transaction triggered by Convert on an accepted offer: creates employee + preboarding + onboarding tasks + notifications |
| **Conversion Cascade** | Same as Cascade |
| **Data Scope** | `all` (admin), `team` (manager), `self` (employee) — controls data visibility |
| **Golden Rule** | Hidden tenant slugs must be scrubbed from API responses and authStore |
| **JWT** | JSON Web Token (HS256) carrying `{ userId, email, role, tenantId }` |
| **Per-tab isolation** | Token stored in sessionStorage (not cookies) to prevent cross-tab identity bleed |
| **Platform DB** | Shared database storing Tenant, User (super_admin), TenantDatabase |
| **Tenant DB** | Per-tenant isolated database storing all HR data |
| **Tenant slug** | URL-friendly identifier derived from subdomain (e.g., `acme-global.3boxeshrms.com` → `acme-global`) |
| **Token shim** | Monkey-patch on `window.localStorage` and `window.fetch` for per-tab auth |
| **Workflow Configuration** | Admin editor at `/recruitment/workflow-config` with 3 tabs shaping recruitment, preboarding, and onboarding |
| **SoD** | Separation of Duties — payroll calculator cannot be the same user as payroll approver |
| **SLA** | Service Level Agreement — configured days per stage, surfaced on dashboards |
| **BGV** | Background Verification — vendor-run check tracked in preboarding |
| **PII** | Personally Identifiable Information — masked for non-recruiters |
| **IDOR** | Insecure Direct Object Reference — prevented by `ecosystem-access.ts` |
| **FNF** | Full and Final settlement — exit financial calculation |
| **EWA** | Earned Wage Access — marketplace feature for early salary access |

---

> **Document End**  
> This document was generated from source-code analysis of the 3Boxes HRMS codebase. All file paths, function names, and code patterns referenced are from the actual implementation. Where production access was not available, limitations are clearly stated.
