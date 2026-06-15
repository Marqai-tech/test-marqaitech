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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get('category');
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (status) where.status = status;

    const policies = await db.policy.findMany({
      where,
      orderBy: { title: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await db.policy.count({ where });

    return NextResponse.json({
      data: policies,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Policies GET error:', error);
    // Demo data fallback
    const demoPolicies = [
      { id: 'pol-1', title: 'Leave Policy', category: 'leave', description: 'Comprehensive leave management policy covering all leave types', content: 'Full leave policy document...', version: '3.2', status: 'active', effectiveDate: new Date('2026-01-01'), expiryDate: null, createdAt: new Date('2025-06-01'), updatedAt: new Date('2026-06-01') },
      { id: 'pol-2', title: 'Attendance Policy', category: 'attendance', description: 'Attendance tracking and punctuality requirements', content: 'Full attendance policy document...', version: '2.1', status: 'active', effectiveDate: new Date('2026-01-01'), expiryDate: null, createdAt: new Date('2025-05-15'), updatedAt: new Date('2026-05-15') },
      { id: 'pol-3', title: 'Code of Conduct', category: 'hr', description: 'Professional conduct and behavioral expectations', content: 'Full code of conduct document...', version: '4.0', status: 'active', effectiveDate: new Date('2026-01-01'), expiryDate: null, createdAt: new Date('2025-04-20'), updatedAt: new Date('2026-04-20') },
      { id: 'pol-4', title: 'Remote Work Policy', category: 'work', description: 'Guidelines for remote and hybrid work arrangements', content: 'Full remote work policy document...', version: '1.5', status: 'active', effectiveDate: new Date('2026-01-01'), expiryDate: null, createdAt: new Date('2025-06-03'), updatedAt: new Date('2026-06-03') },
      { id: 'pol-5', title: 'Travel & Expense Policy', category: 'finance', description: 'Business travel booking and expense reimbursement guidelines', content: 'Full travel and expense policy document...', version: '2.3', status: 'active', effectiveDate: new Date('2026-01-01'), expiryDate: null, createdAt: new Date('2025-03-10'), updatedAt: new Date('2026-03-10') },
      { id: 'pol-6', title: 'IT Security Policy', category: 'it', description: 'Information security and data protection requirements', content: 'Full IT security policy document...', version: '3.0', status: 'active', effectiveDate: new Date('2026-01-01'), expiryDate: null, createdAt: new Date('2025-05-01'), updatedAt: new Date('2026-05-01') },
    ];

    return NextResponse.json({
      data: demoPolicies,
      pagination: { page: 1, limit: 100, total: demoPolicies.length, totalPages: 1 },
    }, { headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, category, description, content, version, status, effectiveDate, expiryDate } = body;

    if (!title || !category || !description) {
      return NextResponse.json({ error: 'Title, category, and description are required' }, { status: 400, headers: corsHeaders() });
    }

    const policy = await db.policy.create({
      data: {
        title,
        category,
        description,
        content: content || null,
        version: version || '1.0',
        status: status || 'active',
        effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });

    return NextResponse.json({ policy }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Policies POST error:', error);
    return NextResponse.json({ error: 'Failed to create policy' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Policy ID is required' }, { status: 400, headers: corsHeaders() });
    }

    if (updateData.effectiveDate) {
      updateData.effectiveDate = new Date(updateData.effectiveDate);
    }
    if (updateData.expiryDate) {
      updateData.expiryDate = new Date(updateData.expiryDate);
    }

    const existing = await db.policy.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404, headers: corsHeaders() });
    }

    const policy = await db.policy.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ policy }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Policies PUT error:', error);
    return NextResponse.json({ error: 'Failed to update policy' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Policy ID is required' }, { status: 400, headers: corsHeaders() });
    }

    await db.policy.delete({ where: { id } });
    return NextResponse.json({ message: 'Policy deleted' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Policies DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete policy' }, { status: 500, headers: corsHeaders() });
  }
}
