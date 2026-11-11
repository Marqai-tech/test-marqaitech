# 3Boxes HRMS — Recruitment Module User Manual
### Complete Step-by-Step Guide: Requisition → Job Posting → Candidate Application → Screening → Interviews → Offer → Onboarding → BGV → Employee Activation

> **All examples below use real test data verified end-to-end on this system.**
> Test candidate: **manoj23434@gmail.com (Manoj Kumar)**
> Test company: Local Dev Company · Test vendor: AcmeVerify Background Checks Pvt Ltd
> Last verified: this exact flow was executed and passed 100% (candidate reached Employee ID `Marq001` and logged into HRMS).

---

## PERSONAS USED IN THIS MANUAL

| Persona | Name | Login Email | Password | Role |
|---|---|---|---|---|
| Hiring Manager | Ravi Prasad | manager@local.3boxeshrms.com | Test@123 | Manager |
| HR Admin | Divya Sharma | hr@local.3boxeshrms.com | Test@123 | HR Admin |
| CEO (Final Approver) | Arun Nair | ceo@local.3boxeshrms.com | Test@123 | CEO |
| **Candidate** | **Manoj Kumar** | **manoj23434@gmail.com** | Manoj@123 (portal) | Job Applicant |
| Vendor Admin | Suresh Gupta | vendoradmin@acmeverify.com | Vendor@123 | Vendor Admin |
| Vendor Verifier | Anil Verma | verifier1@acmeverify.com | Verify@123 | Vendor Employee |
| Employee (after activation) | Manoj Kumar | manoj.kumar@marqaitech.com | Welcome@123 | Employee |

**Login page:** `/login` has 3 tabs: **Employee / HR**, **Job candidate**, **Vendor**.
The public careers page is at **`/careers`** ("Browse Jobs").

---

# PART 1 — MANAGER: CREATE A JOB REQUISITION (with Approval Levels)

**When a job requirement comes, the Manager creates a requisition first. Nothing gets posted before approval.**

### Step 1.1 — Login as Manager
1. Open `/login` → tab **Employee / HR**.
2. Enter `manager@local.3boxeshrms.com` / `Test@123` → **Sign In**.

### Step 1.2 — Open Requisitions
1. Sidebar → **Recruitment → Requisitions** (`/requisitions`).
2. Click the **"Raise Requisition"** button (top right).

### Step 1.3 — Fill the Requisition Form (exact fields)

| Field | Example value used |
|---|---|
| Department * | General |
| Position / Designation | Software Engineer |
| Position Type | New |
| Number of Vacancies | 2 |
| Employment Type | Full-time |
| Priority | High |
| Salary Range / Budget | 800000-1200000 INR/year |
| Required Skills | React, TypeScript, Next.js, Tailwind CSS |
| Experience Required | 3-5 years |
| Qualification | B.Tech / M.Tech in CS |
| Expected Joining Date | 2026-12-01 |
| Reason for Hiring * | "Product team expanding — need 2 frontend developers for the customer portal revamp project" |

3. Click **"Submit for Approval"** (or "Save as Draft" to finish later).
4. The requisition gets ID **REQ-0001** and status **"Pending HR Approval"**. HR roles receive a notification + email.

### Step 1.4 — APPROVAL LEVELS (2-tier workflow)

**Tier 1 — HR Approval:**
1. Login as HR (`hr@local.3boxeshrms.com`) → **Requisitions**.
2. REQ-0001 shows badge **"Pending HR Approval"** → open row → **Approve** (add comment, e.g. "Budget within range, skills match team needs").
3. Status becomes **"Pending Finance Approval"**.

**Tier 2 — Finance / CEO Approval (final):**
1. Login as CEO (`ceo@local.3boxeshrms.com`) → **Requisitions**.
2. REQ-0001 shows **"Pending Finance Approval"** → **Approve** (comment: "Headcount approved for Q4 roadmap").
3. Status becomes **"Approved"** (final: `budget_approved`). The Manager is notified by email.

> Approvals are tenant-configurable (up to 10 tiers — HR / Finance / CEO etc.) via Recruitment Workflow Configuration. The default is the 2 tiers above.
> HR can also **Reject** (with reason) or **Return** it to the Manager for correction at any tier.

