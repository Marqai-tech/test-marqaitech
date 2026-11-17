#!/usr/bin/env python3
"""
Apply the requested changes (atomic, idempotent, with before/after verification):

  1. Promote Madhuri to tenant_admin on the PLATFORM DB (neondb) User table.
  2. Promote Madhuri to tenant_admin on the TENANT DB (tenant_marqaitechgroup) User table.
  3. Set Madhuri as Manoj's reporting manager on the TENANT DB Employee table.

Runbook:
  - Madhuri platform User id : cmth8qimx000604jrfjjsdrs2  (email madhuri@marqaitech.com)
  - Madhuri tenant  User id  : cmth8qimx000604jrfjjsdrs2  (same id, separate table)
  - Madhuri Employee id      : cmth8qib3000404jrtjbsjbgf  (EMP-MTPL-008)
  - Manoj   Employee id      : cmth6fvxk000004l5w3gd2kqx  (EMP-MTPL-010, email manoj@marqaitech.com)

These IDs were obtained from scripts/inspect-tenant-madhuri-manoj.py and
scripts/inspect-tenant-user-table.py — re-run those first if anything looks off.
"""
import psycopg2
import sys

HOST = "ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech"
USER = "neondb_owner"
PASS = "npg_pxZd8woKe4WB"
CONN_PARAMS = "?sslmode=require&connect_timeout=30"

PLATFORM_DB = "neondb"
TENANT_CONN = (
    f"postgresql://{USER}:{PASS}@ep-blue-fire-aqk8jxd2-pooler.c-8.us-east-1.aws.neon.tech/"
    f"tenant_marqaitechgroup{CONN_PARAMS}"
)

MADHURI_EMAIL = "madhuri@marqaitech.com"
MADHURI_EMPLOYEE_ID = "cmth8qib3000404jrtjbsjbgf"
MANOJ_EMAIL = "manoj@marqaitech.com"
NEW_ROLE = "tenant_admin"


def show(cur, sql, label):
    cur.execute(sql.replace("%", "%%"))
    cols = [d[0] for d in cur.description]
    print(f"  [{label}] " + " | ".join(cols))
    for r in cur.fetchall():
        print("         " + " | ".join(str(x) for x in r))


