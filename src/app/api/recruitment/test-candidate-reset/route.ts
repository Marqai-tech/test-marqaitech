import { NextRequest, NextResponse } from 'next/server';
import { getDb, getDbForTenant, getPlatformDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';

const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

// ─── Employee-owned tables (93 FK children + employee-side extras), ordered
// children-before-parents via the schema FK graph. Two passes run over this
// list so rows unblocked by an earlier pass are removed on the second one.
const EMPLOYEE_CHILD_TABLES: string[] = [
  'AssetAssignment', 'Attendance', 'AttendanceAuditLog', 'AttendanceRegularization', 'AttendanceRequest',
  'BankAccount', 'BiometricEnrollment', 'BiometricPunch', 'BurnoutFlag', 'CalendarEvent', 'CalendarSync',
  'CallLog', 'CallParticipant', 'Certificate', 'ChatMessage', 'ChatRoomMember', 'ClientFeedback',
  'CompOffLeave', 'CourseAssignment', 'CourseEnrollment', 'CrossBorderSecondment', 'Dependent',
  'DLPScanLog', 'Document', 'DocumentIntelligenceResult', 'DottedLineManager', 'EWARequest',
  'EmployeeCompanyMapping', 'EmployeeCostRate', 'EmployeeCustomFieldValue', 'EmployeeDimensionAllocation',
  'EmployeePaymentMethod', 'EmployeeRosterAssignment', 'EmployeeSkill', 'EmployeeUpdateRequest',
  'Separation', 'ExitInterview', 'ExitRequest', 'ExpenseClaim', 'Experience', 'FileNode', 'FileVersion',
  'FileShareLink', 'FNFCalculation', 'FinancialStressFlag', 'GDPRAnonymizationRequest', 'Gatepass',
  'GhostEmployeeFlag', 'Gift', 'Goal', 'GratuityLedger', 'Grievance', 'HourlyPermission', 'IncidentReport',
  'IncomeTaxDeclaration', 'InsurancePolicy', 'InsuranceClaim', 'InvoiceLineItem', 'KanbanBoard',
  'LeaveBalance', 'LeaveEncashmentRequest', 'LeaveLedger', 'LeaveRequest', 'Loan', 'LoanMarketplaceListing',
  'MarketplaceFraudFlag', 'MarketplaceOrder', 'Note', 'OnboardingTask',
  'OptionalHolidayElection', 'OvertimeRecord', 'OvertimeRequest', 'Payroll', 'PayrollAdjustmentLog',
  'PayrollAnomaly', 'PayrollHold', 'PayrollInput', 'PayrollTransactionLine', 'PerformanceReview',
  'PersonalizedCatalogCache', 'PolicyAcknowledgment', 'PolicySignOffAck', 'PreboardingCandidate',
  'ProjectActivity', 'ProjectAllocation', 'ProjectMember', 'ProjectReview', 'ProjectUtilizationSnapshot',
  'Promotion', 'PunchEvent', 'Qualification', 'Reimbursement', 'Referral', 'RewardPointsLedger',
  'SocialComment', 'SocialLike', 'SocialPost', 'SocialProfile', 'SkillGap', 'SurveyResponse', 'TeamMember',
  'Timesheet', 'TodoTask', 'TrainingEnrollment', 'TrainingRequest', 'TravelRequest', 'Wallet',
  'WalletBudgetAllocation', 'WfhAttendanceSnapshot', 'WfhRequest', 'WatermarkAccessLog',
];

// User-owned tables deleted (by userId) after Employee, right before the User row.
const USER_CHILD_TABLES: string[] = [
  'Notification', 'LoginActivity', 'UserRoleAssignment', 'NotificationPreference', 'AIChatLog',
  'AIPromptLog', 'AIKnowledgeQuery', 'ChatRoomMember', 'CallParticipant', 'ProjectMember',
  'InterviewPanelMember', 'SocialLike', 'DLPScanLog', 'WatermarkAccessLog', 'Contractor',
];

type Delegate = {
  findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string }>>;
  deleteMany: (args?: Record<string, unknown>) => Promise<{ count: number }>;
};

