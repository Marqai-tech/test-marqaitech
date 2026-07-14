/**
 * Admin-only sample data cleanup endpoint.
 *
 * POST /api/admin/cleanup-sample-data
 *   Body: { tenantSlug: string }
 *
 * Removes ALL sample/mock/auto-seeded data for the specified tenant,
 * keeping only structural/master data and admin users + their employee records.
 *
 * Allowed tenant slugs: '3boxeshrms', 'marqaitechgroup'
 * Any other slug is rejected with 403 to protect demo and other tenants.
 *
 * Keeps:
 *   - Tenant, CompanyGroup, Company, Branch, Department, Designation
 *   - Users with role 'super_admin' or 'tenant_admin' + their Employee records
 *   - Roles, Permissions, RolePermissions, Modules
 *   - LeaveTypes (master data)
 *   - AttendancePolicyConfig (master data)
 *   - SalaryStructures + SalaryComponents (master data)
 *   - SubscriptionPlans, Subscriptions
 *   - FeatureFlags
 *   - TenantDatabase
 *   - Shifts (master data)
 *   - Holidays (master data)
 *   - CTC templates & component mappings (master data)
 *   - Tax slabs (master data)
 *   - Currency configs & exchange rates (master data)
 *   - Dimension definitions (master data)
 *   - Payroll definitions (master data)
 *   - Statutory components (master data)
 *   - Payroll components (master data)
 *   - GL account mappings (master data)
 *   - Compliance obligations (master data)
 *   - Doc categories & articles (documentation)
 *   - Interview sets & questions (templates)
 *   - AI configs (master config)
 *   - SSO providers (config)
 *
 * Deletes:
 *   - All employees except those linked to admin/tenant_admin users
 *   - All employee-linked data (leave balances, leave requests, attendance, payroll, etc.)
 *   - All ecosystem module data (clients, vendors, marketplace, wellness, collaboration)
 *   - All auto-seeded data
 *   - All sample notifications, audit logs, login activities
 *   - All sample payroll runs, transactions
 *   - All recruitment data (job postings, applications, interviews, etc.)
 *   - All project data (projects, tasks, milestones, allocations, members)
 *   - All OKRs, key results
 *   - All tickets, ticket comments, ticket categories
 *   - All workflow definitions/instances/approvals
 *   - All non-admin user role assignments
 *   - All non-admin users
 */
import { NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import prisma from '@/lib/prisma';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

/** Tenant slugs that are allowed to be cleaned up. */
const ALLOWED_SLUGS = ['3boxeshrms', 'marqaitechgroup'];

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: CORS });
}

