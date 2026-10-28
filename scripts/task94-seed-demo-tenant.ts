/**
 * Task 94 (94-3) — Seed the `demo` test tenant database (tenant_demo) with 5 dummy companies
 * and rich dummy data for thorough platform testing.
 *
 * Prereqs: 94-1 (tenant registered in platform DB) + 94-2 (prisma db push --force-reset done).
 * One-shot with a guard: aborts if companies already exist.
 */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Client as PgClient } from 'pg';
import bcrypt from 'bcryptjs';

const TENANT_ID = 'cmmv6dqf67b59441b7cf77ceb2';
const DEMO_URL = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_demo?sslmode=require';
const CLONE_URL = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require';

const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: DEMO_URL }) });

// deterministic RNG (mulberry32)
let _s = 20261013;
function rnd(): number { _s |= 0; _s = (_s + 0x6d2b79f5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function pick<T>(arr: T[]): T { return arr[Math.floor(rnd() * arr.length)]; }
function pickInt(min: number, max: number): number { return Math.floor(rnd() * (max - min + 1)) + min; }
let _idc = 0;
function nid(prefix: string): string { _idc += 1; return `${prefix}${Date.now().toString(36)}${_idc.toString(36)}${Math.floor(rnd() * 1e6).toString(36)}`; }

const FIRST = ['Aarav', 'Diya', 'Rohan', 'Priya', 'Vikram', 'Ananya', 'Karthik', 'Meera', 'Suresh', 'Lakshmi', 'Arjun', 'Sneha', 'Rahul', 'Divya', 'Sandeep', 'Kavya', 'Manoj', 'Pooja', 'Naveen', 'Shreya', 'Harish', 'Nandini', 'Ramesh', 'Aditi', 'Srinivas', 'Deepa', 'Gopal', 'Ritu', 'Amit', 'Swati', 'Vijay', 'Neha', 'Prakash', 'Isha', 'Sanjay', 'Trupti', 'Mahesh', 'Padma', 'Ravi', 'Sunita'];
const LAST = ['Sharma', 'Reddy', 'Iyer', 'Patel', 'Nair', 'Kumar', 'Rao', 'Gupta', 'Menon', 'Verma', 'Joshi', 'Pillai', 'Das', 'Bose', 'Chopra', 'Mehta', 'Shah', 'Kulkarni', 'Singh', 'Mishra'];
const USED_NAMES = new Set<string>();
function personName(): { first: string; last: string } {
  for (let i = 0; i < 300; i++) {
    const first = pick(FIRST), last = pick(LAST);
    if (!USED_NAMES.has(`${first} ${last}`)) { USED_NAMES.add(`${first} ${last}`); return { first, last }; }
  }
  const first = pick(FIRST), last = `${pick(LAST)}${pickInt(10, 99)}`;
  USED_NAMES.add(`${first} ${last}`); return { first, last };
}

const COMPANIES = [
  { code: 'ACT', name: 'Acme Technologies Pvt Ltd', domain: 'acmetech.in', city: 'Hyderabad', state: 'TG', industry: 'IT Services', extraDept: { name: 'Engineering', base: 'Engineering' } },
  { code: 'ZRI', name: 'Zenith Retail India Ltd', domain: 'zenithretail.in', city: 'Mumbai', state: 'MH', industry: 'Retail Chain', extraDept: { name: 'Sales & Merchandising', base: 'Sales' } },
  { code: 'NHC', name: 'Nova Health Care Pvt Ltd', domain: 'novahealth.in', city: 'Chennai', state: 'TN', industry: 'Healthcare', extraDept: { name: 'Medical Operations', base: 'Medical' } },
  { code: 'PML', name: 'Pinnacle Manufacturing Ltd', domain: 'pinnaclemfg.in', city: 'Pune', state: 'MH', industry: 'Manufacturing', extraDept: { name: 'Production & Quality', base: 'Production' } },
  { code: 'OLL', name: 'Orbit Logistics Pvt Ltd', domain: 'orbitlogistics.in', city: 'New Delhi', state: 'DL', industry: 'Logistics & Transport', extraDept: { name: 'Fleet Operations', base: 'Fleet' } },
];
const COMMON_DEPTS = [
  { name: 'Human Resources', base: 'HR' },
  { name: 'Finance', base: 'Finance' },
  { name: 'Operations', base: 'Operations' },
];
const HOLIDAYS_2026 = [
  ['New Year', '2026-01-01', 'national'], ['Republic Day', '2026-01-26', 'national'], ['Holi', '2026-03-03', 'festival'],
  ['Good Friday', '2026-04-03', 'festival'], ['Labour Day', '2026-05-01', 'national'], ['Independence Day', '2026-08-15', 'national'],
  ['Gandhi Jayanti', '2026-10-02', 'national'], ['Diwali', '2026-11-08', 'festival'], ['Christmas', '2026-12-25', 'festival'],
];
const LEAVE_TYPES = [
  { name: 'Casual Leave', code: 'CL', defaultDays: 12, isPaid: true, carryForward: true, maxCarryForward: 3 },
  { name: 'Sick Leave', code: 'SL', defaultDays: 10, isPaid: true, carryForward: false, maxCarryForward: 0 },
  { name: 'Earned Leave', code: 'EL', defaultDays: 15, isPaid: true, carryForward: true, maxCarryForward: 5 },
  { name: 'Maternity Leave', code: 'ML', defaultDays: 90, isPaid: true, carryForward: false, maxCarryForward: 0 },
  { name: 'Paternity Leave', code: 'PL', defaultDays: 15, isPaid: true, carryForward: false, maxCarryForward: 0 },
];
const LEAVE_REASONS = ['Family function out of town', 'Not feeling well, fever and cold', 'Personal work at home', 'Medical checkup appointment', 'Sister\'s wedding ceremony', 'Travel to hometown', 'Rest and recovery after flu'];

interface CompanyCtx {
  idx: number; code: string; id: string; domain: string; city: string; state: string;
  branchIds: string[]; depts: { name: string; base: string; id: string }[]; leaveTypes: { code: string; id: string; defaultDays: number }[];
  hrLeadUserId?: string | null;
}
interface CrewEntry { rowId: string; userId: string | null; deptName: string; role: string; name: string; email: string }
const employeesByCompany: Record<string, CrewEntry[]> = {};

async function main() {
  const existingCompanies = await db.company.count();
  if (existingCompanies > 0) { console.log(`tenant_demo already has ${existingCompanies} companies — aborting (already seeded).`); return; }
  console.log('Seeding tenant_demo …');

  const passwordHash = await bcrypt.hash('MarqAI@2026', 12);

  // ── 1. Tenant + TenantDatabase mirror rows (inside the tenant DB) ──
  await (db as any).tenant.create({ data: {
    id: TENANT_ID, name: '3Boxes Test Demo', slug: 'demo', domain: 'demo.3boxeshrms.com',
    plan: 'enterprise', status: 'active', country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata',
    language: 'en', baseCurrency: 'INR', maxCompaniesAllowed: 10, aiFeedbackEnabled: true, talentPoolCrossCompanyEnabled: true,
  } });
  const POOLER = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2-pooler.c-8.us-east-1.aws.neon.tech/tenant_demo?sslmode=require&connect_timeout=10';
  await (db as any).tenantDatabase.create({ data: { id: `td-${TENANT_ID}`, tenantId: TENANT_ID, connectionString: POOLER, directUrl: POOLER.replace('&connect_timeout=10', ''), databaseName: 'tenant_demo', isActive: true } });
  console.log('✓ Tenant + TenantDatabase mirror rows');

  // ── 2. Company group ──
  const groupId = `${TENANT_ID}-group`;
  await db.companyGroup.create({ data: { id: groupId, name: 'Demo Holdings Group', tenantId: TENANT_ID } });

  // ── 3-7. Companies, branches, departments, designations, leave types, shifts, holidays ──
  const ctxs: CompanyCtx[] = [];
  for (let ci = 0; ci < COMPANIES.length; ci++) {
    const C = COMPANIES[ci];
    const companyId = `${TENANT_ID}-co-${ci}`;
    await db.company.create({ data: {
      id: companyId, name: C.name, code: C.code, companyGroupId: groupId, country: 'IN', currency: 'INR',
      timezone: 'Asia/Kolkata', city: C.city, state: C.state, email: `info@${C.domain}`, website: `https://www.${C.domain}`,
      status: 'active', address: `Plot ${pickInt(10, 99)}, ${C.city}`, phone: `+91-40-${pickInt(40000000, 49999999)}`,
      maxEmployees: 200, plannedEmployeeCount: pickInt(50, 150),
    } });

    const branchIds: string[] = [];
    for (let b = 0; b < 2; b++) {
      const bid = `${TENANT_ID}-br-${ci}-${b}`;
      await db.branch.create({ data: {
        id: bid, name: b === 0 ? `HQ — ${C.city}` : `${C.city} Unit 2`, code: `${C.code}-${b === 0 ? 'HQ' : 'U2'}`,
        city: C.city, state: C.state, country: 'IN', companyId, status: 'active', address: `${C.city}, ${C.state}`,
      } });
      branchIds.push(bid);
    }

    const depts: { name: string; base: string; id: string }[] = [];
    const allDepts = [...COMMON_DEPTS, C.extraDept];
    for (let di = 0; di < allDepts.length; di++) {
      const D = allDepts[di];
      const did = `${TENANT_ID}-dept-${ci}-${di}`;
      await db.department.create({ data: { id: did, name: D.name, code: `${C.code}-${D.name.slice(0, 3).toUpperCase()}`, companyId, branchId: branchIds[0], status: 'active' } });
      depts.push({ ...D, id: did });
      for (const lvl of [{ s: 'Manager', l: 6, min: 1500000, max: 3000000 }, { s: 'Executive', l: 3, min: 500000, max: 1000000 }, { s: 'Associate', l: 1, min: 300000, max: 600000 }]) {
        await db.designation.create({ data: {
          id: `${did}-desg-${lvl.s}`, title: `${D.base} ${lvl.s}`, departmentId: did, level: lvl.l,
          minSalary: lvl.min, maxSalary: lvl.max, status: 'active',
        } });
      }
    }

    const leaveTypes: { code: string; id: string; defaultDays: number }[] = [];
    for (const LT of LEAVE_TYPES) {
      const ltid = `${TENANT_ID}-lt-${LT.code}-${C.code}`;
      await db.leaveType.create({ data: {
        id: ltid, name: LT.name, code: `${LT.code}-${C.code}`, description: `${LT.name} for ${C.name}`,
        defaultDays: LT.defaultDays, isPaid: LT.isPaid, carryForward: LT.carryForward, maxCarryForward: LT.maxCarryForward,
        status: 'active', companyId,
      } });
      leaveTypes.push({ code: LT.code, id: ltid, defaultDays: LT.defaultDays });
    }

    await (db as any).shift.create({ data: { id: `${TENANT_ID}-shift-${ci}-G`, name: 'General Shift', code: `${C.code}-GS`, type: 'fixed', startTime: '09:00', endTime: '18:00', breakDuration: 60, graceTime: 15, companyId } });
    if (C.code === 'PML') {
      await (db as any).shift.create({ data: { id: `${TENANT_ID}-shift-${ci}-N`, name: 'Night Shift', code: `${C.code}-NS`, type: 'fixed', startTime: '21:00', endTime: '06:00', crossMidnight: true, breakDuration: 45, graceTime: 10, companyId } });
    }
    for (const [hname, hdate, htype] of HOLIDAYS_2026) {
      await db.holiday.create({ data: { id: `${TENANT_ID}-hol-${C.code}-${hname.replace(/\s/g, '')}`, name: hname, date: new Date(hdate), type: htype === 'national' ? 'public' : 'company', country: 'IN', companyId } });
    }

    ctxs.push({ idx: ci, code: C.code, id: companyId, domain: C.domain, city: C.city, state: C.state, branchIds, depts, leaveTypes, hrLeadUserId: null });
    console.log(`✓ ${C.code} — ${C.name}`);
  }

  // ── 8. Users + Employees with reporting chains ──
  async function makeEmployee(opts: {
    email: string; name: string; role: string; ctx: CompanyCtx; deptName: string; desgTitle: string;
    employeeId: string; dateOfJoining: Date; employeeStatus: string; employeeType?: string; withLogin: boolean;
  }): Promise<{ rowId: string; userId: string | null }> {
    const { ctx } = opts;
    const dept = ctx.depts.find(d => d.name === opts.deptName)!;
    const desgId = `${dept.id}-desg-${opts.desgTitle.split(' ').pop()}`;
    const desg: any = await (db as any).designation.findUnique({ where: { id: desgId } });
    const salary = desg ? Math.round((desg.minSalary + rnd() * (desg.maxSalary - desg.minSalary)) / 10000) * 10000 : 800000;

    let userId: string | null = null;
    if (opts.withLogin) {
      userId = nid('u');
      await (db as any).user.create({ data: { id: userId, email: opts.email, password: passwordHash, name: opts.name, role: opts.role, status: 'active', tenantId: TENANT_ID } });
    }

    const empRowId = nid('e');
    const [first, ...rest] = opts.name.split(' ');
    const lastNameFull = rest.join(' ') || 'Kumar';
    await (db as any).employee.create({ data: {
      id: empRowId, employeeId: opts.employeeId, firstName: first, lastName: lastNameFull,
      email: opts.email, personalEmail: `${first.toLowerCase()}.${lastNameFull.toLowerCase()}@gmail.com`,
      phone: `+91-9${pickInt(100000000, 999999999)}`,
      userId, departmentId: dept.id, designationId: desgId, branchId: ctx.branchIds[0], companyId: ctx.id,
      dateOfJoining: opts.dateOfJoining, dateOfBirth: new Date(pickInt(1975, 2000), pickInt(0, 11), pickInt(1, 28)),
      gender: rnd() > 0.5 ? 'male' : 'female', maritalStatus: rnd() > 0.5 ? 'single' : 'married', nationality: 'Indian',
      address: `${pickInt(1, 200)}, ${ctx.city}`, city: ctx.city, state: ctx.state, zipCode: `${pickInt(500000, 699999)}`, country: 'IN',
      bloodGroup: pick(['A+', 'B+', 'O+', 'AB+']),
      emergencyContactName: 'Emergency Contact', emergencyContactPhone: `+91-98${pickInt(10000000, 99999999)}`,
      status: 'active', employeeStatus: opts.employeeStatus, employeeType: opts.employeeType || 'full_time',
      bankName: pick(['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank']), bankAccountNo: `${pickInt(10000000000, 99999999999)}`,
      bankIfscCode: `HDFC000${pickInt(1000, 9999)}`, panNumber: `ABCPD${pickInt(1000, 9999)}K`, aadhaarNumber: `${pickInt(100000000000, 999999999999)}`,
      salary, salaryCurrency: 'INR',
    } });
    await (db as any).employeeCompanyMapping.create({ data: {
      id: `${empRowId}-mapping`, employeeId: empRowId, companyId: ctx.id, employeeCode: opts.employeeId,
      departmentId: dept.id, designationId: desgId, branchId: ctx.branchIds[0], isPrimary: true, status: 'active',
      dateOfJoining: opts.dateOfJoining,
    } });
    (employeesByCompany[ctx.code] ||= []).push({ rowId: empRowId, userId, deptName: opts.deptName, role: opts.role, name: opts.name, email: opts.email });
    return { rowId: empRowId, userId };
  }

  for (let ci = 0; ci < ctxs.length; ci++) {
    const ctx = ctxs[ci];
    let seq = 1;
    const nextEmpId = () => `${ctx.code}-${String(seq++).padStart(4, '0')}`;

    if (ci === 0) {
      // ACT — the five quick-test platform-role logins
      const admin = await makeEmployee({ email: 'admin@demo.3boxeshrms.com', name: 'Demo Admin', role: 'tenant_admin', ctx, deptName: 'Human Resources', desgTitle: 'HR Manager', employeeId: nextEmpId(), dateOfJoining: new Date('2021-04-12'), employeeStatus: 'confirmed', withLogin: true });
      ctx.hrLeadUserId = admin.userId;
      const hrUser = await makeEmployee({ email: 'hr@demo.3boxeshrms.com', name: 'Demos Hrhead', role: 'hr_admin', ctx, deptName: 'Human Resources', desgTitle: 'HR Executive', employeeId: nextEmpId(), dateOfJoining: new Date('2022-06-01'), employeeStatus: 'confirmed', withLogin: true });
      await makeEmployee({ email: 'finance@demo.3boxeshrms.com', name: 'Demos Finance', role: 'finance_admin', ctx, deptName: 'Finance', desgTitle: 'Finance Manager', employeeId: nextEmpId(), dateOfJoining: new Date('2021-08-16'), employeeStatus: 'confirmed', withLogin: true });
      const mgr = await makeEmployee({ email: 'manager@demo.3boxeshrms.com', name: 'Demos Manager', role: 'manager', ctx, deptName: 'Operations', desgTitle: 'Operations Manager', employeeId: nextEmpId(), dateOfJoining: new Date('2022-01-10'), employeeStatus: 'confirmed', withLogin: true });
      await makeEmployee({ email: 'employee@demo.3boxeshrms.com', name: 'Demos Employee', role: 'employee', ctx, deptName: 'Engineering', desgTitle: 'Engineering Executive', employeeId: nextEmpId(), dateOfJoining: new Date('2024-03-04'), employeeStatus: 'confirmed', withLogin: true });
      const act = employeesByCompany['ACT'];
      for (const e of act) {
        if (e.rowId === admin.rowId) continue;
        await db.employee.update({ where: { id: e.rowId }, data: { reportingManagerId: e.rowId === act.find(x => x.name === 'Demos Employee')!.rowId ? mgr.rowId : admin.rowId } });
      }
      void hrUser;
    } else {
      // other companies — own HR lead + dept managers + 5 staff (1 probationer each)
      const { first: hrf, last: hrl } = personName();
      const hrLead = await makeEmployee({ email: `${hrf.toLowerCase()}.${hrl.toLowerCase()}@${ctx.domain}`, name: `${hrf} ${hrl}`, role: 'hr_admin', ctx, deptName: 'Human Resources', desgTitle: 'HR Manager', employeeId: nextEmpId(), dateOfJoining: new Date('2021-04-12'), employeeStatus: 'confirmed', withLogin: true });
      ctx.hrLeadUserId = hrLead.userId;
      const mgrRows: Record<string, string> = {};
      for (const d of ctx.depts.filter(x => x.name !== 'Human Resources')) {
        const { first, last } = personName();
        const m = await makeEmployee({ email: `${first.toLowerCase()}.${last.toLowerCase()}@${ctx.domain}`, name: `${first} ${last}`, role: 'manager', ctx, deptName: d.name, desgTitle: `${d.base} Manager`, employeeId: nextEmpId(), dateOfJoining: new Date(2021 + pickInt(0, 1), pickInt(0, 11), pickInt(1, 28)), employeeStatus: 'confirmed', withLogin: true });
        mgrRows[d.name] = m.rowId;
      }
      for (let i = 0; i < 5; i++) {
        const { first, last } = personName();
        const dept = pick(ctx.depts);
        const desgTitle = rnd() > 0.5 ? `${dept.base} Executive` : `${dept.base} Associate`;
        const probation = i === 0;
        const doj = probation ? new Date(Date.now() - pickInt(40, 55) * 86400000) : new Date(2022 + pickInt(0, 3), pickInt(0, 11), pickInt(1, 28));
        await makeEmployee({ email: `${first.toLowerCase()}.${last.toLowerCase()}@${ctx.domain}`, name: `${first} ${last}`, role: 'employee', ctx, deptName: dept.name, desgTitle, employeeId: nextEmpId(), dateOfJoining: doj, employeeStatus: probation ? 'probation' : 'confirmed', employeeType: i === 4 ? 'contract' : 'full_time', withLogin: true });
      }
      const crew = employeesByCompany[ctx.code];
      const adminAct = employeesByCompany['ACT'].find(e => e.role === 'tenant_admin')!;
      for (const e of crew) {
        if (e.rowId === hrLead.rowId) { await db.employee.update({ where: { id: e.rowId }, data: { reportingManagerId: adminAct.rowId } }); continue; }
        await db.employee.update({ where: { id: e.rowId }, data: { reportingManagerId: mgrRows[e.deptName] || hrLead.rowId } });
      }
    }

    // 2 employee-only records (no login) per company
    for (let i = 0; i < 2; i++) {
      const { first, last } = personName();
      const dept = pick(ctx.depts);
      await makeEmployee({ email: `${first.toLowerCase()}.${last.toLowerCase()}@${ctx.domain}`, name: `${first} ${last}`, role: 'employee', ctx, deptName: dept.name, desgTitle: `${dept.base} Associate`, employeeId: `${ctx.code}-${String(900 + i).padStart(4, '0')}`, dateOfJoining: new Date(2023, pickInt(0, 11), pickInt(1, 28)), employeeStatus: 'confirmed', withLogin: false });
    }
    console.log(`✓ ${ctx.code}: crew + reporting chains`);
  }

  const userCount = Object.values(employeesByCompany).flat().filter(e => e.userId).length;
  const empCount = Object.values(employeesByCompany).flat().length;
  console.log(`Users: ${userCount}, Employees: ${empCount}`);

  // ── 9. Attendance — last 30 days (weekdays) for every employee + today punches ──
  const DAY = 86400000;
  const todayUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const allCrew = Object.values(employeesByCompany).flat();
  const attendanceRows: any[] = [];
  for (const e of allCrew) {
    for (let d = 30; d >= 1; d--) {
      const day = new Date(todayUtc.getTime() - d * DAY);
      const dow = day.getUTCDay();
      if (dow === 0 || dow === 6) continue;
      const roll = rnd();
      const status = roll < 0.92 ? 'present' : roll < 0.96 ? 'late' : roll < 0.98 ? 'absent' : 'half_day';
      if (status === 'absent') {
        attendanceRows.push({ id: nid('a'), employeeId: e.rowId, date: day, status, notes: null, punchMethod: null });
        continue;
      }
      const inMin = status === 'late' ? 9 * 60 + pickInt(25, 50) : 8 * 60 + 60 + pickInt(-15, 20); // late: ~09:25-09:50 else 08:45-09:20
      const outMin = 18 * 60 + pickInt(-15, 40);
      const checkIn = new Date(day.getTime() + inMin * 60000);
      const checkOut = new Date(day.getTime() + outMin * 60000);
      const workHours = status === 'half_day' ? 4.5 : Math.round(((outMin - inMin) / 60 - 1) * 10) / 10;
      attendanceRows.push({ id: nid('a'), employeeId: e.rowId, date: day, status, checkIn, checkOut, workHours, punchMethod: 'web', earlyLogout: outMin < 17 * 60 + 45 });
    }
  }
  const loginCrew = allCrew.filter(x => x.userId);
  for (let i = loginCrew.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [loginCrew[i], loginCrew[j]] = [loginCrew[j], loginCrew[i]]; }
  for (const e of loginCrew.slice(0, 25)) {
    attendanceRows.push({ id: nid('a'), employeeId: e.rowId, date: todayUtc, status: 'present', checkIn: new Date(todayUtc.getTime() + (8 * 60 + 60 + pickInt(-10, 15)) * 60000), punchMethod: 'web' });
  }
  for (let i = 0; i < attendanceRows.length; i += 500) {
    await (db as any).attendance.createMany({ data: attendanceRows.slice(i, i + 500), skipDuplicates: true });
  }
  console.log(`✓ Attendance rows: ${attendanceRows.length}`);

  // ── 10. Leave balances — every login-bearing employee × their company's leave types ──
  let balanceCount = 0;
  for (const ctx of ctxs) {
    const crew = employeesByCompany[ctx.code].filter(e => e.userId);
    for (const e of crew) {
      for (const lt of ctx.leaveTypes) {
        const used = ['CL', 'SL', 'EL'].includes(lt.code) ? pickInt(0, 4) : 0;
        await (db as any).leaveBalance.create({ data: { id: nid('lb'), employeeId: e.rowId, leaveTypeId: lt.id, year: 2026, total: lt.defaultDays, used, remaining: lt.defaultDays - used, carryForward: 0 } });
        balanceCount++;
      }
    }
  }
  console.log(`✓ Leave balances: ${balanceCount}`);

  // ── 11. Sample leave requests (6 pending / 6 approved / 2 rejected / 2 cancelled) ──
  let reqCount = 0;
  const plans: { status: string; n: number }[] = [{ status: 'pending', n: 6 }, { status: 'approved', n: 6 }, { status: 'rejected', n: 2 }, { status: 'cancelled', n: 2 }];
  for (const plan of plans) {
    for (let i = 0; i < plan.n; i++) {
      const ctx = ctxs[reqCount % ctxs.length];
      const crew = employeesByCompany[ctx.code].filter(e => e.userId);
      const emp = pick(crew);
      const lt = pick(ctx.leaveTypes.filter(t => ['CL', 'SL', 'EL'].includes(t.code)));
      const empRow = await db.employee.findUnique({ where: { id: emp.rowId }, select: { reportingManagerId: true } });
      let approverName = 'Reporting Manager';
      let approverUserId = ctx.hrLeadUserId || null;
      if (empRow?.reportingManagerId) {
        const mgr = await db.employee.findUnique({ where: { id: empRow.reportingManagerId }, select: { userId: true, firstName: true, lastName: true } });
        if (mgr) { approverName = `${mgr.firstName} ${mgr.lastName}`.trim(); if (mgr.userId) approverUserId = mgr.userId; }
      }
      const dur = pickInt(1, 3);
      const startOffset = plan.status === 'pending' ? pickInt(7, 45) : -pickInt(3, 25);
      const start = new Date(todayUtc.getTime() + startOffset * DAY);
      const end = new Date(start.getTime() + (dur - 1) * DAY);
      await (db as any).leaveRequest.create({ data: {
        id: nid('lr'), employeeId: emp.rowId, leaveTypeId: lt.id, startDate: start, endDate: end,
        reason: pick(LEAVE_REASONS), status: plan.status,
        approvedBy: plan.status === 'approved' || plan.status === 'rejected' ? approverName : null,
        approvedAt: plan.status === 'approved' ? new Date(todayUtc.getTime() - pickInt(1, 5) * DAY) : null,
        comments: plan.status === 'rejected' ? 'Insufficient team coverage for these dates — please re-plan after the release.' : null,
        workflowStage: plan.status === 'pending' ? 'pending' : null,
        currentApproverId: plan.status === 'pending' ? approverUserId : null,
      } });
      reqCount++;
    }
  }
  console.log(`✓ Leave requests: ${reqCount}`);

  // ── 12. Announcements ──
  await (db as any).announcement.create({ data: { id: nid('an'), title: 'Welcome to the 3Boxes Test Demo workspace', content: 'This tenant is a sandbox with 5 dummy companies and sample data. Explore every module freely — changes here never affect production.', priority: 'normal', targetAudience: 'all', isActive: true, publishedAt: new Date(todayUtc.getTime() - 2 * DAY) } });
  await (db as any).announcement.create({ data: { id: nid('an'), title: 'Diwali holiday — offices closed Nov 8', content: 'All group companies remain closed on 8 Nov 2026 for Diwali. Plan client deliverables accordingly.', priority: 'important', targetAudience: 'all', isActive: true, publishedAt: new Date(todayUtc.getTime() - 1 * DAY) } });
  await (db as any).announcement.create({ data: { id: nid('an'), title: 'Q4 townhall — Oct 20, 4 PM IST', content: 'Join the all-hands townhall to review quarterly results and roadmap. Calendar invite sent to all employees.', priority: 'normal', targetAudience: 'all', isActive: true, publishedAt: todayUtc } });
  console.log('✓ Announcements: 3');

  // ── 13. Clone workflow configs, tenant configuration, SMTP settings from the current demo tenant ──
  const pg = new PgClient({ connectionString: CLONE_URL });
  await pg.connect();
  const wfc = await pg.query(`SELECT * FROM "EmployeeWorkflowConfig"`);
  for (const r of wfc.rows) {
    await (db as any).employeeWorkflowConfig.create({ data: {
      id: nid('wfc'), tenantId: TENANT_ID, companyId: r.companyId, isActive: r.isActive, name: r.name,
      description: r.description, config: r.config, employmentType: r.employmentType, branchId: r.branchId,
      departmentId: r.departmentId, employeeStatus: r.employeeStatus, workflowType: r.workflowType,
    } });
  }
  const tcfg = await pg.query(`SELECT * FROM "TenantConfiguration" LIMIT 1`);
  if (tcfg.rows[0]) {
    const r = tcfg.rows[0];
    await (db as any).tenantConfiguration.create({ data: {
      id: nid('tcfg'), tenantId: TENANT_ID, autoProvisionPayroll: r.autoProvisionPayroll, autoProvisionCompliance: r.autoProvisionCompliance,
      autoProvisionTaxSlabs: r.autoProvisionTaxSlabs, autoProvisionMinWage: r.autoProvisionMinWage,
      activeCountryCount: r.activeCountryCount, activeCurrencyCount: r.activeCurrencyCount, activeLanguageCount: r.activeLanguageCount,
      estimatedMonthlyCost: r.estimatedMonthlyCost, estimatedAnnualCost: r.estimatedAnnualCost, customisationTier: r.customisationTier,
      maxUsers: r.maxUsers, maxCompanies: r.maxCompanies, maxEmployees: r.maxEmployees, notes: 'Cloned from demo tenant for the test demo workspace',
    } });
  }
  const cs = await pg.query(`SELECT * FROM "CollaborationSettings" LIMIT 1`);
  if (cs.rows[0]) {
    const r = cs.rows[0];
    await (db as any).collaborationSettings.create({ data: {
      id: `cs_demo_smtp_${Math.floor(rnd() * 1e12).toString(16)}`, tenantId: TENANT_ID,
      encryptionEnabled: r.encryptionEnabled, fileSharingLimitMB: r.fileSharingLimitMB, messageRetentionDays: r.messageRetentionDays,
      calendarSyncEnabled: r.calendarSyncEnabled, calendarSyncProvider: r.calendarSyncProvider,
      emailIntegrationEnabled: r.emailIntegrationEnabled, emailProvider: r.emailProvider,
      smtpHost: r.smtpHost, smtpPort: r.smtpPort, smtpUsername: r.smtpUsername, smtpPassword: r.smtpPassword,
      smtpEncryption: r.smtpEncryption, smtpFromName: r.smtpFromName, smtpFromAddress: r.smtpFromAddress, smtpReplyTo: r.smtpReplyTo,
      smtpVerifiedAt: null, smtpVerifyError: null, resendApiKey: null, resendFromAddress: null,
      autoDeleteMessages: r.autoDeleteMessages, maxCallDurationMin: r.maxCallDurationMin, allowExternalSharing: r.allowExternalSharing,
      watermarkEnabled: r.watermarkEnabled, updatedBy: null,
    } });
  }
  await pg.end();
  console.log(`✓ Cloned: ${wfc.rows.length} workflow configs, tenant configuration, SMTP settings`);

  // ── 14. Summary ──
  const counts: Record<string, number> = {};
  for (const [label, model] of Object.entries({
    companies: 'company', branches: 'branch', departments: 'department', designations: 'designation',
    users: 'user', employees: 'employee', leaveTypes: 'leaveType', leaveBalances: 'leaveBalance',
    leaveRequests: 'leaveRequest', holidays: 'holiday', shifts: 'shift', announcements: 'announcement',
    attendance: 'attendance', workflowConfigs: 'employeeWorkflowConfig',
  })) {
    try { counts[label] = await (db as any)[model].count(); } catch { counts[label] = -1; }
  }
  console.log('\n=== SEED SUMMARY (tenant_demo) ===');
  console.log(JSON.stringify(counts, null, 1));
  console.log('\nLogin at https://demo.3boxeshrms.com/login (after domain attach) — password MarqAI@2026:');
  console.log('  admin@demo.3boxeshrms.com    (tenant_admin — MD persona)');
  console.log('  hr@demo.3boxeshrms.com       (hr_admin)');
  console.log('  finance@demo.3boxeshrms.com  (finance_admin)');
  console.log('  manager@demo.3boxeshrms.com  (manager)');
  console.log('  employee@demo.3boxeshrms.com (employee)');
  console.log('  + per-company @acmetech.in / @zenithretail.in / @novahealth.in / @pinnaclemfg.in / @orbitlogistics.in accounts');

  await db.$disconnect();
  console.log('\nSEED DONE');
}
main().catch(async e => { console.error('SEED FAILED:', e); try { await db.$disconnect(); } catch {} process.exit(1); });
