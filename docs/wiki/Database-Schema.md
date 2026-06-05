# Database Schema

## Entity Relationship Overview

The NEXUS HRMS database uses 24 Prisma models organized into the following domains:

### Core Models
| Model | Description | Key Fields |
|-------|-------------|------------|
| User | System users with authentication | id, email, name, role, companyId |
| Company | Multi-company support | id, name, code, industry, currency |
| Employee | Employee records | id, employeeId, firstName, lastName, email, designation |
| Department | Company departments | id, name, code, companyId |
| Branch | Company branches/offices | id, name, code, city, companyId |

### Recruitment Models
| Model | Description | Key Fields |
|-------|-------------|------------|
| Job | Job postings/requisitions | id, title, department, location, status, priority |
| Candidate | Job applicants | id, name, email, phone, status, jobId |
| Interview | Interview sessions | id, candidateId, jobId, type, status, scheduledAt |

### Time Management Models
| Model | Description | Key Fields |
|-------|-------------|------------|
| Attendance | Daily attendance records | id, employeeId, checkIn, checkOut, status |
| Leave | Leave requests | id, employeeId, type, startDate, endDate, status |
| Shift | Shift schedules | id, name, startTime, endTime, companyId |

### Finance Models
| Model | Description | Key Fields |
|-------|-------------|------------|
| Payroll | Monthly payroll records | id, employeeId, month, year, basicSalary, netSalary |
| Expense | Expense claims | id, employeeId, type, amount, status |
| TravelRequest | Travel authorizations | id, employeeId, destination, startDate, status, estimatedCost |

### Operational Models
| Model | Description | Key Fields |
|-------|-------------|------------|
| Asset | Company assets | id, name, assetType, status, assignedToId |
| Ticket | Helpdesk tickets | id, subject, category, priority, status |
| Client | Client organizations | id, name, industry, status, companyId |
| Vendor | Vendor organizations | id, name, serviceType, status, companyId |
| OnboardingTask | Employee onboarding tasks | id, employeeId, title, status, dueDate |
| ComplianceItem | Regulatory compliance tracking | id, title, category, status, dueDate, companyId |

### Workflow Models
| Model | Description | Key Fields |
|-------|-------------|------------|
| WorkflowDefinition | Workflow templates | id, name, entity, steps, companyId |
| WorkflowInstance | Running workflow instances | id, definitionId, entityId, status, currentStep |

### Other Models
| Model | Description | Key Fields |
|-------|-------------|------------|
| Goal | Employee goals (OKR/KPI) | id, employeeId, title, type, status, progress |
| Survey | Engagement surveys | id, title, type, status, companyId |
| AuditLog | System audit trail | id, action, entity, entityId, userId, details |
| Notification | User notifications | id, userId, title, message, type, isRead |

## Key Relationships

- **Company** → has many Departments, Branches, Employees, Jobs
- **Employee** → belongs to Company, Department, Branch; has Attendance, Leaves, Payroll, Assets, Goals
- **Job** → has many Candidates; belongs to Company
- **Candidate** → has many Interviews; belongs to Job
- **WorkflowDefinition** → has many WorkflowInstances
