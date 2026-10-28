import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { hashPasswordFast, getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { getDataScope } from '@/lib/roleAccess';
import { sendTenantEmail } from '@/lib/notification-channels';

// Vercel serverless function timeout safeguard (see credentials route for details).
export const maxDuration = 60;
const MAX_BATCH_SIZE = 15; // lower than credentials — invite also sends emails

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/** Generate a strong random password */
function generateRandomPassword(length = 12): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;
  let pwd = '';
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  pwd += special[Math.floor(Math.random() * special.length)];
  for (let i = pwd.length; i < length; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

/** Build invite email HTML template */
function buildInviteEmailHtml(params: {
  employeeName: string;
  email: string;
  password: string;
  loginUrl: string;
  tenantName: string;
  tenantLogo: string | null;
  adminName: string;
}): string {
  const { employeeName, email, password, loginUrl, tenantName, tenantLogo, adminName } = params;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f0fdf4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;padding:32px 0;">
    <tr><td align="center">
      <!-- ═══ Greeting Card ═══ -->
      <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(16,185,129,0.15);border:1px solid #d1fae5;">

        <!-- ═══ Top Banner — Green Gradient with Confetti-style Dots ═══ -->
        <tr>
          <td style="background:linear-gradient(135deg,#065f46 0%,#10b981 50%,#34d399 100%);padding:40px 40px 32px;text-align:center;position:relative;">
            <!-- Decorative dots -->
            <div style="position:absolute;top:12px;left:20px;width:8px;height:8px;background:rgba(255,255,255,0.3);border-radius:50%;"></div>
            <div style="position:absolute;top:24px;left:40px;width:6px;height:6px;background:rgba(255,255,255,0.2);border-radius:50%;"></div>
            <div style="position:absolute;top:16px;right:30px;width:10px;height:10px;background:rgba(255,255,255,0.25);border-radius:50%;"></div>
            <div style="position:absolute;top:36px;right:50px;width:5px;height:5px;background:rgba(255,255,255,0.15);border-radius:50%;"></div>

            ${tenantLogo ? `<img src="${tenantLogo}" alt="${tenantName}" style="height:40px;margin-bottom:16px;border-radius:8px;background:rgba(255,255,255,0.9);padding:4px 12px;" />` : ''}
            <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">You're Invited</p>
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;line-height:1.3;">Welcome to<br/>${tenantName} HRMS</h1>
            <div style="width:60px;height:3px;background:rgba(255,255,255,0.5);border-radius:2px;margin:16px auto 0;"></div>
          </td>
        </tr>

        <!-- ═══ Greeting + HRMS Tool Description (2 lines) ═══ -->
        <tr>
          <td style="padding:32px 40px 20px;">
            <p style="margin:0 0 8px;font-size:18px;color:#065f46;font-weight:700;">Dear ${employeeName},</p>
            <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">
              We're delighted to welcome you to <strong>${tenantName}</strong>! Your account on our <strong>3Boxes HRMS</strong> platform is now ready.
              3Boxes HRMS is a comprehensive Human Resource Management System that streamlines your daily HR tasks —
              from attendance tracking and leave management to payroll and performance reviews — all in one place.
            </p>

            <!-- ═══ Credentials Card ═══ -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#ecfdf5 0%,#f0fdf4 100%);border:1.5px solid #10b981;border-radius:12px;margin-bottom:20px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td colspan="2" style="padding:0 0 12px;text-align:center;">
                        <p style="margin:0;font-size:11px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:1.5px;">Your Login Credentials</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#64748b;width:90px;text-align:right;padding-right:12px;">Email:</td>
                      <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;font-family:'Courier New',monospace;">${email}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#64748b;text-align:right;padding-right:12px;">Password:</td>
                      <td style="padding:6px 0;">
                        <span style="font-size:14px;color:#0f172a;font-weight:700;font-family:'Courier New',monospace;background:#d1fae5;padding:3px 10px;border-radius:6px;border:1px solid #10b981;">${password}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- ═══ Login Button ═══ -->
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
              <tr>
                <td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);border-radius:10px;padding:0;box-shadow:0 4px 12px rgba(16,185,129,0.3);">
                  <a href="${loginUrl}" style="display:inline-block;padding:14px 40px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;">Login to Your HRMS Account &rarr;</a>
                </td>
              </tr>
            </table>

            <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;text-align:center;">
              Or copy this link: <a href="${loginUrl}" style="color:#10b981;word-break:break-all;text-decoration:none;">${loginUrl}</a>
            </p>
          </td>
        </tr>

        <!-- ═══ Quick Features Strip ═══ -->
        <tr>
          <td style="padding:0 40px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:10px;">
              <tr>
                <td style="padding:14px 16px;text-align:center;width:33%;">
                  <div style="font-size:22px;margin-bottom:4px;">&#128197;</div>
                  <p style="margin:0;font-size:11px;color:#64748b;font-weight:600;">Attendance</p>
                </td>
                <td style="padding:14px 16px;text-align:center;width:33%;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
                  <div style="font-size:22px;margin-bottom:4px;">&#9728;</div>
                  <p style="margin:0;font-size:11px;color:#64748b;font-weight:600;">Leave</p>
                </td>
                <td style="padding:14px 16px;text-align:center;width:33%;">
                  <div style="font-size:22px;margin-bottom:4px;">&#128176;</div>
                  <p style="margin:0;font-size:11px;color:#64748b;font-weight:600;">Payroll</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══ Security Notice ═══ -->
        <tr>
          <td style="padding:0 40px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
              <tr><td style="padding:14px 18px;">
                <p style="margin:0;font-size:12px;color:#92400e;line-height:1.5;">
                  <strong>&#128274; Security Notice:</strong> Please change your password after your first login.
                  Never share your credentials with anyone. If you did not expect this invitation, please contact your HR administrator.
                </p>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- ═══ Divider ═══ -->
        <tr>
          <td style="padding:0 40px;">
            <div style="height:1px;background:linear-gradient(90deg,transparent,#d1fae5,transparent);margin:0 0 16px;"></div>
          </td>
        </tr>

        <!-- ═══ Footer ═══ -->
        <tr>
          <td style="padding:0 40px 28px;text-align:center;">
            <p style="margin:0 0 4px;font-size:13px;color:#065f46;font-weight:600;">${tenantName}</p>
            <p style="margin:0 0 8px;font-size:11px;color:#94a3b8;line-height:1.5;">
              Sent by ${adminName} via <strong>3Boxes HRMS</strong> &middot; People &middot; Process &middot; Technology<br/>
              A Proud Product of Marq AI Tech Pvt Ltd
            </p>
          </td>
        </tr>

      </table>
      <!-- ═══ End Greeting Card ═══ -->

      <p style="margin:16px 0 0;font-size:10px;color:#86efac;text-align:center;">
        This is an automated email from 3Boxes HRMS. Please do not reply to this address.
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

/** POST — Send invite emails to employees with login credentials */
export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const { employeeIds, mode, generateNewPassword, customMessage } = body;

    if (!mode || !['selected', 'all'].includes(mode)) {
      return NextResponse.json({ error: 'mode must be selected or all' }, { status: 400, headers: corsHeaders() });
    }
    if (mode === 'selected' && (!employeeIds || employeeIds.length === 0)) {
      return NextResponse.json({ error: 'selected mode requires employeeIds' }, { status: 400, headers: corsHeaders() });
    }

    // Get admin info
    const admin = await db.user.findUnique({
      where: { id: decoded.userId as string },
      select: { id: true, name: true, role: true, tenantId: true, tenant: { select: { id: true, name: true, slug: true, domain: true, logo: true } } },
    });
    if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404, headers: corsHeaders() });

    // Build where clause — SAME approach as /api/employees (using getDataScope)
    const scope = getDataScope(admin.role);
    const where: Record<string, unknown> = {};

    if (mode === 'selected') {
      where.id = { in: employeeIds };
    }

    // Data scope filtering — same as /api/employees and /api/employees/credentials GET
    if (scope === 'self' && admin.id) {
      where.userId = admin.id;
    } else if (scope === 'team' && admin.id) {
      const ownEmp = await db.employee.findFirst({
        where: { userId: admin.id, status: 'active' },
        select: { departmentId: true },
      });
      if (ownEmp) {
        where.departmentId = ownEmp.departmentId;
      }
    }
    // scope === 'all' → no additional filtering (tenant_admin, admin, super_admin can see all)

    const employees = await db.employee.findMany({
      where,
      select: { id: true, employeeId: true, firstName: true, lastName: true, email: true, userId: true, phone: true, user: { select: { id: true, role: true } } },
    });

    if (employees.length === 0) {
      return NextResponse.json({ error: 'No employees found' }, { status: 404, headers: corsHeaders() });
    }

    // ─── Batch limit: prevent Vercel function timeout ───
    // Each invite = bcrypt hash (~75ms) + DB updates + SMTP send (~500ms).
    // 15 employees ≈ 8s — under the 10s Hobby timeout.
    const totalCount = employees.length;
    const batch = employees.slice(0, MAX_BATCH_SIZE);
    const hasMore = totalCount > MAX_BATCH_SIZE;

    const loginUrl = admin.tenant?.domain
      ? `https://${admin.tenant.domain}/login`
      : `https://${admin.tenant?.slug || 'app'}.3boxeshrms.com/login`;

    const results: Array<{
      employeeId: string;
      name: string;
      email: string;
      password: string;
      success: boolean;
      emailSent: boolean;
      error?: string;
      /** If true, the email was sent using the Resend sandbox sender (onboarding@resend.dev)
       *  because the admin's configured FROM domain was not verified. The email was likely
       *  ONLY delivered to the Resend account holder — not to the intended employee. */
      usedFallbackFrom?: boolean;
      /** Human-readable warning explaining the sandbox limitation, for display in the UI. */
      emailWarning?: string;
    }> = [];

    for (const emp of batch) {
      try {
        // Ensure employee has a user account
        let userAccount = emp.userId
          ? await db.user.findUnique({ where: { id: emp.userId } })
          : null;

        let pwd = '';

        if (generateNewPassword || !userAccount) {
          pwd = generateRandomPassword();
          const hashedPwd = await hashPasswordFast(pwd);

          if (userAccount) {
            // Reset password
            await db.user.update({
              where: { id: userAccount.id },
              data: { password: hashedPwd, status: 'active' },
            });
          } else {
            // Check if user already exists with this email
            const existingUser = await db.user.findUnique({ where: { email: emp.email } });
            if (existingUser) {
              await db.user.update({
                where: { id: existingUser.id },
                data: { password: hashedPwd, status: 'active' },
              });
              await db.employee.update({
                where: { id: emp.id },
                data: { userId: existingUser.id },
              });
              userAccount = existingUser;
            } else {
              // Use the employee's assigned role (from their User account) if available,
              // otherwise default to 'employee'
              const employeeRole = emp.user?.role || 'employee';
              const newUser = await db.user.create({
                data: {
                  email: emp.email,
                  password: hashedPwd,
                  name: `${emp.firstName} ${emp.lastName}`,
                  role: employeeRole,
                  tenantId: admin.tenantId,
                  status: 'active',
                },
              });
              await db.employee.update({
                where: { id: emp.id },
                data: { userId: newUser.id },
              });
              userAccount = newUser;
            }
          }
        }

        // Build and send the invite email
        const emailHtml = buildInviteEmailHtml({
          employeeName: `${emp.firstName} ${emp.lastName}`,
          email: emp.email,
          password: pwd || '••••••••',
          loginUrl,
          tenantName: admin.tenant?.name || '3Boxes HRMS',
          tenantLogo: admin.tenant?.logo || null,
          adminName: admin.name,
        });

        const emailResult = await sendTenantEmail(db, admin.tenantId!, {
          to: emp.email,
          subject: `You're invited to join ${admin.tenant?.name || '3Boxes HRMS'} HRMS`,
          html: emailHtml,
        });

        // ─── Mark credentials as 'invited' on the Employee record ───
        // Without this, the employee still shows as "No Account" in the
        // Login Credentials settings tab even after the invite was sent
        // and a User account was created/reset above. The credentialsStatus
        // column is the source-of-truth for the settings page metrics.
        await db.$executeRawUnsafe(
          `UPDATE "Employee" SET "credentialsStatus" = 'invited', "credentialsInvitedAt" = NOW(), "credentialsInvitedBy" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
          admin.id,
          emp.id,
        ).catch(() => null);

        console.log(
          `[INVITE] Invite ${emailResult.success ? 'sent' : 'failed'} for ${emp.email} (tenant: ${admin.tenant?.name})` +
          `${emailResult.usedFallback ? ' [TENANT SMTP FAILED — fell back to global Resend sender]' : ''}`,
        );

        const resultEntry: (typeof results)[number] = {
          employeeId: emp.employeeId,
          name: `${emp.firstName} ${emp.lastName}`,
          email: emp.email,
          password: pwd,
          success: true,
          emailSent: emailResult.success,
          error: emailResult.error,
        };

        // If the tenant SMTP config failed and the email fell back to the
        // global Resend sender, flag it so the UI can warn the admin.
        // (After Task 52, the tenant has real webhostbox SMTP configured —
        // this fallback path is rare, but if it triggers, the email may
        // end up in the Resend sandbox which only delivers to the Resend
        // account holder.)
        if (emailResult.usedFallback) {
          resultEntry.usedFallbackFrom = true;
          resultEntry.emailWarning =
            'Tenant SMTP failed and the email was sent via the global fallback sender. ' +
            'If the global sender is the Resend sandbox, the email was likely only delivered to the Resend ' +
            'account holder — not to this employee. Verify the tenant SMTP config at /settings → SMTP Email.';
        }

        results.push(resultEntry);
      } catch (err) {
        results.push({
          employeeId: emp.employeeId,
          name: `${emp.firstName} ${emp.lastName}`,
          email: emp.email,
          password: '',
          success: false,
          emailSent: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const emailSentCount = results.filter(r => r.emailSent).length;
    const fallbackCount = results.filter(r => r.usedFallbackFrom).length;

    // Build a response that includes an admin-level warning if any emails used the sandbox fallback
    const response: Record<string, unknown> = {
      message: hasMore
        ? `Invites processed: ${successCount}/${results.length} of ${totalCount} successful, ${emailSentCount} emails sent. ${totalCount - MAX_BATCH_SIZE} remaining — call again to process the next batch.`
        : `Invites processed: ${successCount}/${results.length} successful, ${emailSentCount} emails sent`,
      results,
      summary: {
        total: results.length,
        succeeded: successCount,
        emailsSent: emailSentCount,
        failed: results.length - successCount,
        /** Number of emails that went through the sandbox fallback — these were
         *  likely NOT delivered to the intended employees. */
        fallbackSent: fallbackCount,
        totalCount,
        processedCount: results.length,
        remainingCount: hasMore ? totalCount - MAX_BATCH_SIZE : 0,
        partial: hasMore,
      },
    };

    // If ANY email used the sandbox fallback, add a top-level admin warning
    // so the UI can display a prominent notice to the administrator.
    if (fallbackCount > 0) {
      response.adminWarning =
        `${fallbackCount} invite email(s) could not be sent via the tenant's configured SMTP server ` +
        `and fell back to the global Resend sender. If the global sender is the Resend sandbox, these emails were ` +
        `only delivered to the Resend account holder — not to the intended employees. ` +
        `To fix this: verify the tenant SMTP configuration at /settings → SMTP Email tab ` +
        `(host, port, username, password, encryption), then use the "Test Connection" button to confirm ` +
        `Vercel can reach the SMTP server.`;
    }

    return NextResponse.json(response, { headers: corsHeaders() });
  } catch (error) {
    console.error('[Invite POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
