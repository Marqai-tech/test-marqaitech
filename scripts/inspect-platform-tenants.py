#!/usr/bin/env python3
"""Inspect platform DB (neondb) tenants + user/tenant mapping for demo creds."""
import psycopg2

HOST = "ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech"
USER = "neondb_owner"
PASS = "npg_pxZd8woKe4WB"
DB = "neondb"  # platform DB

conn = psycopg2.connect(host=HOST, user=USER, password=PASS, dbname=DB, sslmode="require")
conn.autocommit = True
cur = conn.cursor()

print("=== PLATFORM DB: Tenants ===")
cur.execute('SELECT id, name, slug, status, plan FROM "Tenant" ORDER BY "createdAt"')
for r in cur.fetchall():
    print(" ", r)

print("\n=== Feature flags module_ for demo tenant ===")
cur.execute('''SELECT key, enabled FROM "FeatureFlag" WHERE "tenantId" = 'cmrmxegjy000604jv9ntgcshh' AND key LIKE 'module_%' ORDER BY key''')
rows = cur.fetchall()
print("  count:", len(rows))
for r in rows:
    print(" ", r)

print("\n=== Subscription plans ===")
try:
    cur.execute('SELECT id, name, status, price FROM "Plan" ORDER BY price LIMIT 10')
    for r in cur.fetchall():
        print(" ", r)
except Exception as e:
    print("  Plan ERROR:", e)
    # try other table names
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%plan%' OR table_name ILIKE '%subscription%' OR table_name ILIKE '%package%')")
    print("  related tables:", [r[0] for r in cur.fetchall()])

cur.close()
conn.close()
