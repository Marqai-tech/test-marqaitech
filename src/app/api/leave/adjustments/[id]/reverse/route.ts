import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { ensureLeaveSetupSchema } from '@/lib/leave-setup-schema';

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }; }
export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

// POST — reverse an approved adjustment (cancellation)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql));

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || 'Cancellation';

    // Get the adjustment + its ledger entries
    const adj: any[] = await db.$queryRawUnsafe(`SELECT * FROM "LeaveAdjustment" WHERE "id" = $1`, id);
    if (adj.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: cors() });
    if (adj[0].status !== 'hr_approved') return NextResponse.json({ error: 'Only approved adjustments can be reversed' }, { status: 409, headers: cors() });

    // Get original ledger entries
    const entries: any[] = await db.$queryRawUnsafe(`SELECT * FROM "LeaveAdjustmentLedger" WHERE "adjustmentId" = $1 AND "reversalOfId" IS NULL`, id);

    // Write reversal entries
    for (const e of entries) {
      const rid = `lal_${Date.now()}_rev_${Math.random().toString(36).slice(2, 6)}`;
      const revType = e.entryType === 'advance' ? 'reversal' : e.entryType === 'transfer_debit' ? 'transfer_credit' : 'transfer_debit';
      await db.$executeRawUnsafe(
        `INSERT INTO "LeaveAdjustmentLedger" ("id", "adjustmentId", "employeeId", "leaveTypeId", "entryType", "days", "year", "reversalOfId") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        rid, id, e.employeeId, e.leaveTypeId, `reversal`, e.days, e.year, e.id
      );
    }

    // Mark adjustment as cancelled
    await db.$executeRawUnsafe(`UPDATE "LeaveAdjustment" SET "status" = 'cancelled', "updatedAt" = NOW() WHERE "id" = $1`, id);

    return NextResponse.json({ success: true, reversed: entries.length }, { headers: cors() });
  } catch (error) {
    console.error('[adjustment reverse] error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500, headers: cors() });
  }
}
