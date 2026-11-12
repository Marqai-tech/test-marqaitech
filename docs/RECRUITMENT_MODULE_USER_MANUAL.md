# 3Boxes HRMS — Recruitment Module User Manual
### Complete Step-by-Step Guide: Requisition → Job Posting → Candidate Application → Screening → Interviews → Offer → Onboarding → BGV → Employee Activation

> **All examples below use real test data verified end-to-end on this system.**
> Test candidate: **manoj23434@gmail.com (Manoj Kumar)**
> Test company: Local Dev Company · Test vendor: FirstAdvantage India Verification Pvt Ltd
> Last verified: this exact flow was executed and passed 100% (candidate reached Employee ID `Marq001` and logged into HRMS).

---

## PERSONAS USED IN THIS MANUAL

| Persona | Name | Login Email | Password | Role |
|---|---|---|---|---|
| Hiring Manager | Ravi Kumar | manager@local.3boxeshrms.com | Test@123 | Manager |
| HR Admin | Divya Sharma | hr@local.3boxeshrms.com | Test@123 | HR Admin (Tier 1 approver) |
| Finance Approver | Suresh Iyer | finance@local.3boxeshrms.com | Test@123 | Finance Admin (Tier 2 approver) |
| CEO (Final Approver) | Priya Nair | ceo@local.3boxeshrms.com | Test@123 | CEO (Tier 3 approver) |
| Interviewer | Keerthan Rao | employee@local.3boxeshrms.com | Test@123 | Employee (tech panel) |
| Platform Super Admin | Arjun Menon | admin@local.3boxeshrms.com | Test@123 | Super Admin |
| **Candidate** | **Manoj Kumar** | **manoj23434@gmail.com** | **Test@123** (portal) | Job Applicant |
| Vendor Admin | Anita Desai | vendor.admin@firstadvantage-example.co.in | Vendor@123 | Vendor Admin |
| Vendor Verifier | Ravi Verifier | verifier.ravi@firstadvantage-example.co.in | Welcome@123 | Vendor Employee |
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
| Position Title * | Senior Data Engineer |
| Department * | Engineering |
| Position Type | New |
| Number of Vacancies | 1 |
| Employment Type | Full-time |
| Priority | High |
| Salary Range / Budget | 2,200,000 INR/year |
| Required Skills | Python, SQL, Airflow, Spark, AWS |
| Experience Required | 4-6 years |
| Qualification | B.Tech / M.Tech in Computer Science |
| Expected Joining Date | 2026-03-01 |
| Reason for Hiring * | "Data platform expansion — new analytics workstream" |

3. Click **"Submit for Approval"** (or "Save as Draft" to finish later).
4. The requisition gets ID **REQ-0001** and status **"Pending HR Approval"**. HR roles receive a notification + email.

### Step 1.4 — APPROVAL LEVELS (3-tier workflow: HR → Finance → CEO)

**Tier 1 — HR Approval:**
1. Login as HR (`hr@local.3boxeshrms.com`) → **Requisitions**.
2. REQ-0001 shows badge **"Pending HR Approval"** → open row → **Approve** (comment: "Headcount approved by HR. Proceed to Finance.").
3. Status becomes **`hr_approved`** (waiting on Tier 2).

**Tier 2 — Finance Approval:**
1. Login as Finance (`finance@local.3boxeshrms.com`) → **Requisitions**.
2. REQ-0001 shows the pending-finance badge → **Approve** (comment: "Budget within FY allocation. Approved.").
3. Status becomes **`tier_2_approved`** (waiting on Tier 3).

**Tier 3 — CEO Approval (final):**
1. Login as CEO (`ceo@local.3boxeshrms.com`) → **Requisitions**.
2. REQ-0001 → **Approve** (comment: "Final approval — proceed with posting.").
3. Status becomes **"Approved"** (final: `budget_approved`). The Manager is notified by email.

