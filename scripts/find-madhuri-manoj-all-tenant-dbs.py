#!/usr/bin/env python3
"""
Find Madhuri & Manoj in ALL 3 tenant DBs on the ep-blue-fire-aqk8jxd2 Neon project,
so we can apply the role + reporting-manager change everywhere the user might log in.
"""
import psycopg2

HOST_POOL = "ep-blue-fire-aqk8jxd2-pooler.c-8.us-east-1.aws.neon.tech"
HOST_DIRECT = "ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech"
USER = "neondb_owner"
PASS = "npg_pxZd8woKe4WB"
CP = "?sslmode=require&connect_timeout=30"

TENANT_DBS = [
    "tenant_3boxes-hrms-demo",
    "tenant_demo",
    "tenant_marqaitechgroup",
]

def conn(db):
    return psycopg2.connect(f"postgresql://{USER}:{PASS}@{HOST_POOL}/{db}{CP}")

for db in TENANT_DBS:
    print("\n" + "#" * 76)
    print(f"# DB: {db}")
    print("#" * 76)
    try:
        c = conn(db); c.autocommit=True; cur=c.cursor()
        # User rows
        cur.execute("""SELECT id, name, email, role, status FROM "User" WHERE email ILIKE %s OR email ILIKE %s""", ('%madhuri%','%manoj%'))
        print("  User rows:")
        for r in cur.fetchall(): print("    ", r)
        # Employee rows
        cur.execute("""SELECT id, "firstName", "lastName", email, "employeeId", "reportingManagerId" FROM "Employee" WHERE email ILIKE %s OR email ILIKE %s""", ('%madhuri%','%manoj%'))
        print("  Employee rows:")
        for r in cur.fetchall(): print("    ", r)
        cur.close(); c.close()
    except Exception as e:
        print("  ERROR:", e)
