import type { NextRequest } from 'next/server';
import { resolveTenantId } from '@/lib/chat-permissions';

/**
 * Task 138 — Social Feed governance: who may RAISE (create) feeds.
 *
 * Default ('admins'): only the admin-family roles — tenant_admin, ceo, admin,
 * hr_admin, company_hr_admin (plus super_admin) — can create posts. Every
 * other login can still RESPOND (like / comment) to feeds shared by HR/admin.
 *
 * 'selected': the employees listed in CollaborationSettings.feedCreatorIds
 * (picked by HR/Admin in Collaboration → Settings → Social Feed Governance)
 * may ALSO raise feeds from their own logins.
 */

/** Roles that can always raise feeds. */
export const FEED_ADMIN_ROLES = ['tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'] as const;

export type FeedCreationMode = 'admins' | 'selected';

export interface FeedGovernanceSettings {
  creationMode: FeedCreationMode;
  creatorIds: string[];
}

export interface FeedPermissions {
  /** Role-based feed admin (HR / tenant-admin family, incl. super_admin). */
  isFeedAdmin: boolean;
  /** isFeedAdmin OR an explicitly enabled feed creator. */
  canCreate: boolean;
  /** Everyone authenticated can respond (like / comment) to feeds. */
  canRespond: boolean;
  creationMode: FeedCreationMode;
}

export const FEED_GOVERNANCE_DEFAULTS: FeedGovernanceSettings = {
  creationMode: 'admins',
  creatorIds: [],
};

type SettingsReader = {
  // `any` arg keeps PrismaClient structurally assignable (same shape as the
  // chat-permissions reader; the Prisma generic signature needs the looseness).
  collaborationSettings: { findUnique: (a: any) => Promise<any> };
};

/** Safe parse of the JSON creator-id list (never throws, dedupes, caps 500). */
export function parseFeedCreatorIds(raw: unknown): string[] {
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
  ).slice(0, 500);
}

/**
 * Ensure the feed-governance columns exist on a not-yet-synced tenant DB
 * (self-healing DDL — same defensive posture as the chat governance loader's
 * siblings). Runs at most once per process per DB identity; failures are
 * swallowed so the feed never hard-fails on governance.
 */
const healedDbs = new WeakSet<object>();
export async function ensureFeedGovernanceColumns(db: Record<string, any>): Promise<void> {
  if (typeof db?.$executeRawUnsafe !== 'function' || healedDbs.has(db)) return;
  try {
    await db.$executeRawUnsafe(`ALTER TABLE "CollaborationSettings" ADD COLUMN IF NOT EXISTS "feedCreationMode" TEXT DEFAULT 'admins'`);
    await db.$executeRawUnsafe(`ALTER TABLE "CollaborationSettings" ADD COLUMN IF NOT EXISTS "feedCreatorIds" TEXT DEFAULT '[]'`);
    healedDbs.add(db);
  } catch {
    /* missing table on a fresh DB — defaults apply */
  }
}

/**
 * Load the tenant's feed governance settings. Returns DEFAULTS when the row
 * (or the tenant identity) is missing — the settings PATCH endpoint owns row
 * creation, this hot path never writes.
 */
export async function loadFeedGovernance(
  db: SettingsReader,
  tenantId: string | null | undefined,
): Promise<FeedGovernanceSettings> {
  if (!tenantId) return { ...FEED_GOVERNANCE_DEFAULTS };
  try {
    const row = await db.collaborationSettings.findUnique({ where: { tenantId } });
    if (!row) return { ...FEED_GOVERNANCE_DEFAULTS };
    const mode = row.feedCreationMode === 'selected' ? 'selected' : 'admins';
    return {
      creationMode: mode,
      creatorIds: parseFeedCreatorIds(row.feedCreatorIds),
    };
  } catch {
    // Missing columns on a not-yet-synced DB must never hard-fail the feed.
    return { ...FEED_GOVERNANCE_DEFAULTS };
  }
}

/** Compute the caller's effective feed permissions. */
export function computeFeedPermissions(
  settings: FeedGovernanceSettings,
  role: string | undefined,
  employeeId: string | null | undefined,
): FeedPermissions {
  const isFeedAdmin =
    role === 'super_admin' || FEED_ADMIN_ROLES.includes(role as (typeof FEED_ADMIN_ROLES)[number]);
  const isAllowedCreator =
    settings.creationMode === 'selected' && !!employeeId && settings.creatorIds.includes(employeeId);
  return {
    isFeedAdmin,
    canCreate: isFeedAdmin || isAllowedCreator,
    canRespond: true,
    creationMode: settings.creationMode,
  };
}

/**
 * One-call helper for route handlers: resolve tenant id, load governance
 * settings and compute the caller's permissions.
 */
export async function getFeedContext(
  request: NextRequest,
  db: SettingsReader,
  platformDb: unknown, // platform PrismaClient (cast for the shared chat resolver)
  decoded: { role?: string; tenantId?: string | null },
  employeeId?: string | null,
): Promise<{ tenantId: string | null; settings: FeedGovernanceSettings; permissions: FeedPermissions }> {
  await ensureFeedGovernanceColumns(db as unknown as Record<string, any>);
  const tenantId = await resolveTenantId(request, platformDb as Parameters<typeof resolveTenantId>[1], decoded);
  const settings = await loadFeedGovernance(db, tenantId);
  const permissions = computeFeedPermissions(settings, decoded.role, employeeId);
  return { tenantId, settings, permissions };
}