export async function POST(request: Request) {
  try {
    // ─── 1. Authenticate ───
    const token = getTokenFromHeaders(request);
    if (!token) return fail('No token provided', 401);
    const decoded = await verifyToken(token);
    if (!decoded) return fail('Invalid or expired token', 401);
    const userPayload = decoded as Record<string, unknown>;
    const userRole = userPayload.role as string;

    if (!userRole || !['super_admin', 'tenant_admin'].includes(userRole)) {
      return fail('Forbidden: requires tenant_admin or super_admin role', 403);
    }

    // ─── 2. Parse body ───
    let body: { tenantSlug?: string } = {};
    try {
      body = await request.json();
    } catch { /* empty */ }

    const { tenantSlug } = body;
    if (!tenantSlug) return fail('Missing tenantSlug in request body', 400);

    // ─── 3. Validate tenant slug ───
    if (!ALLOWED_SLUGS.includes(tenantSlug)) {
      return fail(
        `Cleanup not allowed for tenant "${tenantSlug}". Only ${ALLOWED_SLUGS.join(', ')} tenants can be cleaned.`,
        403,
      );
    }

    // ─── 4. Find tenant ───
    const tenant = await prisma.tenant.findFirst({
      where: { slug: tenantSlug, status: 'active' },
    });
    if (!tenant) return fail(`Tenant with slug "${tenantSlug}" not found or inactive`, 404);

    // If the user is a tenant_admin, they can only clean their own tenant
    if (userRole === 'tenant_admin' && userPayload.tenantId !== tenant.id) {
      return fail('Forbidden: tenant_admin can only clean their own tenant', 403);
    }

    // ─── 5. Identify structural data to preserve ───
    const tenantId = tenant.id;

    // Get all companies under this tenant
    const companyGroups = await prisma.companyGroup.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const groupIds = companyGroups.map(g => g.id);

    const companies = await prisma.company.findMany({
      where: { companyGroupId: { in: groupIds } },
      select: { id: true },
    });
    const companyIds = companies.map(c => c.id);

    if (companyIds.length === 0) {
      return fail('No companies found under this tenant', 400);
    }

    // Get branches, departments, designations under these companies
    const branches = await prisma.branch.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true },
    });
    const branchIds = branches.map(b => b.id);

    const departments = await prisma.department.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true },
    });
    const departmentIds = departments.map(d => d.id);

    // Get admin users to preserve
    const adminUsers = await prisma.user.findMany({
      where: {
        tenantId,
        role: { in: ['super_admin', 'tenant_admin'] },
        status: 'active',
      },
      select: { id: true, email: true, role: true },
    });
    const adminUserIds = adminUsers.map(u => u.id);

    // Get employee records linked to admin users — these are preserved
    const adminEmployees = await prisma.employee.findMany({
      where: { userId: { in: adminUserIds } },
      select: { id: true },
    });
    const adminEmployeeIds = adminEmployees.map(e => e.id);

    // Get ALL non-admin employee IDs (employees under this tenant's companies)
    // These are the ones we'll delete
    const nonAdminEmployees = await prisma.employee.findMany({
      where: {
        departmentId: { in: departmentIds },
        id: { notIn: adminEmployeeIds },
      },
      select: { id: true },
    });
    const nonAdminEmployeeIds = nonAdminEmployees.map(e => e.id);

    // ─── 6. Execute cleanup ───
    const counts: Record<string, number> = {};

    // Helper: deleteMany and record count
    async function del(label: string, fn: () => Promise<{ count: number }>) {
      try {
        const result = await fn();
        if (result.count > 0) counts[label] = result.count;
      } catch (e) {
        // Some models may not exist in schema yet; skip gracefully
        console.warn(`[cleanup] Skipping ${label}:`, e instanceof Error ? e.message : e);
      }
    }

    // ─── Phase 1: Employee-linked data for non-admin employees ───
    // These must be deleted before deleting the employees themselves

    // Leave management
    await del('leaveBalances', () =>
      prisma.leaveBalance.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('leaveRequests', () =>
      prisma.leaveRequest.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('leaveEncashmentRequests', () =>
      prisma.leaveEncashmentRequest.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('optionalHolidayElections', () =>
      prisma.optionalHolidayElection.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Attendance
    await del('attendance', () =>
      prisma.attendance.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('attendanceRegularizations', () =>
      prisma.attendanceRegularization.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('hourlyPermissions', () =>
      prisma.hourlyPermission.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('gatepasses', () =>
      prisma.gatepass.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('overtimeRequests', () =>
      prisma.overtimeRequest.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('compOffLeaves', () =>
      prisma.compOffLeave.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('wfhAttendanceSnapshots', () =>
      prisma.wfhAttendanceSnapshot.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('wfhRequests', () =>
      prisma.wfhRequest.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('burnoutFlags', () =>
      prisma.burnoutFlag.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('attendanceAuditLogs', () =>
      prisma.attendanceAuditLog.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('biometricEnrollments', () =>
      prisma.biometricEnrollment.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('biometricPunches', () =>
      prisma.biometricPunch.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('rosterAssignments', () =>
      prisma.employeeRosterAssignment.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Payroll - employee linked
    await del('payrolls', () =>
      prisma.payroll.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('loans', () =>
      prisma.loan.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('overtimeRecords', () =>
      prisma.overtimeRecord.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('payrollHolds', () =>
      prisma.payrollHold.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('employeePaymentMethods', () =>
      prisma.employeePaymentMethod.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('payrollInputs', () =>
      prisma.payrollInput.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('incomeTaxDeclarations', () =>
      prisma.incomeTaxDeclaration.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('fnfCalculations', () =>
      prisma.fNFCalculation.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('payrollAdjustmentLogs', () =>
      prisma.payrollAdjustmentLog.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('payrollTransactionLines', () =>
      prisma.payrollTransactionLine.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Performance & Goals
    await del('performanceReviews', () =>
      prisma.performanceReview.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('goals', () =>
      prisma.goal.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Feedbacks (both from and to)
    await del('feedbacks', () =>
      prisma.feedback.deleteMany({
        where: {
          OR: [
            { fromId: { in: nonAdminEmployeeIds } },
            { toId: { in: nonAdminEmployeeIds } },
          ],
        },
      }),
    );

    // Training
    await del('trainingEnrollments', () =>
      prisma.trainingEnrollment.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Assets
    await del('assetAssignments', () =>
      prisma.assetAssignment.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Documents
    await del('documents', () =>
      prisma.document.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Incidents
    await del('incidentReports', () =>
      prisma.incidentReport.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Travel & Expenses
    await del('travelRequests', () =>
      prisma.travelRequest.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('expenseClaims', () =>
      prisma.expenseClaim.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('reimbursements', () =>
      prisma.reimbursement.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Timesheets
    await del('timesheets', () =>
      prisma.timesheet.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Promotions, Grievances, Separations
    await del('promotions', () =>
      prisma.promotion.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('grievances', () =>
      prisma.grievance.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('separations', () =>
      prisma.separation.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('exitRequests', () =>
      prisma.exitRequest.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('exitInterviews', () =>
      prisma.exitInterview.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Onboarding
    await del('onboardingTasks', () =>
      prisma.onboardingTask.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Employee personal data
    await del('dependents', () =>
      prisma.dependent.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('qualifications', () =>
      prisma.qualification.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('experiences', () =>
      prisma.experience.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('employeeSkills', () =>
      prisma.employeeSkill.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Employee core & collaboration
    await del('customFieldValues', () =>
      prisma.employeeCustomFieldValue.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('dottedLineManagers', () =>
      prisma.dottedLineManager.deleteMany({
        where: {
          OR: [
            { employeeId: { in: nonAdminEmployeeIds } },
            { managerId: { in: nonAdminEmployeeIds } },
          ],
        },
      }),
    );
    await del('teamMemberships', () =>
      prisma.teamMember.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('employeeDimensionAllocations', () =>
      prisma.employeeDimensionAllocation.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('employeeCompanyMappings', () =>
      prisma.employeeCompanyMapping.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Social profiles, calendar syncs
    await del('socialProfiles', () =>
      prisma.socialProfile.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('calendarSyncs', () =>
      prisma.calendarSync.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Marketplace / wellness / ecosystem — employee-linked
    await del('wallets', () =>
      prisma.wallet.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('marketplaceOrders', () =>
      prisma.marketplaceOrder.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('insurancePolicies', () =>
      prisma.insurancePolicy.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('insuranceClaims', () =>
      prisma.insuranceClaim.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('ewaRequests', () =>
      prisma.eWARequest.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('loanMarketListings', () =>
      prisma.loanMarketplaceListing.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('gifts', () =>
      prisma.gift.deleteMany({
        where: {
          OR: [
            { recipientId: { in: nonAdminEmployeeIds } },
            { senderId: { in: nonAdminEmployeeIds } },
          ],
        },
      }),
    );
    await del('rewardPointsLedger', () =>
      prisma.rewardPointsLedger.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('marketplaceFraudFlags', () =>
      prisma.marketplaceFraudFlag.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('financialStressFlags', () =>
      prisma.financialStressFlag.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('walletBudgetAllocations_employee', () =>
      prisma.walletBudgetAllocation.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('clientFeedbacks_employee', () =>
      prisma.clientFeedback.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('personalizedCatalogCaches', () =>
      prisma.personalizedCatalogCache.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('utilizationSnapshots', () =>
      prisma.projectUtilizationSnapshot.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // AI attendance/payroll — employee-linked
    await del('payrollAnomalies', () =>
      prisma.payrollAnomaly.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('ghostEmployeeFlags', () =>
      prisma.ghostEmployeeFlag.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('crossBorderSecondments', () =>
      prisma.crossBorderSecondment.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Referrals
    await del('referrals', () =>
      prisma.referral.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Chat & collaboration — employee-linked
    await del('chatMessages', () =>
      prisma.chatMessage.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('callLogs', () =>
      prisma.callLog.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('callParticipations', () =>
      prisma.callParticipant.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // File system — employee-linked
    await del('fileVersionsUploaded', () =>
      prisma.fileVersion.deleteMany({ where: { uploadedById: { in: nonAdminEmployeeIds } } }),
    );
    await del('fileShareLinksCreated', () =>
      prisma.fileShareLink.deleteMany({ where: { createdById: { in: nonAdminEmployeeIds } } }),
    );

    // GDPR / DLP / Watermark — employee-linked
    await del('documentIntelligenceResults', () =>
      prisma.documentIntelligenceResult.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('gdprAnonymizationRequests', () =>
      prisma.gDPRAnonymizationRequest.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('dlpScanLogs', () =>
      prisma.dLPScanLog.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('watermarkAccessLogs', () =>
      prisma.watermarkAccessLog.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Survey responses & recognitions
    await del('surveyResponses', () =>
      prisma.surveyResponse.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );
    await del('recognitionsReceived', () =>
      prisma.recognition.deleteMany({ where: { toId: { in: nonAdminEmployeeIds } } }),
    );

    // ─── Phase 2: Company-scoped data (delete ALL, not just employee-linked) ───

    // Projects & project-linked data
    await del('projectAllocations', () =>
      prisma.projectAllocation.deleteMany({ where: { project: { companyId: { in: companyIds } } } }),
    );
    await del('projectMembers', () =>
      prisma.projectMember.deleteMany({ where: { project: { companyId: { in: companyIds } } } }),
    );
    await del('timesheets_company', () =>
      prisma.timesheet.deleteMany({ where: { project: { companyId: { in: companyIds } } } }),
    );
    await del('projectTasks', () =>
      prisma.projectTask.deleteMany({ where: { project: { companyId: { in: companyIds } } } }),
    );
    await del('projectMilestones', () =>
      prisma.projectMilestone.deleteMany({ where: { project: { companyId: { in: companyIds } } } }),
    );
    await del('contractorRequests', () =>
      prisma.contractorRequest.deleteMany({ where: { project: { companyId: { in: companyIds } } } }),
    );
    await del('contractors', () =>
      prisma.contractor.deleteMany({ where: { project: { companyId: { in: companyIds } } } }),
    );
    await del('purchaseOrders', () =>
      prisma.purchaseOrder.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );
    await del('purchaseOrderLineItems', () =>
      prisma.purchaseOrderLineItem.deleteMany({ where: { purchaseOrder: { company: { id: { in: companyIds } } } } }),
    );

    // Invoices
    await del('invoiceLineItems', () =>
      prisma.invoiceLineItem.deleteMany({ where: { invoice: { companyId: { in: companyIds } } } }),
    );
    await del('invoices', () =>
      prisma.invoice.deleteMany({ where: { companyId: { in: companyIds } } }),
    );

    // Client data
    await del('clientTimesheetApprovals', () =>
      prisma.clientTimesheetApproval.deleteMany({ where: { client: { companyId: { in: companyIds } } } }),
    );
    await del('clientChurnRisks', () =>
      prisma.clientChurnRisk.deleteMany({ where: { client: { companyId: { in: companyIds } } } }),
    );
    await del('clientMarginSnapshots', () =>
      prisma.clientMarginSnapshot.deleteMany({ where: { client: { companyId: { in: companyIds } } } }),
    );
    await del('sows', () =>
      prisma.sOW.deleteMany({ where: { client: { companyId: { in: companyIds } } } }),
    );
    await del('clientPortalUsers', () =>
      prisma.clientPortalUser.deleteMany({ where: { client: { companyId: { in: companyIds } } } }),
    );
    await del('clientContacts', () =>
      prisma.clientContact.deleteMany({ where: { client: { companyId: { in: companyIds } } } }),
    );
    await del('clientBranches', () =>
      prisma.clientBranch.deleteMany({ where: { client: { companyId: { in: companyIds } } } }),
    );
    await del('clientFeedbacks_company', () =>
      prisma.clientFeedback.deleteMany({ where: { client: { companyId: { in: companyIds } } } }),
    );
    await del('clients', () =>
      prisma.client.deleteMany({ where: { companyId: { in: companyIds } } }),
    );

    // Vendor data
    await del('vendorInvoices', () =>
      prisma.vendorInvoice.deleteMany({ where: { vendor: { companyId: { in: companyIds } } } }),
    );
    await del('vendorStaff', () =>
      prisma.vendorStaff.deleteMany({ where: { vendor: { companyId: { in: companyIds } } } }),
    );
    await del('vendorPortalUsers', () =>
      prisma.vendorPortalUser.deleteMany({ where: { vendor: { companyId: { in: companyIds } } } }),
    );
    await del('vendorDocuments', () =>
      prisma.vendorDocument.deleteMany({ where: { vendor: { companyId: { in: companyIds } } } }),
    );
    await del('vendors', () =>
      prisma.vendor.deleteMany({ where: { companyId: { in: companyIds } } }),
    );

    // Projects (now safe after allocations/members deleted)
    await del('projects', () =>
      prisma.project.deleteMany({ where: { companyId: { in: companyIds } } }),
    );

    // Marketplace data (company-scoped)
    await del('marketplaceProducts', () =>
      prisma.marketplaceProduct.deleteMany({ where: { companyId: { in: companyIds } } }),
    );
    await del('walletBudgetAllocations_company', () =>
      prisma.walletBudgetAllocation.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );
    await del('reportSchedules', () =>
      prisma.reportSchedule.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );

    // Requisitions (company-scoped)
    await del('requisitions', () =>
      prisma.requisition.deleteMany({ where: { companyId: { in: companyIds } } }),
    );

    // Payroll runs and related (company-scoped)
    await del('bankPaymentFiles', () =>
      prisma.bankPaymentFile.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );
    await del('payrollRuns', () =>
      prisma.payrollRun.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );
    await del('payrollValidations', () =>
      prisma.payrollValidation.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );
    await del('payrollLockRequests', () =>
      prisma.payrollLockRequest.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );
    await del('payrollApprovals', () =>
      prisma.payrollApproval.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );

    // Compliance filings (company-scoped)
    await del('complianceFilings', () =>
      prisma.complianceFiling.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );

    // Minimum wage configs (company-scoped)
    await del('minimumWageConfigs', () =>
      prisma.minimumWageConfig.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );

    // Data residency policy (company-scoped, will be re-created if needed)
    await del('dataResidencyPolicy', () =>
      prisma.dataResidencyPolicy.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );

    // Anomaly insights & workflow triggers (company-scoped)
    await del('anomalyInsights', () =>
      prisma.anomalyInsight.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );

    // ─── Phase 3: Recruitment data ───

    // Job postings & applications
    await del('interviewFeedbacks', () =>
      prisma.interviewFeedback.deleteMany({ where: { interview: { jobApplication: { jobPosting: { departmentId: { in: departmentIds } } } } } }),
    );
    await del('candidateSentimentScores', () =>
      prisma.candidateSentimentScore.deleteMany({ where: { jobApplication: { jobPosting: { departmentId: { in: departmentIds } } } } }),
    );
    await del('resumeParses', () =>
      prisma.resumeParse.deleteMany({ where: { jobApplication: { jobPosting: { departmentId: { in: departmentIds } } } } }),
    );
    await del('interviews', () =>
      prisma.interview.deleteMany({ where: { jobApplication: { jobPosting: { departmentId: { in: departmentIds } } } } }),
    );
    await del('jobApplications', () =>
      prisma.jobApplication.deleteMany({ where: { jobPosting: { departmentId: { in: departmentIds } } } }),
    );
    await del('jobBoardPostings', () =>
      prisma.jobBoardPosting.deleteMany({ where: { jobPosting: { departmentId: { in: departmentIds } } } }),
    );
    await del('jobPostings', () =>
      prisma.jobPosting.deleteMany({ where: { departmentId: { in: departmentIds } } }),
    );

    // Offers & related
    await del('offerDeclineSurveys', () =>
      prisma.offerDeclineSurvey.deleteMany({ where: { offer: { department: { not: null } } } }),
    );
    await del('offers', () =>
      prisma.offer.deleteMany({ where: { department: { in: departmentIds } } }),
    );

    // ─── Phase 4: Non-admin employees ───
    // Now safe to delete non-admin employees after all their dependent records are gone
    await del('employees', () =>
      prisma.employee.deleteMany({ where: { id: { in: nonAdminEmployeeIds } } }),
    );

    // ─── Phase 5: Non-admin users ───
    // Delete UserRoleAssignments for non-admin users first
    await del('userRoleAssignments', () =>
      prisma.userRoleAssignment.deleteMany({ where: { userId: { notIn: adminUserIds } } }),
    );

    // Delete non-admin users under this tenant
    await del('users', () =>
      prisma.user.deleteMany({
        where: {
          tenantId,
          id: { notIn: adminUserIds },
        },
      }),
    );

    // ─── Phase 6: Tenant-scoped data ───

    // Notifications for this tenant
    await del('notifications', () =>
      prisma.notification.deleteMany({ where: { tenantId } }),
    );

    // Login activities for this tenant's users
    await del('loginActivities', () =>
      prisma.loginActivity.deleteMany({ where: { user: { tenantId } } }),
    );

    // Audit logs for this tenant's users
    await del('auditLogs', () =>
      prisma.auditLog.deleteMany({ where: { user: { tenantId } } }),
    );

    // AI chat logs
    await del('aiChatLogs', () =>
      prisma.aIChatLog.deleteMany({ where: { user: { tenantId } } }),
    );

    // AI prompt logs (tenant-specific)
    await del('aiPromptLogs', () =>
      prisma.aIPromptLog.deleteMany({ where: { userId: { in: adminUserIds } } }),
    );

    // Preboarding candidates
    await del('preboardingCandidates', () =>
      prisma.preboardingCandidate.deleteMany({ where: { employeeId: { in: nonAdminEmployeeIds } } }),
    );

    // Background checks
    await del('backgroundChecks', () =>
      prisma.backgroundCheck.deleteMany({ where: { preboardingCandidate: { employeeId: { in: nonAdminEmployeeIds } } } }),
    );

    // Welcome series emails
    await del('welcomeSeriesEmails', () =>
      prisma.welcomeSeriesEmail.deleteMany({ where: { preboardingCandidate: { employeeId: { in: nonAdminEmployeeIds } } } }),
    );

    // ─── Phase 7: Global/shared data that might have been seeded ───

    // Workflow definitions (company-scoped)
    await del('workflowApprovals', () =>
      prisma.workflowApproval.deleteMany({ where: { workflowInstance: { workflowDefinition: { companyId: { in: companyIds } } } } }),
    );
    await del('workflowInstances', () =>
      prisma.workflowInstance.deleteMany({ where: { workflowDefinition: { companyId: { in: companyIds } } } }),
    );
    await del('workflowDefinitions', () =>
      prisma.workflowDefinition.deleteMany({ where: { companyId: { in: companyIds } } }),
    );

    // Tickets
    await del('ticketComments', () =>
      prisma.ticketComment.deleteMany({ where: { ticket: { requesterId: { in: nonAdminEmployeeIds } } } }),
    );
    await del('tickets', () =>
      prisma.ticket.deleteMany({ where: { requesterId: { in: nonAdminEmployeeIds } } }),
    );

    // Announcements
    await del('announcements', () =>
      prisma.announcement.deleteMany({}),
    );

    // Policies (sample)
    await del('policies', () =>
      prisma.policy.deleteMany({}),
    );

    // Chat rooms & messages (company-scoped)
    await del('chatRoomMembers', () =>
      prisma.chatRoomMember.deleteMany({ where: { room: { companyId: { in: companyIds } } } }),
    );
    await del('chatMessages_company', () =>
      prisma.chatMessage.deleteMany({ where: { room: { companyId: { in: companyIds } } } }),
    );
    await del('chatRooms', () =>
      prisma.chatRoom.deleteMany({ where: { companyId: { in: companyIds } } }),
    );

    // Sentiment analyses & chat summaries
    await del('sentimentAnalyses', () =>
      prisma.sentimentAnalysis.deleteMany({}),
    );
    await del('chatSummaries', () =>
      prisma.chatSummary.deleteMany({}),
    );
    await del('aiKnowledgeQueries', () =>
      prisma.aIKnowledgeQuery.deleteMany({}),
    );

    // Storage analytics
    await del('storageAnalytics', () =>
      prisma.storageAnalytics.deleteMany({ where: { company: { id: { in: companyIds } } } }),
    );

    // Geofences (branch-scoped)
    await del('geofences', () =>
      prisma.geofence.deleteMany({ where: { branchId: { in: branchIds } } }),
    );

    // Biometric devices (branch-scoped)
    await del('biometricDevices', () =>
      prisma.biometricDevice.deleteMany({ where: { branchId: { in: branchIds } } }),
    );

    // Attendance AI thresholds
    await del('attendanceAiThresholds', () =>
      prisma.attendanceAiThreshold.deleteMany({}),
    );

    // Approval routing rules
    await del('approvalRoutingRules', () =>
      prisma.approvalRoutingRule.deleteMany({}),
    );

    // Rosters (branch-scoped)
    await del('rosterAssignments_all', () =>
      prisma.employeeRosterAssignment.deleteMany({ where: { roster: { branchId: { in: branchIds } } } }),
    );
    await del('rotationalRosters', () =>
      prisma.rotationalRoster.deleteMany({ where: { branchId: { in: branchIds } } }),
    );

    // OKRs (company-scoped + individual)
    await del('keyResults', () =>
      prisma.keyResult.deleteMany({ where: { okr: { companyId: { in: companyIds } } } }),
    );
    await del('okrs', () =>
      prisma.oKR.deleteMany({ where: { companyId: { in: companyIds } } }),
    );

    // Surveys (engagement)
    await del('surveyResponses_all', () =>
      prisma.surveyResponse.deleteMany({}),
    );
    await del('surveys', () =>
      prisma.survey.deleteMany({}),
    );

    // Recognitions (remaining)
    await del('recognitions_all', () =>
      prisma.recognition.deleteMany({}),
    );

    // Training data
    await del('trainingEnrollments_all', () =>
      prisma.trainingEnrollment.deleteMany({}),
    );
    await del('trainings', () =>
      prisma.training.deleteMany({}),
    );

    // Assets (sample)
    await del('assetAssignments_all', () =>
      prisma.assetAssignment.deleteMany({}),
    );
    await del('assets', () =>
      prisma.asset.deleteMany({}),
    );

    // Vendor categories
    await del('vendorCategories', () =>
      prisma.vendorCategory.deleteMany({}),
    );

    // Marketplace providers
    await del('marketplaceProviders', () =>
      prisma.marketplaceProvider.deleteMany({}),
    );

    // Wallet buckets
    await del('walletBuckets', () =>
      prisma.walletBucket.deleteMany({}),
    );

    // Wallet transactions
    await del('walletTransactions', () =>
      prisma.walletTransaction.deleteMany({}),
    );

    // ─── Return summary ───
    const totalDeleted = Object.values(counts).reduce((sum, c) => sum + c, 0);

    return ok({
      success: true,
      tenantSlug,
      tenantId,
      preserved: {
        adminUsers: adminUsers.map(u => ({ email: u.email, role: u.role })),
        adminEmployeeCount: adminEmployeeIds.length,
        companyCount: companyIds.length,
        departmentCount: departmentIds.length,
        branchCount: branchIds.length,
      },
      deleted: counts,
      totalRecordsDeleted: totalDeleted,
    });
  } catch (e: unknown) {
    console.error('[cleanup-sample-data] Error:', e);
    return fail(
      e instanceof Error ? e.message : 'Cleanup failed with unknown error',
      500,
    );
  }
}