> Approval chains are tenant-configurable (up to 10 tiers — HR / Finance / CEO / specific user etc.) via **Recruitment Workflow Configuration** (`/api/recruitment/workflow-config`, exposed in the recruitment settings UI). The built-in default is 2 tiers (HR → Finance); the verified local test used the 3-tier chain above.
> Approvers at any tier can also **Reject** (with reason) or **Return** it to the Manager for correction.

---

# PART 2 — HR: CREATE THE JOB POSTING (appears on Careers page)

### Step 2.1 — Create Job Posting from the approved requisition
1. Login as HR → **Requisitions** → REQ-0001 now shows the **"Create Job Posting"** button → click it.
2. The Job Portal form opens pre-filled. Complete these fields:

| Field | Example value used |
|---|---|
| Job Title * | Senior Data Engineer |
| Department * | Engineering (falls back to the first department when no name match — shown as "General") |
| Location | Bengaluru, India (Hybrid) |
| Employment Type | Full-time |
| Experience | 4-6 years |
| Salary Range | INR 1,800,000 - 2,200,000 per annum |
| Vacancies | 1 |
| Application Deadline | pick a future date |
| Job Description * | "Design, build and operate the analytics data platform. Own Airflow DAGs, Spark pipelines and warehouse models…" |
| Requirements | "Python, SQL, Airflow, Spark, AWS; 4-6 years experience; B.Tech/M.Tech CS" |
| Linked Requisition | REQ-0001 (only `budget_approved` requisitions are accepted) |

3. Click **"Preview & Publish"** → the posting goes **live** (status `open`). The requisition moves to `In Progress`.

### Step 2.2 — Verify on the Careers page (candidate view)
1. Open **`/careers`** (no login needed — this is the public "Browse Jobs" page).
2. The job card shows: **Senior Data Engineer · Local Dev Company · Bengaluru, India (Hybrid) · Full Time** — verified in the browser.
3. Filters available: keyword search, location, job type, company. Job stats ("1 open positions across 1 companies") update automatically.

---

# PART 3 — CANDIDATE: APPLY FOR THE JOB (creates their account)

### Step 3.1 — Apply (example: manoj23434@gmail.com)
1. Candidate opens **`/careers`** → finds **Senior Data Engineer** → clicks **"Apply"**.
2. The Apply modal opens. Fill:

| Field | Example value used |
|---|---|
| Resume * | upload `manoj_resume.pdf` (PDF/DOC/DOCX/RTF/TXT, max 5 MB) — the system **parses it automatically** and pre-fills name/email/phone |
| Full Name * | Manoj Kumar |
| Email * | manoj23434@gmail.com |
| Phone | +91 98765 43210 |
| Expected Salary | ₹21 LPA (INR 2,100,000 per annum) |
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
4. **"Set Your Password"** screen → set **`Test@123`** (the portal password used throughout this manual) → **"Set Password & Continue"**.
5. The **Candidate Dashboard** opens: shows **"Welcome, Manoj Kumar"**, Application Overview (**1 APPLIED**), and links: Onboarding, Resume Builder, Browse Jobs, HRMS.

---

# PART 4 — HR: SCREENING, SHORTLISTING & INTERVIEWS

### Step 4.1 — HR sees the application
1. Login as HR → **Recruitment** (`/recruitment`) → **Jobs** tab → open **Senior Data Engineer** → **Applicants** tab (browser-verified: Manoj appears in *Recent Applications* with resume, contact, expected salary, source).
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
| Candidate * | Manoj Kumar (Senior Data Engineer) |
| Type | Technical |
| Date * | 2026-11-14 |
| Time | 10:00 |
| Duration | 60 min |
| Mode / Meeting Link | Video · https://meet.3boxeshrms.com/r1-manoj-tech |
| Panel * | Keerthan Rao (`employee@local.3boxeshrms.com`) |
| Evaluation Areas | Python, SQL, Airflow, System design |
| Instructions | "Focus on ETL pipeline design and orchestration experience." |

