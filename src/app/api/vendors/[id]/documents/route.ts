import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const documents = await prisma.vendorDocument.findMany({ where: { vendorId: id }, orderBy: { createdAt: 'desc' } });
    // Compute current expiry status
    const now = new Date();
    const docs = documents.map(d => {
      let status = d.status;
      if (d.expiryDate) {
        const daysToExpiry = Math.floor((d.expiryDate.getTime() - now.getTime()) / 86400000);
        if (daysToExpiry < 0) status = 'expired';
        else if (daysToExpiry <= 30) status = 'expiring';
        else status = 'valid';
      }
      return { ...d, status, daysToExpiry: d.expiryDate ? Math.floor((d.expiryDate.getTime() - now.getTime()) / 86400000) : null };
    });
    return NextResponse.json({ documents: docs }, { headers: corsHeaders() });
  } catch (error) { console.error('Get vendor docs error:', error); return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const body = await request.json();
    const { name, type, fileUrl, issuedAt, expiryDate } = body;
    if (!name || !type) return NextResponse.json({ error: 'Missing name or type' }, { status: 400, headers: corsHeaders() });
    const doc = await prisma.vendorDocument.create({
      data: { vendorId: id, name, type, fileUrl, issuedAt: issuedAt ? new Date(issuedAt) : null, expiryDate: expiryDate ? new Date(expiryDate) : null, uploadedById: decoded.userId as string },
    });
    await prisma.auditLog.create({ data: { userId: decoded.userId as string, action: 'UPLOAD_VENDOR_DOC', module: 'vendors', details: `Uploaded ${type} doc for vendor ${id}` } });
    return NextResponse.json({ document: doc }, { status: 201, headers: corsHeaders() });
  } catch (error) { console.error('Create vendor doc error:', error); return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() }); }
}
