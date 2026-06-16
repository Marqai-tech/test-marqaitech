import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// GET: List all leave types
export async function GET() {
  try {
    const leaveTypes = await db.leaveType.findMany({
      where: { status: 'active' },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ data: leaveTypes }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Leave types GET error:', error);
    // Demo data fallback
    const demoLeaveTypes = [
      { id: 'lt-1', name: 'Casual Leave', code: 'CL', description: 'Casual leave for personal matters', defaultDays: 12, isPaid: true, carryForward: false, maxCarryForward: 0, status: 'active', createdAt: new Date(), updatedAt: new Date() },
      { id: 'lt-2', name: 'Sick Leave', code: 'SL', description: 'Sick leave for medical reasons', defaultDays: 10, isPaid: true, carryForward: false, maxCarryForward: 0, status: 'active', createdAt: new Date(), updatedAt: new Date() },
      { id: 'lt-3', name: 'Earned Leave', code: 'EL', description: 'Earned / privilege leave', defaultDays: 15, isPaid: true, carryForward: true, maxCarryForward: 5, status: 'active', createdAt: new Date(), updatedAt: new Date() },
      { id: 'lt-4', name: 'Maternity Leave', code: 'ML', description: 'Maternity leave for expecting mothers', defaultDays: 182, isPaid: true, carryForward: false, maxCarryForward: 0, status: 'active', createdAt: new Date(), updatedAt: new Date() },
      { id: 'lt-5', name: 'Paternity Leave', code: 'PL', description: 'Paternity leave for new fathers', defaultDays: 15, isPaid: true, carryForward: false, maxCarryForward: 0, status: 'active', createdAt: new Date(), updatedAt: new Date() },
    ];
    return NextResponse.json({ data: demoLeaveTypes }, { headers: corsHeaders() });
  }
}

// POST: Create a new leave type
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, code, description, defaultDays, isPaid, carryForward, maxCarryForward } = body;

    if (!name || !code) {
      return NextResponse.json({ error: 'Name and code are required' }, { status: 400, headers: corsHeaders() });
    }

    const leaveType = await db.leaveType.create({
      data: {
        name,
        code: code.toUpperCase(),
        description: description || null,
        defaultDays: defaultDays ?? 0,
        isPaid: isPaid ?? true,
        carryForward: carryForward ?? false,
        maxCarryForward: maxCarryForward ?? 0,
        status: 'active',
      },
    });

    return NextResponse.json({ leaveType }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Leave types POST error:', error);
    return NextResponse.json({ error: 'Failed to create leave type' }, { status: 500, headers: corsHeaders() });
  }
}
