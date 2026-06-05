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

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');
    const planType = searchParams.get('planType');

    const where: Record<string, unknown> = { category: 'subscription_plan' };
    if (status) where.status = status;

    const [policies, total] = await Promise.all([
      prisma.policy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.policy.count({ where }),
    ]);

    // Parse the JSON content for each subscription plan
    const subscriptionPlans = policies.map(p => {
      let planData = {};
      try {
        planData = p.content ? JSON.parse(p.content) : {};
      } catch { /* empty */ }
      return {
        id: p.id,
        packageName: p.title,
        planType: (planData as Record<string, unknown>).planType || p.version || 'starter',
        monthlyPrice: (planData as Record<string, unknown>).monthlyPrice || 0,
        annualPrice: (planData as Record<string, unknown>).annualPrice || 0,
        employeeLimit: (planData as Record<string, unknown>).employeeLimit || 0,
        companyLimit: (planData as Record<string, unknown>).companyLimit || 0,
        branchLimit: (planData as Record<string, unknown>).branchLimit || 0,
        storageLimit: (planData as Record<string, unknown>).storageLimit || 0,
        aiInterviewLimit: (planData as Record<string, unknown>).aiInterviewLimit || 0,
        aiChatbotLimit: (planData as Record<string, unknown>).aiChatbotLimit || 0,
        payrollEnabled: (planData as Record<string, unknown>).payrollEnabled || false,
        recruitmentEnabled: (planData as Record<string, unknown>).recruitmentEnabled || false,
        attendanceEnabled: (planData as Record<string, unknown>).attendanceEnabled || false,
        projectEnabled: (planData as Record<string, unknown>).projectEnabled || false,
        clientPortalEnabled: (planData as Record<string, unknown>).clientPortalEnabled || false,
        vendorPortalEnabled: (planData as Record<string, unknown>).vendorPortalEnabled || false,
        mobileAppEnabled: (planData as Record<string, unknown>).mobileAppEnabled || false,
        apiAccessEnabled: (planData as Record<string, unknown>).apiAccessEnabled || false,
        whiteLabelEnabled: (planData as Record<string, unknown>).whiteLabelEnabled || false,
        supportLevel: (planData as Record<string, unknown>).supportLevel || 'standard',
        status: p.status,
        description: p.description,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    // Filter by planType if provided
    const filtered = planType
      ? subscriptionPlans.filter(p => p.planType === planType)
      : subscriptionPlans;

    return NextResponse.json(
      { subscriptionPlans: filtered, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get subscription plans error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const {
      packageName, planType, monthlyPrice, annualPrice,
      employeeLimit, companyLimit, branchLimit, storageLimit,
      aiInterviewLimit, aiChatbotLimit,
      payrollEnabled, recruitmentEnabled, attendanceEnabled, projectEnabled,
      clientPortalEnabled, vendorPortalEnabled, mobileAppEnabled, apiAccessEnabled,
      whiteLabelEnabled, supportLevel, status,
    } = body;

    if (!packageName) {
      return NextResponse.json({ error: 'Package name is required' }, { status: 400, headers: corsHeaders() });
    }

    // Store all plan-specific data as JSON in the content field
    const planContent = JSON.stringify({
      planType: planType || 'starter',
      monthlyPrice: monthlyPrice || 0,
      annualPrice: annualPrice || 0,
      employeeLimit: employeeLimit || 0,
      companyLimit: companyLimit || 0,
      branchLimit: branchLimit || 0,
      storageLimit: storageLimit || 0,
      aiInterviewLimit: aiInterviewLimit || 0,
      aiChatbotLimit: aiChatbotLimit || 0,
      payrollEnabled: payrollEnabled || false,
      recruitmentEnabled: recruitmentEnabled || false,
      attendanceEnabled: attendanceEnabled || false,
      projectEnabled: projectEnabled || false,
      clientPortalEnabled: clientPortalEnabled || false,
      vendorPortalEnabled: vendorPortalEnabled || false,
      mobileAppEnabled: mobileAppEnabled || false,
      apiAccessEnabled: apiAccessEnabled || false,
      whiteLabelEnabled: whiteLabelEnabled || false,
      supportLevel: supportLevel || 'standard',
    });

    const policy = await prisma.policy.create({
      data: {
        title: packageName,
        category: 'subscription_plan',
        description: `${planType || 'Starter'} plan - $${monthlyPrice || 0}/mo`,
        content: planContent,
        version: planType || 'starter',
        status: status || 'active',
      },
    });

    // Return in the same format as GET
    const result = {
      id: policy.id,
      packageName: policy.title,
      planType: planType || 'starter',
      monthlyPrice: monthlyPrice || 0,
      annualPrice: annualPrice || 0,
      employeeLimit: employeeLimit || 0,
      companyLimit: companyLimit || 0,
      branchLimit: branchLimit || 0,
      storageLimit: storageLimit || 0,
      aiInterviewLimit: aiInterviewLimit || 0,
      aiChatbotLimit: aiChatbotLimit || 0,
      payrollEnabled: payrollEnabled || false,
      recruitmentEnabled: recruitmentEnabled || false,
      attendanceEnabled: attendanceEnabled || false,
      projectEnabled: projectEnabled || false,
      clientPortalEnabled: clientPortalEnabled || false,
      vendorPortalEnabled: vendorPortalEnabled || false,
      mobileAppEnabled: mobileAppEnabled || false,
      apiAccessEnabled: apiAccessEnabled || false,
      whiteLabelEnabled: whiteLabelEnabled || false,
      supportLevel: supportLevel || 'standard',
      status: policy.status,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };

    return NextResponse.json({ subscriptionPlan: result }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create subscription plan error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
