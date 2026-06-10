import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // 1. Check PayrollRun table columns
    let columns: any[] = [];
    try {
      columns = await db.$queryRaw`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'PayrollRun'
        ORDER BY ordinal_position
      `;
    } catch (e: any) {
      return NextResponse.json({ error: 'Cannot query schema', details: e.message });
    }

    // 2. Try to create a PayrollRun and capture exact error
    let createError = null;
    let createResult = null;
    try {
      const companies = await db.company.findMany({ take: 1 });
      if (companies.length > 0) {
        createResult = await db.payrollRun.create({
          data: {
            legalEntityId: companies[0].id,
            payrollPeriod: '2026-05-DEBUG',
            periodStartDate: new Date('2026-05-01'),
            periodEndDate: new Date('2026-05-31'),
            payDate: new Date('2026-05-30'),
            runType: 'REGULAR',
            runStatus: 'OPEN',
            currencyCode: 'USD',
            companyId: companies[0].id,
          }
        });
      }
    } catch (e: any) {
      createError = e.message;
    }

    // 3. Clean up debug row
    if (createResult) {
      try {
        await db.payrollRun.delete({ where: { id: createResult.id } });
      } catch {}
    }

    return NextResponse.json({
      columns,
      createError,
      createSuccess: !!createResult,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
