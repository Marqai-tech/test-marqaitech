import { NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { isLiveMode } from '@/lib/site-mode';

/**
 * POST /api/admin/seed-demo-full
 *
 * COMPREHENSIVE demo seeder for the demo link ONLY (3boxes-hrms-demo tenant).
 * GOLDEN RULE: This endpoint is BLOCKED on the live site (3boxeshrms.com).
 *
 * Seeds:
 *   - 6 companies (each with branch, 5 departments, 6 designations, shift, holidays)
 *   - 50 employees distributed across all 6 companies (each company ≥ 6)
 *   - Leave: 5 leave types + balances for all employees + 30 leave requests
 *   - Attendance: last 30 days × 50 employees (weekday-only, 85% present)
 *   - Payroll: 1 PayrollRun (with required legalEntityId) + 3 months payslips × 50
 *   - Recruitment: 6 job postings + 20 candidates + 30 applications
 *   - Assets: 30 assets + 25 assignments
 *   - Training: 5 trainings + 25 enrollments
 *   - Performance: 20 reviews + 40 goals
 *   - Grievances: 8 grievances
 *   - Helpdesk: 15 tickets
 *
 * Query params:
 *   ?reset=true  — delete existing demo companies/employees first (fresh seed)
 *
 * Idempotent: skips companies/employees that already exist (by code / email).
 * Returns a per-module report of created counts.
 */

// ─── Company definitions (6 companies) ──────────────────────────────
const COMPANIES = [
  { name: 'TechNova Solutions', code: 'TNS', city: 'Hyderabad', state: 'Telangana', domain: 'technova.demo' },
  { name: 'Innovatech Systems', code: 'ISY', city: 'Bengaluru', state: 'Karnataka', domain: 'innovatech.demo' },
  { name: 'Global Dynamics Corp', code: 'GDC', city: 'Mumbai', state: 'Maharashtra', domain: 'globaldynamics.demo' },
  { name: 'Apex Services Group', code: 'ASG', city: 'New Delhi', state: 'Delhi', domain: 'apexservices.demo' },
  { name: 'Prime Healthcare Ltd', code: 'PHL', city: 'Chennai', state: 'Tamil Nadu', domain: 'primehealth.demo' },
  { name: 'Stellar Enterprises', code: 'STE', city: 'Pune', state: 'Maharashtra', domain: 'stellar.demo' },
];

// Employee distribution: 50 total across 6 companies (each ≥ 6)
const EMPLOYEE_DISTRIBUTION = [10, 9, 8, 8, 8, 7]; // sums to 50

const DEPARTMENTS = ['Human Resources', 'Engineering', 'Finance', 'Operations', 'Sales & Marketing'];
const DESIGNATIONS = [
  { title: 'Director', level: 8 },
  { title: 'Senior Manager', level: 7 },
  { title: 'Manager', level: 6 },
  { title: 'Team Lead', level: 4 },
  { title: 'Senior Executive', level: 3 },
  { title: 'Executive', level: 2 },
];

const FIRST_NAMES = ['Aarav', 'Ananya', 'Rohan', 'Priya', 'Vikram', 'Sneha', 'Arjun', 'Kavya', 'Rahul', 'Divya',
  'Karthik', 'Meera', 'Sanjay', 'Pooja', 'Naveen', 'Shreya', 'Aditya', 'Nisha', 'Varun', 'Riya',
  'Suresh', 'Deepika', 'Manish', 'Aishwarya', 'Nikhil', 'Swathi', 'Harish', 'Lakshmi', 'Praveen', 'Anitha',
  'Ramesh', 'Kiran', 'Sandeep', 'Bhavna', 'Gaurav', 'Preeti', 'Amit', 'Neha', 'Siddharth', 'Trisha',
  'Mahesh', 'Swara', 'Rajesh', 'Ishita', 'Vivek', 'Anjali', 'Nitin', 'Sapna', 'Abhishek', 'Meghana'];
const LAST_NAMES = ['Kumar', 'Sharma', 'Patel', 'Reddy', 'Singh', 'Nair', 'Iyer', 'Gupta', 'Rao', 'Menon',
  'Joshi', 'Verma', 'Mehta', 'Krishnan', 'Das', 'Shah', 'Pillai', 'Bose', 'Chopra', 'Malhotra'];

const LEAVE_REASONS = [
  'Family function in hometown', 'Not feeling well, fever and cold', 'Personal work at home',
  'Medical checkup appointment', 'Sister wedding', 'Need rest due to exhaustion',
  'Travelling out of station', 'Home maintenance work', 'Childcare emergency', 'Attending training program',
];

const GRIEVANCE_TYPES = ['workload', 'salary', 'harassment', 'discrimination', 'other'];
const GRIEVANCE_SUBJECTS = [
  'Excessive workload in current project', 'Salary discrepancy in last month payslip',
  'Unfair shift allocation', 'Workspace seating arrangement issue',
  'Late reimbursement processing', 'Manager communication concerns',
  'Overtime not being tracked properly', 'Cafeteria food quality concerns',
];

const TICKET_SUBJECTS = [
  'Unable to login to HRMS portal', 'Payslip download not working',
  'Leave balance showing incorrect', 'Request for laptop upgrade',
  'Attendance regularization for last Friday', 'Health insurance card not received',
  'PF deduction query', 'Profile photo not updating',
  'Email ID change request', 'Parking pass renewal',
  'ID card replacement', 'Internet connectivity issues at desk',
  'Reset MFA device', 'Tax declaration form help',
  'Recruitment portal access request',
];

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }
function rand(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randMoney(min: number, max: number): number { return rand(min, max); }
function daysAgo(n: number): Date { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function isWeekend(d: Date): boolean { const day = d.getDay(); return day === 0 || day === 6; }

export async function POST(request: Request) {
  try {
    // ─── GOLDEN RULE: demo site ONLY ───
    if (isLiveMode(request)) {
      return NextResponse.json(
        { error: 'Seeding is BLOCKED on the live site. This endpoint only works on the demo link.' },
        { status: 403 },
      );
    }

    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    if (!['super_admin', 'tenant_admin', 'admin'].includes(decoded.role as string)) {
      return NextResponse.json({ error: 'Only admins can seed demo data' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const reset = searchParams.get('reset') === 'true';

    const platformDb = getPlatformDb();
    const DEMO_SLUG = '3boxes-hrms-demo';

    // ─── 1. Find/ensure demo tenant ───
    let tenant: any = await platformDb.tenant.findUnique({
      where: { slug: DEMO_SLUG },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) {
      tenant = await platformDb.tenant.create({
        data: {
          name: '3 Boxes HRMS Demo',
          slug: DEMO_SLUG,
          domain: 'nexus-hrms-mu.vercel.app',
          plan: 'enterprise',
          status: 'active',
          country: 'IN',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          maxCompaniesAllowed: 10,
        },
      });
    }

    // ─── 2. Get the demo tenant DB ───
    const db = await getDbForTenant(DEMO_SLUG);

    const report: Record<string, { created: number; skipped: number; note?: string }> = {};

    // ─── 3. Optional reset: clear existing companies + employees ───
    if (reset) {
      try {
        const oldEmployees = await db.employee.findMany({ select: { id: true } });
        const oldEmpIds = oldEmployees.map((e: any) => e.id);
        const oldCompanies = await db.company.findMany({ select: { id: true } });
        const oldCompanyIds = oldCompanies.map((c: any) => c.id);

        for (const empId of oldEmpIds) {
          await db.leaveRequest.deleteMany({ where: { employeeId: empId } }).catch(() => {});
          await db.leaveBalance.deleteMany({ where: { employeeId: empId } }).catch(() => {});
          await db.attendance.deleteMany({ where: { employeeId: empId } }).catch(() => {});
          await db.payroll.deleteMany({ where: { employeeId: empId } }).catch(() => {});
          await db.performanceReview.deleteMany({ where: { employeeId: empId } }).catch(() => {});
          await db.goal.deleteMany({ where: { employeeId: empId } }).catch(() => {});
          await db.assetAssignment.deleteMany({ where: { employeeId: empId } }).catch(() => {});
          await db.trainingEnrollment.deleteMany({ where: { employeeId: empId } }).catch(() => {});
          await db.grievance.deleteMany({ where: { employeeId: empId } }).catch(() => {});
          await db.employeeCompanyMapping.deleteMany({ where: { employeeId: empId } }).catch(() => {});
        }
        for (const compId of oldCompanyIds) {
          await db.shift.deleteMany({ where: { companyId: compId } }).catch(() => {});
          await db.holiday.deleteMany({ where: { companyId: compId } }).catch(() => {});
          await db.department.deleteMany({ where: { companyId: compId } }).catch(() => {});
          await db.branch.deleteMany({ where: { companyId: compId } }).catch(() => {});
        }
        await db.employee.deleteMany({}).catch(() => {});
        await db.company.deleteMany({}).catch(() => {});
        await db.companyGroup.deleteMany({}).catch(() => {});
        await db.designation.deleteMany({}).catch(() => {});
        await db.jobApplication.deleteMany({}).catch(() => {});
        await db.candidate.deleteMany({}).catch(() => {});
        await db.asset.deleteMany({}).catch(() => {});
        await db.training.deleteMany({}).catch(() => {});
        await db.grievance.deleteMany({}).catch(() => {});
        await db.ticket.deleteMany({}).catch(() => {});
        await db.payrollRun.deleteMany({}).catch(() => {});
        report['reset'] = { created: 1, skipped: 0, note: 'Cleared existing demo data' };
      } catch (e) {
        report['reset'] = { created: 0, skipped: 0, note: `Reset partially failed: ${e instanceof Error ? e.message : 'unknown'}` };
      }
    } else {
      report['reset'] = { created: 0, skipped: 0, note: 'Reset not requested' };
    }

    // ─── 4. Company Group ───
    let group = await db.companyGroup.findFirst({ where: { tenantId: tenant.id } });
    if (!group) {
      group = await db.companyGroup.create({
        data: { name: '3 Boxes Enterprise Group', tenantId: tenant.id },
      });
    }

    // ─── 5. Create 6 companies + branches + departments + designations + shifts + holidays ───
    const companyRecords: any[] = [];
    const deptRecordsByCompany: Record<string, any[]> = {};
    const desgRecordsByCompany: Record<string, any[]> = {};
    const branchRecordsByCompany: Record<string, any[]> = {};

    for (const c of COMPANIES) {
      let company = await db.company.findFirst({ where: { code: c.code } });
      if (!company) {
        company = await db.company.create({
          data: {
            name: c.name, code: c.code, companyGroupId: group.id,
            country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata',
            city: c.city, state: c.state, email: `info@${c.domain}`,
            website: `https://${c.domain}`, status: 'active', maxEmployees: 100,
          },
        });
        report['companies'] = report['companies'] || { created: 0, skipped: 0 };
        report['companies'].created++;
      } else {
        report['companies'] = report['companies'] || { created: 0, skipped: 0 };
        report['companies'].skipped++;
      }
      companyRecords.push(company);

      // Branch
      let branch = await db.branch.findFirst({ where: { companyId: company.id, name: 'Head Office' } });
      if (!branch) {
        branch = await db.branch.create({
          data: {
            name: 'Head Office', code: `${c.code}-HO`, companyId: company.id,
            city: c.city, state: c.state, country: 'IN', status: 'active',
            address: `${c.city}, ${c.state}`,
          },
        });
      }
      branchRecordsByCompany[company.id] = [branch];

      // Departments (5 per company)
      const depts: any[] = [];
      for (const dn of DEPARTMENTS) {
        let dept = await db.department.findFirst({ where: { companyId: company.id, name: dn } });
        if (!dept) {
          dept = await db.department.create({
            data: { name: dn, companyId: company.id, branchId: branch.id, status: 'active' },
          });
        }
        depts.push(dept);
      }
      deptRecordsByCompany[company.id] = depts;

      // Designations (6 per company)
      const desgs: any[] = [];
      for (let i = 0; i < DESIGNATIONS.length; i++) {
        const d = DESIGNATIONS[i];
        const dept = depts[i % depts.length];
        let desg = await db.designation.findFirst({ where: { departmentId: dept.id, title: d.title } });
        if (!desg) {
          desg = await db.designation.create({
            data: {
              title: d.title, departmentId: dept.id, level: d.level,
              minSalary: d.level >= 6 ? 1500000 : 400000,
              maxSalary: d.level >= 6 ? 3000000 : 1200000,
              status: 'active',
            },
          });
        }
        desgs.push(desg);
      }
      desgRecordsByCompany[company.id] = desgs;

      // Shifts
      const shiftCount = await db.shift.count({ where: { companyId: company.id } });
      if (shiftCount === 0) {
        await db.shift.create({
          data: { name: 'General Shift', startTime: '09:00', endTime: '18:00', breakDuration: 60, graceTime: 15, companyId: company.id, status: 'active' },
        }).catch(() => {});
        await db.shift.create({
          data: { name: 'Early Shift', startTime: '06:00', endTime: '15:00', breakDuration: 45, graceTime: 10, companyId: company.id, status: 'active' },
        }).catch(() => {});
      }

      // Holidays (5 per company)
      const holidayCount = await db.holiday.count({ where: { companyId: company.id } });
      if (holidayCount === 0) {
        const holidays2026 = [
          { name: 'Republic Day', date: new Date('2026-01-26') },
          { name: 'Holi', date: new Date('2026-03-04') },
          { name: 'Independence Day', date: new Date('2026-08-15') },
          { name: 'Diwali', date: new Date('2026-11-08') },
          { name: 'Christmas', date: new Date('2026-12-25') },
        ];
        for (const h of holidays2026) {
          await db.holiday.create({
            data: { name: h.name, date: h.date, type: 'public', country: 'IN', companyId: company.id, status: 'active' },
          }).catch(() => {});
        }
      }
    }

    // ─── 6. Create 50 employees ───
    const employees: any[] = [];
    for (let ci = 0; ci < companyRecords.length; ci++) {
      const company = companyRecords[ci];
      const count = EMPLOYEE_DISTRIBUTION[ci];
      const depts = deptRecordsByCompany[company.id];
      const desgs = desgRecordsByCompany[company.id];
      const branch = branchRecordsByCompany[company.id][0];

      for (let ei = 0; ei < count; ei++) {
        const firstName = pick(FIRST_NAMES, (ci * 10 + ei) * 2 + 1);
        const lastName = pick(LAST_NAMES, (ci * 10 + ei) * 3 + 2);
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${COMPANIES[ci].domain}`;
        const empCode = `EMP-${COMPANIES[ci].code}-${String(ei + 1).padStart(3, '0')}`;

        let emp: any = await db.employee.findFirst({ where: { email } });
        if (!emp) {
          let empIdFinal = empCode;
          const codeExists = await db.employee.findFirst({ where: { employeeId: empIdFinal } });
          if (codeExists) empIdFinal = `${empCode}-${Date.now().toString(36).slice(-4)}`;

          const desg = desgs[ei % desgs.length];
          const dept = depts.find((d: any) => d.id === desg.departmentId) || depts[ei % depts.length];
          const salaryByLevel = desg.title === 'Director' ? 2800000 : desg.title === 'Senior Manager' ? 2200000
            : desg.title === 'Manager' ? 1600000 : desg.title === 'Team Lead' ? 1200000
            : desg.title === 'Senior Executive' ? 800000 : 550000;

          emp = await db.employee.create({
            data: {
              employeeId: empIdFinal,
              firstName, lastName, email,
              personalEmail: `${firstName.toLowerCase()}${lastName.toLowerCase()}@gmail.com`,
              phone: `+91-98${rand(10000000, 99999999)}`,
              departmentId: dept.id, designationId: desg.id,
              branchId: branch.id, companyId: company.id,
              dateOfJoining: daysAgo(rand(90, 1500)),
              dateOfBirth: new Date(rand(1980, 2000), rand(0, 11), rand(1, 28)),
              gender: ei % 2 === 0 ? 'male' : 'female',
              maritalStatus: ei % 3 === 0 ? 'married' : 'single',
              nationality: 'Indian',
              city: COMPANIES[ci].city, state: COMPANIES[ci].state, country: 'IN',
              status: 'active',
              employeeStatus: ei < 2 ? 'probation' : 'confirmed',
              employeeType: ei % 5 === 0 ? 'contract' : 'full_time',
              salary: salaryByLevel + rand(-50000, 100000),
              salaryCurrency: 'INR',
              bankName: pick(['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank'], ei),
              bankAccountNo: `${rand(10000000000, 99999999999)}`,
              bankIfscCode: `HDFC000${rand(1000, 9999)}`,
            },
          });
          report['employees'] = report['employees'] || { created: 0, skipped: 0 };
          report['employees'].created++;
        } else {
          report['employees'] = report['employees'] || { created: 0, skipped: 0 };
          report['employees'].skipped++;
        }
        employees.push(emp);

        // EmployeeCompanyMapping
        const mappingExists = await db.employeeCompanyMapping.findFirst({
          where: { employeeId: emp.id, companyId: company.id },
        });
        if (!mappingExists) {
          await db.employeeCompanyMapping.create({
            data: {
              employeeId: emp.id, companyId: company.id,
              employeeCode: emp.employeeId,
              departmentId: emp.departmentId, designationId: emp.designationId,
              branchId: emp.branchId, isPrimary: true, status: 'active',
              dateOfJoining: emp.dateOfJoining,
            },
          }).catch(() => {});
        }
      }
    }

    // ─── 7. Assign reporting managers (first employee of each company = manager) ───
    for (const company of companyRecords) {
      const companyEmps = employees.filter(e => e.companyId === company.id);
      if (companyEmps.length > 1) {
        const manager = companyEmps[0];
        for (const emp of companyEmps.slice(1)) {
          if (!emp.reportingManagerId) {
            await db.employee.update({ where: { id: emp.id }, data: { reportingManagerId: manager.id } }).catch(() => {});
          }
        }
      }
    }

    // ─── 8. Leave module: types + balances + requests ───
    const leaveTypeDefs = [
      { name: 'Casual Leave', code: 'CL', defaultDays: 12, isPaid: true, carryForward: true, maxCarryForward: 3 },
      { name: 'Sick Leave', code: 'SL', defaultDays: 10, isPaid: true, carryForward: false, maxCarryForward: 0 },
      { name: 'Earned Leave', code: 'EL', defaultDays: 15, isPaid: true, carryForward: true, maxCarryForward: 5 },
      { name: 'Maternity Leave', code: 'ML', defaultDays: 90, isPaid: true, carryForward: false, maxCarryForward: 0 },
      { name: 'Paternity Leave', code: 'PL', defaultDays: 15, isPaid: true, carryForward: false, maxCarryForward: 0 },
    ];
    const leaveTypes: any[] = [];
    for (const lt of leaveTypeDefs) {
      let type: any = null;
      try { type = await db.leaveType.findUnique({ where: { code: lt.code } }); } catch { /* not found */ }
      if (!type) {
        type = await db.leaveType.create({ data: lt }).catch(() => null);
      }
      if (type) leaveTypes.push(type);
    }

    const currentYear = new Date().getFullYear();
    let balancesCreated = 0;
    for (const emp of employees) {
      for (const lt of leaveTypes) {
        if (lt.code === 'ML' || lt.code === 'PL') continue;
        const exists = await db.leaveBalance.findFirst({
          where: { employeeId: emp.id, leaveTypeId: lt.id, year: currentYear },
        });
        if (!exists) {
          const used = rand(0, 5);
          await db.leaveBalance.create({
            data: {
              employeeId: emp.id, leaveTypeId: lt.id, year: currentYear,
              total: lt.defaultDays, used, carryForward: 0,
              remaining: Math.max(0, lt.defaultDays - used),
            },
          }).catch(() => {});
          balancesCreated++;
        }
      }
    }
    report['leaveBalances'] = { created: balancesCreated, skipped: 0 };

    // Leave requests (30, mixed statuses)
    let leaveCreated = 0;
    for (let i = 0; i < 30; i++) {
      const emp = pick(employees, i * 3);
      const lt = pick(leaveTypes.slice(0, 3), i);
      const startOffset = rand(-60, 20);
      const start = daysAgo(-startOffset);
      const duration = rand(1, 4);
      const end = new Date(start);
      end.setDate(end.getDate() + duration - 1);

      const exists = await db.leaveRequest.findFirst({
        where: { employeeId: emp.id, leaveTypeId: lt.id, startDate: start },
      });
      if (exists) continue;

      const status = i < 12 ? 'approved' : i < 22 ? 'pending' : i < 27 ? 'rejected' : 'cancelled';
      await db.leaveRequest.create({
        data: {
          employeeId: emp.id, leaveTypeId: lt.id,
          startDate: start, endDate: end,
          reason: pick(LEAVE_REASONS, i),
          status,
          approvedBy: status === 'approved' || status === 'rejected' ? 'seed-demo' : null,
          approvedAt: status === 'approved' || status === 'rejected' ? new Date() : null,
          comments: status === 'rejected' ? 'Team capacity constraints during this period' : null,
        },
      }).then(() => { leaveCreated++; }).catch(() => {});
    }
    report['leaveRequests'] = { created: leaveCreated, skipped: 0 };

    // ─── 9. Attendance: last 30 days × 50 employees (weekday-only) ───
    let attCreated = 0;
    for (let dayOffset = 1; dayOffset <= 30; dayOffset++) {
      const date = daysAgo(dayOffset);
      if (isWeekend(date)) continue;
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      for (let i = 0; i < employees.length; i++) {
        const emp = employees[i];
        const roll = Math.random();
        const status = roll < 0.82 ? 'present' : roll < 0.92 ? 'late' : roll < 0.96 ? 'half_day' : 'absent';
        if (status === 'absent') continue;
        try {
          await db.attendance.create({
            data: {
              employeeId: emp.id, date: dateOnly, status,
              checkIn: status === 'present' ? `0${rand(8, 9)}:${rand(10, 59)}` : `09:${rand(20, 59)}`,
              checkOut: '18:30',
              workHours: status === 'half_day' ? 4.5 : 8.5,
              overtime: rand(0, 2) === 0 ? rand(1, 3) : 0,
              location: i % 3 === 0 ? 'WFH' : 'Office HQ',
            },
          });
          attCreated++;
        } catch { /* unique constraint — already exists */ }
      }
    }
    report['attendance'] = { created: attCreated, skipped: 0 };

    // ─── 10. Payroll: PayrollRun (with legalEntityId!) + 3 months payslips ───
    const firstCompany = companyRecords[0];
    let payrollRunCreated = 0;
    for (let m = 2; m >= 0; m--) {
      const runDate = new Date();
      runDate.setMonth(runDate.getMonth() - m);
      const period = `${runDate.getFullYear()}-${String(runDate.getMonth() + 1).padStart(2, '0')}`;
      const periodStart = new Date(runDate.getFullYear(), runDate.getMonth(), 1);
      const periodEnd = new Date(runDate.getFullYear(), runDate.getMonth() + 1, 0);
      const payDate = new Date(runDate.getFullYear(), runDate.getMonth() + 1, 1);

      const runExists = await db.payrollRun.findFirst({
        where: { legalEntityId: firstCompany.id, payrollPeriod: period },
      });
      if (!runExists) {
        await db.payrollRun.create({
          data: {
            legalEntityId: firstCompany.id,
            payrollPeriod: period,
            periodStartDate: periodStart,
            periodEndDate: periodEnd,
            payDate,
            runType: 'REGULAR',
            runStatus: 'DISBURSED',
            currencyCode: 'INR',
          },
        }).catch(() => {});
        payrollRunCreated++;
      }

      let payslipCreated = 0;
      for (const emp of employees) {
        const exists = await db.payroll.findFirst({
          where: { employeeId: emp.id, month: runDate.getMonth() + 1, year: runDate.getFullYear() },
        });
        if (exists) continue;
        const basic = Math.round((emp.salary || 600000) / 12);
        const hra = Math.round(basic * 0.4);
        const da = Math.round(basic * 0.1);
        const conveyance = 1600;
        const medical = 1250;
        const otherAllowances = rand(2000, 8000);
        const gross = basic + hra + da + conveyance + medical + otherAllowances;
        const pf = Math.round(basic * 0.12);
        const esi = gross <= 21000 ? Math.round(gross * 0.0075) : 0;
        const tax = Math.round(gross * 0.08);
        const profTax = 200;
        const totalDed = pf + esi + tax + profTax;
        try {
          await db.payroll.create({
            data: {
              employeeId: emp.id,
              month: runDate.getMonth() + 1, year: runDate.getFullYear(),
              basicSalary: basic, hra, da, conveyance, medical, otherAllowances,
              grossSalary: gross, pf, esi, tax, professionalTax: profTax,
              otherDeductions: 0, totalDeductions: totalDed,
              netSalary: gross - totalDed, currency: 'INR',
              status: 'paid', paidDate: payDate,
            },
          });
          payslipCreated++;
        } catch { /* unique — exists */ }
      }
      report['payroll'] = report['payroll'] || { created: 0, skipped: 0 };
      report['payroll'].created += payslipCreated;
      report['payrollRuns'] = report['payrollRuns'] || { created: 0, skipped: 0 };
      report['payrollRuns'].created = payrollRunCreated;
    }

    // ─── 11. Recruitment: job postings + candidates + applications ───
    const jobTitles = ['Senior Software Engineer', 'Product Manager', 'HR Business Partner', 'Financial Analyst', 'Sales Executive', 'Operations Lead'];
    let jobsCreated = 0;
    const jobRecords: any[] = [];
    for (let i = 0; i < jobTitles.length; i++) {
      const company = companyRecords[i % companyRecords.length];
      const dept = deptRecordsByCompany[company.id][i % DEPARTMENTS.length];
      let job = await db.jobPosting.findFirst({ where: { title: jobTitles[i], departmentId: dept.id } });
      if (!job) {
        job = await db.jobPosting.create({
          data: {
            title: jobTitles[i], departmentId: dept.id, position: jobTitles[i],
            location: COMPANIES[i % companyRecords.length].city,
            type: 'full-time', experience: `${rand(2, 8)}-${rand(8, 12)} years`,
            salary: `${rand(8, 15)}-${rand(15, 30)} LPA`,
            description: `We are looking for an experienced ${jobTitles[i]} to join our growing team.`,
            requirements: 'Bachelor degree, relevant experience, strong communication skills',
            status: 'open', vacancies: rand(1, 5),
          },
        }).catch(() => null);
        if (job) jobsCreated++;
      }
      if (job) jobRecords.push(job);
    }
    report['jobPostings'] = { created: jobsCreated, skipped: 0 };

    // Candidates (need tenantId!)
    const candidateRecords: any[] = [];
    let candCreated = 0;
    for (let i = 0; i < 20; i++) {
      const firstName = pick(FIRST_NAMES, i * 7 + 3);
      const lastName = pick(LAST_NAMES, i * 5 + 1);
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@candidate.demo`;
      let cand = await db.candidate.findFirst({ where: { tenantId: tenant.id, email } });
      if (!cand) {
        cand = await db.candidate.create({
          data: {
            tenantId: tenant.id,
            firstName, lastName, email,
            phone: `+91-97${rand(10000000, 99999999)}`,
            status: pick(['new', 'screening', 'interviewing', 'offer', 'hired', 'rejected'], i),
            source: pick(['linkedin', 'job-portal', 'referral', 'company-website'], i),
          },
        }).catch(() => null);
        if (cand) candCreated++;
      }
      if (cand) candidateRecords.push(cand);
    }
    report['candidates'] = { created: candCreated, skipped: 0 };

    // Applications
    let appCreated = 0;
    for (let i = 0; i < 30; i++) {
      const job = pick(jobRecords, i);
      if (!job) continue;
      const cand = pick(candidateRecords, i * 2);
      const name = cand ? `${cand.firstName} ${cand.lastName}` : `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i)}`;
      const email = cand ? cand.email : `applicant${i}@candidate.demo`;
      const exists = await db.jobApplication.findFirst({ where: { jobPostingId: job.id, candidateEmail: email } });
      if (!exists) {
        await db.jobApplication.create({
          data: {
            jobPostingId: job.id,
            candidateId: cand?.id || null,
            candidateName: name, candidateEmail: email,
            candidatePhone: `+91-96${rand(10000000, 99999999)}`,
            status: pick(['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'], i),
            source: pick(['linkedin', 'job-portal', 'referral'], i),
            rating: rand(2, 5),
            expectedSalary: randMoney(600000, 2500000),
          },
        }).catch(() => {});
        appCreated++;
      }
    }
    report['jobApplications'] = { created: appCreated, skipped: 0 };

    // ─── 12. Assets + assignments ───
    const assetCategories = ['laptop', 'desktop', 'phone', 'tablet', 'monitor'];
    const assetBrands = ['Dell', 'HP', 'Apple', 'Lenovo', 'Samsung'];
    let assetsCreated = 0;
    const assetRecords: any[] = [];
    for (let i = 0; i < 30; i++) {
      const company = companyRecords[i % companyRecords.length];
      const category = pick(assetCategories, i);
      const assetTag = `AST-${company.code}-${String(i + 1).padStart(4, '0')}`;
      let asset: any = null;
      try { asset = await db.asset.findUnique({ where: { assetTag } }); } catch { /* not found */ }
      if (!asset) {
        asset = await db.asset.create({
          data: {
            name: `${pick(assetBrands, i)} ${category}`,
            assetTag, category,
            brand: pick(assetBrands, i),
            model: `Model-${rand(100, 999)}`,
            serialNumber: `SN${rand(100000, 999999)}`,
            purchaseDate: daysAgo(rand(30, 900)),
            purchaseCost: randMoney(25000, 180000),
            status: i < 25 ? 'assigned' : 'available',
            condition: pick(['new', 'good', 'good', 'fair'], i),
            location: company.city,
            warrantyExpiry: daysAgo(-rand(30, 700)),
          },
        }).catch(() => null);
        if (asset) assetsCreated++;
      }
      if (asset) assetRecords.push(asset);
    }
    report['assets'] = { created: assetsCreated, skipped: 0 };

    let assignCreated = 0;
    for (let i = 0; i < Math.min(25, assetRecords.length); i++) {
      const asset = assetRecords[i];
      if (!asset) continue;
      const emp = pick(employees, i * 2);
      const exists = await db.assetAssignment.findFirst({ where: { assetId: asset.id, employeeId: emp.id } });
      if (!exists) {
        await db.assetAssignment.create({
          data: {
            assetId: asset.id, employeeId: emp.id,
            assignedDate: daysAgo(rand(10, 300)),
            status: 'active',
          },
        }).catch(() => {});
        assignCreated++;
      }
    }
    report['assetAssignments'] = { created: assignCreated, skipped: 0 };

    // ─── 13. Training + enrollments ───
    const trainings = [
      'Python for Data Analysis', 'Effective Communication Skills', 'Workplace Safety & Compliance',
      'Advanced Excel for Finance', 'Leadership Fundamentals',
    ];
    const trainingRecords: any[] = [];
    let trainingsCreated = 0;
    for (let i = 0; i < trainings.length; i++) {
      let training = await db.training.findFirst({ where: { title: trainings[i] } });
      if (!training) {
        const start = daysAgo(-rand(5, 40));
        const end = new Date(start);
        end.setDate(end.getDate() + rand(2, 10));
        training = await db.training.create({
          data: {
            title: trainings[i],
            description: `Professional development training: ${trainings[i]}`,
            category: pick(['technical', 'soft-skills', 'compliance', 'leadership'], i),
            trainer: `${pick(FIRST_NAMES, i + 5)} ${pick(LAST_NAMES, i + 3)}`,
            startDate: start, endDate: end,
            location: i % 2 === 0 ? 'Online (Zoom)' : `Training Room A, ${COMPANIES[i % 6].city}`,
          },
        }).catch(() => null);
        if (training) trainingsCreated++;
      }
      if (training) trainingRecords.push(training);
    }
    report['trainings'] = { created: trainingsCreated, skipped: 0 };

    let enrollCreated = 0;
    for (let i = 0; i < 25; i++) {
      const training = pick(trainingRecords, i);
      if (!training) continue;
      const emp = pick(employees, i * 2 + 1);
      const exists = await db.trainingEnrollment.findFirst({ where: { trainingId: training.id, employeeId: emp.id } });
      if (!exists) {
        await db.trainingEnrollment.create({
          data: {
            trainingId: training.id, employeeId: emp.id,
            status: pick(['enrolled', 'completed', 'completed', 'in_progress'], i),
            score: rand(60, 98),
          },
        }).catch(() => {});
        enrollCreated++;
      }
    }
    report['trainingEnrollments'] = { created: enrollCreated, skipped: 0 };

    // ─── 14. Performance: reviews + goals ───
    let reviewsCreated = 0;
    for (let i = 0; i < 20; i++) {
      const emp = pick(employees, i * 2 + 1);
      const cycle = pick(['Q1 2026', 'Q2 2026', 'Annual 2025'], i);
      const exists = await db.performanceReview.findFirst({ where: { employeeId: emp.id, reviewCycle: cycle } });
      if (!exists) {
        await db.performanceReview.create({
          data: {
            employeeId: emp.id, reviewCycle: cycle,
            reviewPeriod: cycle,
            rating: rand(2, 5),
            goalsRating: rand(2, 5),
            skillsRating: rand(2, 5),
            behaviorRating: rand(2, 5),
            overallRating: rand(2, 5),
            comments: pick([
              'Consistent performer, exceeds expectations in project delivery.',
              'Good team player, needs improvement in time management.',
              'Outstanding technical skills, ready for next-level responsibility.',
              'Meets expectations, showing steady growth this quarter.',
            ], i),
            status: pick(['completed', 'completed', 'pending'], i),
            reviewDate: daysAgo(rand(10, 120)),
          },
        }).catch(() => {});
        reviewsCreated++;
      }
    }
    report['performanceReviews'] = { created: reviewsCreated, skipped: 0 };

    const goalTitles = ['Complete Q3 project deliverables', 'Improve customer satisfaction score', 'Learn new technology stack',
      'Reduce response time by 20%', 'Mentor junior team members', 'Achieve sales target of 50L',
      'Complete certification course', 'Lead a cross-functional initiative'];
    let goalsCreated = 0;
    for (let i = 0; i < 40; i++) {
      const emp = pick(employees, i);
      const title = pick(goalTitles, i);
      const exists = await db.goal.findFirst({ where: { employeeId: emp.id, title } });
      if (!exists) {
        const start = daysAgo(rand(30, 90));
        const end = new Date(start);
        end.setMonth(end.getMonth() + 3);
        await db.goal.create({
          data: {
            employeeId: emp.id, title,
            description: `Goal: ${title}. Aligned with quarterly objectives.`,
            category: pick(['performance', 'development', 'behavioral'], i),
            priority: pick(['high', 'medium', 'low'], i),
            status: pick(['not_started', 'in_progress', 'in_progress', 'completed'], i),
            progress: rand(0, 100),
            startDate: start, endDate: end,
          },
        }).catch(() => {});
        goalsCreated++;
      }
    }
    report['goals'] = { created: goalsCreated, skipped: 0 };

    // ─── 15. Grievances ───
    let grievancesCreated = 0;
    for (let i = 0; i < 8; i++) {
      const emp = pick(employees, i * 5);
      const subject = pick(GRIEVANCE_SUBJECTS, i);
      const exists = await db.grievance.findFirst({ where: { employeeId: emp.id, subject } });
      if (!exists) {
        await db.grievance.create({
          data: {
            employeeId: emp.id,
            type: pick(GRIEVANCE_TYPES, i),
            subject,
            description: `${subject}. Requesting HR to review and take appropriate action. This issue has been ongoing and affecting my work experience.`,
            priority: pick(['low', 'medium', 'high'], i),
            status: pick(['open', 'in_progress', 'resolved', 'closed'], i),
            assignedTo: i % 2 === 0 ? 'HR Team' : null,
          },
        }).catch(() => {});
        grievancesCreated++;
      }
    }
    report['grievances'] = { created: grievancesCreated, skipped: 0 };

    // ─── 16. Helpdesk tickets ───
    let ticketsCreated = 0;
    for (let i = 0; i < 15; i++) {
      const emp = pick(employees, i * 3);
      const subject = pick(TICKET_SUBJECTS, i);
      const ticketId = `TK-${String(Date.now()).slice(-6)}-${String(i + 1).padStart(4, '0')}`;
      const exists = await db.ticket.findFirst({ where: { requesterId: emp.id, subject } });
      if (!exists) {
        await db.ticket.create({
          data: {
            ticketId,
            requesterType: 'employee',
            requesterId: emp.id,
            requesterName: `${emp.firstName} ${emp.lastName}`,
            subject,
            description: `${subject}. Raised via employee helpdesk portal. Please assist at the earliest.`,
            priority: pick(['low', 'medium', 'medium', 'high'], i),
            status: pick(['open', 'in_progress', 'resolved', 'closed', 'open'], i),
          },
        }).catch(() => {});
        ticketsCreated++;
      }
    }
    report['tickets'] = { created: ticketsCreated, skipped: 0 };

    // ─── Final summary ───
    const totalCreated = Object.values(report).reduce((sum: number, r: any) => sum + (r.created || 0), 0);
    const totalEmployees = await db.employee.count().catch(() => 0);
    const totalCompanies = await db.company.count().catch(() => 0);

    return NextResponse.json({
      success: true,
      message: `Demo seed complete. ${totalCompanies} companies, ${totalEmployees} employees. ${totalCreated} records created across all modules.`,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      summary: { totalCompanies, totalEmployees, totalCreated },
      report,
    });
  } catch (error) {
    console.error('[SeedDemoFull] Error:', error);
    return NextResponse.json(
      { error: 'Demo seed failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
