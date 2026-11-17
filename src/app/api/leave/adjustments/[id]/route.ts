import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { ensureLeaveSetupSchema } from '@/lib/leave-setup-schema';

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }; }
export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

// GET — single adjustment detail with ledger entries
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql));

    const { id } = await params;
    const rows: any[] = await db.$queryRawUnsafe(`
      SELECT la.*, e."firstName", e."lastName", e."employeeId" as empCode,
             lt."name" as leaveTypeName, lt."code" as leaveTypeCode,
             dt."name" as donorTypeName, dt."code" as donorTypeCode
      FROM "LeaveAdjustment" la
      JOIN "Employee" e ON la."employeeId" = e."id"
      JOIN "LeaveType" lt ON la."leaveTypeId" = lt."id"
      LEFT JOIN "LeaveType" dt ON la."modeBDonorTypeId" = dt."id"
      WHERE la."id" = $1
    `, id);

    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: cors() });

    const ledger: any[] = await db.$queryRawUnsafe(
      `SELECT * FROM "LeaveAdjustmentLedger" WHERE "adjustmentId" = $1 ORDER BY "createdAt" ASC`, id
    );

    return NextResponse.json({ data: rows[0], ledger }, { headers: cors() });
  } catch (error) {
    console.error('[adjustment GET] error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500, headers: cors() });
  }
}

// PATCH — approve/reject (manager or HR level)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql));

    const { id } = await params;
    const body = await req.json();
    const { action, remarks, level } = body; // level: 'manager' | 'hr', action: 'approve' | 'reject'

    if (!action || !level) return NextResponse.json({ error: 'action and level required' }, { status: 400, headers: cors() });

    // Get current state
    const current: any[] = await db.$queryRawUnsafe(`SELECT * FROM "LeaveAdjustment" WHERE "id" = $1`, id);
    if (current.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: cors() });
    const adj = current[0];

    if (level === 'manager') {
      if (adj.status !== 'pending') return NextResponse.json({ error: 'Not in pending state' }, { status: 409, headers: cors() });
      const newStatus = action === 'approve' ? 'manager_approved' : 'rejected';
      await db.$executeRawUnsafe(
        `UPDATE "LeaveAdjustment" SET "status" = $1, "managerApproverId" = $2, "managerApprovedAt" = NOW(), "managerRemarks" = $3, "updatedAt" = NOW() WHERE "id" = $4`,
        newStatus, scope.userId, remarks || null, id
      );
      // If approved by manager, write ledger entries
      if (action === 'approve') {
        if (adj.modeA && adj.modeADays > 0) {
          const lid = `lal_${Date.now()}_a`;
          await db.$executeRawUnsafe(
            `INSERT INTO "LeaveAdjustmentLedger" ("id", "adjustmentId", "employeeId", "leaveTypeId", "entryType", "days", "year") VALUES ($1, $2, $3, $4, 'advance', $5, $6)`,
            lid, id, adj.employeeId, adj.leaveTypeId, adj.modeADays, new Date().getFullYear() + 1
          );
        }
        if (adj.modeB && adj.modeBDays > 0 && adj.modeBDonorTypeId) {
          const lid1 = `lal_${Date.now()}_d`, lid2 = `lal_${Date.now()}_c`;
          await db.$executeRawUnsafe(
            `INSERT INTO "LeaveAdjustmentLedger" ("id", "adjustmentId", "employeeId", "leaveTypeId", "entryType", "days", "year") VALUES ($1, $2, $3, $4, 'transfer_debit', $5, $6)`,
            lid1, id, adj.employeeId, adj.modeBDonorTypeId, adj.modeBDays, new Date().getFullYear()
          );
          await db.$executeRawUnsafe(
            `INSERT INTO "LeaveAdjustmentLedger" ("id", "adjustmentId", "employeeId", "leaveTypeId", "entryType", "days", "year") VALUES ($1, $2, $3, $4, 'transfer_credit', $5, $6)`,
            lid2, id, adj.employeeId, adj.leaveTypeId, adj.modeBDays, new Date().getFullYear()
          );
        }
      }
    } else if (level === 'hr') {
      if (adj.status !== 'manager_approved') return NextResponse.json({ error: 'Requires manager approval first' }, { status: 409, headers: cors() });
      const newStatus = action === 'approve' ? 'hr_approved' : 'rejected';
      await db.$executeRawUnsafe(
        `UPDATE "LeaveAdjustment" SET "status" = $1, "hrApproverId" = $2, "hrApprovedAt" = NOW(), "hrRemarks" = $3, "updatedAt" = NOW() WHERE "id" = $4`,
        newStatus, scope.userId, remarks || null, id
      );
    }

    return NextResponse.json({ success: true, status: action === 'approve' ? (level === 'manager' ? 'manager_approved' : 'hr_approved') : 'rejected' }, { headers: cors() });
  } catch (error) {
    console.error('[adjustment PATCH] error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500, headers: cors() });
  }
}
