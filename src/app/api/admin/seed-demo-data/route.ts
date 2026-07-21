/**
 * POST /api/admin/seed-demo-data
 *
 * Admin-only endpoint that seeds comprehensive demo data directly
 * using the app's Prisma client (no child process needed).
 *
 * Runs in batches to stay within Vercel's function timeout.
 * Call multiple times with different modules, or use module="all" for full seed.
 *
 * Body: { confirm: true, module?: "all" | "core" | "employees" | "hr" | "projects" | "finance" | "support" }
 */
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import bcryptjs from 'bcryptjs';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

const DEMO_PASSWORD_HASH = bcryptjs.hashSync('MarqAI@2026', 12);

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

/** Safe Prisma operation — catches table-not-exists errors and returns 0 */
async function safeOp(fn: () => Promise<number>, label: string): Promise<number> {
  try { return await fn(); }
  catch (e: any) {
    console.warn(`[Seed Demo] Skipping ${label}: ${e?.message?.substring(0, 100) || e}`);
    return 0;
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const role = (decoded as any).role;
    if (!['super_admin', 'tenant_admin', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403, headers: corsHeaders() });
    }

    let body: { confirm?: boolean; module?: string } = {};
    try { body = await request.json(); } catch { /* empty */ }

    if (!body.confirm) {
      return NextResponse.json({
        message: 'Send { confirm: true, module: "all"|"core"|"employees"|"hr"|"projects"|"finance"|"support" } to proceed.',
        modules: { all: 'Full seed (may timeout - call individual modules instead)', core: 'Tenant + Companies + Branches + Depts + Designations + Shifts + Holidays + Leave Types', employees: 'Users + Employees + Company Mappings + Dependents + Qualifications + Skills', hr: 'Leave Balances + Leave Requests + Attendance + Performance + Goals + Training', projects: 'Projects + Tasks + Milestones + Clients + Vendors + Invoices', finance: 'Salary Structures + Payroll Components + Loans + Overtime + Expenses + Travel', support: 'Tickets + Policies + Documents + Recognitions + Notifications + Announcements + Audit Logs' },
      }, { headers: corsHeaders() });
    }

    const mod = body.module || 'all';
    const results: Record<string, number> = {};
    const errors: string[] = [];
    const startTime = Date.now();

    // Helper to run a module section safely
    async function runSection(name: string, fn: () => Promise<void>) {
      try { await fn(); }
      catch (e: any) { errors.push(`${name}: ${e?.message?.substring(0, 200) || String(e)}`); console.warn(`[Seed Demo] Error in ${name}:`, e?.message?.substring(0, 200)); }
    }

    // ── CORE ──
    if (mod === 'all' || mod === 'core') {
    await runSection('core', async () => {
      // Ensure tenant exists
      let tenant = await getPlatformDb().tenant.findUnique({ where: { slug: '3boxes-hrms-demo' } });
      if (!tenant) {
        tenant = await getPlatformDb().tenant.create({
          data: {
            name: '3 Boxes HRMS Demo', slug: '3boxes-hrms-demo',
            domain: 'nexus-hrms-mu.vercel.app', plan: 'enterprise', status: 'active',
            country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata',
            aiFeedbackEnabled: true, resumeScoreThreshold: 0, talentPoolCrossCompanyEnabled: true,
          },
        });
      }
      results.tenant = 1;

      // Company Group
      let cg = await db.companyGroup.findFirst({ where: { tenantId: tenant.id } });
      if (!cg) {
        cg = await db.companyGroup.create({ data: { name: '3 Boxes Enterprise Group', tenantId: tenant.id } });
      }

      // Companies
      const existingCompanies = await db.company.findMany({ where: { companyGroupId: cg.id } });
      let tcg = existingCompanies.find(c => c.code === 'TCG');
      let mpi = existingCompanies.find(c => c.code === 'MPI');
      let hfs = existingCompanies.find(c => c.code === 'HFS');

      if (!tcg) tcg = await db.company.create({ data: { name: 'TechCorp Global', code: 'TCG', companyGroupId: cg.id, country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata', city: 'Hyderabad', state: 'TG', email: 'info@techcorp.com', status: 'active' } });
      if (!mpi) mpi = await db.company.create({ data: { name: 'ManufactPro Industries', code: 'MPI', companyGroupId: cg.id, country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata', city: 'Mumbai', state: 'MH', email: 'info@manufactpro.com', status: 'active' } });
      if (!hfs) hfs = await db.company.create({ data: { name: 'HealthFirst Solutions', code: 'HFS', companyGroupId: cg.id, country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata', city: 'Bengaluru', state: 'KA', email: 'info@healthfirst.com', status: 'active' } });
      results.companies = 3;

      // Branches
      const existingBranches = await db.branch.findMany({ where: { companyId: { in: [tcg.id, mpi.id, hfs.id] } } });
      if (existingBranches.length < 6) {
        const branchData = [
          { name: 'Hyderabad HQ', code: 'TCG-HYD', city: 'Hyderabad', state: 'TG', companyId: tcg.id },
          { name: 'Mumbai Office', code: 'TCG-MUM', city: 'Mumbai', state: 'MH', companyId: tcg.id },
          { name: 'Mumbai Factory', code: 'MPI-MUM', city: 'Mumbai', state: 'MH', companyId: mpi.id },
          { name: 'Pune Plant', code: 'MPI-PUN', city: 'Pune', state: 'MH', companyId: mpi.id },
          { name: 'Bengaluru HQ', code: 'HFS-BLR', city: 'Bengaluru', state: 'KA', companyId: hfs.id },
          { name: 'Chennai R&D', code: 'HFS-MAA', city: 'Chennai', state: 'TN', companyId: hfs.id },
        ];
        for (const b of branchData) {
          if (!existingBranches.find(eb => eb.code === b.code)) {
            await db.branch.create({ data: { ...b, country: 'IN', status: 'active' } });
          }
        }
        results.branches = 6;
      }

      // Departments
      const allBranches = await db.branch.findMany({ where: { companyId: { in: [tcg.id, mpi.id, hfs.id] } } });
      const existingDepts = await db.department.findMany({ where: { companyId: { in: [tcg.id, mpi.id, hfs.id] } } });
      if (existingDepts.length < 24) {
        const DEPT_NAMES = ['Engineering', 'Human Resources', 'Finance', 'Operations', 'Sales & Marketing', 'Quality Assurance', 'Research & Development', 'Administration'];
        const DEPT_CODES = ['ENG', 'HR', 'FIN', 'OPS', 'SAL', 'QA', 'RND', 'ADM'];
        for (const company of [tcg, mpi, hfs]) {
          const companyBranches = allBranches.filter(b => b.companyId === company.id);
          for (let i = 0; i < DEPT_NAMES.length; i++) {
            const code = `${company.code}-${DEPT_CODES[i]}`;
            if (!existingDepts.find(d => d.code === code)) {
              await db.department.create({
                data: { name: DEPT_NAMES[i], code, companyId: company.id, branchId: companyBranches[0]?.id, status: 'active' },
              });
            }
          }
        }
        results.departments = 24;
      }

      // Designations
      const allDepts = await db.department.findMany({ where: { companyId: { in: [tcg.id, mpi.id, hfs.id] } } });
      const existingDesgs = await db.designation.findMany({ where: { departmentId: { in: allDepts.map(d => d.id) } } });
      if (existingDesgs.length < 18) {
        const DESG_TITLES = [
          { title: 'Vice President', level: 8, minSalary: 3500000, maxSalary: 6000000 },
          { title: 'Senior Manager', level: 7, minSalary: 2500000, maxSalary: 4000000 },
          { title: 'Manager', level: 6, minSalary: 1800000, maxSalary: 3000000 },
          { title: 'Team Lead', level: 5, minSalary: 1200000, maxSalary: 2200000 },
          { title: 'Senior Associate', level: 4, minSalary: 800000, maxSalary: 1500000 },
          { title: 'Associate', level: 3, minSalary: 500000, maxSalary: 1000000 },
        ];
        for (const company of [tcg, mpi, hfs]) {
          const companyDepts = allDepts.filter(d => d.companyId === company.id);
          for (const desgDef of DESG_TITLES) {
            const dept = pick(companyDepts);
            await db.designation.create({
              data: { title: desgDef.title, departmentId: dept.id, level: desgDef.level, minSalary: desgDef.minSalary, maxSalary: desgDef.maxSalary, status: 'active' },
            });
          }
        }
        results.designations = 18;
      }

      // Shifts (may not exist in deployed schema)
      results.shifts = await safeOp(async () => {
        const existingShifts = await db.shift.findMany({ where: { companyId: { in: [tcg.id, mpi.id, hfs.id] } } });
        if (existingShifts.length >= 3) return 0;
        await db.shift.create({ data: { name: 'General Shift', code: 'GS', startTime: '09:00', endTime: '18:00', companyId: tcg.id, status: 'active', graceMinutes: 15, isNight: false } });
        await db.shift.create({ data: { name: 'Factory Shift A', code: 'FA', startTime: '07:00', endTime: '15:00', companyId: mpi.id, status: 'active', graceMinutes: 10, isNight: false } });
        await db.shift.create({ data: { name: 'Lab Shift', code: 'LS', startTime: '08:00', endTime: '16:30', companyId: hfs.id, status: 'active', graceMinutes: 15, isNight: false } });
        return 3;
      }, 'shifts');

      // Leave Types
      const existingLTs = await db.leaveType.findMany();
      if (existingLTs.length < 6) {
        const ltData = [
          { name: 'Casual Leave', code: 'CL', defaultDays: 12, isPaid: true, carryForward: true, maxCarryForward: 3 },
          { name: 'Sick Leave', code: 'SL', defaultDays: 10, isPaid: true, carryForward: false },
          { name: 'Earned Leave', code: 'EL', defaultDays: 15, isPaid: true, carryForward: true, maxCarryForward: 5 },
          { name: 'Maternity Leave', code: 'ML', defaultDays: 180, isPaid: true, carryForward: false },
          { name: 'Paternity Leave', code: 'PL', defaultDays: 15, isPaid: true, carryForward: false },
          { name: 'Compensatory Off', code: 'CO', defaultDays: 1, isPaid: true, carryForward: true, maxCarryForward: 2 },
        ];
        for (const lt of ltData) {
          if (!existingLTs.find(e => e.code === lt.code)) {
            await db.leaveType.create({ data: { ...lt, status: 'active' } as any });
          }
        }
        results.leaveTypes = 6;
      }

      // Holidays (may not exist in deployed schema)
      results.holidays = await safeOp(async () => {
        const existingHolidays = await db.holiday.findMany({ where: { companyId: { in: [tcg.id, mpi.id, hfs.id] } } });
        if (existingHolidays.length >= 10) return 0;
        const HOLIDAYS = [
          { name: 'Republic Day', date: new Date('2026-01-26'), type: 'national' },
          { name: 'Holi', date: new Date('2026-03-14'), type: 'festival' },
          { name: 'Independence Day', date: new Date('2026-08-15'), type: 'national' },
          { name: 'Gandhi Jayanti', date: new Date('2026-10-02'), type: 'national' },
          { name: 'Dussehra', date: new Date('2026-10-20'), type: 'festival' },
          { name: 'Diwali', date: new Date('2026-11-08'), type: 'festival' },
          { name: 'Christmas', date: new Date('2026-12-25'), type: 'festival' },
        ];
        for (const company of [tcg, mpi, hfs]) {
          for (const h of HOLIDAYS) {
            await db.holiday.create({ data: { name: h.name, date: h.date, type: h.type, companyId: company.id, status: 'active' } });
          }
        }
        return HOLIDAYS.length * 3;
      }, 'holidays');
    }); // end core section
    }

    // ── EMPLOYEES ──
    if (mod === 'all' || mod === 'employees') {
    await runSection('employees', async () => {
      const tenant = await getPlatformDb().tenant.findUnique({ where: { slug: '3boxes-hrms-demo' } });
      if (!tenant) return NextResponse.json({ error: 'Run "core" module first to create tenant' }, { status: 400, headers: corsHeaders() });

      const companies = await db.company.findMany({ where: { companyGroupId: { not: null } }, take: 3 });
      const allDepts = await db.department.findMany({ where: { companyId: { in: companies.map(c => c.id) } } });
      const allDesgs = await db.designation.findMany({ where: { departmentId: { in: allDepts.map(d => d.id) } } });
      const allBranches = await db.branch.findMany({ where: { companyId: { in: companies.map(c => c.id) } } });

      if (companies.length < 3) return NextResponse.json({ error: 'Run "core" first' }, { status: 400, headers: corsHeaders() });

      // Users
      const existingUsers = await db.user.findMany({ where: { tenantId: tenant.id } });

      // Create super_admin if not exists
      let superAdminUser = existingUsers.find(u => u.role === 'super_admin' && u.email === 'superadmin@3boxeshrms.com');
      if (!superAdminUser) {
        superAdminUser = await db.user.create({ data: { email: 'superadmin@3boxeshrms.com', password: DEMO_PASSWORD_HASH, name: 'Super Admin', role: 'super_admin', status: 'active', tenantId: tenant.id } });
      }

      // Create tenant_admin
      let tenantAdminUser = existingUsers.find(u => u.role === 'tenant_admin');
      if (!tenantAdminUser) {
        tenantAdminUser = await db.user.create({ data: { email: 'tenantadmin@3boxeshrms.com', password: DEMO_PASSWORD_HASH, name: 'Tenant Admin', role: 'tenant_admin', status: 'active', tenantId: tenant.id } });
      }

      // HR Admins
      const hrAdminEmails = ['hr.tcg@3boxeshrms.com', 'hr.mpi@3boxeshrms.com', 'hr.hfs@3boxeshrms.com'];
      const hrAdminNames = ['Anitha Reddy', 'Suresh Iyer', 'Deepa Nair'];
      const hrAdminUsers = [];
      for (let i = 0; i < 3; i++) {
        let hrUser = existingUsers.find(u => u.email === hrAdminEmails[i]);
        if (!hrUser) {
          hrUser = await db.user.create({ data: { email: hrAdminEmails[i], password: DEMO_PASSWORD_HASH, name: hrAdminNames[i], role: 'hr_admin', status: 'active', tenantId: tenant.id } });
        }
        hrAdminUsers.push(hrUser);
      }

      // Manager Users
      const mgrEmails = ['mgr1@3boxeshrms.com', 'mgr2@3boxeshrms.com', 'mgr3@3boxeshrms.com', 'mgr4@3boxeshrms.com', 'mgr5@3boxeshrms.com', 'mgr6@3boxeshrms.com'];
      const mgrNames = ['Rajesh Kumar', 'Pooja Sharma', 'Vikram Patel', 'Sunita Joshi', 'Arun Menon', 'Kavitha Raman'];
      const mgrUsers = [];
      for (let i = 0; i < mgrEmails.length; i++) {
        let mgr = existingUsers.find(u => u.email === mgrEmails[i]);
        if (!mgr) {
          mgr = await db.user.create({ data: { email: mgrEmails[i], password: DEMO_PASSWORD_HASH, name: mgrNames[i], role: 'manager', status: 'active', tenantId: tenant.id } });
        }
        mgrUsers.push(mgr);
      }

      // Employee Users
      const EMP_NAMES = [
        { first: 'Amit', last: 'Verma' }, { first: 'Bharathi', last: 'Krishnan' }, { first: 'Chandra', last: 'Shekhar' },
        { first: 'Divya', last: 'Prasad' }, { first: 'Eshwar', last: 'Rao' }, { first: 'Fatima', last: 'Begum' },
        { first: 'Ganesh', last: 'Acharya' }, { first: 'Harini', last: 'Subramanian' }, { first: 'Irfan', last: 'Khan' },
        { first: 'Janaki', last: 'Raman' }, { first: 'Karthik', last: 'Gopal' }, { first: 'Lakshmi', last: 'Devi' },
        { first: 'Manoj', last: 'Tiwari' }, { first: 'Nandini', last: 'Rathore' }, { first: 'Om', last: 'Prakash' },
        { first: 'Padma', last: 'Lakshmi' }, { first: 'Qadir', last: 'Hussain' }, { first: 'Ritu', last: 'Singh' },
        { first: 'Sanjay', last: 'Gupta' }, { first: 'Tanuja', last: 'Mishra' }, { first: 'Uday', last: 'Kiran' },
        { first: 'Vasundhara', last: 'Das' }, { first: 'Wasim', last: 'Akram' }, { first: 'Xena', last: 'Fernandes' },
        { first: 'Yogesh', last: 'Pandey' }, { first: 'Zeenat', last: 'Bano' }, { first: 'Anil', last: 'Kapoor' },
        { first: 'Bhanu', last: 'Pratap' }, { first: 'Chitra', last: 'Venkatesh' }, { first: 'Dinesh', last: 'Kumar' },
      ];

      const empUsers = [];
      for (const name of EMP_NAMES) {
        const email = `${name.first.toLowerCase()}.${name.last.toLowerCase()}@3boxeshrms.com`;
        let empUser = existingUsers.find(u => u.email === email);
        if (!empUser) {
          empUser = await db.user.create({ data: { email, password: DEMO_PASSWORD_HASH, name: `${name.first} ${name.last}`, role: 'employee', status: 'active', tenantId: tenant.id } });
        }
        empUsers.push({ ...empUser, firstName: name.first, lastName: name.last });
      }
      results.users = 1 + 1 + 3 + 6 + EMP_NAMES.length; // 41

      // Create Employee records
      const existingEmps = await db.employee.findMany({ where: { companyId: { in: companies.map(c => c.id) } } });

      // Super Admin Employee
      if (!existingEmps.find(e => e.employeeId === 'EMP-SYS-SUP001')) {
        await db.employee.create({
          data: { employeeId: 'EMP-SYS-SUP001', firstName: 'Super', lastName: 'Admin', email: superAdminUser.email, userId: superAdminUser.id, departmentId: allDepts[0]?.id, designationId: allDesgs[0]?.id, branchId: allBranches[0]?.id, companyId: companies[0].id, dateOfJoining: new Date('2020-01-01'), dateOfBirth: new Date('1980-01-01'), gender: 'male', nationality: 'Indian', city: 'Hyderabad', state: 'TG', country: 'IN', status: 'active', salary: 5000000, salaryCurrency: 'INR' },
        });
      }

      // HR Admin Employees
      for (let i = 0; i < 3; i++) {
        const empCode = `EMP-${companies[i].code}-HR001`;
        if (!existingEmps.find(e => e.employeeId === empCode)) {
          const nameParts = hrAdminNames[i].split(' ');
          const companyDepts = allDepts.filter(d => d.companyId === companies[i].id);
          const hrDept = companyDepts.find(d => d.name === 'Human Resources') || companyDepts[0];
          const companyDesgs = allDesgs.filter(d => companyDepts.some(cd => cd.id === d.departmentId));
          const desg = companyDesgs.find(d => d.title === 'Senior Manager') || companyDesgs[0];
          await db.employee.create({
            data: { employeeId: empCode, firstName: nameParts[0], lastName: nameParts[1] || '', email: hrAdminUsers[i].email, userId: hrAdminUsers[i].id, departmentId: hrDept.id, designationId: desg.id, branchId: allBranches.filter(b => b.companyId === companies[i].id)[0]?.id, companyId: companies[i].id, dateOfJoining: new Date('2020-03-15'), dateOfBirth: new Date('1985-06-20'), gender: i % 2 === 0 ? 'female' : 'male', nationality: 'Indian', city: companies[i].city, state: companies[i].state, country: 'IN', status: 'active', salary: 1800000 + i * 200000, salaryCurrency: 'INR' },
          });
        }
      }

      // Manager Employees
      for (let i = 0; i < mgrUsers.length; i++) {
        const companyIdx = Math.floor(i / 2);
        const company = companies[Math.min(companyIdx, companies.length - 1)];
        const empCode = `EMP-${company.code}-MGR${String(i + 1).padStart(3, '0')}`;
        if (!existingEmps.find(e => e.employeeId === empCode)) {
          const nameParts = mgrNames[i].split(' ');
          const companyDepts = allDepts.filter(d => d.companyId === company.id);
          const dept = companyDepts[i % companyDepts.length];
          const companyDesgs = allDesgs.filter(d => companyDepts.some(cd => cd.id === d.departmentId));
          const desg = companyDesgs.find(d => d.title === 'Manager') || companyDesgs[0];
          await db.employee.create({
            data: { employeeId: empCode, firstName: nameParts[0], lastName: nameParts[1] || '', email: mgrUsers[i].email, userId: mgrUsers[i].id, departmentId: dept.id, designationId: desg.id, branchId: allBranches.filter(b => b.companyId === company.id)[0]?.id, companyId: company.id, dateOfJoining: randDate(new Date('2019-01-01'), new Date('2022-06-30')), dateOfBirth: randDate(new Date('1975-01-01'), new Date('1990-12-31')), gender: i % 2 === 0 ? 'male' : 'female', nationality: 'Indian', city: company.city, state: company.state, country: 'IN', status: 'active', salary: 1800000 + i * 150000, salaryCurrency: 'INR' },
          });
        }
      }

      // Regular Employee records
      let empCreated = 0;
      for (let i = 0; i < EMP_NAMES.length; i++) {
        const name = EMP_NAMES[i];
        const companyIdx = i % 3;
        const company = companies[companyIdx];
        const empCode = `EMP-${company.code}-${String(i + 1).padStart(3, '0')}`;
        if (existingEmps.find(e => e.employeeId === empCode)) continue;

        const companyDepts = allDepts.filter(d => d.companyId === company.id);
        const dept = companyDepts[i % companyDepts.length];
        const companyDesgs = allDesgs.filter(d => companyDepts.some(cd => cd.id === d.departmentId));
        const desg = companyDesgs[Math.min(Math.floor(i / 5), companyDesgs.length - 1)];
        const companyBranches = allBranches.filter(b => b.companyId === company.id);

        await db.employee.create({
          data: {
            employeeId: empCode, firstName: name.first, lastName: name.last,
            email: empUsers[i].email, userId: empUsers[i].id,
            departmentId: dept.id, designationId: desg.id,
            branchId: companyBranches[i % companyBranches.length]?.id, companyId: company.id,
            dateOfJoining: randDate(new Date('2020-01-01'), new Date('2025-06-30')),
            dateOfBirth: randDate(new Date('1985-01-01'), new Date('2000-12-31')),
            gender: i % 3 === 0 ? 'female' : 'male', nationality: 'Indian',
            city: company.city, state: company.state, country: 'IN',
            status: i < 2 ? 'onboarding' : (i < 4 ? 'probation' : 'active'),
            salary: 500000 + i * 50000, salaryCurrency: 'INR',
          },
        });
        empCreated++;
      }
      results.employees = empCreated + 10; // admins + managers + regular

      // Employee Company Mappings
      const allEmployees = await db.employee.findMany({ where: { companyId: { in: companies.map(c => c.id) } } });
      let mappingCount = 0;
      for (const emp of allEmployees) {
        if (emp.companyId) {
          const existingMapping = await db.employeeCompanyMapping.findFirst({ where: { employeeId: emp.id, companyId: emp.companyId } });
          if (!existingMapping) {
            await db.employeeCompanyMapping.create({
              data: { employeeId: emp.id, companyId: emp.companyId, employeeCode: emp.employeeId, departmentId: emp.departmentId, designationId: emp.designationId, branchId: emp.branchId, isPrimary: true, status: 'active' },
            });
            mappingCount++;
          }
        }
      }
      results.companyMappings = mappingCount;

      // Dependents (for first 15 employees)
      let depCount = 0;
      for (const emp of allEmployees.slice(0, 15)) {
        const existingDeps = await db.dependent.findMany({ where: { employeeId: emp.id } });
        if (existingDeps.length > 0) continue;
        for (let d = 0; d < randInt(1, 3); d++) {
          await db.dependent.create({
            data: { employeeId: emp.id, name: `${pick(['Aarav', 'Aditi', 'Vihaan', 'Saanvi'])} ${emp.lastName}`, relationship: pick(['spouse', 'son', 'daughter', 'father', 'mother']), dateOfBirth: randDate(new Date('1960-01-01'), new Date('2020-12-31')), gender: pick(['male', 'female']) },
          });
          depCount++;
        }
      }
      results.dependents = depCount;

      // Qualifications
      let qualCount = 0;
      const QUAL_DATA = [
        { degree: 'B.Tech Computer Science', institution: 'IIT Hyderabad', year: 2018, percentage: 85.5 },
        { degree: 'MBA Finance', institution: 'IIM Ahmedabad', year: 2019, percentage: 82.0 },
        { degree: 'M.Sc Statistics', institution: 'ISI Kolkata', year: 2021, percentage: 90.0 },
      ];
      for (const emp of allEmployees.slice(0, 20)) {
        const existingQuals = await db.qualification.findMany({ where: { employeeId: emp.id } });
        if (existingQuals.length > 0) continue;
        const qual = QUAL_DATA[qualCount % QUAL_DATA.length];
        await db.qualification.create({ data: { employeeId: emp.id, ...qual, specialization: pick(['Full Stack', 'Data Science', 'Finance']) } });
        qualCount++;
      }
      results.qualifications = qualCount;
    }); // end employees section
    }

    // ── HR Module ──
    if (mod === 'all' || mod === 'hr') {
    await runSection('hr', async () => {
      const allEmployees = await db.employee.findMany({ where: { status: 'active' } });
      const leaveTypes = await db.leaveType.findMany();
      const managers = await db.employee.findMany({ where: { email: { contains: 'mgr' } } });

      if (allEmployees.length === 0) return NextResponse.json({ error: 'Run "employees" first' }, { status: 400, headers: corsHeaders() });

      // Leave Balances
      let lbCount = 0;
      const currentYear = new Date().getFullYear();
      for (const emp of allEmployees.slice(0, 30)) {
        for (const lt of leaveTypes.slice(0, 4)) {
          const existing = await db.leaveBalance.findFirst({ where: { employeeId: emp.id, leaveTypeId: lt.id, year: currentYear } });
          if (!existing) {
            const total = lt.defaultDays;
            const used = randInt(0, Math.min(total, 8));
            await db.leaveBalance.create({ data: { employeeId: emp.id, leaveTypeId: lt.id, year: currentYear, total, used, remaining: total - used, carryForward: 0 } });
            lbCount++;
          }
        }
      }
      results.leaveBalances = lbCount;

      // Leave Requests
      let lrCount = 0;
      for (const emp of allEmployees.slice(3, 20)) {
        const existingReqs = await db.leaveRequest.findMany({ where: { employeeId: emp.id } });
        if (existingReqs.length > 2) continue;
        for (let r = 0; r < randInt(1, 3); r++) {
          const lt = pick(leaveTypes.filter(l => l.code !== 'ML' && l.code !== 'PL'));
          const startDate = randDate(new Date('2026-01-01'), new Date('2026-07-15'));
          const numDays = randInt(1, 5);
          await db.leaveRequest.create({
            data: { employeeId: emp.id, leaveTypeId: lt.id, startDate, endDate: new Date(startDate.getTime() + numDays * 86400000), numberOfDays: numDays, reason: pick(['Personal work', 'Family function', 'Health checkup', 'Travel']), status: pick(['pending', 'approved', 'approved', 'rejected']), approvedBy: managers[0]?.id },
          });
          lrCount++;
        }
      }
      results.leaveRequests = lrCount;

      // Attendance (last 10 days to avoid timeout)
      let attCount = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (const emp of allEmployees.slice(0, 15)) {
        for (let d = 10; d >= 0; d--) {
          const date = new Date(today.getTime() - d * 86400000);
          if (date.getDay() === 0 || date.getDay() === 6) continue;
          const existing = await db.attendance.findFirst({ where: { employeeId: emp.id, date } });
          if (existing) continue;
          const isLate = Math.random() < 0.1;
          const checkIn = new Date(date.getTime() + (isLate ? 10.5 : 9) * 3600000);
          await db.attendance.create({
            data: { employeeId: emp.id, date, checkIn, checkOut: new Date(checkIn.getTime() + 8.5 * 3600000), workHours: 8.5, status: isLate ? 'late' : 'present' },
          });
          attCount++;
        }
      }
      results.attendance = attCount;

      // Performance Reviews
      let revCount = 0;
      for (const emp of allEmployees.slice(3, 20)) {
        const existing = await db.performanceReview.findFirst({ where: { employeeId: emp.id, period: 'Q1 2026' } });
        if (existing) continue;
        await db.performanceReview.create({
          data: { employeeId: emp.id, reviewerId: managers[0]?.id, period: 'Q1 2026', status: pick(['completed', 'completed', 'in_progress']), overallRating: randInt(3, 5), communicationRating: randInt(3, 5), technicalRating: randInt(3, 5), leadershipRating: randInt(2, 5), teamworkRating: randInt(3, 5), comments: pick(['Strong performer', 'Good team player', 'Room for growth in leadership']) },
        });
        revCount++;
      }
      results.performanceReviews = revCount;

      // Goals
      let goalCount = 0;
      const GOAL_TITLES = ['Complete AWS Certification', 'Improve Code Quality', 'Reduce Bug Count', 'Lead Sprint Planning', 'Complete Onboarding Docs'];
      for (const emp of allEmployees.slice(3, 15)) {
        const existing = await db.goal.findFirst({ where: { employeeId: emp.id } });
        if (existing) continue;
        for (let g = 0; g < 2; g++) {
          await db.goal.create({ data: { employeeId: emp.id, title: GOAL_TITLES[g], description: `Target: ${GOAL_TITLES[g].toLowerCase()}`, category: pick(['learning', 'performance', 'leadership']), priority: pick(['high', 'medium']), startDate: new Date('2026-01-01'), targetDate: new Date('2026-12-31'), status: 'in_progress', progress: randInt(20, 80) } });
          goalCount++;
        }
      }
      results.goals = goalCount;

      // Training Courses
      const COURSE_DATA = [
        { title: 'React Advanced Patterns', category: 'Technical', duration: 40, mode: 'online', provider: 'Udemy Business', level: 'advanced' },
        { title: 'Leadership Essentials', category: 'Soft Skills', duration: 16, mode: 'classroom', provider: 'LinkedIn Learning', level: 'intermediate' },
        { title: 'AWS Cloud Practitioner', category: 'Technical', duration: 20, mode: 'online', provider: 'AWS Training', level: 'beginner' },
        { title: 'Agile Project Management', category: 'Process', duration: 24, mode: 'hybrid', provider: 'Scrum Alliance', level: 'intermediate' },
        { title: 'Workplace Safety - Manufacturing', category: 'Compliance', duration: 8, mode: 'classroom', provider: 'NSC India', level: 'beginner' },
        { title: 'Data Privacy & GDPR', category: 'Compliance', duration: 4, mode: 'online', provider: 'Internal', level: 'beginner' },
        { title: 'Python for Data Science', category: 'Technical', duration: 30, mode: 'online', provider: 'Coursera', level: 'intermediate' },
        { title: 'Effective Communication', category: 'Soft Skills', duration: 12, mode: 'classroom', provider: 'Dale Carnegie', level: 'beginner' },
        { title: 'First Aid & Emergency Response', category: 'Compliance', duration: 6, mode: 'classroom', provider: 'Red Cross', level: 'beginner' },
        { title: 'DevOps CI/CD Pipeline', category: 'Technical', duration: 35, mode: 'online', provider: 'Pluralsight', level: 'advanced' },
      ];

      let courseCount = 0;
      const existingCourses = await db.training.findMany();
      for (const c of COURSE_DATA) {
        if (existingCourses.find(ec => ec.title === c.title)) continue;
        await db.training.create({ data: { ...c, status: 'active', description: `Training on ${c.title.toLowerCase()}`, startDate: new Date('2026-02-01'), endDate: new Date('2026-12-31'), maxParticipants: randInt(15, 50) } as any });
        courseCount++;
      }
      results.courses = courseCount;

      // Training Enrollments
      let enrollCount = 0;
      const courses = await db.training.findMany();
      for (const course of courses) {
        const selectedEmps = allEmployees.slice(0, randInt(3, 6));
        for (const emp of selectedEmps) {
          const existing = await db.trainingEnrollment.findFirst({ where: { trainingId: course.id, employeeId: emp.id } });
          if (existing) continue;
          await db.trainingEnrollment.create({ data: { trainingId: course.id, employeeId: emp.id, status: pick(['enrolled', 'in_progress', 'completed']), enrolledDate: randDate(new Date('2026-01-01'), new Date('2026-06-30')), rating: randInt(3, 5) } });
          enrollCount++;
        }
      }
      results.trainingEnrollments = enrollCount;
    }); // end hr section
    }

    // ── PROJECTS ──
    if (mod === 'all' || mod === 'projects') {
    await runSection('projects', async () => {
      const companies = await db.company.findMany({ take: 3 });
      const allEmployees = await db.employee.findMany({ where: { status: 'active' } });

      // Projects
      const PROJECT_DATA = [
        { name: 'HRMS Portal Redesign', code: 'PRJ-HRMS-001', type: 'internal', priority: 'high', budget: 2500000, startDate: new Date('2026-01-15'), endDate: new Date('2026-06-30'), status: 'in_progress', progress: 65, companyId: companies[0]?.id },
        { name: 'Manufacturing IoT Dashboard', code: 'PRJ-IOT-001', type: 'client', priority: 'critical', budget: 4500000, startDate: new Date('2026-02-01'), endDate: new Date('2026-08-31'), status: 'in_progress', progress: 40, companyId: companies[1]?.id },
        { name: 'Patient Management System', code: 'PRJ-PMS-001', type: 'client', priority: 'high', budget: 3500000, startDate: new Date('2026-03-01'), endDate: new Date('2026-09-30'), status: 'in_progress', progress: 30, companyId: companies[2]?.id },
        { name: 'Employee Self-Service App', code: 'PRJ-ESS-001', type: 'internal', priority: 'medium', budget: 1200000, startDate: new Date('2026-04-01'), endDate: new Date('2026-07-31'), status: 'in_progress', progress: 55, companyId: companies[0]?.id },
        { name: 'AI Chatbot Integration', code: 'PRJ-AI-001', type: 'internal', priority: 'high', budget: 900000, startDate: new Date('2026-01-01'), endDate: new Date('2026-04-30'), status: 'completed', progress: 100, companyId: companies[0]?.id },
      ];

      let projCount = 0;
      const existingProjects = await db.project.findMany();
      for (const p of PROJECT_DATA) {
        if (existingProjects.find(ep => ep.code === p.code)) continue;
        const project = await db.project.create({ data: p as any });
        projCount++;

        // Project Members
        const companyEmps = allEmployees.filter(e => e.companyId === p.companyId);
        for (let m = 0; m < Math.min(5, companyEmps.length); m++) {
          await db.projectMember.create({ data: { projectId: project.id, employeeId: companyEmps[m].id, role: m === 0 ? 'lead' : 'developer', allocation: randInt(50, 100) } });
        }

        // Project Tasks
        const TASKS = ['Requirement Analysis', 'System Design', 'API Development', 'Frontend Development', 'Unit Testing', 'Integration Testing'];
        for (let t = 0; t < TASKS.length; t++) {
          await db.projectTask.create({ data: { projectId: project.id, title: TASKS[t], status: t < 2 ? 'completed' : (t < 4 ? 'in_progress' : 'todo'), priority: pick(['medium', 'high']), dueDate: randDate(new Date('2026-03-01'), new Date('2026-12-31')), estimatedHours: randInt(8, 40) } });
        }
      }
      results.projects = projCount;

      // Clients
      const CLIENT_DATA = [
        { name: 'Infosys Technologies', industry: 'IT Services', email: 'partner@infosys.com', companyId: companies[0]?.id },
        { name: 'Reliance Industries', industry: 'Conglomerate', email: 'hr@reliance.com', companyId: companies[1]?.id },
        { name: 'Apollo Hospitals', industry: 'Healthcare', email: 'corporate@apollo.com', companyId: companies[2]?.id },
        { name: 'TCS', industry: 'IT Services', email: 'partner@tcs.com', companyId: companies[0]?.id },
        { name: 'Biocon Limited', industry: 'Biotech', email: 'bd@biocon.com', companyId: companies[2]?.id },
      ];
      let clientCount = 0;
      const existingClients = await db.client.findMany();
      for (const c of CLIENT_DATA) {
        if (existingClients.find(ec => ec.name === c.name)) continue;
        await db.client.create({ data: { ...c, status: 'active' } as any });
        clientCount++;
      }
      results.clients = clientCount;

      // Vendors
      const VENDOR_DATA = [
        { name: 'Dell Technologies India', category: 'IT Hardware', email: 'sales@dell.in', companyId: companies[0]?.id },
        { name: 'AWS India', category: 'Cloud Services', email: 'enterprise@aws.in', companyId: companies[0]?.id },
        { name: 'Siemens India', category: 'Industrial Equipment', email: 'supply@siemens.in', companyId: companies[1]?.id },
      ];
      let vendorCount = 0;
      const existingVendors = await db.vendor.findMany();
      for (const v of VENDOR_DATA) {
        if (existingVendors.find(ev => ev.name === v.name)) continue;
        await db.vendor.create({ data: { ...v, status: 'active', complianceStatus: 'approved' } as any });
        vendorCount++;
      }
      results.vendors = vendorCount;
    }); // end projects section
    }

    // ── FINANCE ──
    if (mod === 'all' || mod === 'finance') {
    await runSection('finance', async () => {
      const companies = await db.company.findMany({ take: 3 });
      const allEmployees = await db.employee.findMany({ where: { status: 'active' } });
      const managers = await db.employee.findMany({ where: { email: { contains: 'mgr' } } });

      // Salary Structures
      const SAL_STRUCTS = [
        { name: 'Software Engineer - Standard', companyId: companies[0]?.id, baseSalary: 1200000 },
        { name: 'Manager - Standard', companyId: companies[0]?.id, baseSalary: 1800000 },
        { name: 'Factory Worker - Standard', companyId: companies[1]?.id, baseSalary: 500000 },
      ];
      let ssCount = 0;
      for (const ss of SAL_STRUCTS) {
        const existing = await db.salaryStructure.findFirst({ where: { name: ss.name } });
        if (existing) continue;
        const struct = await db.salaryStructure.create({ data: { name: ss.name, companyId: ss.companyId, effectiveFrom: new Date('2026-01-01'), status: 'active' } });
        const components = [
          { name: 'Basic Salary', type: 'earning', amount: ss.baseSalary, isFixed: true, isTaxable: true, salaryStructureId: struct.id },
          { name: 'HRA', type: 'earning', amount: ss.baseSalary * 0.4, isFixed: true, isTaxable: true, salaryStructureId: struct.id },
          { name: 'PF', type: 'deduction', amount: ss.baseSalary * 0.12, isFixed: true, isTaxable: false, salaryStructureId: struct.id },
        ];
        for (const comp of components) {
          await db.salaryComponent.create({ data: comp });
        }
        ssCount++;
      }
      results.salaryStructures = ssCount;

      // Payroll Components
      let pcCount = 0;
      const PAYROLL_COMPS = [
        { name: 'Basic Salary', type: 'earning', calculationType: 'fixed', statutory: false },
        { name: 'HRA', type: 'earning', calculationType: 'percentage', statutory: false },
        { name: 'PF (Employee)', type: 'deduction', calculationType: 'percentage', statutory: true },
        { name: 'Professional Tax', type: 'deduction', calculationType: 'fixed', statutory: true },
        { name: 'TDS', type: 'deduction', calculationType: 'variable', statutory: true },
      ];
      for (const pc of PAYROLL_COMPS) {
        const existing = await db.payrollComponent.findFirst({ where: { name: pc.name } });
        if (existing) continue;
        await db.payrollComponent.create({ data: { ...pc, status: 'active' } });
        pcCount++;
      }
      results.payrollComponents = pcCount;

      // Expenses
      let expCount = 0;
      for (let i = 0; i < 10; i++) {
        const emp = pick(allEmployees);
        await db.expenseClaim.create({
          data: { employeeId: emp.id, category: pick(['Travel', 'Meals', 'Software', 'Training']), description: pick(['Flight to Mumbai', 'Team lunch', 'JetBrains subscription', 'AWS exam fee']), amount: pick([2500, 3200, 15000, 22000]), status: pick(['pending', 'approved', 'approved', 'rejected']), submittedDate: randDate(new Date('2026-01-01'), new Date('2026-07-15')), approvedBy: managers[0]?.id },
        });
        expCount++;
      }
      results.expenses = expCount;

      // Travel Requests
      let travelCount = 0;
      for (let i = 0; i < 5; i++) {
        const emp = pick(allEmployees);
        await db.travelRequest.create({
          data: { employeeId: emp.id, destination: pick(['Mumbai', 'Bengaluru', 'Singapore', 'Dubai']), purpose: pick(['Client Meeting', 'Tech Summit', 'Sales Conference']), type: pick(['domestic', 'international']) as any, estimatedCost: pick([15000, 25000, 150000, 200000]), startDate: randDate(new Date('2026-03-01'), new Date('2026-09-30')), endDate: randDate(new Date('2026-03-03'), new Date('2026-10-02')), status: pick(['pending', 'approved', 'rejected']) as any, approvedBy: managers[0]?.id },
        });
        travelCount++;
      }
      results.travelRequests = travelCount;

      // Loans
      let loanCount = 0;
      for (let i = 0; i < 4; i++) {
        const emp = pick(allEmployees.slice(5, 25));
        await db.loan.create({
          data: { employeeId: emp.id, type: pick(['personal', 'emergency', 'education', 'vehicle']) as any, amount: pick([50000, 200000, 300000, 500000]), interestRate: pick([5, 6.5, 8.5, 9]), tenure: pick([6, 24, 36, 48]), emi: pick([8550, 9100, 9180, 12450]), outstandingAmount: pick([35000, 140000, 210000]), status: pick(['pending', 'approved', 'active']), appliedDate: randDate(new Date('2025-06-01'), new Date('2026-06-30')) },
        });
        loanCount++;
      }
      results.loans = loanCount;

      // Overtime
      let otCount = 0;
      for (const emp of allEmployees.slice(3, 10)) {
        await db.overtimeRecord.create({ data: { employeeId: emp.id, date: randDate(new Date('2026-01-01'), new Date('2026-07-15')), hours: randInt(1, 4), rate: 250, status: pick(['pending', 'approved']), approvedBy: managers[0]?.id, reason: pick(['Project deadline', 'Production issue']) } });
        otCount++;
      }
      results.overtimeRecords = otCount;
    }); // end finance section
    }

    // ── SUPPORT ──
    if (mod === 'all' || mod === 'support') {
    await runSection('support', async () => {
      const companies = await db.company.findMany({ take: 3 });
      const allEmployees = await db.employee.findMany({ where: { status: 'active' } });
      const managers = await db.employee.findMany({ where: { email: { contains: 'mgr' } } });
      const tenant = await getPlatformDb().tenant.findFirst();
      const superAdminUser = await db.user.findFirst({ where: { role: 'super_admin' } });

      // Tickets
      const TICKET_DATA = [
        { subject: 'VPN Connection Issue', category: 'IT Support', priority: 'high' },
        { subject: 'Email Not Syncing', category: 'IT Support', priority: 'medium' },
        { subject: 'New Laptop Request', category: 'Hardware', priority: 'low' },
        { subject: 'Payroll Discrepancy', category: 'HR', priority: 'high' },
        { subject: 'Badge Access Issue', category: 'Security', priority: 'high' },
        { subject: 'Printer Paper Jam', category: 'Hardware', priority: 'low' },
        { subject: 'Leave Balance Incorrect', category: 'HR', priority: 'high' },
        { subject: 'Software License Renewal', category: 'IT Support', priority: 'medium' },
        { subject: 'Cabin AC Not Working', category: 'Facilities', priority: 'medium' },
        { subject: 'Reimbursement Delay', category: 'Finance', priority: 'medium' },
        { subject: 'Policy Document Query', category: 'HR', priority: 'low' },
        { subject: 'Mandatory Fire Drill', category: 'Safety', priority: 'high' },
      ];
      let ticketCount = 0;
      for (const t of TICKET_DATA) {
        await db.ticket.create({ data: { employeeId: pick(allEmployees).id, subject: t.subject, category: t.category as any, priority: t.priority as any, description: `${t.subject} - needs attention`, status: pick(['open', 'in_progress', 'resolved', 'closed']), assignedTo: pick(managers).id } });
        ticketCount++;
      }
      results.tickets = ticketCount;

      // Policies
      const POLICY_DATA = [
        { title: 'Remote Work Policy', content: 'Employees can work remotely up to 3 days per week with manager approval.', category: 'workplace' },
        { title: 'Leave Policy', content: 'All employees entitled to CL, SL, and EL as per company policy.', category: 'leave' },
        { title: 'Code of Conduct', content: 'Professional behavior and confidentiality required.', category: 'conduct' },
        { title: 'IT Security Policy', content: 'Use company-approved devices and VPN only.', category: 'security' },
        { title: 'Anti-Harassment Policy', content: 'Zero tolerance towards harassment.', category: 'hr' },
      ];
      let policyCount = 0;
      for (const p of POLICY_DATA) {
        for (const company of companies) {
          const existing = await db.policy.findFirst({ where: { title: p.title, companyId: company.id } });
          if (existing) continue;
          await db.policy.create({ data: { title: p.title, content: p.content, category: p.category as any, companyId: company.id, status: 'active', version: '1.0' } });
          policyCount++;
        }
      }
      results.policies = policyCount;

      // Assets
      const ASSET_DATA = [
        { name: 'MacBook Pro 16"', category: 'Laptop', serialNumber: 'MBP-2024-001', value: 250000, companyId: companies[0]?.id },
        { name: 'Dell Latitude 5540', category: 'Laptop', serialNumber: 'DLL-2024-002', value: 95000, companyId: companies[0]?.id },
        { name: 'iPhone 15 Pro', category: 'Mobile', serialNumber: 'IPH-2024-001', value: 135000, companyId: companies[0]?.id },
        { name: 'Dell Monitor', category: 'Monitor', serialNumber: 'MON-2024-001', value: 55000, companyId: companies[0]?.id },
        { name: 'HP LaserJet Pro', category: 'Printer', serialNumber: 'PRT-2024-001', value: 35000, companyId: companies[0]?.id },
        { name: 'ThinkPad X1', category: 'Laptop', serialNumber: 'TPD-2024-003', value: 120000, companyId: companies[1]?.id },
        { name: 'Lab Microscope', category: 'Lab Equipment', serialNumber: 'LAB-2024-001', value: 500000, companyId: companies[2]?.id },
        { name: 'Server Rack Dell R750', category: 'Server', serialNumber: 'SRV-2024-001', value: 800000, companyId: companies[0]?.id },
      ];
      let assetCount = 0;
      for (const a of ASSET_DATA) {
        const existing = await db.asset.findFirst({ where: { serialNumber: a.serialNumber } });
        if (existing) continue;
        await db.asset.create({ data: { ...a, status: 'available', purchaseDate: randDate(new Date('2024-01-01'), new Date('2026-06-30')) } as any });
        assetCount++;
      }
      results.assets = assetCount;

      // Recognitions
      let recCount = 0;
      const REC_DATA = [
        { title: 'Star Performer - Q1 2026', type: 'performance' },
        { title: 'Innovation Award', type: 'innovation' },
        { title: 'Team Player Award', type: 'collaboration' },
        { title: 'Customer Champion', type: 'customer' },
      ];
      for (const r of REC_DATA) {
        await db.recognition.create({ data: { employeeId: pick(allEmployees).id, title: r.title, type: r.type as any, message: `${r.title} - outstanding contribution`, givenBy: managers[0]?.id, date: randDate(new Date('2026-01-01'), new Date('2026-07-15')) } });
        recCount++;
      }
      results.recognitions = recCount;

      // Job Postings
      const JOB_DATA = [
        { title: 'Senior Full-Stack Developer', location: 'Hyderabad', type: 'full-time', experience: '5-8 years', salary: '18-25 LPA', vacancies: 2 },
        { title: 'UX Research Lead', location: 'Mumbai', type: 'full-time', experience: '6-9 years', salary: '15-22 LPA', vacancies: 1 },
        { title: 'Data Scientist', location: 'Bengaluru', type: 'full-time', experience: '3-5 years', salary: '14-20 LPA', vacancies: 1 },
        { title: 'HR Business Partner', location: 'Hyderabad', type: 'full-time', experience: '7-10 years', salary: '12-18 LPA', vacancies: 1 },
        { title: 'DevOps Engineer', location: 'Pune', type: 'full-time', experience: '4-7 years', salary: '16-22 LPA', vacancies: 2 },
        { title: 'QA Lead', location: 'Mumbai', type: 'full-time', experience: '5-8 years', salary: '12-17 LPA', vacancies: 1 },
        { title: 'Financial Analyst', location: 'Bengaluru', type: 'full-time', experience: '3-5 years', salary: '8-14 LPA', vacancies: 2 },
        { title: 'Production Manager', location: 'Pune', type: 'full-time', experience: '8-12 years', salary: '20-30 LPA', vacancies: 1 },
        { title: 'Sales Executive', location: 'Mumbai', type: 'full-time', experience: '2-5 years', salary: '7-12 LPA', vacancies: 3 },
        { title: 'Clinical Research Coordinator', location: 'Chennai', type: 'full-time', experience: '3-6 years', salary: '9-15 LPA', vacancies: 1 },
        { title: 'Marketing Specialist', location: 'Hyderabad', type: 'full-time', experience: '2-4 years', salary: '6-10 LPA', vacancies: 1 },
        { title: 'Intern - Software Development', location: 'Hyderabad', type: 'internship', experience: '0-1 years', salary: '15-25K/month', vacancies: 5 },
      ];
      let jobCount = 0;
      const allDepts = await db.department.findMany({ where: { companyId: { in: companies.map(c => c.id) } } });
      for (const j of JOB_DATA) {
        const existing = await db.jobPosting.findFirst({ where: { title: j.title } });
        if (existing) continue;
        await db.jobPosting.create({
          data: { title: j.title, position: j.title, location: j.location, type: j.type, experience: j.experience, salary: j.salary, departmentId: pick(allDepts).id, description: `Looking for ${j.title.toLowerCase()}`, requirements: j.experience, status: 'open', postedDate: new Date(), closingDate: new Date('2026-12-31'), vacancies: j.vacancies },
        });
        jobCount++;
      }
      results.jobPostings = jobCount;

      // Notifications
      let notifCount = 0;
      const allUsers = await db.user.findMany({ where: { tenantId: tenant?.id } });
      const NOTIF_DATA = [
        { title: 'New Job Application', message: 'Arun Kumar applied for Senior Full-Stack Developer', type: 'info', category: 'recruitment' },
        { title: 'Leave Approved', message: 'Your casual leave for July 10-12 approved', type: 'success', category: 'leave' },
        { title: 'Payroll Processed', message: 'June 2026 payroll processed', type: 'success', category: 'payroll' },
        { title: 'Interview Scheduled', message: 'Technical interview tomorrow 10 AM', type: 'info', category: 'recruitment' },
        { title: 'Expense Rejected', message: 'Travel expense of ₹6,000 rejected', type: 'warning', category: 'expense' },
        { title: 'Policy Update', message: 'Remote work policy updated', type: 'info', category: 'policy' },
        { title: 'Performance Review Due', message: 'Q2 review due by Friday', type: 'warning', category: 'performance' },
        { title: 'Ticket Resolved', message: 'IT ticket resolved', type: 'success', category: 'helpdesk' },
        { title: 'Training Reminder', message: 'AWS training starts tomorrow', type: 'info', category: 'training' },
        { title: 'Attendance Alert', message: 'Marked late today', type: 'warning', category: 'attendance' },
      ];
      for (const n of NOTIF_DATA) {
        for (const user of allUsers.slice(0, randInt(2, 5))) {
          await db.notification.create({ data: { tenantId: tenant?.id, userId: user.id, title: n.title, message: n.message, type: n.type as any, category: n.category as any, isRead: Math.random() > 0.5 } });
          notifCount++;
        }
      }
      results.notifications = notifCount;

      // Announcements
      const ANN_DATA = [
        { title: 'Company Town Hall - Q2 2026', message: 'Quarterly town hall with business updates', priority: 'high', type: 'general' },
        { title: 'New Health Insurance Plan', message: 'Upgraded plan effective Aug 1, 2026', priority: 'high', type: 'benefits' },
        { title: 'Annual Day Celebration', message: 'September 10, 2026 - Cultural programs await!', priority: 'medium', type: 'event' },
        { title: 'Mandatory Fire Drill', message: 'July 25 at 11:00 AM - All must participate', priority: 'high', type: 'safety' },
      ];
      for (const a of ANN_DATA) {
        const existing = await db.announcement.findFirst({ where: { title: a.title, tenantId: tenant?.id } });
        if (existing) continue;
        await db.announcement.create({ data: { tenantId: tenant?.id, title: a.title, message: a.message, priority: a.priority as any, type: a.type as any, isActive: true, createdBy: superAdminUser?.id } });
      }
      results.announcements = ANN_DATA.length;

      // Audit Logs
      let auditCount = 0;
      const AUDIT_ACTIONS = [
        { action: 'LOGIN', module: 'auth' }, { action: 'CREATE_EMPLOYEE', module: 'employees' },
        { action: 'APPROVE_LEAVE', module: 'leave' }, { action: 'PROCESS_PAYROLL', module: 'payroll' },
      ];
      for (let i = 0; i < 20; i++) {
        const audit = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length];
        await db.auditLog.create({ data: { userId: pick(allUsers).id, action: audit.action, module: audit.module, details: `${audit.action} performed`, timestamp: randDate(new Date('2026-01-01'), new Date('2026-07-15')) } });
        auditCount++;
      }
      results.auditLogs = auditCount;

      // Invoices
      const clients = await db.client.findMany();
      const projects = await db.project.findMany();
      let invCount = 0;
      for (let i = 0; i < 4; i++) {
        const invNum = `INV-2026-${String(i + 1).padStart(3, '0')}`;
        const existing = await db.invoice.findFirst({ where: { invoiceNumber: invNum } });
        if (existing) continue;
        const amount = pick([450000, 750000, 380000, 250000]);
        const tax = Math.round(amount * 0.18);
        const inv = await db.invoice.create({ data: { invoiceNumber: invNum, companyId: companies[0]?.id, clientId: clients[i % clients.length]?.id, projectId: projects[i % projects.length]?.id, amount, tax, totalAmount: amount + tax, status: pick(['draft', 'sent', 'paid', 'overdue']) as any, issueDate: new Date(), dueDate: new Date(Date.now() + 30 * 86400000) } as any });
        await db.invoiceLineItem.create({ data: { invoiceId: inv.id, description: 'Professional Services', quantity: 100, rate: 3000, amount } });
        invCount++;
      }
      results.invoices = invCount;

      // Subscription Plan
      const existingPlan = await getPlatformDb().subscriptionPlan.findFirst();
      if (!existingPlan) {
        const plan = await getPlatformDb().subscriptionPlan.create({
          data: { name: 'Enterprise Demo', planType: 'enterprise', monthlyPrice: 299, annualPrice: 2990, employeeLimit: 500, companyLimit: 10, payrollEnabled: true, recruitmentEnabled: true, attendanceEnabled: true, projectEnabled: true, status: 'active', description: 'Full-featured enterprise demo' },
        });
        if (tenant) {
          await getPlatformDb().subscription.create({ data: { tenantId: tenant.id, planId: plan.id, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), billingCycle: 'annual', amount: 2990, currency: 'INR', paymentStatus: 'paid', status: 'active', autoRenew: true } });
        }
        results.subscriptionPlan = 1;
      }
    }); // end support section
    }

    const elapsed = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      module: mod,
      results,
      errors: errors.length > 0 ? errors : undefined,
      elapsedMs: elapsed,
      message: `Demo data seeded for module "${mod}" in ${elapsed}ms. All passwords: MarqAI@2026`,
      loginCredentials: {
        superAdmin: 'superadmin@3boxeshrms.com',
        tenantAdmin: 'tenantadmin@3boxeshrms.com',
        hrAdminTCG: 'hr.tcg@3boxeshrms.com',
        hrAdminMPI: 'hr.mpi@3boxeshrms.com',
        hrAdminHFS: 'hr.hfs@3boxeshrms.com',
        manager1: 'mgr1@3boxeshrms.com',
        employee1: 'amit.verma@3boxeshrms.com',
        password: 'MarqAI@2026',
      },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[Seed Demo API] Error:', error);
    return NextResponse.json(
      { error: 'Seed failed', details: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined },
      { status: 500, headers: corsHeaders() }
    );
  }
}
