import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/public/tenant-info?slug=marqaitechgroup
 *
 * Public endpoint (no auth required) that returns basic tenant information
 * for subdomain-based login page branding. Only returns non-sensitive data:
 * name, slug, and logo.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json({ error: 'Slug parameter is required' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        status: true,
      },
    });

    if (!tenant || tenant.status !== 'active') {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json({
      tenant: {
        name: tenant.name,
        slug: tenant.slug,
        logo: tenant.logo,
      },
    });
  } catch (error) {
    console.error('Tenant info error:', error);
    return NextResponse.json({ error: 'Failed to fetch tenant info' }, { status: 500 });
  }
}