export async function DELETE(req: NextRequest) {
  const token = getTokenFromHeaders(req);
  const decoded = token ? await verifyToken(token) : null;
  const jwtRole = String(decoded?.role || '');
  if (!decoded || !ADMIN_ROLES.includes(jwtRole)) {
    return NextResponse.json({ error: 'HR/Admin access required' }, { status: 403 });
  }
  const { email, confirmation } = await req.json().catch(() => ({}));
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || confirmation !== `DELETE ${normalizedEmail}`) {
    return NextResponse.json({ error: `Type DELETE ${normalizedEmail || '<email>'} to confirm` }, { status: 400 });
  }

  // ─── Resolve the correct database for super_admin — EXACTLY like the
  // departments route: the company switcher's ?tenantId= / ?companyId= wins
  // over the JWT's tenant (which often points at a placeholder tenant).
  // Plain getDb() would let the JWT tenant win on live, so a super admin
  // deleting after switching scope would wipe the WRONG database and
  // silently delete nothing.
  let db = await getDb(req);
  if (jwtRole === 'super_admin') {
    const url = new URL(req.url);
    const queryTenantId = url.searchParams.get('tenantId');
    const queryCompanyId = url.searchParams.get('companyId');
    if (queryTenantId) {
      const tenant = await getPlatformDb().tenant.findUnique({ where: { id: queryTenantId }, select: { slug: true } }).catch(() => null);
      if (tenant?.slug) db = await getDbForTenant(tenant.slug);
    } else if (queryCompanyId) {
      let company = await db.company.findUnique({ where: { id: queryCompanyId }, select: { companyGroupId: true } }).catch(() => null);
      if (!company) company = await getPlatformDb().company.findUnique({ where: { id: queryCompanyId }, select: { companyGroupId: true } }).catch(() => null);
      if (company?.companyGroupId) {
        let group = await db.companyGroup.findUnique({ where: { id: company.companyGroupId }, select: { tenantId: true } }).catch(() => null);
        if (!group) group = await getPlatformDb().companyGroup.findUnique({ where: { id: company.companyGroupId }, select: { tenantId: true } }).catch(() => null);
        if (group?.tenantId) {
          const tenant = await getPlatformDb().tenant.findUnique({ where: { id: group.tenantId }, select: { slug: true } });
          if (tenant?.slug) db = await getDbForTenant(tenant.slug);
        }
      }
    }
  }

  const deleted: Record<string, number> = {};
  const failed: Record<string, string> = {};
  // Prisma delegates are lowerFirst(model): Employee -> employee, JobApplication -> jobApplication.
  const store = new Proxy(db as unknown as Record<string, Delegate>, {
    get: (target, prop: string) => target[prop.charAt(0).toLowerCase() + prop.slice(1)],
  });
  const ins = { equals: normalizedEmail, mode: 'insensitive' as const };

  const del = async (model: string, where?: Record<string, unknown>) => {
    try {
      const r = await store[model].deleteMany(where);
      if (r.count) deleted[model] = (deleted[model] || 0) + Number(r.count);
    } catch (e) {
      failed[model] = String((e as Error)?.message || e).slice(0, 160);
    }
  };
  const ids = async (model: string, where: Record<string, unknown>): Promise<string[]> => {
    try { return (await store[model].findMany({ where, select: { id: true } })).map(r => r.id); }
    catch { return []; }
  };

  // ─── 1. Interview-session family (children keep sessionId FKs)
  const sessionIds = await ids('InterviewSession', { candidateEmail: ins });
  for (const sid of sessionIds) {
    await del('InterviewResponse', { sessionId: sid });
    await del('ProctoringLog', { sessionId: sid });
  }
  await del('InterviewSession', { candidateEmail: ins });

  // ─── 2. Job-application family (children keep jobApplicationId / interviewId)
  const appIds = await ids('JobApplication', { candidateEmail: ins });
  if (appIds.length) {
    const interviewIds = await ids('Interview', { jobApplicationId: { in: appIds } });
    for (const iid of interviewIds) await del('InterviewPanelMember', { interviewId: iid });
    await del('Interview', { jobApplicationId: { in: appIds } });
    await del('ResumeParse', { jobApplicationId: { in: appIds } });
    await del('CandidateSentimentScore', { jobApplicationId: { in: appIds } });
    await del('CandidateResumeOptimization', { jobApplicationId: { in: appIds } });
    await del('CandidateAiFeedback', { jobApplicationId: { in: appIds } });
  }
  await del('JobApplication', { candidateEmail: ins });

  // ─── 3. Offer family (OfferBranding / OfferApproval / OfferDeclineSurvey)
  const offerIds = await ids('Offer', { candidateEmail: ins });
  if (offerIds.length) {
    await del('OfferBranding', { offerId: { in: offerIds } });
    await del('OfferApproval', { offerId: { in: offerIds } });
    await del('OfferDeclineSurvey', { offerId: { in: offerIds } });
  }
  await del('Offer', { candidateEmail: ins });

  // ─── 4. Preboarding family (BackgroundCheck / WelcomeSeriesEmail)
  const preIds = await ids('PreboardingCandidate', { candidateEmail: ins });
  if (preIds.length) {
    await del('BackgroundCheck', { preboardingCandidateId: { in: preIds } });
    await del('WelcomeSeriesEmail', { preboardingCandidateId: { in: preIds } });
  }
  await del('PreboardingCandidate', { candidateEmail: ins });

  // ─── 5. BGV family (children carry raw requestId columns, no relations)
  const bgvIds = await ids('BgvRequest', { candidateEmail: ins });
  if (bgvIds.length) {
    for (const t of ['BgvEvidence', 'BgvCheck', 'BgvNotification', 'BgvReport', 'BgvAssignment', 'BgvDocumentShare']) {
      await del(t, { requestId: { in: bgvIds } });
    }
  }
  await del('BgvRequest', { candidateEmail: ins });

  // ─── 6. Remaining candidate-side tables keyed directly by email
  for (const [t, col] of [
    ['InterviewInvitation', 'candidateEmail'], ['CandidateMessage', 'candidateEmail'],
    ['Referral', 'email'], ['CandidateSavedJob', 'candidateEmail'], ['CandidateTalentPool', 'candidateEmail'],
    ['CandidatePasswordReset', 'candidateEmail'], ['CandidateErasureRequest', 'candidateEmail'],
    ['CandidateJobAlert', 'candidateEmail'], ['CandidateConsent', 'candidateEmail'],
    ['CandidatePortalUser', 'email'], ['Candidate', 'email'],
  ] as const) await del(t, { [col]: ins });

  // ─── 7. Employee side: resolve the employee (and their user) by email
  const userIds = (await store.User.findMany({ where: { email: ins }, select: { id: true } }).catch(() => [] as Array<{ id: string }>)).map(r => r.id);
  const empRows = await store.Employee.findMany({
    where: { OR: [{ email: ins }, ...(userIds.length ? [{ userId: { in: userIds } }] : [])] },
    select: { id: true },
  }).catch(() => [] as Array<{ id: string }>);
  const empIds = empRows.map(r => r.id);
  if (empIds.length) {
    // Two passes: pass 1 removes children that block other children (FK order);
    // pass 2 picks up rows that became deletable afterwards.
    for (let pass = 0; pass < 2; pass++) {
      for (const t of EMPLOYEE_CHILD_TABLES) await del(t, { employeeId: { in: empIds } });
    }
    await del('Employee', { id: { in: empIds } });
  }

  // ─── 8. User side (login, roles, prefs, panel memberships, contractor)
  if (userIds.length) {
    for (const t of USER_CHILD_TABLES) await del(t, { userId: { in: userIds } });
    await del('User', { id: { in: userIds } });
  }

  await db.auditLog.create({
    data: {
      userId: String(decoded.userId),
      action: 'RESET_TEST_CANDIDATE',
      module: 'recruitment',
      details: `Reset test candidate data for ${normalizedEmail} — deleted: ${JSON.stringify(deleted)}${Object.keys(failed).length ? `, failed: ${Object.keys(failed).join(',')}` : ''}`,
    },
  }).catch(() => null);

  return NextResponse.json({
    message: 'Test candidate data reset',
    email: normalizedEmail,
    deleted,
    failed,
    employeesFound: empIds.length,
    usersFound: userIds.length,
  });
}
