import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// GET /api/companies — List companies
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (tenantId) {
      const companyGroups = await db.companyGroup.findMany({
        where: { tenantId },
        select: { id: true },
      });
      const groupIds = companyGroups.map((g) => g.id);
      where.companyGroupId = { in: groupIds };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const companies = await db.company.findMany({
      where,
      include: {
        companyGroup: { select: { id: true, name: true, tenantId: true } },
        _count: { select: { departments: true, branches: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ companies }, { headers: corsHeaders() });
  } catch (error: unknown) {
    console.error('Get companies error:', error);
    // Demo data fallback
    const demoCompanies = [
      {
        id: 'comp-1', name: '3 Boxes Technologies', code: '3BOXES',
        companyGroupId: 'cg-1', companyGroup: { id: 'cg-1', name: '3 Boxes Group', tenantId: 't-1' },
        registrationNo: 'U72200MH2020PTC345678', taxId: '27AABCN1234F1Z5',
        country: 'India', currency: 'INR', timezone: 'Asia/Kolkata',
        address: 'BKC, Bandra East', city: 'Mumbai', state: 'Maharashtra', zipCode: '400051',
        phone: '+91 22 4567 8901', email: 'info@3boxestech.com', website: 'https://3boxestech.com',
        logo: null, status: 'active',
        _count: { departments: 8, branches: 3 },
        createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'comp-2', name: '3 Boxes Solutions', code: 'NEXSOL',
        companyGroupId: 'cg-1', companyGroup: { id: 'cg-1', name: '3 Boxes Group', tenantId: 't-1' },
        registrationNo: 'U72200TG2021PTC123456', taxId: '36AABCN5678F1Z3',
        country: 'India', currency: 'INR', timezone: 'Asia/Kolkata',
        address: 'HITEC City, Madhapur', city: 'Hyderabad', state: 'Telangana', zipCode: '500081',
        phone: '+91 40 2345 6789', email: 'info@3boxessol.com', website: 'https://3boxessol.com',
        logo: null, status: 'active',
        _count: { departments: 8, branches: 2 },
        createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'comp-3', name: '3 Boxes Staffing', code: 'NEXSTAFF',
        companyGroupId: 'cg-1', companyGroup: { id: 'cg-1', name: '3 Boxes Group', tenantId: 't-1' },
        registrationNo: 'U72200MH2022PTC789012', taxId: '27AABCN9012F1Z1',
        country: 'India', currency: 'INR', timezone: 'Asia/Kolkata',
        address: 'Hinjewadi Phase 2', city: 'Pune', state: 'Maharashtra', zipCode: '411057',
        phone: '+91 20 3456 7890', email: 'info@3boxesstaff.com', website: 'https://3boxesstaff.com',
        logo: null, status: 'active',
        _count: { departments: 8, branches: 1 },
        createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-01'),
      },
    ];
    return NextResponse.json({ companies: demoCompanies }, { headers: corsHeaders() });
  }
}

// POST /api/companies — Create a company
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, code, companyGroupId, registrationNo, taxId, country, currency, timezone,
            address, city, state, zipCode, phone, email, website, status } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders() });
    }

    // Try to find or create a company group if not provided
    let groupId = companyGroupId;
    if (!groupId) {
      const existingGroup = await db.companyGroup.findFirst();
      if (existingGroup) {
        groupId = existingGroup.id;
      } else {
        const newGroup = await db.companyGroup.create({
          data: { name: `${name} Group`, tenantId: 'default' },
        });
        groupId = newGroup.id;
      }
    }

    const company = await db.company.create({
      data: {
        name,
        code: code || name.substring(0, 6).toUpperCase().replace(/\s/g, ''),
        companyGroupId: groupId,
        registrationNo,
        taxId,
        country: country || 'India',
        currency: currency || 'INR',
        timezone: timezone || 'Asia/Kolkata',
        address,
        city,
        state,
        zipCode,
        phone,
        email,
        website,
        status: status || 'active',
      },
      include: {
        companyGroup: { select: { id: true, name: true } },
        _count: { select: { departments: true, branches: true } },
      },
    });

    return NextResponse.json({ company }, { status: 201, headers: corsHeaders() });
  } catch (error: unknown) {
    console.error('Create company error:', error);
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500, headers: corsHeaders() });
  }
}

// PUT /api/companies — Update a company
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const existing = await db.company.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404, headers: corsHeaders() });
    }

    const company = await db.company.update({
      where: { id },
      data: updateData,
      include: {
        companyGroup: { select: { id: true, name: true } },
        _count: { select: { departments: true, branches: true } },
      },
    });

    return NextResponse.json({ company }, { headers: corsHeaders() });
  } catch (error: unknown) {
    console.error('Update company error:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500, headers: corsHeaders() });
  }
}

// DELETE /api/companies — Delete a company
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400, headers: corsHeaders() });
    }

    await db.company.delete({ where: { id } });
    return NextResponse.json({ message: 'Company deleted' }, { headers: corsHeaders() });
  } catch (error: unknown) {
    console.error('Delete company error:', error);
    return NextResponse.json({ error: 'Failed to delete company' }, { status: 500, headers: corsHeaders() });
  }
}
