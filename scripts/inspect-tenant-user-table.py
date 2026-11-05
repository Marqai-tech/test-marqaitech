#!/usr/bin/env python3
"""
Check User table structure on tenant DB and whether Madhuri has a tenant-local
User row that also needs a role update.
"""
import psycopg2

TENANT_CONN = "postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2-pooler.c-8.us-east-1.aws.neon.tech/tenant_marqaitechgroup?sslmode=require&connect_timeout=30"

conn = psycopg2.connect(TENANT_CONN)
conn.autocommit = True
cur = conn.cursor()

print("=" * 80)
print("Columns of User table on tenant DB")
print("=" * 80)
cur.execute("""
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'User'
ORDER BY ordinal_position
""")
for r in cur.fetchall():
    print(" | ".join(str(x) for x in r))

print()
print("=" * 80)
print("All rows of User table on tenant DB (id, name, email, role, status)")
print("=" * 80)
cur.execute("""SELECT id, name, email, role, status FROM "User" ORDER BY email""")
cols = [d[0] for d in cur.description]
print(" | ".join(cols))
rows = cur.fetchall()
for r in rows:
    print(" | ".join(str(x) for x in r))
print(f"({len(rows)} rows)")

print()
print("=" * 80)
print("Madhuri's User row on tenant DB (if any)")
print("=" * 80)
cur.execute("""SELECT id, name, email, role, status FROM "User" WHERE email ILIKE '%madhuri%'""")
for r in cur.fetchall():
    print(" | ".join(str(x) for x in r))

cur.close()
conn.close()