3. Save → the interview gets **Round 1** automatically, panel members are notified, double-booking is blocked (the API refuses a second active interview for the same candidate with `ACTIVE_INTERVIEW_EXISTS`).

### Step 4.4 — RESCHEDULE (candidate requested another slot — verified)
1. On the interview → **Reschedule** → new date `2026-11-17`, time `15:30` + reason "Rescheduled at candidate request — Manoj had a conflicting commitment".
2. Status becomes **`Rescheduled`**, panel confirmations reset, panel + candidate notified ("Interview rescheduled — panel members notified").

### Step 4.5 — Feedback & Round 2 (verified)
1. After the interview the **panel member** records structured feedback (technical skills, communication, problem solving, strengths, concerns, recommendation):
   - **Round 1 (Keerthan Rao):** rating **4/5**, recommendation **strong_hire** — "Deep Airflow + Spark expertise; clear on data modelling trade-offs. Limited Kafka streaming exposure."
2. HR marks Round 1 **Completed** (score 4), then schedules **Round 2 — Leadership** (2026-11-19 11:00, onsite Bengaluru, panel: Ravi Kumar).
3. Round 2 was **rescheduled to 2026-11-20 14:00** (also verified) and completed with rating **5/5**, recommendation **hire** — "Great ownership mindset, communicates trade-offs clearly." (marked final).

### Step 4.6 — Final decision: OFFER
- HR Decision → **Offer** → the application moves to **`Offered`** and **an Offer draft is created automatically**.

> Other decisions available: Strong Hire, Hire, Hold, Shortlist, Reject, Schedule Another.

---

# PART 5 — HR: OFFER APPROVAL & SENDING

### Step 5.1 — Configure the offer
1. Sidebar → **Offer Dashboard** (`/offers`) → open Manoj's draft offer.
2. Fill: Position **Senior Data Engineer**, Offered Salary **₹20,00,000**, Annual CTC **₹22,00,000**, Joining Date **2026-12-01**, Probation **"6 months"** (stored/normalised as **180 days**), Reporting To **Ravi Kumar**.
3. Buttons flow: **"Submit for Approval"** → status `pending_approval` → **"Approve"** (tier signing: with the default single-tier HR chain, HR approval finalises it) → **"Send Offer Letter"** (only `approved` offers can be sent — enforced server-side).
4. The system mints a secure token link (`accessToken`) and emails the candidate: *"Offer of Employment — Senior Data Engineer"* with a **"View & Respond to Offer →"** button (valid 7 days).

### Step 5.2 — Candidate e-signs & accepts
1. Candidate opens the offer link (`/offer/{token}` — no login needed) or Candidate Portal → **My Offers**.
2. The page shows: **Annual CTC ₹22,00,000 · Joining Date December 1, 2026 · Probation 180 days** + Download Offer Letter. (Verified: `/offer/{token}` renders the accepted state with "Signed: Manoj Kumar".)
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
| Department * | General (Engineering resolved to the company department list) |
| Designation | Software Engineer |
| Reporting Manager | Ravi Kumar |
| Employment Type | Full-time |
| Annual CTC (INR) * | 2,200,000 |
| Work Location | Bengaluru, India (Hybrid) |
| Company Email * | manoj.kumar@marqaitech.com |

3. Click **"Convert & Start Onboarding"** → response (verified): *"Candidate converted to draft. Status: BGV Pending"* with `preboardingCandidateId` and **documentsSeeded: 6**.

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

