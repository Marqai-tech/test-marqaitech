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

type Delegate = { deleteMany: (args?: Record<string, unknown>) => Promise<{ count: number }> };
type AnyDb = {
  $executeRawUnsafe: (sql: string, ...params: string[]) => Promise<number>;
  $queryRawUnsafe: (sql: string, ...params: string[]) => Promise<unknown>;
} & Record<string, Delegate>;

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

  // ─── Two databases can hold the candidate's data for a super admin:
  // (a) the DB plain getDb() resolves from the JWT (where the app writes),
  // (b) the DB resolved from the company switcher's ?tenantId= / ?companyId=
  // (where scoped read-apis look). Wipe BOTH so nothing survives a scope mix.
  const db = await getDb(req);
  let scopedDb: typeof db | null = null;
  if (jwtRole === 'super_admin') {
    const url = new URL(req.url);
    const queryTenantId = url.searchParams.get('tenantId');
    const queryCompanyId = url.searchParams.get('companyId');
    if (queryTenantId) {
      const tenant = await getPlatformDb().tenant.findUnique({ where: { id: queryTenantId }, select: { slug: true } }).catch(() => null);
      if (tenant?.slug) scopedDb = await getDbForTenant(tenant.slug);
    } else if (queryCompanyId) {
      let company = await db.company.findUnique({ where: { id: queryCompanyId }, select: { companyGroupId: true } }).catch(() => null);
      if (!company) company = await getPlatformDb().company.findUnique({ where: { id: queryCompanyId }, select: { companyGroupId: true } }).catch(() => null);
      if (company?.companyGroupId) {
        let group = await db.companyGroup.findUnique({ where: { id: company.companyGroupId }, select: { tenantId: true } }).catch(() => null);
        if (!group) group = await getPlatformDb().companyGroup.findUnique({ where: { id: company.companyGroupId }, select: { tenantId: true } }).catch(() => null);
        if (group?.tenantId) {
          const tenant = await getPlatformDb().tenant.findUnique({ where: { id: group.tenantId }, select: { slug: true } });
          if (tenant?.slug) scopedDb = await getDbForTenant(tenant.slug);
        }
      }
    }
  }
  const dbs: AnyDb[] = (scopedDb && scopedDb !== db ? [db, scopedDb] : [db]) as unknown as AnyDb[];

  const deleted: Record<string, number> = {};
  const failed: Record<string, string> = {};
  let employeesFound = 0;
  let usersFound = 0;

  // NOTE: `mode: 'insensitive'` is rejected by the driver-adapter tenant
  // clients on this deployment (every email match failed with a Prisma
  // validation error), so ALL email matching uses raw SQL LOWER() — the same
  // pattern as the departments route. Table/column names come only from the
  // static lists above; the email itself is always a bound $1 parameter.
  const wipeFromDb = async (dbc: AnyDb) => {
    const fail = (model: string, e: unknown) => {
      failed[model] = String((e as Error)?.message || e).slice(0, 160);
    };
    const execRaw = async (sql: string, ...params: string[]): Promise<{ count: number; error?: Error }> => {
      try {
        const count = Number(await dbc.$executeRawUnsafe(sql, ...params));
        return { count: Number.isFinite(count) ? count : 0 };
      } catch (e) {
        return { count: 0, error: e as Error };
      }
    };
    const selRaw = async <T>(sql: string, ...params: string[]): Promise<T[]> => {
      try {
        return (await dbc.$queryRawUnsafe<T[]>(sql, ...params)) as T[];
      } catch (e) {
        fail('_lookup', e);
        return [];
      }
    };
    const store = new Proxy(dbc as unknown as Record<string, Delegate>, {
      get: (target, prop: string) => target[prop.charAt(0).toLowerCase() + prop.slice(1)],
    });
    const del = async (model: string, where?: Record<string, unknown>) => {
      try {
        const r = await store[model].deleteMany(where);
        if (r.count) deleted[model] = (deleted[model] || 0) + Number(r.count);
      } catch (e) {
        fail(model, e);
      }
    };
    const delByEmail = async (table: string, column: string) => {
      const { count, error } = await execRaw(`DELETE FROM "${table}" WHERE LOWER("${column}") = LOWER($1)`, normalizedEmail);
      if (count > 0) deleted[table] = (deleted[table] || 0) + count;
      else if (error) fail(table, error);
    };
    const idsByEmail = async (table: string, column: string): Promise<string[]> => {
      const rows = await selRaw<{ id: string }>(`SELECT "id" FROM "${table}" WHERE LOWER("${column}") = LOWER($1)`, normalizedEmail);
      return rows.map(r => String(r.id));
    };

    // ─── 1. Interview-session family (children keep sessionId FKs)
    const sessionIds = await idsByEmail('InterviewSession', 'candidateEmail');
    for (const sid of sessionIds) {
      await del('InterviewResponse', { sessionId: sid });
      await del('ProctoringLog', { sessionId: sid });
    }
    await delByEmail('InterviewSession', 'candidateEmail');

    // ─── 2. Job-application family (children keep jobApplicationId / interviewId)
    const appIds = await idsByEmail('JobApplication', 'candidateEmail');
    if (appIds.length) {
      const interviewRows = await selRaw<{ id: string }>(
        `SELECT "id" FROM "Interview" WHERE "jobApplicationId" IN (${appIds.map((_, i) => `$${i + 1}`).join(',')})`,
        ...appIds,
      );
      const interviewIds = interviewRows.map(r => String(r.id));
      for (const iid of interviewIds) await del('InterviewPanelMember', { interviewId: iid });
      if (interviewIds.length) await del('Interview', { id: { in: interviewIds } });
      await del('ResumeParse', { jobApplicationId: { in: appIds } });
      await del('CandidateSentimentScore', { jobApplicationId: { in: appIds } });
      await del('CandidateResumeOptimization', { jobApplicationId: { in: appIds } });
      await del('CandidateAiFeedback', { jobApplicationId: { in: appIds } });
    }
    await delByEmail('JobApplication', 'candidateEmail');

    // ─── 3. Offer family (OfferBranding / OfferApproval / OfferDeclineSurvey)
    const offerIds = await idsByEmail('Offer', 'candidateEmail');
    if (offerIds.length) {
      await del('OfferBranding', { offerId: { in: offerIds } });
      await del('OfferApproval', { offerId: { in: offerIds } });
      await del('OfferDeclineSurvey', { offerId: { in: offerIds } });
    }
    await delByEmail('Offer', 'candidateEmail');

    // ─── 4. Preboarding family (BackgroundCheck / WelcomeSeriesEmail)
    const preIds = await idsByEmail('PreboardingCandidate', 'candidateEmail');
    if (preIds.length) {
      await del('BackgroundCheck', { preboardingCandidateId: { in: preIds } });
      await del('WelcomeSeriesEmail', { preboardingCandidateId: { in: preIds } });
    }
    await delByEmail('PreboardingCandidate', 'candidateEmail');

    // ─── 5. BGV family (children carry raw requestId columns, no relations)
    const bgvIds = await idsByEmail('BgvRequest', 'candidateEmail');
    if (bgvIds.length) {
      for (const t of ['BgvEvidence', 'BgvCheck', 'BgvNotification', 'BgvReport', 'BgvAssignment', 'BgvDocumentShare']) {
        await del(t, { requestId: { in: bgvIds } });
      }
    }
    await delByEmail('BgvRequest', 'candidateEmail');

    // ─── 6. Remaining candidate-side tables keyed directly by the email
    for (const [t, col] of [
      ['InterviewInvitation', 'candidateEmail'], ['CandidateMessage', 'candidateEmail'],
      ['Referral', 'candidateEmail'], ['CandidateSavedJob', 'candidateEmail'], ['CandidateTalentPool', 'candidateEmail'],
      ['CandidatePasswordReset', 'candidateEmail'], ['CandidateErasureRequest', 'candidateEmail'],
      ['CandidateJobAlert', 'candidateEmail'], ['CandidateConsent', 'candidateEmail'],
      ['CandidatePortalUser', 'candidateEmail'], ['Candidate', 'email'],
    ] as const) await delByEmail(t, col);

    // ─── 7. Employee side: resolve the employee (and their user) by email
    const userIds = (await selRaw<{ id: string }>(`SELECT "id" FROM "User" WHERE LOWER("email") = LOWER($1)`, normalizedEmail)).map(r => String(r.id));
    const empRows = await selRaw<{ id: string }>(
      `SELECT "id" FROM "Employee" WHERE LOWER("email") = LOWER($1)` +
      (userIds.length ? ` OR "userId" IN (${userIds.map((_, i) => `$${i + 2}`).join(',')})` : ``),
      normalizedEmail, ...userIds,
    );
    const empIds = empRows.map(r => String(r.id));
    if (empIds.length) {
      // Two passes: pass 1 removes children that block other children (FK
      // order); pass 2 picks up rows that became deletable afterwards.
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
    employeesFound += empIds.length;
    usersFound += userIds.length;
  };

  for (const dbc of dbs) await wipeFromDb(dbc);

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
    employeesFound,
    usersFound,
  });
}
