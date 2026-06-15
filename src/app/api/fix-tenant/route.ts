import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// This endpoint fixes EH2R or any wrong branding in the database
// It can be called without authentication to ensure the tenant is always "3 Boxes Corp"
// BULLETPROOF: ALWAYS forces ALL tenants to be "3 Boxes Corp"
export async function GET() {
  try {
    console.log('[FixTenant] Aggressively fixing tenant branding...');

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

    // Fix or create the main tenant - ALWAYS force name to "3 Boxes Corp"
    if (mainTenant) {
      // ALWAYS update, even if the name looks correct (in case of subtle differences)
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
      console.log('[FixTenant] Forced main tenant name to "3 Boxes Corp"');
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

    // Fix ANY other tenants — merge them all into the main tenant
    for (const otherTenant of allTenants) {
      if (otherTenant.id !== mainTenant.id) {
        try {
          // Move users from wrong tenant to main tenant
          const movedUsers = await prisma.user.updateMany({
            where: { tenantId: otherTenant.id },
            data: { tenantId: mainTenant.id },
          });
          console.log(`[FixTenant] Moved ${movedUsers.count} users from "${otherTenant.name}" to "3 Boxes Corp"`);

          // Also fix any employees linked to the old tenant's company
          try {
            const companies = await prisma.company.findMany({
              where: { tenantId: otherTenant.id },
            });
            if (companies.length > 0) {
              await prisma.company.updateMany({
                where: { tenantId: otherTenant.id },
                data: { tenantId: mainTenant.id },
              });
              console.log(`[FixTenant] Moved ${companies.length} companies to "3 Boxes Corp"`);
            }
          } catch (e) {
            console.error('[FixTenant] Error moving companies:', e);
          }

          // Delete the old tenant
          await prisma.tenant.delete({ where: { id: otherTenant.id } });
          fixedCount++;
          console.log('[FixTenant] Deleted old tenant:', otherTenant.name);
        } catch (e) {
          console.error('[FixTenant] Error fixing tenant:', otherTenant.name, e);
          // If we can't delete it, at least rename it
          try {
            await prisma.tenant.update({
              where: { id: otherTenant.id },
              data: { name: '3 Boxes Corp', slug: '3boxes-corp' },
            });
            fixedCount++;
          } catch (e2) {
            console.error('[FixTenant] Also failed to rename tenant:', e2);
          }
        }
      }
    }

    // FINAL SAFETY CHECK: Force ALL remaining tenants to have "3 Boxes Corp" name
    const allRemainingTenants = await prisma.tenant.findMany();
    for (const tenant of allRemainingTenants) {
      if (tenant.name !== '3 Boxes Corp' || tenant.slug !== '3boxes-corp') {
        try {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { name: '3 Boxes Corp', slug: '3boxes-corp' },
          });
          fixedCount++;
        } catch (e) {
          console.error('[FixTenant] Final fix failed for tenant', tenant.id, e);
        }
      }
    }

    // Fix any users still linked to wrong tenant
    const wrongTenantUsers = await prisma.user.findMany({
      where: { NOT: { tenantId: mainTenant.id } },
    });
    if (wrongTenantUsers.length > 0) {
      const fixResult = await prisma.user.updateMany({
        where: { NOT: { tenantId: mainTenant.id } },
        data: { tenantId: mainTenant.id },
      });
      fixedCount++;
      console.log(`[FixTenant] Fixed ${fixResult.count} users linked to wrong tenant`);
    }

    return NextResponse.json({
      success: true,
      message: fixedCount > 0
        ? `Fixed ${fixedCount} tenant record(s). All branding is now "3 Boxes Corp".`
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
