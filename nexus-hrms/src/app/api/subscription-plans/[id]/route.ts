import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function parsePlanFromPolicy(p: { id: string; title: string; category: string; description: string; content: string | null; version: string; status: string; createdAt: Date; updatedAt: Date }) {
  let planData: Record<string, unknown> = {};
  try {
    planData = p.content ? JSON.parse(p.content) : {};
  } catch { /* empty */ }
  return {
    id: p.id,
    packageName: p.title,
    planType: planData.planType || p.version || 'starter',
    monthlyPrice: planData.monthlyPrice || 0,
    annualPrice: planData.annualPrice || 0,
    employeeLimit: planData.employeeLimit || 0,
    companyLimit: planData.companyLimit || 0,
    branchLimit: planData.branchLimit || 0,
    storageLimit: planData.storageLimit || 0,
    aiInterviewLimit: planData.aiInterviewLimit || 0,
    aiChatbotLimit: planData.aiChatbotLimit || 0,
    payrollEnabled: planData.payrollEnabled || false,
    recruitmentEnabled: planData.recruitmentEnabled || false,
    attendanceEnabled: planData.attendanceEnabled || false,
    projectEnabled: planData.projectEnabled || false,
    clientPortalEnabled: planData.clientPortalEnabled || false,
    vendorPortalEnabled: planData.vendorPortalEnabled || false,
    mobileAppEnabled: planData.mobileAppEnabled || false,
    apiAccessEnabled: planData.apiAccessEnabled || false,
    whiteLabelEnabled: planData.whiteLabelEnabled || false,
    supportLevel: planData.supportLevel || 'standard',
    status: p.status,
    description: p.description,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const policy = await prisma.policy.findFirst({
      where: { id, category: 'subscription_plan' },
    });

    if (!policy) {
      return NextResponse.json({ error: 'Subscription plan not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ subscriptionPlan: parsePlanFromPolicy(policy) }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get subscription plan error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();

    // Get existing plan
    const existing = await prisma.policy.findFirst({ where: { id, category: 'subscription_plan' } });
    if (!existing) {
      return NextResponse.json({ error: 'Subscription plan not found' }, { status: 404, headers: corsHeaders() });
    }

    // Parse existing content
    let existingData: Record<string, unknown> = {};
    try {
      existingData = existing.content ? JSON.parse(existing.content) : {};
    } catch { /* empty */ }

    // Merge with new data
    const mergedData = { ...existingData };
    if (body.planType !== undefined) mergedData.planType = body.planType;
    if (body.monthlyPrice !== undefined) mergedData.monthlyPrice = parseFloat(body.monthlyPrice) || 0;
    if (body.annualPrice !== undefined) mergedData.annualPrice = parseFloat(body.annualPrice) || 0;
    if (body.employeeLimit !== undefined) mergedData.employeeLimit = parseInt(body.employeeLimit) || 0;
    if (body.companyLimit !== undefined) mergedData.companyLimit = parseInt(body.companyLimit) || 0;
    if (body.branchLimit !== undefined) mergedData.branchLimit = parseInt(body.branchLimit) || 0;
    if (body.storageLimit !== undefined) mergedData.storageLimit = parseInt(body.storageLimit) || 0;
    if (body.aiInterviewLimit !== undefined) mergedData.aiInterviewLimit = parseInt(body.aiInterviewLimit) || 0;
    if (body.aiChatbotLimit !== undefined) mergedData.aiChatbotLimit = parseInt(body.aiChatbotLimit) || 0;
    if (body.payrollEnabled !== undefined) mergedData.payrollEnabled = body.payrollEnabled;
    if (body.recruitmentEnabled !== undefined) mergedData.recruitmentEnabled = body.recruitmentEnabled;
    if (body.attendanceEnabled !== undefined) mergedData.attendanceEnabled = body.attendanceEnabled;
    if (body.projectEnabled !== undefined) mergedData.projectEnabled = body.projectEnabled;
    if (body.clientPortalEnabled !== undefined) mergedData.clientPortalEnabled = body.clientPortalEnabled;
    if (body.vendorPortalEnabled !== undefined) mergedData.vendorPortalEnabled = body.vendorPortalEnabled;
    if (body.mobileAppEnabled !== undefined) mergedData.mobileAppEnabled = body.mobileAppEnabled;
    if (body.apiAccessEnabled !== undefined) mergedData.apiAccessEnabled = body.apiAccessEnabled;
    if (body.whiteLabelEnabled !== undefined) mergedData.whiteLabelEnabled = body.whiteLabelEnabled;
    if (body.supportLevel !== undefined) mergedData.supportLevel = body.supportLevel;

    const data: Record<string, unknown> = {
      content: JSON.stringify(mergedData),
    };
    if (body.packageName !== undefined) data.title = body.packageName;
    if (body.planType !== undefined) data.version = body.planType;
    if (body.status !== undefined) data.status = body.status;
    if (body.planType !== undefined) data.description = `${body.planType} plan - $${mergedData.monthlyPrice || 0}/mo`;

    const policy = await prisma.policy.update({ where: { id }, data });
    return NextResponse.json({ subscriptionPlan: parsePlanFromPolicy(policy) }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update subscription plan error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    // Verify it's a subscription plan
    const existing = await prisma.policy.findFirst({ where: { id, category: 'subscription_plan' } });
    if (!existing) {
      return NextResponse.json({ error: 'Subscription plan not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.policy.delete({ where: { id } });
    return NextResponse.json({ message: 'Subscription plan deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete subscription plan error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
