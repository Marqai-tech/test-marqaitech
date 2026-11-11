# Complete Onboarding + BGV Workflow — Step-by-Step Documentation

## Test Candidate: Manoj Thummala (manoj23434@gmail.com)

Live URL: https://3boxes-hrms-beta.vercel.app

---

## Step 1: HR Logs In
- **Path**: Go to https://3boxes-hrms-beta.vercel.app/login
- **Action**: Enter `madhuri@marqaitech.com` / `MarqAI@2026`
- **Result**: ✅ Login successful (Role: tenant_admin)

## Step 2: HR Creates Vendor Company
- **Path**: Sidebar → Onboarding → BGV Dashboard (or use API)
- **Action**: Create vendor "VerifyRight BGV Services"
- **API**: POST /api/vendors
- **Result**: ✅ Vendor created (ID: vc-xxx)
- **Email sent**: Vendor admin invitation email

## Step 3: HR Converts Candidate to Draft Employee
- **Path**: Sidebar → Recruitment → find candidate → click "Convert to Employee"
- **Action**: Fill form:
  - Joining Date: 2026-12-15
  - Department: (select from dropdown)
  - Designation: (select from dropdown)
  - Employment Type: Full-time
  - CTC: 1,200,000
  - Work Location: Hyderabad
  - Company Email: thummala@marqaitech.com
- **API**: POST /api/onboarding/convert-to-draft
- **Result**: ✅ Draft created
  - PreboardingCandidate ID: pb-xxx
  - Company Email: thummala@marqaitech.com
  - Status: BGV Pending
  - 6 documents seeded (Aadhaar, PAN, Education, Experience, Bank, Address)
  - User account created (thummala@marqaitech.com / Welcome@123)
  - NO credentials sent to candidate yet
- **Notification**: "Onboarding Started" message in candidate portal

## Step 4: Candidate Uploads Documents
- **Path**: Candidate logs into Candidate Portal → click "Onboarding" link
- **Action**: Upload 6 documents:
  1. Aadhaar Card (aadhaar-card.pdf)
  2. PAN Card (pan-card.pdf)
  3. Educational Certificate (education-certificate.pdf)
  4. Experience Letter (experience-letter.pdf)
  5. Bank Account Proof (bank-proof.pdf)
  6. Address Proof (address-proof.pdf)
- **API**: POST /api/onboarding/documents/upload
- **Result**: ✅ Each document status changes from "Pending" → "Submitted"
- **Notification**: HR notified of each document submission

## Step 5: HR Reviews Documents
- **Path**: Sidebar → Onboarding → Onboarding Review
- **Action**: Click on candidate → expand → approve/reject each document
- **API**: PATCH /api/onboarding/documents/[id]/review
- **Result**: ✅ Document status changes to "Approved" or "Rejected"
- **Notification**: Candidate notified of approval/rejection

## Step 6: HR Marks as Joined (Provisional Employee)
- **Path**: Onboarding Review → click "Mark as Joined"
- **API**: POST /api/onboarding/mark-joined
- **Result**: ✅ Status changes to "Provisional Employee"
  - Candidate gets limited access: view attendance, apply for leave, edit profile
  - NO payroll, NO payslips, NO admin features
- **Notification**: "Marked as Joined" message sent to candidate

## Step 7: HR Initiates BGV with Vendor
- **Path**: Onboarding Review → click "Initiate BGV"
- **Action**: Select vendor company, select checks, select documents to share
- **API**: POST /api/bgv/initiate
- **Result**: ✅ BGV request created
  - Status: "Awaiting Assignment"
  - Vendor notified
  - No vendor employee assigned yet

## Step 8: Vendor Admin Assigns Request
- **Path**: Vendor logs in (Vendor tab on /login) → Vendor Dashboard
- **Action**: Click "Assign" on unassigned request
- **API**: POST /api/vendor/requests/[id]/assign
- **Result**: ✅ Status changes to "Assigned"
- **Notification**: Assigned vendor employee notified

## Step 9: Vendor Employee Performs Verification
- **Path**: Vendor Dashboard → click "Open" on assigned request
- **Action**: Update each check:
  - Start verification (pending → in_progress)
  - Record findings (Clear / Discrepancy / Unable to Verify)
  - Submit final report
- **API**: PATCH /api/vendor/requests/[id]/checks/[checkId], POST /api/vendor/requests/[id]/submit-report
- **Result**: ✅ Status changes to "Submitted for HR Review"
- **Notification**: HR notified of report submission

## Step 10: HR Reviews BGV Report
- **Path**: Sidebar → Onboarding → BGV Dashboard
- **Action**: Review check results + report → Approve or Reject
- **API**: POST /api/bgv/requests/[id]/approve
- **Result**: ✅ BGV Approved!

## Step 11: Employee Activation (Automatic on BGV Approval)
- **What happens automatically:**
  1. Employee record created from saved draft details
  2. Employee ID generated: **Marq017** (sequential — Marq001, Marq002, ...)
  3. User account upgraded to full employee role
  4. Activation email sent to candidate's personal email (manoj23434@gmail.com) with:
     - Employee ID: Marq017
     - Company Email: thummala@marqaitech.com
     - Password: Welcome@123
     - Login URL: https://3boxes-hrms-beta.vercel.app/login
  5. In-app welcome notification
  6. Audit log created
- **Result**: ✅ Status changes to "Active Employee"

