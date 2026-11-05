/**
 * Email Preview API
 * GET /api/email-preview?eventKey=leave.applied&module=leave&tenantId=...
 * GET /api/email-preview?list=1   → returns the catalog of all events
 *
 * Renders any notification event as a branded HTML email using sample data,
 * WITHOUT sending an actual email. Used by the email gallery page and for
 * screenshot generation.
 *
 * TEST ENVIRONMENT ONLY — admin-only (no real emails are sent).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { NOTIFICATION_MODULES, getEventDef } from '@/lib/notification-events';
import { renderPlaceholders, escapeHtml } from '@/lib/notification-render';
import { renderEmail, type TenantBranding, type EmailStatus } from '@/lib/email-template-renderer';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: cors() });
}

// ── Sample data for previews ───────────────────────────────────────
const SAMPLE_BRANDINGS: Record<string, TenantBranding> = {
  default: {
    name: 'Marqai Technologies',
    logoUrl: null,
    brandColor: '#2563eb',
    website: 'www.marqaitech.com',
    phone: '+91 80 4567 8900',
    email: 'hr@marqaitech.com',
    address: 'Prestige Tech Park, Kadubeesanahalli, Bengaluru 560103',
  },
  teal: {
    name: 'Acme Global',
    logoUrl: null,
    brandColor: '#0d9488',
    website: 'www.acmeglobal.example',
    phone: '+1 415 555 0199',
    email: 'people@acmeglobal.example',
    address: '500 Howard St, San Francisco, CA 94105',
  },
  purple: {
    name: 'Zenith Retail',
    logoUrl: null,
    brandColor: '#7c3aed',
    website: 'www.zenithretail.example',
    phone: '+44 20 7946 0958',
    email: 'hello@zenithretail.example',
    address: '1 Tottenham Court Rd, London W1T 1BE',
  },
};

const SAMPLE_VARS: Record<string, Record<string, string>> = {
  leave: {
    Employee_Name: 'Rahul Sharma',
    Leave_Type: 'Casual Leave',
    From_Date: '15 Nov 2026',
    To_Date: '17 Nov 2026',
    Days: '3',
    Reason: 'Family function out of town',
    Approver_Name: 'Priya Iyer',
    Comment: 'Approved — enjoy your break!',
    Pending_Since: '12 Nov 2026, 10:30',
    Submitted_On: '12 Nov 2026',
    Pending_Hours: '36',
    Request_Id: 'LR-2026-0048',
  },
  attendance: {
    Employee_Name: 'Anita Desai',
    Request_Type: 'Regularization',
    Date: '14 Nov 2026',
    Time: '09:15',
    Reason: 'Network issue — fingerprint scanner down at gate',
    Approver_Name: 'Vikram Rao',
    Comment: 'Approved',
    Total_Hours: '8',
    Production_Hours: '6.5',
    Missing_Punch_Type: 'Check-out',
    Request_Id: 'AR-2026-0212',
  },
  recruitment: {
    Candidate_Name: 'Sneha Patel',
    Job_Title: 'Senior Frontend Engineer',
    Department: 'Engineering',
    Interview_Date: '20 Nov 2026',
    Interview_Time: '14:00 IST',
    Interview_Type: 'Technical Round 2',
    Interviewer_Name: 'Arjun Mehta',
    Location: 'Google Meet',
    Offer_Amount: '₹24,00,000 per annum',
    Start_Date: '01 Dec 2026',
    Hiring_Manager: 'Deepa Krishnan',
    Req_Id: 'REQ-2026-007',
  },
  onboarding: {
    Employee_Name: 'Karthik Subramaniam',
    Start_Date: '01 Dec 2026',
    Department: 'Product',
    Designation: 'Product Manager',
    Task_Name: 'Submit ID proof',
    Task_Due: '28 Nov 2026',
    Manager_Name: 'Rohit Bansal',
    Buddy_Name: 'Megha Nair',
  },
  core_hr: {
    Employee_Name: 'Fatima Khan',
    Field_Name: 'Personal Email',
    Old_Value: 'fatima.k@example.com',
    New_Value: 'fatima.k@marqaitech.com',
    Document_Name: 'PAN Card',
    Expiry_Date: '15 Dec 2026',
    Policy_Name: 'Code of Conduct 2026',
    Ack_Deadline: '30 Nov 2026',
  },
  performance: {
    Employee_Name: 'Rajesh Kumar',
    Reviewer_Name: 'Sanjay Gupta',
    Cycle: 'H2 2026',
    Rating: 'Exceeds Expectations',
    Goal_Name: 'Launch v2 dashboard',
    Due_Date: '31 Dec 2026',
  },
  learning: {
    Employee_Name: 'Pooja Reddy',
    Course_Name: 'GDPR Compliance Training',
    Due_Date: '25 Nov 2026',
    Completion_Date: '18 Nov 2026',
    Score: '95%',
    Manager_Name: 'Imran Sheikh',
  },
  payroll: {
    Employee_Name: 'Suresh Nair',
    Month: 'November 2026',
    Amount: '₹1,85,450',
    Payslip_Url: 'https://hrms.example.com/payroll/payslips/2026-11',
    Declaration_Type: 'Section 80C',
    Declared_Amount: '₹1,50,000',
    Variance_Amount: '₹12,000',
    Bank_Name: 'HDFC Bank',
    File_Name: 'NEFT-20261125.csv',
  },
  exit: {
    Employee_Name: 'Deepak Menon',
    Resignation_Date: '10 Nov 2026',
    Last_Working_Day: '09 Dec 2026',
    Notice_Period: '30 days',
    FnF_Amount: '₹2,45,680',
    Settlement_Date: '15 Dec 2026',
    Exit_Interview_Date: '05 Dec 2026',
    Approver_Name: 'Lakshmi Venkat',
    Reason: 'Career growth opportunity',
  },
  probation: {
    Employee_Name: 'Aisha Bhat',
    Confirmation_Date: '01 Dec 2026',
    Probation_Months: '6',
    Reviewer_Name: 'Naveen Pillai',
    Extension_Months: '3',
    Extension_Reason: 'Needs improvement in client communication',
  },
};

function getSampleVars(module: string): Record<string, string> {
  return SAMPLE_VARS[module] || {
    Employee_Name: 'Rahul Sharma',
    Recipient_Name: 'Rahul',
    Company_Name: 'Marqai Technologies',
    Today_Date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

function inferStatus(eventKey: string): EmailStatus | undefined {
  const k = eventKey.toLowerCase();
  if (/welcome|new_hire/.test(k)) return 'welcome';
  if (/\.approved$|\.confirmed$|\.accepted$|\.ack_confirmed$|\.completed$|signoff$/.test(k)) return 'approved';
  if (/\.rejected$|\.declined$|\.terminated$|review_rejected$/.test(k)) return 'rejected';
  if (/\.submitted$|\.pending|\.reminder|\.ack_pending|\.escalated$|\.missing_punch$|\.expiring$|\.due$|\.overdue$|\.flagged$|\.conflict$/.test(k)) return 'pending';
  return 'info';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listMode = searchParams.get('list') === '1';

    // Catalog endpoint — list all events for the gallery
    if (listMode) {
      const catalog = NOTIFICATION_MODULES.map(m => ({
        module: m.module,
        label: m.label,
        color: m.color,
        events: m.events.map(e => ({
          eventKey: e.eventKey,
          name: e.name,
          description: e.description,
          actionable: e.actionable || false,
          recipients: e.recipients,
          status: inferStatus(e.eventKey),
        })),
      }));
      return NextResponse.json({ modules: catalog, brandings: Object.keys(SAMPLE_BRANDINGS) }, { headers: cors() });
    }

    // Auth check — admin only (preview is a dev/admin tool)
    const auth = await getAuthInfo(req);
    if (!auth || !['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only — email preview is restricted' }, { status: 403, headers: cors() });
    }

    const eventKey = searchParams.get('eventKey');
    const module = searchParams.get('module');
    const brandingKey = searchParams.get('branding') || 'default';
    const tenantIdParam = searchParams.get('tenantId');

    if (!eventKey || !module) {
      return NextResponse.json({ error: 'eventKey and module are required' }, { status: 400, headers: cors() });
    }

    const eventDef = getEventDef(module, eventKey);
    if (!eventDef) {
      return NextResponse.json({ error: `Event ${module}/${eventKey} not found in catalog` }, { status: 404, headers: cors() });
    }

    // Resolve branding: tenant branding if tenantId provided, else sample
    let branding: TenantBranding = SAMPLE_BRANDINGS[brandingKey] || SAMPLE_BRANDINGS.default;
    if (tenantIdParam) {
      try {
        const platformDb = getPlatformDb();
        const tenant = await platformDb.tenant.findUnique({
          where: { id: tenantIdParam },
          select: { name: true, logo: true, brandColor: true, website: true, phone: true, email: true },
        });
        if (tenant) {
          branding = {
            name: tenant.name,
            logoUrl: tenant.logo,
            brandColor: tenant.brandColor,
            website: tenant.website,
            phone: tenant.phone,
            email: tenant.email,
          };
        }
      } catch { /* fall back to sample */ }
    }

    // Build sample vars + render
    const sampleVars = {
      ...getSampleVars(module),
      Company_Name: branding.name,
      Recipient_Name: getSampleVars(module).Employee_Name?.split(' ')[0] || 'there',
      HRMS_Name: '3Boxes HRMS',
      Today_Date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    };
    const title = renderPlaceholders(eventDef.subject, sampleVars);
    const bodyText = renderPlaceholders(eventDef.body, sampleVars);
    const status = inferStatus(eventKey);

    // Build a sample action URL for actionable events
    const sampleActionUrl = eventDef.actionable
      ? `https://hrms.example.com/notifications/action/sample-token-${eventKey.replace(/\./g, '-')}?tenant=demo`
      : undefined;

    const html = renderEmail({
      title,
      preheader: eventDef.description,
      greeting: `Hi ${sampleVars.Recipient_Name},`,
      bodyText,
      status,
      branding,
      approvalActions: sampleActionUrl ? { approveUrl: sampleActionUrl + '&action=approve', rejectUrl: sampleActionUrl + '&action=reject' } : undefined,
      primaryAction: sampleActionUrl && !eventDef.actionable ? { label: 'Open in HRMS', url: sampleActionUrl } : undefined,
      actionExpiresAt: eventDef.actionable ? '22 Nov 2026, 17:30 IST' : undefined,
      footerNote: `This is a preview of the "${eventDef.name}" email template. Sample data is shown.`,
      appBaseUrl: 'https://hrms.example.com',
    });

    return new NextResponse(html, {
      headers: {
        ...cors(),
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[email-preview] error:', error);
    return NextResponse.json({ error: 'Failed to render email preview' }, { status: 500, headers: cors() });
  }
}