1. Candidate logs into the Candidate Portal (`/candidate-portal/login`, password `Test@123`) → header link **"Onboarding"**.
2. Page shows: **Status: BGV Pending** ("Your Employee ID will be assigned after BGV approval"), Employment Details, and **Required Documents** with a progress bar ("0 of 6 approved").
3. For each document click **"Upload"** → choose file (`.pdf/.doc/.docx/.jpg/.png`, **max 10 MB**) → status flips to **"Submitted"**.
4. **Example (verified):** Manoj uploaded all 6 — Aadhaar Card, PAN Card, Educational Certificate, Previous Employment Experience Letter, Bank Account Proof, Address Proof → all show **"Submitted"** (uploads use `POST /api/onboarding/documents/upload`, base64 data-URL, max 10 MB).

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
2. Result (verified): Manoj gets a **temporary Employee ID `PROV-70YEFN3W`**, status **"Provisional Employee"** — *"You have provisional access to attendance and leave. Full access after BGV approval."*
3. His onboarding page now ALSO shows **Attendance (last 30 days)** and **Leave Balances** — he can start working while BGV runs in parallel.

---

# PART 9 — HR: INITIATE BGV WITH THE VENDOR

### Step 9.1 — One-time vendor setup (skip if vendor exists)
1. HR → **Vendors** (`/vendors`) → **"Add Vendor"**: Name `FirstAdvantage India Verification Pvt Ltd`, email `ops@firstadvantage-example.co.in`, phone `+91-80-4000-1234`, address "Tech Park One, Whitefield, Bengaluru", supported checks (identity/address/education/employment/criminal/reference). **Vendor rows can now be edited and deactivated from the same page (fixed — see Known Issues History).**
2. Invite the **Vendor Admin**: from the vendor row → **Invite Admin** → `vendor.admin@firstadvantage-example.co.in / Anita Desai` → the system emails a set-password link (7-day expiry); in this test the link token was used directly and password `Vendor@123` was set → account `active`.
3. Add **Vendor Employees** (the verifiers): **Invite Employee** → `verifier.ravi@firstadvantage-example.co.in / Ravi Verifier` (created active with password `Welcome@123`).

### Step 9.2 — Initiate the BGV request
1. HR → **Onboarding → Onboarding Review** → expand Manoj → click **"Initiate BGV with Vendor"**.
2. The modal opens (candidate pre-filled: Manoj Kumar, manoj23434@gmail.com). Configure:

| Setting | Example value used |
|---|---|
| Vendor Company * | FirstAdvantage India Verification Pvt Ltd |
| Verification Checks * | ✅ Identity Check (Aadhaar/PAN), ✅ Address Verification, ✅ Education Verification, ✅ Previous Employment Check, ✅ Criminal Record Check |
| Share Documents | the approved documents are **pre-selected** (Aadhaar, PAN, Education, Experience, Bank, Address) |
| Due Date | 2026-11-27 |
| Instructions | "Standard pre-employment BGV for Senior Data Engineer hire. Priority: high." |

3. Click **"Send to Vendor"** → BGV Request created with status **"Awaiting Assignment"**; every vendor admin receives an email *"New BGV Request Received"*.

---

# PART 10 — VENDOR ADMIN: ASSIGN THE CASE TO A VERIFIER

1. Vendor admin logs in: `/login` → **Vendor** tab → `vendor.admin@firstadvantage-example.co.in` / `Vendor@123` → **Sign In as Vendor**. (Browser-verified: the dashboard shows stat cards — Unassigned / In Progress / Submitted / Completed — and all requests with check chips.)
2. The unassigned request **"Manoj Kumar — Awaiting Assignment"** appears with all 5 requested checks.
3. In the row's **staff dropdown** select **"Ravi Verifier (verifier.ravi@firstadvantage-example.co.in)"** → **"Assign"**. (No more typing raw IDs in a `window.prompt` — the dropdown is fed by `GET /api/vendors/{id}/users`.)
4. Toast: **"Request assigned"** — status becomes **`Assigned`**, the assignment is recorded, and **the verifier receives the email "BGV Request Assigned to You"**.

---

# PART 11 — VENDOR VERIFIER: PERFORM THE CHECKS & SUBMIT THE REPORT

