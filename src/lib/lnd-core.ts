/**
 * L&D module shared core (Task 38): auth context, scoping helpers,
 * certificate numbering and notification dispatch.
 */
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import type { PrismaClient } from '@/generated/prisma/client';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin'];
export const APPROVER_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'manager', 'hr_manager'];

export interface LndAuth {
  db: PrismaClient;
  userId: string;
  role: string;
  isAdmin: boolean;
  isApprover: boolean;
  employeeId: string | null;
  tenantId: string | null;
  companyId: string | null;
}

/**
 * Resolve the caller's auth + employee context for L&D routes.
 * companyId comes from ?companyId= (company switcher) when provided.
 */
export async function lndAuth(request: Request): Promise<LndAuth | null> {
  const db = await getDb(request);
  const decoded = await verifyToken(getTokenFromHeaders(request));
  if (!decoded) return null;
  const userId = String(decoded.userId || '');
  const role = String(decoded.role || 'employee');
  const isAdmin = ADMIN_ROLES.includes(role);
  const isApprover = APPROVER_ROLES.includes(role);

  let employeeId: string | null = null;
  let tenantId: string | null = (decoded.tenantId as string) || null;
  let companyId: string | null = null;
  try {
    const emp = await db.employee.findFirst({
      where: { userId },
      select: { id: true, companyId: true },
    });
    if (emp) {
      employeeId = emp.id;
      companyId = emp.companyId || null;
    }
  } catch { /* employee link optional */ }
  // Employee model has no tenantId column (tenant isolation is DB-level) —
  // resolve the real tenant id from the User record for notification routing.
  try {
    const u = await db.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
    if (u?.tenantId) tenantId = u.tenantId;
  } catch { /* keep decoded tenantId */ }

  const { searchParams } = new URL(request.url);
  const scopeCompany = searchParams.get('companyId');
  if (scopeCompany) companyId = scopeCompany;

  return { db, userId, role, isAdmin, isApprover, employeeId, tenantId, companyId };
}

/** Company scope filter: seeded/global rows (companyId null) are always visible. */
export function companyWhere(companyId: string | null) {
  if (!companyId) return {};
  return { OR: [{ companyId }, { companyId: null }] };
}

/** Next certificate number: CERT-<FY>-0001 */
export async function nextCertificateNo(db: PrismaClient): Promise<string> {
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fy = `${String(fyStart).slice(2)}${String(fyStart + 1).slice(2)}`;
  const prefix = `CERT-FY${fy}-`;
  const last = await db.certificate.findFirst({
    where: { certificateNo: { startsWith: prefix } },
    orderBy: { certificateNo: 'desc' },
    select: { certificateNo: true },
  });
  const seq = last ? parseInt(last.certificateNo.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/** Fire a module-wise notification (never fatal). */
export async function notify(opts: {
  tenantId: string | null;
  eventKey: string;
  recipients: { userId: string; name?: string; email?: string }[];
  vars: Record<string, string | number | null | undefined>;
  entity?: { type: string; id: string; link?: string };
  origin?: string | null;
}) {
  if (!opts.tenantId || !opts.recipients?.length) return;
  try {
    const { dispatchNotification } = await import('@/lib/notification-center');
    await dispatchNotification({
      tenantId: opts.tenantId,
      module: 'learning',
      eventKey: opts.eventKey,
      recipients: opts.recipients,
      vars: opts.vars,
      entity: opts.entity,
      origin: opts.origin || undefined,
    });
  } catch (e) {
    console.error('[lnd] notification dispatch failed (non-fatal):', e);
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: CORS });
}