def main():
    failures = 0

    # ─────────────────────────────────────────────────────────────────────
    # 1. PLATFORM DB: promote Madhuri to tenant_admin
    # ─────────────────────────────────────────────────────────────────────
    print("\n" + "#" * 76)
    print("# 1. PLATFORM DB (neondb) — promote Madhuri to tenant_admin")
    print("#" * 76)
    plat = psycopg2.connect(f"postgresql://{USER}:{PASS}@{HOST}/{PLATFORM_DB}{CONN_PARAMS}")
    plat.autocommit = True
    cur = plat.cursor()

    print("\nBEFORE:")
    show(cur, f"""SELECT id, name, email, role, status FROM "User" WHERE email = '{MADHURI_EMAIL}'""", "platform User")

    cur.execute(
        """UPDATE "User" SET role = %s, "updatedAt" = NOW() WHERE email = %s RETURNING id, name, email, role, status""",
        (NEW_ROLE, MADHURI_EMAIL),
    )
    updated = cur.fetchall()
    print(f"\nUPDATE returned {len(updated)} row(s).")
    if not updated:
        failures += 1
        print("  !! No row updated on platform DB — aborting step 1.")

    print("\nAFTER:")
    show(cur, f"""SELECT id, name, email, role, status FROM "User" WHERE email = '{MADHURI_EMAIL}'""", "platform User")
    cur.close()
    plat.close()

    # ─────────────────────────────────────────────────────────────────────
    # 2. TENANT DB: promote Madhuri to tenant_admin (tenant-local User row)
    # ─────────────────────────────────────────────────────────────────────
    print("\n" + "#" * 76)
    print("# 2. TENANT DB (tenant_marqaitechgroup) — promote Madhuri to tenant_admin")
    print("#" * 76)
    ten = psycopg2.connect(TENANT_CONN)
    ten.autocommit = True
    cur = ten.cursor()

    print("\nBEFORE:")
    show(cur, f"""SELECT id, name, email, role, status FROM "User" WHERE email = '{MADHURI_EMAIL}'""", "tenant User")

    cur.execute(
        """UPDATE "User" SET role = %s, "updatedAt" = NOW() WHERE email = %s RETURNING id, name, email, role, status""",
        (NEW_ROLE, MADHURI_EMAIL),
    )
    updated = cur.fetchall()
    print(f"\nUPDATE returned {len(updated)} row(s).")
    if not updated:
        failures += 1
        print("  !! No row updated on tenant DB — aborting step 2.")

    print("\nAFTER:")
    show(cur, f"""SELECT id, name, email, role, status FROM "User" WHERE email = '{MADHURI_EMAIL}'""", "tenant User")

    # ─────────────────────────────────────────────────────────────────────
    # 3. TENANT DB: set Madhuri as Manoj's reporting manager
    # ─────────────────────────────────────────────────────────────────────
    print("\n" + "#" * 76)
    print("# 3. TENANT DB (tenant_marqaitechgroup) — Manoj.reportingManagerId = Madhuri")
    print("#" * 76)

    print("\nBEFORE:")
    show(cur, f"""SELECT id, "firstName", "lastName", email, "employeeId", "reportingManagerId" FROM "Employee" WHERE email = '{MANOJ_EMAIL}'""", "Manoj Employee")
    show(cur, f"""SELECT id, "firstName", "lastName", email, "employeeId" FROM "Employee" WHERE email = '{MADHURI_EMAIL}'""", "Madhuri Employee")

    cur.execute(
        """UPDATE "Employee" SET "reportingManagerId" = %s WHERE email = %s RETURNING id, "firstName", "lastName", email, "employeeId", "reportingManagerId" """,
        (MADHURI_EMPLOYEE_ID, MANOJ_EMAIL),
    )
    updated = cur.fetchall()
    print(f"\nUPDATE returned {len(updated)} row(s).")
    if not updated:
        failures += 1
        print("  !! No row updated on tenant Employee — aborting step 3.")

    print("\nAFTER:")
    show(cur, f"""SELECT id, "firstName", "lastName", email, "employeeId", "reportingManagerId" FROM "Employee" WHERE email = '{MANOJ_EMAIL}'""", "Manoj Employee")
    show(cur, f"""SELECT id, "firstName", "lastName", email, "employeeId" FROM "Employee" WHERE email = '{MADHURI_EMAIL}'""", "Madhuri Employee")

    # Show the join so we can SEE Madhuri's name next to Manoj's reportingManagerId.
    # NOTE: do NOT call .replace("%","%%") here — this is a parameterized query
    # using %s placeholders, which psycopg2 expects verbatim.
    print("\nVERIFY (Manoj + his reporting manager name):")
    cur.execute(
        """
        SELECT e."employeeId" AS emp_code, e."firstName" AS emp_first, e.email AS emp_email,
               m."firstName" AS mgr_first, m."lastName" AS mgr_last, m.email AS mgr_email
        FROM "Employee" e
        LEFT JOIN "Employee" m ON m.id = e."reportingManagerId"
        WHERE e.email = %s
        """,
        (MANOJ_EMAIL,),
    )
    cols = [d[0] for d in cur.description]
    print("  [join] " + " | ".join(cols))
    for r in cur.fetchall():
        print("         " + " | ".join(str(x) for x in r))
    cur.close()
    ten.close()

    if failures:
        print(f"\n!! {failures} step(s) failed — investigate.")
        sys.exit(1)
    print("\nALL 3 UPDATES APPLIED SUCCESSFULLY.")


if __name__ == "__main__":
    main()
