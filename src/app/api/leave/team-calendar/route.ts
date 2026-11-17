import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }; }
export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month');
    const includeSelf = searchParams.get('includeSelf') === 'true';
    if (!month) return NextResponse.json({ error: 'month required' }, { status: 400, headers: cors() });
    const [year, monthNum] = month.split('-').map(Number);
    const startOfMonth = new Date(year, monthNum - 1, 1);
    const endOfMonth = new Date(year, monthNum, 0, 23, 59, 59, 999);
    const where: Record<string, unknown> = { status: { in: ['pending', 'approved'] }, startDate: { lte: endOfMonth }, endDate: { gte: startOfMonth } };
    let selfEmp: any = null; let teamMembers: any[] = [];
    if (scope.scope === 'self' || scope.scope === 'team') {
      selfEmp = await db.employee.findFirst({ where: { userId: scope.userId, status: 'active' }, select: { id: true, firstName: true, lastName: true, departmentId: true, avatar: true } }).catch(() => null);
      if (selfEmp?.departmentId) { teamMembers = await db.employee.findMany({ where: { departmentId: selfEmp.departmentId, status: 'active' }, select: { id: true, firstName: true, lastName: true, employeeId: true, avatar: true } }).catch(() => []); where.employee = { departmentId: selfEmp.departmentId, status: 'active' }; if (!includeSelf && selfEmp?.id) where.employeeId = { not: selfEmp.id }; }
      else { where.employee = { userId: scope.userId }; }
    } else if (scope.companyId) { where.employee = { companyId: scope.companyId, status: 'active' }; teamMembers = await db.employee.findMany({ where: { companyId: scope.companyId, status: 'active' }, select: { id: true, firstName: true, lastName: true, employeeId: true, avatar: true } }).catch(() => []); }
    else { try { const fc = await db.company.findFirst({ where: { status: 'active' }, select: { id: true }, orderBy: { createdAt: 'asc' } }); if (fc) { where.employee = { companyId: fc.id, status: 'active' }; teamMembers = await db.employee.findMany({ where: { companyId: fc.id, status: 'active' }, select: { id: true, firstName: true, lastName: true, employeeId: true, avatar: true } }).catch(() => []); } } catch {} }
    const leaveRequests = await db.leaveRequest.findMany({ where, orderBy: { startDate: 'asc' }, include: { employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, avatar: true } }, leaveType: { select: { id: true, name: true, code: true } } } }).catch(() => []);
    const fixAvatar = (emp: any) => emp ? { ...emp, avatar: emp.avatar?.startsWith('data:') ? `/api/employees/${emp.id}/photo` : emp.avatar || null } : { id: '', firstName: 'Unknown', lastName: '', avatar: null };
    const leaves = leaveRequests.map((lr: any) => ({ id: lr.id, status: lr.status, startDate: lr.startDate, endDate: lr.endDate, halfDay: lr.halfDay || false, halfDaySlot: lr.halfDaySlot || null, reason: lr.reason || null, leaveType: lr.leaveType || { id: '', name: 'Leave', code: '' }, employee: fixAvatar(lr.employee) }));
    const byDate: Record<string, number[]> = {};
    leaves.forEach((lv: any, idx: number) => { const s = new Date(lv.startDate); const e = new Date(lv.endDate); const c = new Date(s); let g = 0; while (c <= e && g < 400) { g++; const dk = c.toISOString().split('T')[0]; if (!byDate[dk]) byDate[dk] = []; byDate[dk].push(idx); c.setDate(c.getDate() + 1); } });
    const team = teamMembers.map((m: any) => ({ id: m.id, firstName: m.firstName || '', lastName: m.lastName || '', employeeCode: m.employeeId || '', avatar: m.avatar?.startsWith('data:') ? `/api/employees/${m.id}/photo` : m.avatar || null }));
    return NextResponse.json({ teamSize: team.length, month, leaves, byDate, team, me: selfEmp ? { id: selfEmp.id, firstName: selfEmp.firstName, lastName: selfEmp.lastName } : null }, { headers: cors() });
  } catch (error) { console.error('[team-calendar] error:', error); return NextResponse.json({ teamSize: 0, month: '', leaves: [], byDate: {}, team: [], me: null }, { headers: cors() }); }
}
