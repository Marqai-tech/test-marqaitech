import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// This endpoint fixes EH2R or any wrong branding in the database
// It can be called without authentication to ensure the tenant is always "3 Boxes Corp"
export async function GET() {
  try {
    console.log('[FixTenant] Checking and fixing tenant branding...');

    const allTenants = await prisma.tenant.findMany();
    console.log('[FixTenant] Found', allTenants.length, 'tenant(s):', allTenants.map(t => `${t.name} (${t.slug})`));

    let fixedCount = 0;
    let mainTenant = allTenants.find((t: any) =>
      t.slug === '3boxes-corp' || t.slug === '3boxes-hrms-demo'
    );

    // If no 3 Boxes tenant exists, find any tenant and rebrand it
    if (!mainTenant && allTenants.length > 0) {
      mainTenant = allTenants[0];
    }

    // Fix or create the main tenant
    if (mainTenant) {
      const nameLower = (mainTenant.name || '').toLowerCase();
      const needsFix = nameLower.includes('eh2r') || nameLower.includes('ehhr') ||
        nameLower.includes('nexus') || !nameLower.includes('3 boxes') || mainTenant.slug !== '3boxes-corp';

      if (needsFix) {
        mainTenant = await prisma.tenant.update({
          where: { id: mainTenant.id },
          data: {
            name: '3 Boxes Corp',
            slug: '3boxes-corp',
            domain: '3boxeshrms.com',
            plan: mainTenant.plan || 'enterprise',
            status: mainTenant.status || 'active',
          },
        });
        fixedCount++;
        console.log('[FixTenant] Fixed main tenant from', nameLower, 'to "3 Boxes Corp"');
      }
    } else {
      // No tenants at all — create one
      mainTenant = await prisma.tenant.create({
        data: {
          name: '3 Boxes Corp',
          slug: '3boxes-corp',
          domain: '3boxeshrms.com',
          plan: 'enterprise',
          status: 'active',
          country: 'US',
          currency: 'USD',
          timezone: 'America/New_York',
        },
      });
      fixedCount++;
      console.log('[FixTenant] Created new tenant: 3 Boxes Corp');
    }

    // Fix any other tenants with wrong branding
    for (const otherTenant of allTenants) {
      if (otherTenant.id !== mainTenant.id) {
        const otherNameLower = (otherTenant.name || '').toLowerCase();
        if (otherNameLower.includes('eh2r') || otherNameLower.includes('ehhr') ||
          !otherNameLower.includes('3 boxes')) {
          try {
            // Move users from wrong tenant to main tenant
            await prisma.user.updateMany({
              where: { tenantId: otherTenant.id },
              data: { tenantId: mainTenant.id },
            });

            // Delete the old tenant
            await prisma.tenant.delete({ where: { id: otherTenant.id } });
            fixedCount++;
            console.log('[FixTenant] Deleted wrong tenant:', otherTenant.name);
          } catch (e) {
            console.error('[FixTenant] Error fixing tenant:', otherTenant.name, e);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: fixedCount > 0
        ? `Fixed ${fixedCount} tenant(s). All branding is now "3 Boxes Corp".`
        : 'All tenants are correctly branded as "3 Boxes Corp".',
      tenant: mainTenant ? { id: mainTenant.id, name: mainTenant.name, slug: mainTenant.slug } : null,
      fixedCount,
    });
  } catch (error) {
    console.error('[FixTenant] Error:', error);
    return NextResponse.json(
      { error: 'Fix tenant failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Also support POST for convenience
export async function POST() {
  return GET();
}
