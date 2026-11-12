# Task 4-h — Preboarding Documents: mock-screen rework audit, hardening + LIVE verification

## User request (verbatim intent)
- Preboarding dashboard → "Verify Documents" used to show ALL candidates' documents mixed in one queue (pending verification / approved / rejected / awaiting) — wanted the mock-screen flow instead.
- Candidate name must be visible when you open a candidate — workspace per the two mock screens (candidate header, 4 summary cards, documents table, right preview panel with Approve/Reject/Request-resubmission + reason/due-date/notify form, activity log, Initiate BGV).
- HR viewing ANY document (image / PDF / Word / anything) must actually display it; plus a Download option.
- Existing tabs Candidates / Documents / Verification — Documents and Verification are the same thing → implement the screens under Documents; left sidebar structure otherwise untouched.

## What commit 11777e4 (previous session, same day) already contained
- `documents/page.tsx` reworked to two-level flow (Level 1 candidates list, Level 2 candidate workspace).
- `src/components/preboarding/DocumentPreview.tsx` — universal viewer (img / iframe-PDF / mammoth-docx / fallback card) with Download + Open full preview.
- `api/preboarding/brd/documents/[id]/file/route.ts` — streams real bytes from base64 data-URLs stored in OnboardingDocument (browsers block top-level data: URL navigation — root cause of "HR cannot view documents").
- `/preboarding/verification` redirects; sidebar merged; dashboard links updated; candidate detail View/Download fixed; documents GET strips base64 columns (hasFile/viewUrl/downloadUrl).
- WHY THE USER STILL SAW THE OLD UI: the commit's Vercel production build was still BUILDING when the user tested.

## Hardening shipped (commit 19cdc5d)
1. `src/lib/schema-sync.ts` — ADD COLUMN IF NOT EXISTS `fileName`/`fileData`/`fileMimeType`/`fileSize` on OnboardingDocument (older tenant DBs missing any column → SELECT in file route fails → silent 404 "Document not found").
2. file route — ES2017-safe regex ([\s\S] instead of s-flag), typed rows (`DocFileRow`) + token claims (`TokenClaims`); passes ESLint (4 errors fixed).

## Live verification (3boxes-hrms-beta.vercel.app, tenant test-marqaitech, login madhuri@marqaitech.com)
| Check | Result |
| --- | --- |
| Level 1 list + filters + per-candidate summary + BGV chip | PASS |
| Sidebar: single merged "Documents" entry (no Verification) | PASS |
| Level 2 workspace header/cards/table/activity | PASS |
| Image preview (PNG, 1122px, no error) | PASS |
| Word preview (.docx → mammoth, 8,799 chars) | PASS |
| PDF preview (blob iframe) | PASS |
| Approve/Reject/Resubmit + replacement form fields | PASS (opened, then cancelled — no mutation) |
| Download (`?download=1`) | PASS — 200, correct MIME, attachment disposition, 15,356 bytes |
| `/preboarding/verification` → redirects to Documents | PASS |

## Deployment notes
- 11777e4 build went READY and was verified live before hardening.
- 19cdc5d did not auto-deploy (GitHub webhook miss) → production deployment created via Vercel API `gitSource` (ref 19cdc5d).
- Screenshots: verify-1-workspace.png, verify-3-word-preview.png, verify-4-pdf-preview.png, verify-5-resubmit-form.png (agent working dir / download folder of that session).
