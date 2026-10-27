# 3Boxes HRMS — Code & Data Change Governance

**Effective immediately. Applies to humans AND AI assistants.**

No code or configuration change may reach **GitHub** or **Vercel** — production
(3boxeshrms.com + tenant subdomains) or the demo host
(nexus-hrms-demo.vercel.app) — without an **approved super-admin change
request**. Tenant data changes follow the same approval discipline.

This policy is enforced by the platform's change-control system and the
`scripts/deploy-release.sh` guard.

---

## 1. The only permitted deployment flow

```
1. REGISTER     POST /api/super-admin/change-requests
                (super admin login, platform DB)
                title + description of EXACTLY what will change and why.

2. APPROVE      Super admin (mahesh@marqaitech.com) approves:
                  • via the emailed approval-token link, OR
                  • in-app:  PATCH /api/super-admin/change-requests/{id}
                             { "action": "approve" }
                Request status must be `approved` BEFORE any push/deploy.

3. DEPLOY       Code is pushed / deployed ONLY with the change-request id in
                the commit message:  `Task NNN: ... (CR:<id>)`
                CLI deploys MUST go through scripts/deploy-release.sh, which
                verifies the CR is approved against the live platform API and
                refuses to deploy otherwise.

4. IMPLEMENT    After the deploy is verified, close the loop:
                  PATCH /api/super-admin/change-requests/{id}
                  { "action": "implement", "deployCommit": "<sha>" }
                The change-request trail is the permanent deployment log.
```

Statuses: `pending_approval → approved → implemented` (or `rejected`).
A rejected or pending request authorizes **nothing**.

## 2. Rules by change type

| Change | Requires |
|---|---|
| App code (web app, mobile app, APIs, schema) | Approved CR + `CR:<id>` in commit message |
| Environment variables / domains / Vercel project settings | Approved CR |
| Tenant lifecycle (create, suspend, plan, delete) | Super admin only — platform APIs already enforce this |
| **Tenant links** (workspace subdomain / slug, custom domain) | **Locked.** Slug is immutable through the API for everyone; the custom domain can only be changed by a super admin. Every link change is audited and broadcast (notification + email) to all super admins and the tenant's admins |
| Tenant business data (employees, leaves, payroll…) | Performed inside the tenant by authorized roles; every mutation is written to the tenant AuditLog |
| Emergency hotfix | Register + get approval FIRST, then deploy; the audit trail is the proof |

## 3. Mechanical enforcement in place

- **`scripts/deploy-release.sh`** — refuses any CLI deploy unless it can
  verify an approved change request id against the live platform API.
  AI assistants and operators must use it for every deploy.
- **Super-admin change-request trail** — `/governance` in the app lists every
  request with approver, method, timestamp and `deployCommit` (13+ requests).
- **AuditLog per tenant** — module-level audit of business-data mutations.
- **Tenant APIs** — tenant creation/suspension/plan changes are hard-gated to
  `super_admin`; tenant admins can never alter the platform or other tenants.
- **Tenant-link protection** — `PATCH /api/tenants/[id]` rejects slug changes
  outright (`TENANT_LINK_LOCKED`) and rejects custom-domain changes from
  tenant admins; super-admin link changes trigger platform-wide notification
  + email broadcasts, so a workspace address can never silently move.
- **Mobile app integrity** — method whitelist on the punch API, GPS geofence
  audit notes, and mock-location flags prevent client-side tampering.

## 4. Recommended hardening (super admin, one-time, in the UIs)

1. **GitHub → Settings → Branches → Add rule for `main` and `release`**:
   "Require a pull request before merging" + "Restrict who can push to
   matching branches". (Needs repo-admin — the automation PAT is push-only
   by design, so this cannot be set programmatically.)
2. **Vercel → Project `3-boxes-hrms` → Settings → Git → Production Branch**:
   set to `release`. From then on, pushes to `main` build preview
   deployments only; production updates happen by merging `main` → `release`
   (or CLI `vercel --prod`) — both covered by the CR gate above.
   The `release` branch already exists in GitHub at the last approved commit.

## 5. For AI assistants

Treat this file as binding. Before ANY commit/push/deploy:

1. Register the change request (task106-governance.mjs shows the API shape).
2. Wait for approval (the approval email is sent automatically; the super
   admin can also approve in-app).
3. Commit with `CR:<id>` and deploy via `scripts/deploy-release.sh`.
4. Mark the request implemented with the commit SHA and update worklog.md.
