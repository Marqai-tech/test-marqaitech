# Role-Based Access Control

## User Roles (14)

| Role | Label | Description |
|------|-------|-------------|
| super_admin | Super Admin | Full system access across all companies |
| company_hr_admin | HR Admin | HR administration for assigned company |
| hr_executive | HR Executive | Day-to-day HR operations |
| dept_head | Department Head | Department-level management |
| reporting_manager | Reporting Manager | Team management and approvals |
| employee | Employee | Self-service HR portal |
| finance | Finance Team | Payroll and financial operations |
| it_admin | IT Admin | IT asset and system management |
| recruiter | Recruiter | Recruitment and hiring |
| vendor | Vendor | Vendor portal access |
| sub_vendor | Sub-Vendor | Sub-vendor portal access |
| client | Client | Client portal access |
| auditor | Auditor | Compliance and audit review |
| job_seeker | Job Seeker | Job portal and interview access |

## Module Visibility Matrix

| Module | Super Admin | HR Admin | HR Exec | Dept Head | Rep Manager | Employee | Finance | IT Admin | Recruiter |
|--------|:---------:|:-------:|:------:|:--------:|:----------:|:-------:|:------:|:-------:|:--------:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Employees | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Onboarding | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Recruitment | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Job Portal | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| AI Interview | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Attendance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Leave | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Payroll | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Performance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Learning | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Engagement | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Helpdesk | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Travel & Expense | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assets | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| Compliance | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Workflow | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Client Portal | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Vendor Portal | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Analytics | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| AI Chatbot | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Help & Training | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
