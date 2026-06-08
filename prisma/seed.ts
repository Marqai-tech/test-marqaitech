import bcryptjs from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

// Setup Prisma client with Neon adapter (same pattern as src/lib/prisma.ts)
const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('No database connection string found. Set POSTGRES_PRISMA_URL, POSTGRES_URL, or DATABASE_URL');
}

const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

async function hashPassword(password: string): Promise<string> {
  const salt = await bcryptjs.genSalt(12);
  return bcryptjs.hash(password, salt);
}

async function main() {
  console.log('🌱 Seeding database...');
  console.log('ℹ️  Using connection string prefix:', connectionString?.substring(0, 30) + '...');

  // ==================== TENANT ====================
  console.log('\n📋 Creating Tenant...');
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Nexus HRMS Demo',
      slug: 'nexus-hrms-demo',
      domain: 'demo.nexushrms.com',
      plan: 'enterprise',
      status: 'active',
      country: 'US',
      currency: 'USD',
      timezone: 'America/New_York',
    },
  });
  console.log(`  ✓ Tenant: ${tenant.name} (${tenant.id})`);

  // ==================== COMPANY GROUP ====================
  console.log('\n📋 Creating Company Group...');
  const companyGroup = await prisma.companyGroup.create({
    data: {
      name: 'TechCorp Global Group',
      tenantId: tenant.id,
    },
  });
  console.log(`  ✓ CompanyGroup: ${companyGroup.name}`);

  // ==================== COMPANIES ====================
  console.log('\n📋 Creating Companies...');
  const [tcg, mpi, hfs] = await Promise.all([
    prisma.company.create({
      data: {
        name: 'TechCorp Global',
        code: 'TCG',
        companyGroupId: companyGroup.id,
        country: 'US',
        currency: 'USD',
        timezone: 'America/New_York',
        city: 'San Francisco',
        state: 'CA',
        email: 'info@techcorp.com',
        website: 'https://techcorp.com',
        status: 'active',
      },
    }),
    prisma.company.create({
      data: {
        name: 'ManufactPro Industries',
        code: 'MPI',
        companyGroupId: companyGroup.id,
        country: 'IN',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        city: 'Mumbai',
        state: 'MH',
        email: 'info@manufactpro.com',
        status: 'active',
      },
    }),
    prisma.company.create({
      data: {
        name: 'HealthFirst Solutions',
        code: 'HFS',
        companyGroupId: companyGroup.id,
        country: 'GB',
        currency: 'GBP',
        timezone: 'Europe/London',
        city: 'London',
        state: 'England',
        email: 'info@healthfirst.com',
        status: 'active',
      },
    }),
  ]);
  console.log(`  ✓ Created 3 companies: ${tcg.name}, ${mpi.name}, ${hfs.name}`);

  // ==================== BRANCHES ====================
  console.log('\n📋 Creating Branches...');
  const [sfBranch, nyBranch, mumbaiBranch, londonBranch] = await Promise.all([
    prisma.branch.create({
      data: { name: 'HQ San Francisco', code: 'TCG-SF', city: 'San Francisco', state: 'CA', country: 'US', companyId: tcg.id, status: 'active' },
    }),
    prisma.branch.create({
      data: { name: 'NYC Office', code: 'TCG-NY', city: 'New York', state: 'NY', country: 'US', companyId: tcg.id, status: 'active' },
    }),
    prisma.branch.create({
      data: { name: 'Mumbai HQ', code: 'MPI-MUM', city: 'Mumbai', state: 'MH', country: 'IN', companyId: mpi.id, status: 'active' },
    }),
    prisma.branch.create({
      data: { name: 'London Office', code: 'HFS-LON', city: 'London', state: 'England', country: 'GB', companyId: hfs.id, status: 'active' },
    }),
  ]);
  console.log(`  ✓ Created 4 branches`);

  // ==================== DEPARTMENTS ====================
  console.log('\n📋 Creating Departments...');
  const [engDept, hrDept, designDept, finDept, opsDept, salesDept, anaDept, recDept] = await Promise.all([
    prisma.department.create({ data: { name: 'Engineering', code: 'ENG', companyId: tcg.id, branchId: sfBranch.id, status: 'active' } }),
    prisma.department.create({ data: { name: 'Human Resources', code: 'HR', companyId: tcg.id, branchId: sfBranch.id, status: 'active' } }),
    prisma.department.create({ data: { name: 'Design', code: 'DSG', companyId: tcg.id, branchId: sfBranch.id, status: 'active' } }),
    prisma.department.create({ data: { name: 'Finance', code: 'FIN', companyId: tcg.id, branchId: nyBranch.id, status: 'active' } }),
    prisma.department.create({ data: { name: 'Operations', code: 'OPS', companyId: tcg.id, branchId: sfBranch.id, status: 'active' } }),
    prisma.department.create({ data: { name: 'Sales', code: 'SAL', companyId: tcg.id, branchId: nyBranch.id, status: 'active' } }),
    prisma.department.create({ data: { name: 'Analytics', code: 'ANA', companyId: tcg.id, branchId: sfBranch.id, status: 'active' } }),
    prisma.department.create({ data: { name: 'Recruitment', code: 'REC', companyId: tcg.id, branchId: sfBranch.id, status: 'active' } }),
  ]);
  console.log(`  ✓ Created 8 departments`);

  // ==================== DESIGNATIONS ====================
  console.log('\n📋 Creating Designations...');
  const [seniorDevDesg, hrManagerDesg, designerDesg, devOpsDesg, financeAnalystDesg, opsManagerDesg, recruiterDesg, dataScientistDesg] = await Promise.all([
    prisma.designation.create({ data: { title: 'Senior Software Engineer', departmentId: engDept.id, level: 4, minSalary: 120000, maxSalary: 180000, status: 'active' } }),
    prisma.designation.create({ data: { title: 'HR Manager', departmentId: hrDept.id, level: 5, minSalary: 90000, maxSalary: 130000, status: 'active' } }),
    prisma.designation.create({ data: { title: 'Product Designer', departmentId: designDept.id, level: 3, minSalary: 95000, maxSalary: 140000, status: 'active' } }),
    prisma.designation.create({ data: { title: 'DevOps Lead', departmentId: engDept.id, level: 4, minSalary: 130000, maxSalary: 175000, status: 'active' } }),
    prisma.designation.create({ data: { title: 'Finance Analyst', departmentId: finDept.id, level: 3, minSalary: 70000, maxSalary: 100000, status: 'active' } }),
    prisma.designation.create({ data: { title: 'Operations Manager', departmentId: opsDept.id, level: 4, minSalary: 85000, maxSalary: 120000, status: 'active' } }),
    prisma.designation.create({ data: { title: 'Recruiter', departmentId: recDept.id, level: 3, minSalary: 65000, maxSalary: 95000, status: 'active' } }),
    prisma.designation.create({ data: { title: 'Data Scientist', departmentId: anaDept.id, level: 4, minSalary: 110000, maxSalary: 160000, status: 'active' } }),
  ]);
  console.log(`  ✓ Created 8 designations`);

  // ==================== USERS ====================
  console.log('\n📋 Creating Users (with bcrypt-hashed passwords)...');
  const passwordHashes = await Promise.all([
    hashPassword('admin123'),
    hashPassword('hr123'),
    hashPassword('manager123'),
    hashPassword('employee123'),
    hashPassword('recruiter123'),
    hashPassword('candidate123'),
  ]);

  const [adminUser, hrUser, managerUser, employeeUser, recruiterUser, candidateUser] = await Promise.all([
    prisma.user.create({
      data: { email: 'admin@nexushrms.com', password: passwordHashes[0], name: 'Admin Nexus', role: 'super_admin', status: 'active', tenantId: tenant.id },
    }),
    prisma.user.create({
      data: { email: 'hr@nexushrms.com', password: passwordHashes[1], name: 'Sarah Johnson', role: 'hr_admin', status: 'active', tenantId: tenant.id },
    }),
    prisma.user.create({
      data: { email: 'manager@nexushrms.com', password: passwordHashes[2], name: 'Priya Sharma', role: 'manager', status: 'active', tenantId: tenant.id },
    }),
    prisma.user.create({
      data: { email: 'employee@nexushrms.com', password: passwordHashes[3], name: 'Raj Patel', role: 'employee', status: 'active', tenantId: tenant.id },
    }),
    prisma.user.create({
      data: { email: 'recruiter@nexushrms.com', password: passwordHashes[4], name: 'Kim Chen', role: 'recruiter', status: 'active', tenantId: tenant.id },
    }),
    prisma.user.create({
      data: { email: 'candidate@nexushrms.com', password: passwordHashes[5], name: 'Alex Turner', role: 'candidate', status: 'active', tenantId: tenant.id },
    }),
  ]);
  console.log(`  ✓ Created 6 users: super_admin, hr_admin, manager, employee, recruiter, candidate`);

  // ==================== EMPLOYEES (for internal roles) ====================
  console.log('\n📋 Creating Employees...');
  const [hrEmployee, managerEmployee, employeeEmployee, recruiterEmployee] = await Promise.all([
    prisma.employee.create({
      data: {
        employeeId: 'EMP001',
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: 'hr@nexushrms.com',
        phone: '+1-555-0101',
        userId: hrUser.id,
        departmentId: hrDept.id,
        designationId: hrManagerDesg.id,
        branchId: sfBranch.id,
        companyId: tcg.id,
        dateOfJoining: new Date('2021-07-01'),
        dateOfBirth: new Date('1988-03-15'),
        gender: 'female',
        nationality: 'American',
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        status: 'active',
        salary: 115000,
        salaryCurrency: 'USD',
      },
    }),
    prisma.employee.create({
      data: {
        employeeId: 'EMP002',
        firstName: 'Priya',
        lastName: 'Sharma',
        email: 'manager@nexushrms.com',
        phone: '+1-555-0102',
        userId: managerUser.id,
        departmentId: opsDept.id,
        designationId: opsManagerDesg.id,
        branchId: sfBranch.id,
        companyId: tcg.id,
        dateOfJoining: new Date('2020-11-20'),
        dateOfBirth: new Date('1985-08-22'),
        gender: 'female',
        nationality: 'Indian',
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        status: 'active',
        salary: 105000,
        salaryCurrency: 'USD',
      },
    }),
    prisma.employee.create({
      data: {
        employeeId: 'EMP003',
        firstName: 'Raj',
        lastName: 'Patel',
        email: 'employee@nexushrms.com',
        phone: '+1-555-0103',
        userId: employeeUser.id,
        departmentId: engDept.id,
        designationId: seniorDevDesg.id,
        branchId: sfBranch.id,
        companyId: tcg.id,
        dateOfJoining: new Date('2022-03-15'),
        dateOfBirth: new Date('1992-06-10'),
        gender: 'male',
        nationality: 'Indian',
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        status: 'active',
        salary: 145000,
        salaryCurrency: 'USD',
      },
    }),
    prisma.employee.create({
      data: {
        employeeId: 'EMP004',
        firstName: 'Kim',
        lastName: 'Chen',
        email: 'recruiter@nexushrms.com',
        phone: '+1-555-0104',
        userId: recruiterUser.id,
        departmentId: recDept.id,
        designationId: recruiterDesg.id,
        branchId: sfBranch.id,
        companyId: tcg.id,
        dateOfJoining: new Date('2023-01-10'),
        dateOfBirth: new Date('1990-11-05'),
        gender: 'female',
        nationality: 'American',
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        status: 'active',
        salary: 85000,
        salaryCurrency: 'USD',
      },
    }),
  ]);
  console.log(`  ✓ Created 4 employee records for internal users`);

  // ==================== JOB POSTINGS ====================
  console.log('\n📋 Creating Job Postings (AI Interview sample data)...');
  const [job1, job2, job3, job4] = await Promise.all([
    prisma.jobPosting.create({
      data: {
        title: 'Senior Full-Stack Developer',
        departmentId: engDept.id,
        position: 'Senior Full-Stack Developer',
        location: 'San Francisco, CA',
        type: 'full-time',
        experience: '5-8 years',
        salary: '$140,000 - $180,000',
        description: 'We are looking for a senior full-stack developer to join our engineering team. You will be responsible for building and maintaining scalable web applications using modern technologies.',
        requirements: 'React, Node.js, TypeScript, PostgreSQL, 5+ years experience, strong system design skills',
        status: 'open',
        postedDate: new Date('2025-01-15'),
        closingDate: new Date('2025-03-15'),
        vacancies: 2,
      },
    }),
    prisma.jobPosting.create({
      data: {
        title: 'UX Research Lead',
        departmentId: designDept.id,
        position: 'UX Research Lead',
        location: 'Remote',
        type: 'full-time',
        experience: '6-9 years',
        salary: '$120,000 - $150,000',
        description: 'Lead UX research initiatives across products. Drive user-centered design through qualitative and quantitative research methods.',
        requirements: '6+ years UX research experience, mixed methods expertise, proficiency in research tools',
        status: 'open',
        postedDate: new Date('2025-01-10'),
        closingDate: new Date('2025-02-28'),
        vacancies: 1,
      },
    }),
    prisma.jobPosting.create({
      data: {
        title: 'Data Scientist',
        departmentId: anaDept.id,
        position: 'Data Scientist',
        location: 'Austin, TX',
        type: 'full-time',
        experience: '3-5 years',
        salary: '$110,000 - $145,000',
        description: 'Build ML models for business insights. Work with cross-functional teams to identify opportunities for data-driven decision making.',
        requirements: 'Python, TensorFlow/PyTorch, SQL, statistical analysis, 3+ years experience',
        status: 'open',
        postedDate: new Date('2025-01-20'),
        closingDate: new Date('2025-03-20'),
        vacancies: 1,
      },
    }),
    prisma.jobPosting.create({
      data: {
        title: 'HR Business Partner',
        departmentId: hrDept.id,
        position: 'HR Business Partner',
        location: 'New York, NY',
        type: 'full-time',
        experience: '7-10 years',
        salary: '$95,000 - $120,000',
        description: 'Seeking an experienced HR business partner to align people strategies with business objectives and drive organizational effectiveness.',
        requirements: '7+ years HR experience, PHR certification preferred, strong stakeholder management',
        status: 'filled',
        postedDate: new Date('2024-11-28'),
        closingDate: new Date('2025-01-15'),
        vacancies: 1,
      },
    }),
  ]);
  console.log(`  ✓ Created 4 job postings`);

  // ==================== JOB APPLICATIONS ====================
  console.log('\n📋 Creating Job Applications...');
  const [app1, app2, app3, app4, app5, app6, app7] = await Promise.all([
    // Application for Senior Full-Stack Developer - interview stage
    prisma.jobApplication.create({
      data: {
        jobPostingId: job1.id,
        candidateName: 'Alex Turner',
        candidateEmail: 'alex.turner@email.com',
        candidatePhone: '+1-555-1001',
        source: 'linkedin',
        status: 'interview',
        appliedDate: new Date('2025-01-18'),
        rating: 5,
        expectedSalary: '$160,000',
        notes: 'Strong candidate with Google background. Excellent technical skills.',
      },
    }),
    // Another application for Senior Full-Stack Developer - screening stage
    prisma.jobApplication.create({
      data: {
        jobPostingId: job1.id,
        candidateName: 'Maya Singh',
        candidateEmail: 'maya.singh@email.com',
        candidatePhone: '+1-555-1002',
        source: 'referral',
        status: 'screening',
        appliedDate: new Date('2025-01-20'),
        rating: 4,
        expectedSalary: '$175,000',
        notes: 'Referred by current employee. Amazon background.',
      },
    }),
    // Application for UX Research Lead - interview stage
    prisma.jobApplication.create({
      data: {
        jobPostingId: job2.id,
        candidateName: 'Sophie Martin',
        candidateEmail: 'sophie.martin@email.com',
        candidatePhone: '+1-555-1003',
        source: 'website',
        status: 'interview',
        appliedDate: new Date('2025-01-12'),
        rating: 4,
        expectedSalary: '$140,000',
        notes: 'Meta UX researcher, strong portfolio.',
      },
    }),
    // Application for Data Scientist - applied stage
    prisma.jobApplication.create({
      data: {
        jobPostingId: job3.id,
        candidateName: 'Wei Zhang',
        candidateEmail: 'wei.zhang@email.com',
        candidatePhone: '+1-555-1004',
        source: 'indeed',
        status: 'applied',
        appliedDate: new Date('2025-01-21'),
        rating: 3,
        expectedSalary: '$135,000',
      },
    }),
    // Application for HR Business Partner - hired (completed flow)
    prisma.jobApplication.create({
      data: {
        jobPostingId: job4.id,
        candidateName: 'James Williams',
        candidateEmail: 'james.williams@email.com',
        candidatePhone: '+1-555-1005',
        source: 'referral',
        status: 'hired',
        appliedDate: new Date('2024-12-01'),
        rating: 5,
        expectedSalary: '$110,000',
        notes: 'Exceptional candidate. Offer accepted.',
      },
    }),
    // Another application for Senior Full-Stack Developer - rejected
    prisma.jobApplication.create({
      data: {
        jobPostingId: job1.id,
        candidateName: 'Tom Baker',
        candidateEmail: 'tom.baker@email.com',
        candidatePhone: '+1-555-1006',
        source: 'website',
        status: 'rejected',
        appliedDate: new Date('2025-01-16'),
        rating: 2,
        expectedSalary: '$190,000',
        notes: 'Did not meet minimum technical requirements.',
      },
    }),
    // Application for Data Scientist - screening stage
    prisma.jobApplication.create({
      data: {
        jobPostingId: job3.id,
        candidateName: 'Lisa Park',
        candidateEmail: 'lisa.park@email.com',
        candidatePhone: '+1-555-1007',
        source: 'linkedin',
        status: 'screening',
        appliedDate: new Date('2025-01-22'),
        rating: 4,
        expectedSalary: '$125,000',
        notes: 'Strong ML background, published researcher.',
      },
    }),
  ]);
  console.log(`  ✓ Created 7 job applications in various stages`);

  // ==================== INTERVIEWS ====================
  console.log('\n📋 Creating Interviews (with AI scores and feedback)...');
  const [interview1, interview2, interview3, interview4, interview5, interview6] = await Promise.all([
    // Completed AI interview - Alex Turner for Full-Stack Developer
    prisma.interview.create({
      data: {
        jobApplicationId: app1.id,
        type: 'technical',
        date: new Date('2025-02-01T10:00:00Z'),
        time: '10:00 AM',
        duration: 60,
        location: 'Online',
        meetingUrl: 'https://meet.nexushrms.com/interview-alex-tech',
        interviewer: recruiterEmployee.id,
        status: 'completed',
        feedback: 'Strong technical skills demonstrated. Good problem-solving approach. Excellent communication.',
        score: 88,
        aiScore: 92,
        aiFeedback: 'Candidate demonstrated exceptional proficiency in React, Node.js, and TypeScript. Problem-solving approach was systematic and efficient. Communication skills rated 9/10. Recommended for next round. Key strengths: system design, algorithmic thinking, clean code practices.',
      },
    }),
    // Completed AI HR interview - Alex Turner
    prisma.interview.create({
      data: {
        jobApplicationId: app1.id,
        type: 'hr',
        date: new Date('2025-02-03T14:00:00Z'),
        time: '2:00 PM',
        duration: 45,
        location: 'Online',
        meetingUrl: 'https://meet.nexushrms.com/interview-alex-hr',
        interviewer: hrEmployee.id,
        status: 'completed',
        feedback: 'Good culture fit. Strong alignment with company values.',
        score: 85,
        aiScore: 89,
        aiFeedback: 'Candidate shows strong cultural alignment with organizational values. Leadership potential identified. Response consistency score: 94%. Behavioral indicators suggest high adaptability and team collaboration skills. Recommended for offer stage.',
      },
    }),
    // Scheduled AI interview - Sophie Martin for UX Research Lead
    prisma.interview.create({
      data: {
        jobApplicationId: app3.id,
        type: 'technical',
        date: new Date('2025-02-10T11:00:00Z'),
        time: '11:00 AM',
        duration: 60,
        location: 'Online',
        meetingUrl: 'https://meet.nexushrms.com/interview-sophie-tech',
        interviewer: recruiterEmployee.id,
        status: 'scheduled',
      },
    }),
    // Completed AI interview - James Williams for HR Business Partner (full cycle)
    prisma.interview.create({
      data: {
        jobApplicationId: app5.id,
        type: 'technical',
        date: new Date('2024-12-15T10:00:00Z'),
        time: '10:00 AM',
        duration: 60,
        location: 'Online',
        interviewer: hrEmployee.id,
        status: 'completed',
        feedback: 'Excellent HR knowledge. Strong stakeholder management experience.',
        score: 92,
        aiScore: 95,
        aiFeedback: 'Candidate demonstrated expert-level knowledge in HR business partnering. Strategic thinking score: 96%. Stakeholder management simulation: outstanding. Industry knowledge comprehensive. Strongly recommended for hire.',
      },
    }),
    // Completed AI final interview - James Williams
    prisma.interview.create({
      data: {
        jobApplicationId: app5.id,
        type: 'final',
        date: new Date('2024-12-20T15:00:00Z'),
        time: '3:00 PM',
        duration: 45,
        location: 'Online',
        interviewer: managerEmployee.id,
        status: 'completed',
        feedback: 'Final round cleared. Ready for offer.',
        score: 90,
        aiScore: 93,
        aiFeedback: 'Final assessment confirms strong fit for HR Business Partner role. Leadership assessment: excellent. Cultural fit: 95%. Communication: outstanding. Salary expectation alignment: within range. Proceed to offer stage.',
      },
    }),
    // Scheduled AI interview - Maya Singh for Full-Stack Developer
    prisma.interview.create({
      data: {
        jobApplicationId: app2.id,
        type: 'technical',
        date: new Date('2025-02-15T09:00:00Z'),
        time: '9:00 AM',
        duration: 60,
        location: 'Online',
        meetingUrl: 'https://meet.nexushrms.com/interview-maya-tech',
        interviewer: recruiterEmployee.id,
        status: 'scheduled',
      },
    }),
  ]);
  console.log(`  ✓ Created 6 interviews (4 completed with AI scores, 2 scheduled)`);

  // ==================== LEAVE TYPES ====================
  console.log('\n📋 Creating Leave Types...');
  const [casualLeave, sickLeave, paidLeave] = await Promise.all([
    prisma.leaveType.create({
      data: { name: 'Casual Leave', code: 'CL', description: 'Casual leave for personal matters', defaultDays: 12, isPaid: true, carryForward: true, maxCarryForward: 3, status: 'active' },
    }),
    prisma.leaveType.create({
      data: { name: 'Sick Leave', code: 'SL', description: 'Sick leave for medical reasons', defaultDays: 10, isPaid: true, carryForward: false, status: 'active' },
    }),
    prisma.leaveType.create({
      data: { name: 'Paid Leave', code: 'PL', description: 'Earned paid leave', defaultDays: 15, isPaid: true, carryForward: true, maxCarryForward: 5, status: 'active' },
    }),
  ]);
  console.log(`  ✓ Created 3 leave types`);

  // ==================== LEAVE BALANCES ====================
  console.log('\n📋 Creating Leave Balances...');
  const currentYear = new Date().getFullYear();
  await Promise.all([
    // Sarah (HR) leave balances
    prisma.leaveBalance.create({ data: { employeeId: hrEmployee.id, leaveTypeId: casualLeave.id, year: currentYear, total: 12, used: 3, remaining: 9, carryForward: 2 } }),
    prisma.leaveBalance.create({ data: { employeeId: hrEmployee.id, leaveTypeId: sickLeave.id, year: currentYear, total: 10, used: 2, remaining: 8, carryForward: 0 } }),
    prisma.leaveBalance.create({ data: { employeeId: hrEmployee.id, leaveTypeId: paidLeave.id, year: currentYear, total: 15, used: 5, remaining: 10, carryForward: 3 } }),
    // Raj (Employee) leave balances
    prisma.leaveBalance.create({ data: { employeeId: employeeEmployee.id, leaveTypeId: casualLeave.id, year: currentYear, total: 12, used: 1, remaining: 11, carryForward: 0 } }),
    prisma.leaveBalance.create({ data: { employeeId: employeeEmployee.id, leaveTypeId: sickLeave.id, year: currentYear, total: 10, used: 0, remaining: 10, carryForward: 0 } }),
    prisma.leaveBalance.create({ data: { employeeId: employeeEmployee.id, leaveTypeId: paidLeave.id, year: currentYear, total: 15, used: 2, remaining: 13, carryForward: 5 } }),
  ]);
  console.log(`  ✓ Created leave balances`);

  // ==================== ATTENDANCE ====================
  console.log('\n📋 Creating Attendance records...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await Promise.all([
    prisma.attendance.create({ data: { employeeId: hrEmployee.id, date: today, checkIn: new Date(today.getTime() + 9 * 3600000 + 2 * 60000), checkOut: new Date(today.getTime() + 18 * 3600000 + 15 * 60000), workHours: 8.5, status: 'present' } }),
    prisma.attendance.create({ data: { employeeId: employeeEmployee.id, date: today, checkIn: new Date(today.getTime() + 8 * 3600000 + 50 * 60000), checkOut: new Date(today.getTime() + 17 * 3600000 + 45 * 60000), workHours: 8.0, status: 'present' } }),
    prisma.attendance.create({ data: { employeeId: managerEmployee.id, date: today, checkIn: new Date(today.getTime() + 9 * 3600000 + 35 * 60000), checkOut: new Date(today.getTime() + 18 * 3600000 + 30 * 60000), workHours: 8.0, status: 'late' } }),
  ]);
  console.log(`  ✓ Created 3 attendance records`);

  // ==================== NOTIFICATIONS ====================
  console.log('\n📋 Creating Notifications...');
  await Promise.all([
    prisma.notification.create({ data: { tenantId: tenant.id, userId: hrUser.id, title: 'New Job Application', message: 'Alex Turner has applied for Senior Full-Stack Developer', type: 'info', category: 'recruitment', isRead: false } }),
    prisma.notification.create({ data: { tenantId: tenant.id, userId: hrUser.id, title: 'Interview Scheduled', message: 'AI Technical interview with Sophie Martin on Feb 10', type: 'info', category: 'recruitment', isRead: false } }),
    prisma.notification.create({ data: { tenantId: tenant.id, userId: recruiterUser.id, title: 'AI Interview Completed', message: 'AI interview for Alex Turner has been completed with score 92/100', type: 'success', category: 'recruitment', isRead: true } }),
    prisma.notification.create({ data: { tenantId: tenant.id, userId: adminUser.id, title: 'New Candidate Registered', message: 'Candidate Alex Turner has registered on the platform', type: 'info', category: 'recruitment', isRead: false } }),
    prisma.notification.create({ data: { tenantId: tenant.id, userId: managerUser.id, title: 'Leave Request', message: 'Raj Patel has submitted a leave request', type: 'info', category: 'leave', isRead: false } }),
  ]);
  console.log(`  ✓ Created 5 notifications`);

  // ==================== SUBSCRIPTION PLAN ====================
  console.log('\n📋 Creating Subscription Plan...');
  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: 'Enterprise',
      planType: 'enterprise',
      monthlyPrice: 299,
      annualPrice: 2990,
      employeeLimit: 500,
      companyLimit: 10,
      branchLimit: 50,
      storageLimit: 50000,
      aiInterviewLimit: 500,
      aiChatbotLimit: 5000,
      payrollEnabled: true,
      recruitmentEnabled: true,
      attendanceEnabled: true,
      projectEnabled: true,
      clientPortalEnabled: true,
      vendorPortalEnabled: true,
      mobileAppEnabled: true,
      apiAccessEnabled: true,
      whiteLabelEnabled: false,
      supportLevel: 'dedicated',
      status: 'active',
      description: 'Full-featured enterprise plan with AI capabilities',
    },
  });
  console.log(`  ✓ Created subscription plan: ${plan.name}`);

  // Subscription
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      billingCycle: 'annual',
      amount: 2990,
      currency: 'USD',
      paymentStatus: 'paid',
      status: 'active',
      autoRenew: true,
    },
  });
  console.log(`  ✓ Created subscription for tenant`);

  // ==================== VERIFICATION ====================
  console.log('\n🔍 Verifying seed data...');
  const userCount = await prisma.user.count();
  const employeeCount = await prisma.employee.count();
  const jobPostingCount = await prisma.jobPosting.count();
  const jobAppCount = await prisma.jobApplication.count();
  const interviewCount = await prisma.interview.count();

  console.log(`  ✓ Users: ${userCount}`);
  console.log(`  ✓ Employees: ${employeeCount}`);
  console.log(`  ✓ Job Postings: ${jobPostingCount}`);
  console.log(`  ✓ Job Applications: ${jobAppCount}`);
  console.log(`  ✓ Interviews: ${interviewCount}`);

  // Verify password hashing works
  const adminUserCheck = await prisma.user.findUnique({ where: { email: 'admin@nexushrms.com' } });
  if (adminUserCheck) {
    const passwordMatch = await bcryptjs.compare('admin123', adminUserCheck.password);
    console.log(`  ✓ Password verification (admin@nexushrms.com / admin123): ${passwordMatch ? 'PASS ✓' : 'FAIL ✗'}`);
  }

  console.log('\n✅ Database seeding completed successfully!');
  console.log('\n📝 Demo Login Credentials:');
  console.log('  ┌─────────────────┬───────────────────────────┬──────────────┐');
  console.log('  │ Role            │ Email                     │ Password     │');
  console.log('  ├─────────────────┼───────────────────────────┼──────────────┤');
  console.log('  │ Super Admin     │ admin@nexushrms.com       │ admin123     │');
  console.log('  │ HR Admin        │ hr@nexushrms.com          │ hr123        │');
  console.log('  │ Manager         │ manager@nexushrms.com     │ manager123   │');
  console.log('  │ Employee        │ employee@nexushrms.com    │ employee123  │');
  console.log('  │ Recruiter       │ recruiter@nexushrms.com   │ recruiter123 │');
  console.log('  │ Candidate       │ candidate@nexushrms.com   │ candidate123 │');
  console.log('  └─────────────────┴───────────────────────────┴──────────────┘');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
