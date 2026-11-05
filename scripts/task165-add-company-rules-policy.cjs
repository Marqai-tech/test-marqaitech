#!/usr/bin/env node
/* Task 165 — seed the "Company Rules to be followed by Employees (Mandatory)"
 * policy into the production Marq AI tenant DB so every active employee sees
 * it in the Employee Dashboard acknowledgement panel + /policies-handbook and
 * can Read & Acknowledge it (PENDING until accepted).
 *
 * Idempotent: safe to re-run. If the policy already exists it is updated
 * (content/description refreshed; version/acks untouched).
 */
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');

const envLine = fs.readFileSync('/home/z/my-project/.env.production.local', 'utf8')
  .split('\n').find((l) => l.startsWith('DATABASE_URL='));
const PLATFORM = envLine ? envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim() : '';

const TITLE = 'Company Rules to be followed by Employees (Mandatory)';

const DESCRIPTION = `Mandatory company rules for all Marq Aitech employees covering attendance & working hours, break times, leave & permission, work responsibilities, office discipline, mobile phone & personal activities, internet & company systems, confidentiality, meetings & communication, dress & personal appearance, workplace respect, company property, security, end-of-day responsibility and the general rule (violation notice). Every employee must read and acknowledge this policy.`;

const CONTENT = `COMPANY RULES TO BE FOLLOWED BY EMPLOYEES (MANDATORY)

──────────────────────────────────────────────
1. ATTENDANCE & WORKING HOURS
──────────────────────────────────────────────
• Employees are expected to report to work on time and follow the company's designated working hours.
• Employees must mark their attendance as required by the company.
• Late arrival or early departure should be informed to the reporting manager in advance.
• Unplanned absence should be communicated to the manager/HR as soon as possible.

Note: Working hours are 9:30 am to 6:30 pm. Grace period is 30 minutes — if anyone comes after 10:00 am they have to be informed in advance.
3 late comings only will be allowed per month; if exceeded, the working day will become a half-day.

──────────────────────────────────────────────
2. BREAK TIME IN OFFICE HOURS
──────────────────────────────────────────────
• Coffee break: 10:30 am & 4:30 pm (10 minutes only).
• Lunch break: 1:30 pm to 2:30 pm.
• Any kind of chit-chats will not happen on the office floor.
• Use your Marq Aitech professional mail for any kind of communication (do not send mails to c3boxes consulting).
• Use the same kind of signature in the mail.
• Every single conversation should happen in the group only (not verbal communication).
• You can post it to where each and every employee is there in the group (Marq AI Tribe).

──────────────────────────────────────────────
3. LEAVE & PERMISSION
──────────────────────────────────────────────
• Leave should be requested and approved in advance wherever possible.
• Employees should not take leave without informing their reporting manager.
• For emergencies, employees should notify their manager/HR at the earliest opportunity.

──────────────────────────────────────────────
4. WORK RESPONSIBILITIES
──────────────────────────────────────────────
• Employees are expected to complete assigned tasks within agreed timelines.
• Employees should keep their reporting manager informed about work progress and any delays.
• Work-related questions or issues should be raised promptly rather than waiting until deadlines.

──────────────────────────────────────────────
5. OFFICE DISCIPLINE
──────────────────────────────────────────────
• Employees should maintain professional behavior and communicate respectfully with colleagues, managers, clients, and visitors.
• Arguments, abusive language, harassment, bullying, or inappropriate behavior will not be tolerated.
• Employees should maintain cleanliness and take care of office property.

──────────────────────────────────────────────
6. MOBILE PHONE & PERSONAL ACTIVITIES
──────────────────────────────────────────────
• Personal phone usage should be kept to a reasonable level during working hours.
• Employees should avoid excessive personal calls, social media, online shopping, gaming, or other non-work activities during work hours.
• Personal activities should not affect work responsibilities or productivity.

──────────────────────────────────────────────
7. INTERNET & COMPANY SYSTEMS
──────────────────────────────────────────────
• Company computers, internet, email, software, and other resources should primarily be used for business purposes.
• Employees must not install unauthorized software or access inappropriate websites using company systems.
• Company passwords and login credentials must be kept confidential.

──────────────────────────────────────────────
8. CONFIDENTIALITY
──────────────────────────────────────────────
• Employees must protect company information, client information, employee information, passwords, documents, and business data.
• Confidential information must not be shared with unauthorized persons.
• Company documents and data should not be copied or transferred without proper authorization.

──────────────────────────────────────────────
9. MEETINGS & COMMUNICATION
──────────────────────────────────────────────
• Employees should join meetings on time and be prepared.
• Employees should respond to important work-related messages within a reasonable time.
• Email, Teams, WhatsApp, or other communication channels should be used professionally.

──────────────────────────────────────────────
10. DRESS & PERSONAL APPEARANCE
──────────────────────────────────────────────
• Employees are expected to maintain a clean and professional appearance appropriate for the workplace.
• Client meetings or company events may require appropriate formal or business-casual attire.

──────────────────────────────────────────────
11. WORKPLACE RESPECT
──────────────────────────────────────────────
• All employees should treat colleagues fairly and respectfully.
• Discrimination, harassment, bullying, intimidation, or inappropriate conduct is not acceptable.
• Employees should maintain a positive and cooperative workplace environment.

──────────────────────────────────────────────
12. COMPANY PROPERTY
──────────────────────────────────────────────
• Employees are responsible for taking reasonable care of laptops, ID cards, access cards, equipment, documents, and other company property assigned to them.
• Loss or damage should be reported to HR/management immediately.

──────────────────────────────────────────────
13. SECURITY
──────────────────────────────────────────────
• Employees should follow all office safety and security procedures.
• Any security concern should immediately be reported to HR or management.

──────────────────────────────────────────────
14. END-OF-DAY RESPONSIBILITY
──────────────────────────────────────────────
Before leaving work, employees should:
• Complete or update their assigned tasks.
• Update the reporting manager on important pending work.
• Save and secure company documents.
• Keep their workstation reasonably clean.
• Ensure company equipment is properly secured.

──────────────────────────────────────────────
15. GENERAL RULE
──────────────────────────────────────────────
• Every employee is expected to use good judgment, maintain professionalism, and act in the best interests of the company and its employees.
• Management reserves the right to take appropriate action in case of repeated or serious violations of company rules, in accordance with applicable company policies and law.
• If any employee breaks a company rule, the employee will receive a professional "Violation Notice".`;