## Step 12: Employee Logs In to HRMS
- **Path**: Go to https://3boxes-hrms-beta.vercel.app/login
- **Action**: Login with:
  - Company Email: thummala@marqaitech.com + Welcome@123
  - OR Employee ID: Marq017 + Welcome@123
- **Result**: ✅ Full employee self-service access
  - Dashboard, Attendance, Leave, Payroll, Payslips, Profile
  - Employee ID visible: Marq017
  - All attendance/leave history from provisional period preserved

---

## Sample Documents Provided

Located in: `/download/sample-documents/`

| Document | File | Details |
|---|---|---|
| Aadhaar Card | aadhaar-card.pdf | Manoj Thummala, XXXX-XXXX-7892, DOB 15 June 1995 |
| PAN Card | pan-card.pdf | ABCTH1234M, Father: Ramesh Thummala |
| Education Certificate | education-certificate.pdf | B.Tech CSE, JNTU Hyderabad, 2017, CGPA 7.8 |
| Experience Letter | experience-letter.pdf | Software Engineer, Tech Solutions Pvt Ltd, 2017-2023 |
| Bank Account Proof | bank-proof.pdf | HDFC Bank, Savings, IFSC HDFC0001234 |
| Address Proof | address-proof.pdf | Electricity Bill (TSPDCL), October 2026 |

---

## All Statuses

| Status | Description | Access Level |
|---|---|---|
| Candidate | Applied for job | Candidate Portal only |
| BGV Pending | Converted to draft, BGV not started | Onboarding + documents + profile edit |
| Provisional Employee | Joined, BGV still pending | + attendance view + leave apply + profile edit |
| Active Employee | BGV approved, fully activated | Full employee self-service |
| BGV Failed | BGV failed | Restricted (no activation) |
| Rejected | Candidate rejected | No access |
| Withdrawn | Candidate withdrew | No access |

## Employee ID Generation
- Sequential: Marq001, Marq002, Marq003, ... Marq017
- Queries latest Marq-prefixed employeeId in DB
- Increments by 1
- Pads to 3 digits (Marq001..Marq999), then 4 digits (Marq1000+)

## Notifications (10 types)
1. Onboarding started ✅ (CandidateMessage)
2. Documents required ✅ (shown in portal)
3. Documents submitted ✅ (CandidateMessage to HR)
4. Document approved ✅ (CandidateMessage)
5. Document rejected ✅ (CandidateMessage)
6. BGV started ✅ (audit log)
7. BGV approved ✅ (email + notification)
8. BGV failed ✅ (CandidateMessage)
9. Employee account activated ✅ (email + notification)
10. Vendor admin invited ✅ (email)

## Audit History
- CANDIDATE_CONVERTED_TO_DRAFT
- CANDIDATE_MARKED_JOINED_PROVISIONAL
- BGV_APPROVED_EMPLOYEE_ACTIVATED
- BGV_FAILED
- BGV_REQUEST_INITIATED
- BGV_REQUEST_ASSIGNED
- BGV_CHECK_UPDATED
- BGV_REPORT_SUBMITTED
- BGV_APPROVED / BGV_REJECTED
- DOCUMENT_APPROVED / DOCUMENT_REJECTED
- ONBOARDING_DOCUMENT_UPLOADED
- VENDOR_COMPANY_CREATED
- VENDOR_ADMIN_INVITED

---

## Files Changed

### Backend APIs (18 routes):
- src/app/api/onboarding/convert-to-draft/route.ts
- src/app/api/onboarding/bgv/route.ts
- src/app/api/onboarding/mark-joined/route.ts
- src/app/api/onboarding/documents/upload/route.ts
- src/app/api/onboarding/documents/[id]/review/route.ts
- src/app/api/candidate-portal/onboarding/route.ts
- src/app/api/vendors/route.ts
- src/app/api/vendors/[id]/invite-admin/route.ts
- src/app/api/bgv/initiate/route.ts
- src/app/api/bgv/requests/route.ts
- src/app/api/bgv/requests/[id]/approve/route.ts
- src/app/api/bgv/requests/[id]/reject/route.ts
- src/app/api/vendor/requests/route.ts
- src/app/api/vendor/requests/[id]/assign/route.ts
- src/app/api/vendor/requests/[id]/checks/[checkId]/route.ts
- src/app/api/vendor/requests/[id]/submit-report/route.ts

### Frontend Pages (7 pages):
- src/app/candidate-portal/onboarding/page.tsx
- src/app/(dashboard)/onboarding-review/page.tsx
- src/app/(dashboard)/bgv-dashboard/page.tsx
- src/app/vendor-portal/dashboard/page.tsx
- src/app/vendor-portal/requests/[id]/page.tsx
- src/app/login/page.tsx (Vendor Login tab added)
- src/components/hrms/ConvertCandidateButton.tsx (enhanced with full form)

### Database (schema-sync.js):
- 13 new columns on PreboardingCandidate
- 7 new tables: OnboardingDocument, VendorCompany, VendorUser, BgvRequest, BgvCheck, BgvDocumentShare, BgvReport, BgvAssignment

### Other:
- src/lib/tenant-filter.ts (3boxes-hrms.vercel.app added)
- src/app/api/auth/login/route.ts (personal email for employees allowed)
- src/lib/navData.tsx (Onboarding Review + BGV Dashboard nav links)
- src/app/candidate-portal/dashboard/page.tsx (Onboarding link added)
- download/sample-documents/ (6 PDF files)
- download/onboarding-workflow-documentation.md (this document)
