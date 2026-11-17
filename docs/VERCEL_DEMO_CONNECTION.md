# Demo Deployment (nexus-hrms) — Reconnect or Make Independent

> ## ⚡ STATUS UPDATE (Task 100, Oct 16) — READ THIS FIRST
> **Option B is DONE.** The current test link is **`nexus-hrms-demo.vercel.app`**
> (project `nexus-hrms-demo`, project ID `prj_yOsBojQSP3GdgKEE8rFQVjrDKxqh`,
> org/team `team_ALrSsdNlfJYe6FxgR59NEG6N` — the same account as production).
> It is deployed from the latest code and hosts 100% sample data
> (4 sample tenants, 7 sample companies, 60 sample employees — zero real MarqAI data).
>
> **`nexus-hrms-mu.vercel.app` is DEPRECATED.** It lives on the old Vercel
> account, is frozen at a Task-95-era build, and can no longer receive updates
> (its cron config is rejected on the old account's plan — every build attempt
> fails). Ignore it; delete it from the old account when convenient.
>
> **CI auto-deploy — FULLY ARMED (Task 100-b):** all three secrets
> (`VERCEL_TOKEN`, `VERCEL_ORG_ID_DEMO`, `VERCEL_PROJECT_ID_DEMO`) are stored
> on the repo. The demo was ALSO already redeployed to the latest main via CLI
> (build `dpl_EErbhtP7w6vUk4dS1uP2qMQ4CaeZ`), so the test link is 100%
> code-current right now. The single remaining activation step: GitHub repo →
> Actions → paste `docs/vercel-deploy.yml.txt` as
> `.github/workflows/vercel-deploy.yml` (Create workflow → paste → commit).
> From the next push, every commit to `main` auto-deploys the demo link.
>
> **Alternative (no secrets at all):** install the Vercel GitHub App on
> `maheshkpreddy/nexus-hrms` and connect project `nexus-hrms-demo` to it
> (Vercel → nexus-hrms-demo → Settings → Git → Connect).
>
> Everything below is the original Task-97 analysis, kept for history.

## Situation
- The demo link `nexus-hrms-mu.vercel.app` is hosted on an **old Vercel account**.
- Its Git integration is NOT connected to the current GitHub account
  (`maheshkpreddy/nexus-hrms`), so every push "falls back": the demo production
  stays on the last good build (`06dec53e`, pre-Task-95) and new deployments
  fail. The LIVE project (`3-boxes-hrms`) is unaffected and builds green on the
  same commits.
- No Vercel API token exists in the sandbox, so the connection itself must be
  fixed in a Vercel dashboard. Everything below is click-by-click.

## Option A — Reconnect the old account (fastest, keeps the same URL, ~5 min)
1. Log into the **old Vercel account** (the one that owns the `nexus-hrms`
   project / `nexus-hrms-mu.vercel.app`).
2. Open project **nexus-hrms** → **Settings → Git**.
3. Under "Git Integration", disconnect the stale/disconnected repository.
4. Click **Connect Git Repository** → GitHub → when the GitHub authorization
   page opens, **sign in as `maheshkpreddy`** (or install the Vercel GitHub App
   on the `maheshkpreddy/nexus-hrms` repo if already signed in).
5. Select `maheshkpreddy/nexus-hrms`, branch `main`, save.
6. **Deployments** tab → latest → **Redeploy** (menu ⋯) — confirm.
7. Verify: the new deployment goes green and `nexus-hrms-mu.vercel.app` serves
   the Task 94/95 modules (super-admin change-approvals page etc.).

## Option B — Make the demo independent on the CURRENT account (~15 min)
1. Log into the **current Vercel account** (the one hosting `3-boxes-hrms`).
2. **Add New… → Project** → Import `maheshkpreddy/nexus-hrms`.
3. Name it (e.g. `nexus-hrms-demo`) — it gets a new `*.vercel.app` URL.
   The old `nexus-hrms-mu.vercel.app` cannot be moved between accounts.
4. **Settings → Environment Variables**: copy all variables from the old
   project (old account → nexus-hrms → Settings → Environment Variables).
   Minimum set used by the code:
   `DATABASE_URL`, `JWT_SECRET`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`,
   `SITE_MODE` (=`demo`), `NEXT_PUBLIC_SITE_MODE`, `CRON_SECRET`,
   `ETIMEOFFICE_*` (only if biometric sync is used on demo), any
   `RESEND_API_KEY` / SMTP vars used for demo email.
   Tip: CLI shortcut — `vercel link` old project → `vercel env pull old.env` →
   link new project → `vercel env add < old.env` (production).
5. Deploy once (Vercel builds it) and confirm the new URL works.
6. Optional: attach a custom domain (Settings → Domains), e.g.
   `demo.3boxeshrms.com`. After attaching, tell us the final host so it can be
   added to `DEMO_DOMAINS` in `src/lib/site-mode.ts` + `src/middleware.ts`
   (one-line change) — demo mode and tenant resolution are host-based.
7. When done, the old project can be deleted on the old account.

## Option C — CI deploys via Vercel CLI (integration-independent, ready to install)
The workflow content is ready at **`docs/vercel-deploy.yml.txt`**. It deploys
via the Vercel CLI using repo secrets, so it works **no matter which Vercel
account hosts the project** and no matter what happens to GitHub App
connections:
1. Install the workflow (one-time; the sandbox PAT lacks the `workflow` scope,
   so GitHub rejected pushing `.github/workflows/` directly):
   - Easiest: on GitHub → repo → **Add file → Create new file** → path
     `.github/workflows/vercel-deploy.yml` → paste the full content of
     `docs/vercel-deploy.yml.txt` → commit to `main`.
   - Or update the PAT with the `workflow` scope and let us push it.
2. Vercel dashboard → project → Settings → copy **Vercel ID** (org) and
   **Project ID**; create an **API token** (Account Settings → Tokens).
3. GitHub repo → Settings → Secrets and variables → Actions → add:
   - `VERCEL_TOKEN`, `VERCEL_ORG_ID_DEMO`, `VERCEL_PROJECT_ID_DEMO` (demo), and
     optionally `VERCEL_TOKEN_LIVE`, `VERCEL_ORG_ID_LIVE`, `VERCEL_PROJECT_ID_LIVE`.
4. Every push to `main` then deploys through CI. Without the secrets the
   workflow skips cleanly (no failing checks).
   (Adding secrets needs repo admin — the sandbox PAT has push-only rights, so
   add them in the GitHub UI or hand over an admin PAT/token.)

## Recommendation
- Need the demo working **right now**: do **Option A**.
- Want a durable setup: do **Option B** (single current account) **and** add the
  **Option C** secrets so deploys no longer depend on any Git integration.
