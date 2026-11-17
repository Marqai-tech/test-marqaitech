# Super Admin Change Control Workflow

**Applies to:** every code, configuration, or data change that touches a **super-admin surface** of
3Boxes HRMS (the `/super-admin/*` pages, their APIs under `/api/super-admin/*`, `/api/tenants/*`,
`/api/subscriptions/*`, super-admin data cleanup/provisioning endpoints, and any platform-DB schema
change that alters what the super admin sees).

**Policy since:** Task 95 (October 2026) — requested by mahesh@marqaitech.com.

---

## 1. The Golden Rule

> **No code update may be deployed to the super admin link until the corresponding change request
> has been APPROVED — either by the designated approver (mahesh@marqaitech.com) via the emailed
> approval link, or by the super admin in-app (Super Admin → Change Approvals).**

In addition, the data shown on any super-admin form or module must always be scoped to the tenant
selected in the company switcher. Cross-tenant or sample/dummy data must never appear for a
selected tenant.

## 2. Roles

| Role | Who | Can do |
|------|-----|--------|
| Requester | Anyone proposing a super-admin change (dev team / AI agent / super admin) | Raise a change request |
| Designated approver | **mahesh@marqaitech.com** | Approve/reject via the emailed decision link (no login needed) |
| Super admin (in-app) | superadmin@3boxeshrms.com | Approve/reject in-app; mark approved changes as implemented |

## 3. Workflow

1. **Raise** — The requester creates a Change Request (in-app: Super Admin → Change Approvals →
   *New Change Request*; programmatically: `POST /api/super-admin/change-requests` with
   `title`, `description`, `module`).
   - The platform generates a single-use approval token (valid 7 days).
   - An approval email is sent to **mahesh@marqaitech.com** (override with the
     `CHANGE_APPROVAL_EMAIL` env var) containing a *Review & Decide* link.
   - The request is stored with status `pending_approval` and an audit entry is written.

2. **Decide** — Exactly one of:
   - **Email path:** the approver opens the emailed link
     (`GET /api/super-admin/change-requests/token?token=…`). The link renders a read-only decision
     page (no side effects on prefetch). Clicking *Approve* / *Reject* POSTs the decision.
   - **In-app path:** the super admin opens **Super Admin → Change Approvals** and uses
     *Approve* / *Reject* on the pending row (rejection requires a reason).
   - The token is single-use: after any decision it is cleared and cannot be replayed.
   - Decisions are recorded in the platform `AuditLog` (`governance` module) and attributed to the
     decider (`email_link` → mahesh@marqaitech.com, `in_app` → acting super admin).

3. **Implement & deploy** — Only after a request reaches `approved` may the code change be
   committed and deployed. Once deployed, mark the request `implemented` (in-app *Mark
   Implemented*, optionally with the deploy commit hash) so the audit trail links the approval to
   the release.

4. **Rejected** — A rejected request must not be deployed. A revised proposal requires a NEW
   change request.

## 4. Emergency / hotfix exceptions

A genuine production-breaking incident on a super-admin surface may be hotfixed first, but the
change request MUST be raised (and approved or retroactively acknowledged) within 24 hours, and
the worklog must reference the request ID.

## 5. Data hygiene rules (enforced alongside)

- Sample/dummy tenants (e.g. `acme-global-demo`, `zenith-retail-demo`, `nova-tech-demo`) and
  tenant-less seeded tickets must NOT exist in any production platform DB. Task 95 removed them;
  do not re-seed them.
- The super-admin dashboard follows the company switcher: `GET
  /api/super-admin/dashboard?tenantId=<id>` returns data scoped to that tenant only. The UI sends
  the switcher selection automatically.
- Hidden tenants on each site are governed by `src/lib/tenant-filter.ts`
  (`LIVE_HIDDEN_SLUGS` / `DEMO_HIDDEN_SLUGS`).

## 6. Technical reference

| Artifact | Location |
|----------|----------|
| Data model | `SuperAdminChangeRequest` in `prisma/schema.prisma` (platform DB; table auto-created at build time by `scripts/schema-sync.js`) |
| List / raise API | `GET/POST /api/super-admin/change-requests` |
| In-app decision API | `PATCH /api/super-admin/change-requests/[id]` (approve / reject / implement) |
| Email-token API | `GET/POST /api/super-admin/change-requests/token` |
| UI | `/super-admin/change-approvals` (nav: Super Admin → Change Approvals) |
| Approver email target | `CHANGE_APPROVAL_EMAIL` env var, default `mahesh@marqaitech.com` |
