#!/usr/bin/env python3
"""
Inspect tenant_marqaitechgroup DB: find Madhuri & Manoj employee records,
show reportingManagerId column, and check User table there too.
"""
import psycopg2

# Tenant DB connection (from TenantDatabase table)
TENANT_CONN = "postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2-pooler.c-8.us-east-1.aws.neon.tech/tenant_marqaitechgroup?sslmode=require&connect_timeout=30"

def get_conn():
    return psycopg2.connect(TENANT_CONN)

def run(cur, sql, label, params=None):
    print("=" * 80)
    print(label)
    print("=" * 80)
    # Escape literal % so psycopg2 doesn't treat them as param placeholders
    if params is None:
        sql = sql.replace('%', '%%')
        cur.execute(sql)
    else:
        cur.execute(sql, params)
    cols = [d[0] for d in cur.description] if cur.description else []
    rows = cur.fetchall()
    if cols:
        print(" | ".join(cols))
    for r in rows:
        print(" | ".join(str(x) for x in r))
    print(f"({len(rows)} rows)")

conn = get_conn()
conn.autocommit = True
cur = conn.cursor()

# 1. Show all employees matching Madhuri / Manoj
run(cur, """
SELECT id, "firstName", "lastName", email, "employeeId", "companyId",
       "reportingManagerId", "departmentId", status
FROM "Employee"
WHERE email ILIKE '%madhuri%' OR email ILIKE '%manoj%'
   OR "firstName" ILIKE '%madhuri%' OR "firstName" ILIKE '%manoj%'
ORDER BY email
""", "Employees matching Madhuri/Manoj in tenant DB")

# 2. Show full employee roster for context (so we know Manoj's current manager etc.)
run(cur, """
SELECT id, "firstName", "lastName", email, "employeeId", "reportingManagerId", status
FROM "Employee"
ORDER BY email
""", "All employees in tenant DB (roster)")

# 3. Show the User table in tenant DB (some systems keep a tenant-local User too)
run(cur, """
SELECT id, name, email, role, "employeeId", "tenantId", status
FROM "User"
ORDER BY email
""", "User table in tenant DB (if exists)")

# 4. Show Employee table columns (so we know the exact reportingManager column name)
run(cur, """
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Employee'
  AND (column_name ILIKE '%report%' OR column_name ILIKE '%manager%')
ORDER BY ordinal_position
""", "Employee table columns matching 'report' or 'manager'")

# 5. Sanity: confirm the User table on tenant DB has the columns we expect
run(cur, """
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'User'
ORDER BY ordinal_position
""", "All columns of User table on tenant DB")

cur.close()
conn.close()
