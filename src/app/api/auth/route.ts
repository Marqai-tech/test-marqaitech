import { NextRequest, NextResponse } from 'next/server';

// Demo users for fallback when database is unavailable
const DEMO_USERS: Record<string, { name: string; role: string; password: string; companyId: string | null; companyName: string | null; companyCode: string | null; companyCurrency: string | null; employeeId: string | null; employeeName: string | null }> = {
  'admin@nexushrms.com': { name: 'Admin Nexus', role: 'super_admin', password: 'admin123', companyId: 'comp-1', companyName: 'Nexus Technologies', companyCode: 'NEXUS', companyCurrency: 'INR', employeeId: null, employeeName: null },
  'sarah.j@nexustech.com': { name: 'Sarah Johnson', role: 'company_hr_admin', password: 'sarah123', companyId: 'comp-1', companyName: 'Nexus Technologies', companyCode: 'NEXUS', companyCurrency: 'INR', employeeId: 'EMP002', employeeName: 'Priya Sharma' },
  'raj.p@nexustech.com': { name: 'Raj Patel', role: 'reporting_manager', password: 'raj123', companyId: 'comp-1', companyName: 'Nexus Technologies', companyCode: 'NEXUS', companyCurrency: 'INR', employeeId: 'EMP001', employeeName: 'Rajesh Kumar' },
  'emily.c@nexustech.com': { name: 'Emily Chen', role: 'employee', password: 'emily123', companyId: 'comp-1', companyName: 'Nexus Technologies', companyCode: 'NEXUS', companyCurrency: 'INR', employeeId: 'EMP003', employeeName: 'Amit Patel' },
  'hr@acme.com': { name: 'Acme Corp', role: 'client', password: 'acme123', companyId: 'comp-1', companyName: 'Nexus Technologies', companyCode: 'NEXUS', companyCurrency: 'INR', employeeId: null, employeeName: null },
  'info@talenthunt.com': { name: 'TalentHunt Agency', role: 'vendor', password: 'thunt123', companyId: 'comp-1', companyName: 'Nexus Technologies', companyCode: 'NEXUS', companyCurrency: 'INR', employeeId: null, employeeName: null },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Try database authentication first
    try {
      const { db } = await import('@/lib/db');

      const user = await db.user.findUnique({
        where: { email },
        include: {
          company: true,
          employee: {
            include: {
              department: true,
              branch: true,
            },
          },
        },
      });

      if (user) {
        if (!user.isActive) {
          return NextResponse.json(
            { error: 'Account is deactivated' },
            { status: 403 }
          );
        }

        // Simple password comparison
        if (user.password !== password) {
          return NextResponse.json(
            { error: 'Invalid email or password' },
            { status: 401 }
          );
        }

        // Update last login (non-blocking)
        db.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        }).catch(() => {});

        // Create audit log (non-blocking)
        db.auditLog.create({
          data: {
            action: 'LOGIN',
            entity: 'User',
            entityId: user.id,
            userId: user.id,
            details: `User ${user.email} logged in`,
          },
        }).catch(() => {});

        const { password: _, ...userWithoutPassword } = user;

        return NextResponse.json({
          user: userWithoutPassword,
          token: Buffer.from(`${user.id}:${Date.now()}`).toString('base64'),
        });
      }
    } catch (dbError) {
      console.error('Database auth error, trying demo fallback:', dbError);
    }

    // Fallback: demo users
    const demoUser = DEMO_USERS[email];
    if (demoUser && demoUser.password === password) {
      const userId = `demo-${email.split('@')[0]}`;
      return NextResponse.json({
        user: {
          id: userId,
          email,
          name: demoUser.name,
          role: demoUser.role,
          companyId: demoUser.companyId,
          isActive: true,
          avatar: null,
          lastLogin: null,
          company: demoUser.companyId ? {
            id: demoUser.companyId,
            name: demoUser.companyName,
            code: demoUser.companyCode,
            currency: demoUser.companyCurrency,
            industry: 'IT Services',
            country: 'IN',
            isActive: true,
          } : null,
          employee: demoUser.employeeId ? {
            id: `demo-${email.split('@')[0]}`,
            employeeId: demoUser.employeeId,
            firstName: demoUser.employeeName?.split(' ')[0] || '',
            lastName: demoUser.employeeName?.split(' ').slice(1).join(' ') || '',
          } : null,
        },
        token: Buffer.from(`${userId}:${Date.now()}`).toString('base64'),
      });
    }

    return NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
