import type { NextRequest } from 'next/server';

/**
 * Task 122 — Chat governance: who may create / rename / populate / delete
 * chats. Defaults match the safety baseline requested by the customer:
 *
 *  - GROUP (and project / team / announcement) chats: only chat admins —
 *    roles tenant_admin, admin, hr_admin, company_hr_admin (plus super_admin)
 *    — can create, edit or delete them. The tenant can optionally enable a
 *    CUSTOM manager list in Collaboration Settings; those employees then hold
 *    the same rights.
 *  - DIRECT (1:1) chats: every participant may delete (hide) their own copy
 *    while `directDeleteEnabled` is on (default). Chat admins can always.
 *
 * Deletions are SOFT: group rooms flip isActive=false (+ deletedAt/deletedBy
 * audit columns) with every message retained in the database so Super Admin
 * eDiscovery keeps full history (Task 121 retention measure). Direct chats
 * hide per-member (ChatRoomMember.isHidden); a new incoming message clears
 * the flag so replies are never swallowed.
 */

/** Roles that always hold chat-manager rights. */
export const CHAT_ADMIN_ROLES = ['tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'] as const;

/** Roles that pass the stricter announcement-channel check (unchanged). */
export const CHAT_ANNOUNCEMENT_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin'] as const;

export interface ChatGovernanceSettings {
  customManagersEnabled: boolean;
  directDeleteEnabled: boolean;
  managerIds: string[];
}

export interface ChatPermissions {
  /** Role-based chat admin (HR / tenant-admin family, incl. super_admin). */
  isChatAdmin: boolean;
  /** isChatAdmin OR a selected custom manager. */
  isChatManager: boolean;
  canCreateGroup: boolean;
  canEditGroup: boolean;
  canDeleteGroup: boolean;
  /** Direct chats: everyone when the toggle is on; chat admins always. */
  canDeleteDirect: boolean;
}

export const CHAT_GOVERNANCE_DEFAULTS: ChatGovernanceSettings = {
  customManagersEnabled: false,
  directDeleteEnabled: true,
  managerIds: [],
};

type SettingsReader = {
  collaborationSettings: { findUnique: (a: Record<string, unknown>) => Promise<any> };
};

/** Safe parse of the JSON manager-id list (never throws, dedupes, caps 200). */
export function parseManagerIds(raw: unknown): string[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return Array.from(
    new Set(arr.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())),
  ).slice(0, 200);
}

/**
 * Load the tenant's chat governance settings. Returns DEFAULTS when the row
 * (or the tenant identity) is missing — no write in this hot path; the
 * settings PATCH endpoint owns row creation.
 */
export async function loadChatGovernance(
  db: SettingsReader,
  tenantId: string | null | undefined,
): Promise<ChatGovernanceSettings> {
  if (!tenantId) return { ...CHAT_GOVERNANCE_DEFAULTS };
  try {
    const row = await db.collaborationSettings.findUnique({ where: { tenantId } });
    if (!row) return { ...CHAT_GOVERNANCE_DEFAULTS };
    return {
      customManagersEnabled: row.chatCustomManagersEnabled === true,
      directDeleteEnabled: row.chatDirectDeleteEnabled !== false, // default true
      managerIds: parseManagerIds(row.chatGroupManagerIds),
    };
  } catch {
    // Missing columns on a not-yet-synced DB must never hard-fail chat.
    return { ...CHAT_GOVERNANCE_DEFAULTS };
  }
}

/**
 * Resolve the tenant id the same way /api/collaboration/settings does:
 * x-tenant-slug header first, then the JWT claim.
 */
export async function resolveTenantId(
  request: NextRequest,
  platformDb: { tenant: { findUnique: (a: Record<string, unknown>) => Promise<any> } },
  decoded: { tenantId?: string | null },
): Promise<string | null> {
  const tenantSlug = request.headers.get('x-tenant-slug');
  if (tenantSlug) {
    try {
      const tenant = await platformDb.tenant.findUnique({ where: { slug: tenantSlug } });
      if (tenant) return tenant.id as string;
    } catch {
      /* fall through to the JWT claim */
    }
  }
  return (decoded.tenantId as string | undefined) || null;
}

/** Compute the caller's effective chat permissions. */
export function computeChatPermissions(
  settings: ChatGovernanceSettings,
  role: string | undefined,
  employeeId: string | null | undefined,
): ChatPermissions {
  const isChatAdmin = role === 'super_admin' || CHAT_ADMIN_ROLES.includes(role as (typeof CHAT_ADMIN_ROLES)[number]);
  const isCustomManager =
    settings.customManagersEnabled && !!employeeId && settings.managerIds.includes(employeeId);
  const isChatManager = isChatAdmin || isCustomManager;
  return {
    isChatAdmin,
    isChatManager,
    canCreateGroup: isChatManager,
    canEditGroup: isChatManager,
    canDeleteGroup: isChatManager,
    canDeleteDirect: settings.directDeleteEnabled || isChatManager,
  };
}

/**
 * One-call helper for route handlers: resolve tenant id, load governance
 * settings and compute the caller's permissions.
 */
export async function getChatContext(
  request: NextRequest,
  db: SettingsReader,
  platformDb: Parameters<typeof resolveTenantId>[1],
  decoded: { role?: string; tenantId?: string | null },
  employeeId?: string | null,
): Promise<{ tenantId: string | null; settings: ChatGovernanceSettings; permissions: ChatPermissions }> {
  const tenantId = await resolveTenantId(request, platformDb, decoded);
  const settings = await loadChatGovernance(db, tenantId);
  const permissions = computeChatPermissions(settings, decoded.role, employeeId);
  return { tenantId, settings, permissions };
}
