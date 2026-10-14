import { NextResponse } from 'next/server';
import { getPlatformDb } from '@/lib/tenant-db';

/**
 * Token-based approval for super-admin change requests (the EMAIL path).
 *
 * GET  ?token=<token>            → renders a standalone HTML decision page
 *                                  (NO side effects — safe for email prefetch).
 * POST { token, action, reason } → executes approve/reject. The token is
 *                                  single-use (cleared on completion).
 *
 * This endpoint is intentionally PUBLIC: the designated approver
 * (mahesh@marqaitech.com) decides from their inbox without needing a login.
 * The token is a 48-hex-char secret generated at request creation and is only
 * valid while the request is pending_approval and unexpired (7 days).
 */

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

function page(title: string, bodyHtml: string, ok = true): Response {
  const color = ok ? '#059669' : '#b91c1c';
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — 3Boxes HRMS Change Control</title>
<style>
 body{font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9;margin:0;padding:24px}
 .card{max-width:640px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
 .head{background:#0f172a;color:#fff;padding:16px 24px;font-size:18px;font-weight:600}
 .body{padding:24px;color:#0f172a;line-height:1.55}
 table{width:100%;border-collapse:collapse;margin:14px 0}
 td{padding:6px 8px;vertical-align:top}
 td.k{background:#f8fafc;font-weight:600;width:150px}
 .btn{display:inline-block;padding:10px 24px;border-radius:6px;border:0;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none}
 .approve{background:#059669;color:#fff}.reject{background:#dc2626;color:#fff}
 .banner{padding:10px 14px;border-radius:6px;margin:12px 0;color:#fff;background:${color}}
 textarea,input{width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-family:inherit}
 .muted{color:#64748b;font-size:13px}
</style></head><body><div class="card"><div class="head">Super Admin Change Control</div><div class="body">${bodyHtml}</div></div></body></html>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders() } },
  );
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── GET — render the decision page (no side effects) ───
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token) return page('Invalid link', '<div class="banner">Missing approval token.</div>', false);

  const cr = await getPlatformDb().superAdminChangeRequest.findUnique({ where: { approvalToken: token } }).catch(() => null);
  if (!cr) return page('Invalid link', '<div class="banner">This approval link is invalid or has already been used.</div>', false);
  if (cr.status !== 'pending_approval') {
    return page('Already decided', `<div class="banner">This change request was already <b>${esc(cr.status)}</b> by ${esc(cr.approvedBy || 'the approver')}.</div><p class="muted">No further action is needed.</p>`);
  }
  if (cr.tokenExpiresAt && cr.tokenExpiresAt < new Date()) {
    return page('Link expired', '<div class="banner">This approval link has expired. Please ask the super admin to raise a new change request or approve in-app.</div>', false);
  }

  const body = `
    <p>A change to the <b>super admin platform</b> is awaiting your decision. Code updates may only be deployed after approval.</p>
    <table>
      <tr><td class="k">Title</td><td>${esc(cr.title)}</td></tr>
      <tr><td class="k">Module</td><td>${esc(cr.module)}</td></tr>
      <tr><td class="k">Requested by</td><td>${esc(cr.requestedBy)}</td></tr>
      <tr><td class="k">Request ID</td><td>${esc(cr.id)}</td></tr>
      <tr><td class="k">Description</td><td style="white-space:pre-wrap">${esc(cr.description)}</td></tr>
    </table>
    <div id="reasonWrap" style="margin:12px 0">
      <label class="muted">Rejection reason (required only when rejecting):</label>
      <textarea id="reason" rows="2" placeholder="Why is this change being rejected?"></textarea>
    </div>
    <p>
      <button class="btn approve" onclick="decide('approve')">Approve</button>
      &nbsp;
      <button class="btn reject" onclick="decide('reject')">Reject</button>
    </p>
    <p class="muted">Approving authorizes the requested super-admin change to be implemented and deployed. Your decision is recorded with your email in the platform audit trail.</p>
    <div id="result"></div>
    <script>
      async function decide(action){
        const reason=(document.getElementById('reason')||{}).value||'';
        const res=await fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'${esc(token)}',action,reason})});
        const data=await res.json().catch(()=>({}));
        const el=document.getElementById('result');
        if(res.ok){el.innerHTML='<div class="banner">Decision recorded: <b>'+action.toUpperCase()+'</b>. You may close this window.</div>';
          document.querySelector('.approve').disabled=true;document.querySelector('.reject').disabled=true;}
        else{el.innerHTML='<div class="banner" style="background:#b91c1c">'+(data.error||('Failed (HTTP '+res.status+')'))+'</div>';}
      }
    </script>`;
  return page('Change approval', body);
}

// ─── POST — execute the decision (single-use token) ───
export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  let token = '', action = '', reason = '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    token = body.token || ''; action = body.action || ''; reason = body.reason || '';
  } else {
    const form = await request.formData().catch(() => null);
    token = (form?.get('token') as string) || ''; action = (form?.get('action') as string) || ''; reason = (form?.get('reason') as string) || '';
  }

  if (!token || !action) return page('Invalid', '<div class="banner">Missing token or action.</div>', false);
  if (!['approve', 'reject'].includes(action)) return page('Invalid', '<div class="banner">Invalid action.</div>', false);

  const platformDb = getPlatformDb();
  const cr = await platformDb.superAdminChangeRequest.findUnique({ where: { approvalToken: token } }).catch(() => null);
  if (!cr) return page('Invalid link', '<div class="banner">This approval link is invalid or has already been used.</div>', false);
  if (cr.status !== 'pending_approval') {
    return page('Already decided', `<div class="banner">This change request was already <b>${esc(cr.status)}</b> by ${esc(cr.approvedBy || 'the approver')}.</div>`);
  }
  if (cr.tokenExpiresAt && cr.tokenExpiresAt < new Date()) {
    return page('Link expired', '<div class="banner">This approval link has expired.</div>', false);
  }
  if (action === 'reject' && !reason.trim()) {
    return page('Reason required', '<div class="banner">A rejection reason is required.</div>', false);
  }

  const approverEmail = process.env.CHANGE_APPROVAL_EMAIL || 'mahesh@marqaitech.com';
  const updated = await platformDb.superAdminChangeRequest.update({
    where: { id: cr.id },
    data: action === 'approve'
      ? {
          status: 'approved', approvedBy: approverEmail, approvalMethod: 'email_link',
          approvedAt: new Date(), approvalToken: null, tokenExpiresAt: null,
        }
      : {
          status: 'rejected', approvedBy: approverEmail, approvalMethod: 'email_link',
          approvedAt: new Date(), rejectedReason: reason.trim(), approvalToken: null, tokenExpiresAt: null,
        },
  });

  // Audit (best-effort, platform DB)
  try {
    await platformDb.auditLog.create({
      data: {
        action: action === 'approve' ? 'CHANGE_REQUEST_APPROVED' : 'CHANGE_REQUEST_REJECTED',
        module: 'governance',
        details: `Change request "${cr.title}" ${action === 'approve' ? 'APPROVED' : 'REJECTED'} via email link by ${approverEmail}${action === 'reject' ? `: ${reason.trim()}` : ''}`,
      },
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, request: { id: updated.id, status: updated.status } }, { headers: corsHeaders() });
}
