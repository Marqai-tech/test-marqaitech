import { NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request: Request) {
  try {
    // Verify auth — allow super_admin and tenant_admin
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    if (!['super_admin', 'tenant_admin', 'admin'].includes(decoded.role as string)) {
      return NextResponse.json({ error: 'Only admins can backup' }, { status: 403 });
    }

    const body = await request.json();
    const { tenantSlug } = body;

    if (!tenantSlug) {
      return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 });
    }

    const platformDb = getPlatformDb();
    const tenant = await platformDb.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, slug: true, name: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: `Tenant "${tenantSlug}" not found` }, { status: 404 });
    }

    const tenantDb = await getDbForTenant(tenant.slug);

    // Collect record counts for all major tables
    const tables = [
      'employee', 'user', 'company', 'companyGroup', 'department', 'designation',
      'branch', 'leaveType', 'leaveBalance', 'leaveRequest', 'attendance',
      'shift', 'holiday', 'payrollRun', 'payroll', 'payrollComponent',
      'statutoryComponent', 'cTCTemplate', 'taxSlabTable', 'employeePaymentMethod',
      'loan', 'overtimeRecord', 'payrollHold', 'payrollInput', 'payrollValidation',
      'incomeTaxDeclaration', 'complianceFiling', 'bankPaymentFile',
      'leavePolicyRule', 'attendancePolicyRule',
      'onboardingTask', 'preboardingCandidate', 'grievance',
      'document', 'performanceReview', 'goal', 'trainingEnrollment',
      'assetAssignment', 'incidentReport', 'travelRequest', 'expenseClaim',
      'timesheet', 'project', 'task', 'projectAllocation',
      'invoice', 'invoiceLineItem', 'ticket',
    ];

    const tableCounts: { table: string; count: number }[] = [];
    let totalRecords = 0;

    for (const table of tables) {
      try {
        const count = await (tenantDb as any)[table].count();
        tableCounts.push({ table, count });
        totalRecords += count;
      } catch {
        // Table might not exist in this tenant's schema — skip
      }
    }

    console.log(`[backup] Tenant "${tenantSlug}": ${tableCounts.length} tables, ${totalRecords} total records`);

    return NextResponse.json({
      success: true,
      tenant: tenant.name,
      tenantSlug: tenant.slug,
      timestamp: new Date().toISOString(),
      tables: tableCounts.filter(t => t.count > 0),
      totalTables: tableCounts.length,
      totalRecords,
      message: `Backup summary generated for ${tenant.name}. ${totalRecords} records across ${tableCounts.filter(t => t.count > 0).length} tables.`,
    });
  } catch (error) {
    console.error('Backup error:', error);
    return NextResponse.json(
      { error: 'Failed to backup database', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
