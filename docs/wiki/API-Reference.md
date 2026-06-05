# API Reference

## Base URL
All API endpoints are relative to the application root: `/api/*`

## Authentication
Authentication is handled via session-based tokens with role validation.

## Common Patterns

### Pagination
Most GET endpoints support pagination:
```
GET /api/employees?page=1&limit=20
Response: { data: [...], pagination: { page, limit, total, totalPages } }
```

### Error Handling
All endpoints return structured error responses:
```json
{ "error": "Error message description" }
```

### Demo Data Fallbacks
When the database is unavailable, all endpoints return comprehensive demo data.

## Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth | Login with email/password |

### Employees
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/employees | List employees (paginated, filterable) |
| POST | /api/employees | Create new employee |
| PUT | /api/employees | Update employee |

### Departments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/departments | List departments |

### Branches
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/branches | List branches |

### Companies
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/companies | List companies |
| POST | /api/companies | Create company |
| PUT | /api/companies | Update company |

### Jobs (Recruitment)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/jobs | List job postings |
| POST | /api/jobs | Create job posting |
| PUT | /api/jobs | Update job posting |

### Candidates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/candidates | List candidates |
| POST | /api/candidates | Create candidate |
| PUT | /api/candidates | Update candidate |

### Interviews
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/interviews | List interviews |
| POST | /api/interviews | Schedule interview |

### Attendance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/attendance | Get attendance records |
| POST | /api/attendance | Check in |
| PUT | /api/attendance | Check out |

### Leaves
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/leaves | List leave requests |
| POST | /api/leaves | Apply for leave |
| PUT | /api/leaves | Update leave |
| PATCH | /api/leaves | Approve/reject leave |

### Payroll
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/payroll | List payroll records |
| POST | /api/payroll | Create payroll |
| PUT | /api/payroll | Update payroll |

### Assets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/assets | List assets |
| POST | /api/assets | Create asset |
| PUT | /api/assets | Update asset |

### Travel
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/travel | List travel requests |
| POST | /api/travel | Create travel request |
| PATCH | /api/travel | Approve/reject travel |

### Expenses
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/expenses | List expenses |
| POST | /api/expenses | Create expense |
| PATCH | /api/expenses | Approve/reject expense |

### Tickets (Helpdesk)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tickets | List tickets |
| POST | /api/tickets | Create ticket |
| PUT | /api/tickets | Update ticket |

### Clients
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/clients | List clients |
| POST | /api/clients | Create client |
| PUT | /api/clients | Update client |

### Vendors
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/vendors | List vendors |
| POST | /api/vendors | Create vendor |

### Compliance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/compliance | List compliance items |
| POST | /api/compliance | Create compliance item |
| PUT | /api/compliance | Update compliance item |

### Workflows
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/workflows | List workflows |
| POST | /api/workflows | Create/initiate workflow |
| PATCH | /api/workflows | Process workflow step |

### Learning
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/learning | List learning records |
| POST | /api/learning | Create learning record |
| PUT | /api/learning | Update learning record |

### Goals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/goals | List goals |
| POST | /api/goals | Create goal |
| PUT | /api/goals | Update goal |

### Surveys
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/surveys | List surveys |
| POST | /api/surveys | Create survey / Submit response |

### Onboarding
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/onboarding | List onboarding tasks |
| POST | /api/onboarding | Create onboarding task |
| PUT | /api/onboarding | Update onboarding task |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/notifications | Get notifications |
| PATCH | /api/notifications | Mark as read |
| DELETE | /api/notifications | Clear notifications |

### Audit
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/audit | List audit logs |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/dashboard | Get dashboard statistics |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/analytics | Get analytics data |

### Shifts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/shifts | List shifts |