---

# PART 2 — HR: CREATE THE JOB POSTING (appears on Careers page)

### Step 2.1 — Create Job Posting from the approved requisition
1. Login as HR → **Requisitions** → REQ-0001 now shows the **"Create Job Posting"** button → click it.
2. The Job Portal form opens pre-filled. Complete these fields:

| Field | Example value used |
|---|---|
| Job Title * | Frontend Developer |
| Department * | General |
| Location | Hyderabad, India |
| Employment Type | Full-time |
| Experience | 3-5 years |
| Salary Range | 800000-1200000 INR |
| Vacancies | 2 |
| Application Deadline | pick a future date |
| Job Description * | "We are looking for a talented Frontend Developer to join our product team…" |
| Requirements | "3-5 years of experience with React and TypeScript…" |

3. Click **"Preview & Publish"** → the posting goes **live** (status `open`). The requisition moves to `In Progress`.

### Step 2.2 — Verify on the Careers page (candidate view)
1. Open **`/careers`** (no login needed — this is the public "Browse Jobs" page linked from the login page's **"Browse Openings"**).
2. The job card shows: **Frontend Developer · Local Dev Company · Hyderabad, India · Full Time**.
3. Filters available: keyword search, location, job type, company. Job stats ("1 open positions across 1 companies") update automatically.

---

# PART 3 — CANDIDATE: APPLY FOR THE JOB (creates their account)

### Step 3.1 — Apply (example: manoj23434@gmail.com)
1. Candidate opens **`/careers`** → finds **Frontend Developer** → clicks **"Apply"**.
2. The Apply modal opens. Fill:

| Field | Example value used |
|---|---|
| Resume * | upload `manoj_resume.pdf` (PDF/DOC/DOCX/RTF/TXT, max 5 MB) — the system **parses it automatically** and pre-fills name/email/phone |
| Full Name * | Manoj Kumar |
| Email * | manoj23434@gmail.com |
| Phone | +91 98765 43210 |
| Expected Salary | ₹10 LPA |
| Cover Letter | short note |

3. Tick all 4 consent checkboxes (Resume processing / Background check / AI evaluation / Video recording) + the **AI Transparency** acknowledgment.
4. Click **"Submit Application"** → success message: *"We've received your application."*

### Step 3.2 — What the system creates automatically
- A **Job Application** with status **`Applied`** (linked to the posting).
- The parsed resume is stored for HR screening.
- Notification + email to the hiring team.
- Idempotency: the same email cannot apply twice to the same job (409).

### Step 3.3 — Candidate sets up their portal account
1. On the success screen click **"Set up my candidate portal →"** (or go to `/candidate-portal/login` anytime).
2. Choose the **OTP** tab → click **"Send OTP"** → a 6-digit code is sent to the candidate's email (in dev/test it is also shown on screen).
3. Enter the OTP → **"Verify & Continue"**.
4. **"Set Your Password"** screen → set e.g. `Manoj@123` → **"Set Password & Continue"**.
5. The **Candidate Dashboard** opens: shows **"Welcome, Manoj Kumar"**, Application Overview (**1 APPLIED**), and links: Onboarding, Resume Builder, Browse Jobs, HRMS.

---

# PART 4 — HR: SCREENING, SHORTLISTING & INTERVIEWS

### Step 4.1 — HR sees the application
1. Login as HR → **Recruitment** (`/recruitment`) → **Jobs** tab → open **Frontend Developer** → **Applicants** tab.
2. Manoj Kumar appears with status **Applied** (resume, contact, expected salary, source).

### Step 4.2 — Move through the pipeline
Use the **Status** dropdown on the applicant row (or drag the card in the Kanban **Pipeline** view):

| Stage | What HR does |
|---|---|
| **Screening** | Review resume (parsed panel shows skills, experience, education). Set status → `Screening`. |
| **Shortlisted** | Candidate passes screening → status `Shortlisted`. Candidate gets an automatic status email at every change. |

**Example (verified):** Manoj was set `Screening` → `Shortlisted`.

### Step 4.3 — Schedule Interview — Round 1
1. Sidebar → **Interviews** (`/interviews`) → **Schedule Interview**.
2. Fill the form:

| Field | Example value used |
|---|---|
| Candidate * | Manoj Kumar (Frontend Developer) |
| Type | Technical |
| Date * | 2026-11-13 |
| Time | 10:30 |
| Duration | 60 min |
| Mode / Meeting Link | Online · https://meet.3boxeshrms.com/tech-round1-manoj |
| Panel * | Ravi Prasad + Keerthan Rao (availability shown per member) |
| Instructions | "Focus on React, TypeScript and system design basics." |

3. Save → the interview gets **Round 1** automatically, the application moves to `Interview`, panel members are notified, double-booking is blocked.

### Step 4.4 — RESCHEDULE (candidate requests another slot)
1. On the interview card → **Reschedule** → new date `2026-11-14`, time `15:00` + reason.
2. Status becomes **`Rescheduled`**, panel confirmations reset, panel + candidate notified.

### Step 4.5 — Feedback & Round 2
1. After the interview, HR/panel record **Feedback + Score** (example: "Strong React fundamentals…" score **78**) → status `Completed`.
2. HR uses the **HR Decision** dropdown → **Next Round** and picks Round-2 details (HR round, 2026-11-16 11:00, panel: Divya Sharma) → **Round 2 is auto-created**.
3. Round 2 completed with feedback (score **85**).

### Step 4.6 — Final decision: OFFER
- HR Decision → **Offer** → the application moves to **`Offered`** and **an Offer draft is created automatically**.

> Other decisions available: Strong Hire, Hire, Hold, Shortlist, Reject, Schedule Another.

---

# PART 5 — HR: OFFER APPROVAL & SENDING

### Step 5.1 — Configure the offer
1. Sidebar → **Offer Dashboard** (`/offers`) → open Manoj's draft offer.
2. Fill: Annual CTC **₹10,00,000**, Joining Date **2026-12-01**, Probation **90 days**, Salary Breakdown, Reporting To.
3. Buttons flow: **"Submit for Approval"** → **"Approve"** → **"Send Offer Letter"**.
4. The system generates the offer letter PDF, mints a secure token link, and emails the candidate: *"Offer of Employment — Frontend Developer"* with a **"View & Respond to Offer →"** button (valid 7 days).

### Step 5.2 — Candidate e-signs & accepts
1. Candidate opens the offer link (`/offer/{token}` — no login needed) or Candidate Portal → **My Offers**.
2. The page shows: **Annual CTC ₹10,00,000 · Joining Date December 1, 2026 · Probation 90 days** + Download Offer Letter.
3. Under **"Record Your Response"**: type full legal name — **"Manoj Kumar"** (this is the legally binding e-signature) → optional comment → **"Accept Offer"**.
4. Confirmation: *"Offer accepted. Welcome aboard!"* — HR + IT are notified instantly. Offer status → `accepted`, application → `hired`.

> **Decline path:** "Decline" requires a written reason; HR is notified, and the candidate may receive a decline survey link.

---

# PART 6 — HR: CONVERT THE CANDIDATE (starts onboarding)

### Step 6.1 — The Convert dialog
1. HR → **Offer Dashboard** → the accepted offer row now shows **"Convert"** → click it.
2. Dialog: **"Convert to Draft Employee — Onboarding"**. Fill ALL details:

| Field | Example value used |
|---|---|
| Joining Date * | 2026-12-01 |
| Start Date | 2026-12-01 |
| Department * | General |
| Designation | Software Engineer |
| Reporting Manager | Ravi Prasad |
| Employment Type | Full-time |
| Annual CTC (INR) * | 1000000 |
| Work Location | Hyderabad |
| Company Email * | manoj.kumar@marqaitech.com |

3. Click **"Convert & Start Onboarding"**.

### Step 6.2 — What the system does instantly
1. Creates a **Draft Employee** record — status **"BGV Pending"** (no Employee ID yet).
2. Creates the candidate's **Candidate Portal account** + internal **HRMS User account** (password `Welcome@123`, **not emailed yet**).
3. **Seeds 6 required documents** (status `Pending`):
   - Aadhaar Card
   - PAN Card
   - Educational Certificate
   - Previous Employment Experience Letter
   - Bank Account Proof
   - Address Proof
4. Candidate receives a portal message: *"Welcome to onboarding! Status: BGV Pending. Please upload your documents."*

---

# PART 7 — CANDIDATE: UPLOAD DOCUMENTS

1. Candidate logs into the Candidate Portal (`/candidate-portal/login`, password `Manoj@123`) → header link **"Onboarding"**.
2. Page shows: **Status: BGV Pending** ("Your Employee ID will be assigned after BGV approval"), Employment Details, and **Required Documents** with a progress bar ("0 of 6 approved").
3. For each document click **"Upload"** → choose file (`.pdf/.doc/.docx/.jpg/.png`, **max 10 MB**) → status flips to **"Submitted"**.
4. **Example (verified):** Manoj uploaded all 6 — Aadhaar Card, PAN Card, Educational Certificate, Experience Letter, Bank Proof, Address Proof → all show **"Submitted"**.

---

# PART 8 — HR: REVIEW DOCUMENTS & MARK AS JOINED

### Step 8.1 — Review and approve documents
1. HR → **Onboarding → Onboarding Review** (`/onboarding-review`).
2. Manoj's card shows: status pill, **"BGV: pending"**, **"6/6 approved"** counter and **"6 pending review"**.
3. Click the row to expand → each document shows filename, upload date and status. For each `Submitted` document click:
   - **Approve (✓)** — or —
   - **Reject (✗)** (a reason is required; the candidate is told to re-upload and the row shows "Rejected — Re-upload Required" in their portal).
4. Candidate portal message per document: *"Your document 'X' has been approved."*

### Step 8.2 — Mark as Joined (provisional access)
1. On the same expanded card click **"Mark as Joined"**.
2. Result (verified): Manoj gets a **temporary Employee ID `PROV-86EYUQWI`**, status **"Provisional Employee"** — *"You have provisional access to attendance and leave. Full access after BGV approval."*
3. His onboarding page now ALSO shows **Attendance (last 30 days)** and **Leave Balances** — he can start working while BGV runs in parallel.

---

# PART 9 — HR: INITIATE BGV WITH THE VENDOR

### Step 9.1 — One-time vendor setup (skip if vendor exists)
1. HR → **Vendors** (`/vendors`) → **"Add Vendor"**: Name `AcmeVerify Background Checks Pvt Ltd`, email `contact@acmeverify.com`, phone, supported checks.
2. Invite the **Vendor Admin**: system emails a set-password link (7-day expiry) → vendor admin opens it → sets `Vendor@123` → account `active`.
3. Add **Vendor Employees** (the verifiers): e.g. `verifier1@acmeverify.com / Anil Verma` (activated with `Verify@123`).

### Step 9.2 — Initiate the BGV request
1. HR → **Onboarding → Onboarding Review** → expand Manoj → click **"Initiate BGV with Vendor"**.
2. The modal opens (candidate pre-filled: Manoj Kumar, manoj23434@gmail.com). Configure:

| Setting | Example value used |
|---|---|
| Vendor Company * | AcmeVerify Background Checks Pvt Ltd |
| Verification Checks * | ✅ Address Verification, ✅ Previous Employment Verification, ✅ Education Verification, ✅ Criminal Record Check, ✅ Identity Verification (Aadhaar/PAN) |
| Share Documents | the 6 approved documents are **pre-selected** (Aadhaar, PAN, Education, Experience, Bank, Address) |
| Due Date | 2026-11-20 |
| Instructions | "Complete all checks within 7 days. Contact HR for discrepancies." |

3. Click **"Send to Vendor"** → BGV Request created with status **"Awaiting Assignment"**; every vendor admin receives an email *"New BGV Request Received"*.

---

# PART 10 — VENDOR ADMIN: ASSIGN THE CASE TO A VERIFIER

1. Vendor admin logs in: `/login` → **Vendor** tab → `vendoradmin@acmeverify.com` / `Vendor@123` → **Sign In as Vendor**.
2. The **Vendor Dashboard** shows stat cards (Unassigned 1 / In Progress / Submitted / Completed) and the section **"AWAITING ASSIGNMENT (1): Manoj Kumar"** with all requested checks.
3. In the row's dropdown **"Assign to team member…"** select **"Anil Verma (verifier1@acmeverify.com)"** → click **"Assign"**.
4. Toast: **"Request assigned"** — the request status becomes **`Assigned`**, the assignment is recorded in history (re-assignments are tracked), and **Anil receives the email "BGV Request Assigned to You"**.

---

# PART 11 — VENDOR VERIFIER: PERFORM THE CHECKS & SUBMIT THE REPORT

1. Verifier logs in (`/login` → Vendor tab → `verifier1@acmeverify.com` / `Verify@123`) → Vendor Dashboard (he sees **only his assigned cases**) → **"Open →"** on Manoj's case.
2. The workspace shows:
   - **Candidate Information** (name, email, status, HR instructions)
   - **Shared Documents (6)** — Aadhaar, PAN, etc. shared by HR, with View links
   - **Verification Checks (5)** — one card per check
3. For **each check** click **"Start"** (status → In Progress, whole request → In Progress), then one of:
   - **"Mark Clear"** — enter findings (example: *"Current address verified via physical visit — matches Aadhaar records."*)
   - **"Discrepancy"** — enter discrepancy details
   - **"Unable to Verify"** — enter the reason
4. Verified example — all 5 checks completed **Clear**:

| Check | Result | Findings (example) |
|---|---|---|
| Address Verification | Clear | Physical visit — address matches Aadhaar |
| Previous Employment Verification | Clear | TechNova confirmed Jul 2022 – Nov 2026 |
| Education Verification | Clear | JNTU confirmed B.Tech, CGPA 8.2 |
| Criminal Record Check | Clear | Police + court records clean |
| Identity Verification | Clear | Aadhaar/PAN match UIDAI/NSDL |

5. Scroll to **"Submit Final Report"**: write the **Summary** (required) → select **Overall Result: Clear** → click **"Submit Report to HR"**.
6. The report is saved as **version v1**; request status → **"Submitted for HR Review"**; HR receives the email *"BGV Report Submitted for Review"*.

---

# PART 12 — HR: FINAL BGV DECISION

**Where:** HR → **Onboarding → BGV Dashboard** (`/bgv-dashboard`) — "Track all Background Verification requests and make final decisions."

The request card shows: candidate, vendor, all 5 checks with results (Clear = green / Discrepancy = red), and the **Latest Report (v1)** with the verifier's summary. Two buttons appear when status = Submitted for Review:

## ✅ PATH A — SUCCESS (verified end-to-end)
1. HR clicks **"Approve"** → toast: **"BGV Approved! Employee ID: Marq001. Activation email sent."**
2. Automatic activation cascade:
   - Real sequential **Employee ID assigned: `Marq001`** (replaces `PROV-…`)
   - Employee record → `active` + `probation` + credentials `active`
   - **Welcome email to the candidate's personal email**: *"Welcome! Your employee account is active"* containing **Employee ID (Marq001) · Company Email (manoj.kumar@marqaitech.com) · Password (Welcome@123) · Login URL**
   - In-app notification: "Welcome to the team!"
3. Candidate's portal status → **"Active Employee"**.
4. **Final proof (verified):** Manoj logged into the HRMS at `/login` (Employee/HR tab) with `manoj.kumar@marqaitech.com` / `Welcome@123` → **Employee dashboard opened showing "MK — Manoj Kumar — Employee"**.
5. Post-activation: HR completes remaining **Onboarding Tasks** (`/onboarding` — IT setup, payroll, training, KRAs) using templates with due-offset days.

## ❌ PATH B — FAILURE (verified end-to-end with test candidate Priya Reddy)
1. Verifier marks checks **"Discrepancy Found"** (e.g. *"Employer untraceable in MCA records"*) → submits report with Overall Result: **Discrepancy Found**.
2. HR on the BGV Dashboard clicks **"Reject"** → must enter the reason.
3. What happens (verified):
   - Request → **`Rejected`**; report stored with HR decision + reason
   - Candidate's BGV status → **`failed`**; onboarding status → **BGV Failed**
   - Candidate receives a portal message: *"Your background verification has not been cleared. Please contact HR for more information."*
   - **The candidate/employee record is NOT deleted** — everything is frozen for review
4. **Recovery:** HR can **re-initiate a new BGV** with the same or a different vendor (verified: a fresh request was created successfully after rejection) — the vendor then submits a **v2 report**; HR makes the final call.

---

# PART 13 — QUICK REFERENCE

### Status flow map
```
REQUISITION:  draft → pending → HR approved → Finance approved (Approved)
JOB POSTING:  open → (applications) → filled/closed
APPLICATION:  applied → screening → shortlisted → interview → offered → hired
INTERVIEW:    scheduled → rescheduled? → completed → (next round | decision)
OFFER:        draft → pending_approval → approved → sent → accepted | rejected
ONBOARDING:   BGV Pending → (docs: pending → submitted → approved/rejected) → Provisional Employee
BGV REQUEST:  awaiting_assignment → assigned → in_progress → submitted_for_hr_review
              → approved_by_hr ✅ | rejected_by_hr ❌ (re-initiation possible)
EMPLOYEE:     PROV-XXXXXXXX (provisional) → MarqNNN (active, probation)
```

### All screens used (in order)
| # | Screen | URL | Persona |
|---|---|---|---|
| 1 | Requisitions | /requisitions | Manager |
| 2 | Requisitions (approve) | /requisitions | HR → CEO |
| 3 | Job Portal | /job-portal | HR |
| 4 | Careers / Browse Jobs | /careers | Candidate |
| 5 | Candidate Portal login/OTP | /candidate-portal/login | Candidate |
| 6 | Recruitment applicants | /recruitment | HR |
| 7 | Interviews | /interviews | HR |
| 8 | Offer Dashboard | /offers | HR |
| 9 | Offer e-sign page | /offer/{token} | Candidate |
| 10 | Convert dialog | /offers → Convert | HR |
| 11 | Onboarding (upload docs) | /candidate-portal/onboarding | Candidate |
| 12 | Onboarding Review | /onboarding-review | HR |
| 13 | Vendors | /vendors | HR |
| 14 | BGV modal | /onboarding-review → Initiate BGV with Vendor | HR |
| 15 | Vendor Dashboard | /vendor-portal/dashboard | Vendor Admin |
| 16 | BGV request workspace | /vendor-portal/requests/{id} | Vendor Employee |
| 17 | BGV Dashboard | /bgv-dashboard | HR |
| 18 | HRMS login (activated employee) | /login | Employee |

### Test data set (as used in this manual)
- Requisition: **REQ-0001** — Frontend Developer, 2 openings, High priority
- Job posting: **Frontend Developer** — Hyderabad, ₹8–12 LPA
- Candidate application: **Manoj Kumar / manoj23434@gmail.com** — applied, screened, shortlisted
- Interviews: **Round 1 Technical** (Ravi + Keerthan, rescheduled to Nov 14 15:00, score 78) · **Round 2 HR** (Divya, Nov 16 11:00, score 85)
- Offer: **₹10,00,000 CTC, joining 2026-12-01, probation 90 days** — accepted (e-signed "Manoj Kumar")
- Draft employee: company email **manoj.kumar@marqaitech.com**, 6 documents all approved
- Provisional ID: **PROV-86EYUQWI** → Final ID: **Marq001**
- BGV: **bgv request via AcmeVerify** — 5 checks all Clear → approved → **Marq001 activated**
- Failure-path test: **Priya Reddy (priya.reddy@gmail.com)** — discrepancy found → rejected → re-initiated successfully

### Known behaviors to be aware of
- Emails require SMTP/Resend configuration; without it the system logs emails instead of sending (flows continue without blocking).
- The offer link is valid **7 days**; the candidate can also respond from the portal's **My Offers** page.
- Document uploads are capped at **10 MB** (resume upload at apply time: **5 MB**).
- Only one active BGV request per candidate at a time; rejected requests can be re-initiated.
- Employee IDs follow the pattern **Marq001, Marq002, …** (sequential, assigned only on BGV approval).

---
*This manual documents the verified behavior of 3Boxes HRMS as of commit ac95e82 (Nov 2026). The complete flow above was executed end-to-end with the listed test data and passed.*