async function main() {
  const platform = neon(PLATFORM);
  const tenants = await platform.query(`
    SELECT t.id AS tenant_id, t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  const t = tenants.find((x) => /marqai/i.test(x.slug));
  if (!t) throw new Error('marqai tenant not found');
  const db = neon(t.cs);
  console.log('== Tenant:', t.slug, t.tenant_id, '==');

  // 0) context: companies + the two mapped employees
  const companies = await db.query(`SELECT id, name FROM "Company" ORDER BY name`);
  console.log('0) companies:', JSON.stringify(companies));

  const emp = await db.query(`
    SELECT e."companyId", c.name AS company_name FROM "Employee" e
    LEFT JOIN "Company" c ON c.id = e."companyId"
    WHERE e."employeeId" IN ('MARQ007','MARQ008')`);
  console.log('   mapped employees companies:', JSON.stringify(emp));

  // 1) existing policies snapshot
  const before = await db.query(`SELECT id, title, version, status, category FROM "Policy" ORDER BY "createdAt"`);
  console.log('1) existing policies:', before.length);
  for (const p of before) console.log(`   - [${p.id}] ${p.title} v${p.version} (${p.status}, ${p.category})`);

  // 2) determine target company: company of MARQ008/MARQ007, else the single/first company
  let companyId = emp.find((r) => r.companyId)?.companyId || companies[0]?.id;
  if (!companyId) throw new Error('no companyId resolved');
  console.log('2) target companyId:', companyId);

  // 3) upsert the policy (idempotent on title + company)
  const existing = await db.query(`SELECT id FROM "Policy" WHERE "companyId" = $1 AND lower(title) = lower($2) LIMIT 1`, [companyId, TITLE]);
  const nowIso = new Date().toISOString();
  let policyId;
  if (existing.length) {
    policyId = existing[0].id;
    await db.query(`
      UPDATE "Policy" SET description = $2, content = $3, category = 'code_of_conduct',
        status = 'active', "effectiveDate" = COALESCE("effectiveDate", $4::timestamptz), "updatedAt" = NOW()
      WHERE id = $1`, [policyId, DESCRIPTION, CONTENT, nowIso]);
    console.log('3) policy UPDATED (id:', policyId + ')');
  } else {
    const ins = await db.query(`
      INSERT INTO "Policy" (id, title, category, description, content, version, status, "effectiveDate", "companyId", "createdAt", "updatedAt")
      VALUES ('pol_task165_' || floor(random() * 1000000000)::text, $1, 'code_of_conduct', $2, $3, '1.0', 'active', $4::timestamptz, $5, NOW(), NOW())
      RETURNING id`, [TITLE, DESCRIPTION, CONTENT, nowIso, companyId]);
    policyId = ins[0].id;
    console.log('3) policy INSERTED (id:', policyId + ')');
  }

  // 4) verify: the row must satisfy the handbook "usable" filter
  const verify = await db.query(`
    SELECT id, title, version, status, category,
      ("effectiveDate" IS NULL OR "effectiveDate" <= NOW()) AS effective_ok,
      ("expiryDate" IS NULL OR "expiryDate" >= NOW()) AS not_expired,
      length(content) AS content_len, "updatedAt"::text
    FROM "Policy" WHERE id = $1`, [policyId]);
  console.log('4) VERIFY:', JSON.stringify(verify));

  // 5) how many active employees will see it as PENDING
  const empCount = await db.query(`SELECT count(*)::int AS n FROM "Employee" WHERE "companyId" = $1`, [companyId]);
  const ackCount = await db.query(`SELECT count(*)::int AS n FROM "PolicyAcknowledgment" WHERE "policyId" = $1`, [policyId]);
  console.log('5) employees in company:', empCount[0].n, '| existing acks for this policy:', ackCount[0].n, '(all employees PENDING until they accept)');
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