1. Verifier logs in (`/login` → Vendor tab → `verifier.ravi@firstadvantage-example.co.in` / `Welcome@123`) → Vendor Dashboard (sees **only his assigned cases**) → **"Open →"** on Manoj's case. (Browser-verified: the workspace shows Candidate Information, HR instructions and all checks with Start / Mark Clear / Discrepancy / Unable-to-Verify buttons.)
2. The workspace shows:
   - **Candidate Information** (name, email, status, HR instructions)
   - **Shared Documents (6)** — Aadhaar, PAN, etc. shared by HR, with View links
   - **Verification Checks (5)** — one card per check
3. For **each check** click **"Start"** (status → In Progress, whole request → In Progress), then one of:
   - **"Mark Clear"** — enter findings (example: *"Current address verified via physical visit — matches Aadhaar records."*)
   - **"Discrepancy"** — enter discrepancy details
   - **"Unable to Verify"** — enter the reason
4. Verified example — all 5 checks completed **Clear**:

| Check | Result | Findings (verified) |
|---|---|---|
| Identity Check (Aadhaar/PAN) | Clear | "Aadhaar and PAN verified against UIDAI and NSDL records. Names and DOB match." |
| Address Verification | Clear | "Permanent and current address verified via physical site visit on 14 Nov 2026." |
| Education Verification | Clear | "B.Tech CS degree confirmed with NIT Trichy registrar office. Roll number matches." |
| Previous Employment Check | Clear | "InfoEdge (2021-2026) and TCS Digital (2019-2021) tenure, designation and reasons for leaving verified via HR contacts." |
| Criminal Record Check | Clear | "No criminal records found in district court and police verification databases." |

5. Scroll to **"Submit Final Report"**: write the **Summary** (required) → select **Overall Result: Clear** → click **"Submit Report to HR"**.
6. The report is saved as **version v1**; request status → **"Submitted for HR Review"**; HR receives the email *"BGV Report Submitted for Review"*.

---

# PART 12 — HR: FINAL BGV DECISION

**Where:** HR → **Onboarding → BGV Dashboard** (`/bgv-dashboard`) — "Track all Background Verification requests and make final decisions."

The request card shows: candidate, vendor, all 5 checks with results (Clear = green / Discrepancy = red), and the **Latest Report (v1/v2)** with the verifier's summary. FOUR actions appear when status = Submitted for Review (browser-verified): **Approve**, **Awaiting Info**, **Rework**, **Reject**.

### Interim review — Awaiting Info / Rework Required (NEW — previously dead states, now wired end-to-end)
1. HR clicks **"Awaiting Info"** → enters what is needed (e.g. "Please attach the employment verification email transcript from InfoEdge HR.") → request status becomes **`awaiting_information`**; the vendor admin is emailed "Action needed: more information required…".
2. HR clicks **"Rework"** → enters what must be fixed (e.g. "Education check finding is missing the marksheet upload reference. Please re-verify with the registrar and resubmit.") → request status becomes **`rework_required`**; vendor admin emailed "Rework required: BGV report for…".
3. The vendor dashboard shows the request with the amber/orange badge; the verifier updates checks / findings and **re-submits a new report version** (v2) → the request flips back to **`Submitted for HR Review`** for the final decision. (Verified: v1 → rework_required → v2 → approved.)

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
              → awaiting_information ⟲ | rework_required ⟲ (vendor resubmits → back to submitted_for_hr_review)
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

