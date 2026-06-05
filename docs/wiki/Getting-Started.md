# Getting Started

## Prerequisites

- **Node.js** 20+ (or Bun runtime)
- **PostgreSQL** database (or Neon serverless)
- **Git** for version control

## Installation

```bash
# Clone the repository
git clone https://github.com/maheshkpreddy/nexus-hrms.git
cd nexus-hrms

# Install dependencies
bun install

# Generate Prisma client
bun run prisma generate

# Set up environment variables
cp .env.example .env
# Edit .env with your POSTGRES_URL

# Start development server
bun dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_URL` | Yes | PostgreSQL connection string |

## Login Credentials

The application comes with demo login credentials:
- **Email**: admin@nexushrms.com
- **Password**: admin123

If the database is unavailable, the application automatically falls back to demo data.

## Demo Data

When the database connection fails, all 26 API routes return comprehensive demo data:
- 10 employees across 7 departments and 3 branches
- 6 job postings with 7 candidates
- Payroll records, attendance, leaves, and more
- All demo data uses consistent IDs (comp-1, dept-1 through dept-7, branch-1 through branch-3)

## Development Workflow

1. Create a feature branch from main
2. Make changes and test locally
3. Push to GitHub
4. Vercel auto-deploys from the main branch
5. Verify deployment at nexus-hrms-mu.vercel.app
