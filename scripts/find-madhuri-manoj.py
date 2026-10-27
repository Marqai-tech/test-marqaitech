#!/usr/bin/env python3
"""
Find Madhuri and Manoj in platform DB + marqaitechgroup tenant DB.
"""
import psycopg2

HOST = "ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech"
USER = "neondb_owner"
PASS = "npg_pxZd8woKe4WB"
CONN_PARAMS = "?sslmode=require&connect_timeout=30"

def get_conn(dbname):
    return psycopg2.connect(f"postgresql://{USER}:{PASS}@{HOST}/{dbname}{CONN_PARAMS}")

def run(conn, sql, label):
    print("=" * 70)
    print(label)
    print("=" * 70)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(sql)
    cols = [d[0] for d in cur.description] if cur.description else []
    rows = cur.fetchall()
    if cols:
        print(" | ".join(cols))
    for r in rows:
        print(" | ".join(str(x) for x in r))
    print(f"({len(rows)} rows)")
    cur.close()

# === 1. Platform DB: Tenant + TenantDatabase + User for marqaitechgroup ===
print("\n########## PLATFORM DB (neondb) ##########")
conn = get_conn("neondb")

run(conn, """
SELECT id, slug, name, status, "createdAt"
FROM "Tenant"
WHERE slug ILIKE '%marqai%' OR name ILIKE '%marqai%'
ORDER BY "createdAt"
""", "Tenants matching 'marqai'")

run(conn, """
SELECT td."databaseName", td."connectionString", td."isActive", t.slug
FROM "TenantDatabase" td
JOIN "Tenant" t ON t.id = td."tenantId"
WHERE t.slug ILIKE '%marqai%'
""", "TenantDatabase rows for marqai tenants")

run(conn, """
SELECT id, name, email, role, "tenantId", status
FROM "User"
WHERE email ILIKE '%madhuri%' OR email ILIKE '%marqaitech%' OR name ILIKE '%madhuri%' OR name ILIKE '%manoj%'
ORDER BY email
""", "Users matching madhuri/manoj/marqaitech on platform DB")

# Try to find all users that look like marqaitech tenant users
run(conn, """
SELECT id, name, email, role, "tenantId", status
FROM "User"
WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE slug ILIKE '%marqai%')
ORDER BY email
""", "All users in marqai tenants (platform DB)")

conn.close()