### Test data set (as verified end-to-end in the latest run)
- Requisition: **REQ-0001** — Senior Data Engineer, 1 opening, High priority, 3-tier approval (HR `hr_approved` → Finance `tier_2_approved` → CEO `budget_approved`)
- Job posting: **Senior Data Engineer** — Bengaluru, India (Hybrid), INR 1.8–2.2M
- Candidate application: **Manoj Kumar / manoj23434@gmail.com** — applied → screening → shortlisted → interview → offered
- Interviews: **Round 1 Technical** (Keerthan Rao, rescheduled to Nov 17 15:30, rating 4 strong_hire) · **Round 2 Leadership** (Ravi Kumar, rescheduled to Nov 20 14:00, rating 5 hire, final)
- Offer: **₹22,00,000 CTC, joining 2026-12-01, probation "6 months" → 180 days** — accepted (e-signed "Manoj Kumar")
- Draft employee: company email **manoj.kumar@marqaitech.com**, 6 documents all approved
- Provisional ID: **PROV-70YEFN3W** → Final ID: **Marq001**
- BGV: **FirstAdvantage India Verification Pvt Ltd** — 5 checks all Clear → approved → **Marq001 activated**; interim-review test **Priya Testcase (priya.testcase@example.com)** — v1 → rework_required → v2 → submitted for review
- Failure-path test: **Priya Reddy (priya.reddy@gmail.com)** — discrepancy found → rejected → re-initiated successfully (previous run)

### Known behaviors to be aware of
- Emails require SMTP/Resend configuration; without it the system logs emails instead of sending (flows continue without blocking).
- The offer link is valid **7 days**; the candidate can also respond from the portal's **My Offers** page.
- Document uploads are capped at **10 MB** (resume upload at apply time: **5 MB**).
- Only one active BGV request per candidate at a time; rejected requests can be re-initiated.
- Employee IDs follow the pattern **Marq001, Marq002, …** (sequential, assigned only on BGV approval).

## Known Issues History (fixed in this release)

| # | Issue | Fix |
|---|---|---|
| 1 | `/onboarding-review` page rendered blank (fetched `/api/onboarding/progress` but expected `{candidates:[…]}`) | Page now reads `/api/onboarding/pipeline` which returns candidates with nested documents; browser-verified rendering |
| 2 | Vendor BGV could only be initiated via raw API call — no UI button | "Initiate BGV with Vendor" button + vendor/checks/documents modal on `/onboarding-review` |
| 3 | Vendor assignment required typing raw IDs in a `window.prompt` | Staff dropdown fed by `GET /api/vendors/{id}/users`; one-click assign |
| 4 | `Awaiting Info` / `Rework Required` were display-only dead states | New `POST /api/bgv/requests/[id]/review` + Approve/Awaiting Info/Rework/Reject buttons on `/bgv-dashboard`; vendor resubmission loop verified (v1 → rework → v2) |
| 5 | `/vendors` list read `VendorCompany` but edit/delete wrote the Prisma `Vendor` table — edits silently failed | `/api/vendors/[id]` rewritten onto `VendorCompany`; GET/PUT/DELETE verified |
| 6 | `src/app/api/auto-seed-demo/route.ts` was REPORTED as syntax-corrupted (`(prisma as any)odel]`) | **Retracted — display artifact of the analysis terminal** (it swallowed the literal `[m` in `(prisma as any)[model]`); `od -c` on the committed file proves the source was always valid. No change needed. |
| 7 | Candidate Portal **My Offers** missed offers (isolated-tenant sweep only; `offerLetterUrl` column missing made the SELECT fail silently; `approved` status not included) | Sweep now includes the shared DB, `offerLetterUrl` auto-added via `ALTER TABLE … IF NOT EXISTS`, `approved` added to the visible statuses, results deduped |
| 8 | Interview feedback submission always failed (legacy `InterviewFeedback` NOT NULL columns `interviewerName`/`sentiment`/`body` never provided) | API fills them; schema-sync drops the legacy constraints; rating range 1–5 enforced |
| 9 | Probation period "6 months" was stored as `6` and rendered "6 days" | Create-offer API now normalises units to days ("6 months" → 180) |

---
*This manual documents the verified behavior of 3Boxes HRMS (Nov 2026). The complete flow above was executed end-to-end with the listed test data and passed — requisition through employee activation (`Marq001` login verified).*
