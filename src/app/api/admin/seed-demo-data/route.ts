/**
 * POST /api/admin/seed-demo-data
 *
 * Admin-only endpoint that triggers the comprehensive demo seed.
 * This populates ALL modules with sample data for the demo link.
 *
 * Body: { confirm: true }
 * Headers: Authorization: Bearer <admin_token>
 */
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function POST(request: Request) {
  try {
    // Verify admin access
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized - no token' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
    }

    const role = (decoded as any).role;
    if (!['super_admin', 'tenant_admin', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403, headers: corsHeaders() });
    }

    let body: { confirm?: boolean } = {};
    try { body = await request.json(); } catch { /* empty */ }

    if (!body.confirm) {
      return NextResponse.json({
        message: 'This will DELETE all existing demo data and re-seed. Send { confirm: true } to proceed.',
        warning: 'Destructive operation — all current data will be replaced with demo sample data.',
      }, { headers: corsHeaders() });
    }

    // Run seed-demo.ts via child process
    const { execFile } = await import('child_process');
    const path = await import('path');

    const scriptPath = path.join(process.cwd(), 'prisma', 'seed-demo.ts');

    return new Promise((resolve) => {
      const child = execFile(
        'npx',
        ['tsx', scriptPath],
        {
          cwd: process.cwd(),
          env: { ...process.env },
          timeout: 300000, // 5 minute timeout
          maxBuffer: 1024 * 1024 * 5,
        },
        (error, stdout, stderr) => {
          if (error) {
            console.error('[Seed Demo] Error:', error);
            resolve(NextResponse.json({
              error: 'Demo seed failed',
              details: error.message,
              stdout: stdout?.substring(0, 2000),
              stderr: stderr?.substring(0, 2000),
            }, { status: 500, headers: corsHeaders() }));
            return;
          }

          resolve(NextResponse.json({
            success: true,
            message: 'Demo data seeded successfully!',
            output: stdout?.substring(stdout.length - 3000),
          }, { headers: corsHeaders() }));
        }
      );
    });
  } catch (error) {
    console.error('[Seed Demo API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: corsHeaders() }
    );
  }
}
