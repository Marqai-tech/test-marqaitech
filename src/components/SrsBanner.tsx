'use client';

import Link from 'next/link';
import {
  FiShield, FiServer, FiZap, FiLock, FiBriefcase, FiLayers,
  FiActivity, FiGlobe, FiInfo,
} from 'react-icons/fi';

/**
 * SrsBanner
 *
 * Renders an SRS-aligned header banner at the top of the Super Admin and
 * Tenant Admin pages, making it crystal-clear which SRS requirements each
 * page covers and linking to the related sub-pages. The goal is "cleanly
 * defined" admin modules per the user's request — every admin can see at a
 * glance what their role is allowed to do, with the SRS requirement IDs
 * traceable to the spec document.
 *
 * SRS coverage:
 *  - Super Admin: SRS §3 (REQ-SA-01 .. REQ-SA-12) + §6 RBAC matrix + §7 Security
 *  - Tenant Admin: SRS §4 (REQ-TA-01 .. REQ-TA-10) + §6 RBAC matrix + §5 Localization
 */

interface BannerCard {
  href: string;
  icon: React.ReactNode;
  label: string;
  srsId: string;
  description: string;
  accent: string; // tailwind classes for icon chip
}

const SUPER_ADMIN_CARDS: BannerCard[] = [
  {
    href: '/super-admin',
    icon: <FiShield className="w-4 h-4" />,
    label: 'Tenants & Subscriptions',
    srsId: 'REQ-SA-01..04',
    description: 'Create parent companies, define plans, set validity, suspend / delete.',
    accent: 'bg-blue-50 text-blue-600',
  },
  {
    href: '/super-admin',
    icon: <FiActivity className="w-4 h-4" />,
    label: 'Global Dashboard',
    srsId: 'REQ-SA-06',
    description: 'Total parent companies, sub-companies, users, MRR/ARR, system health.',
    accent: 'bg-emerald-50 text-emerald-600',
  },
  {
    href: '/super-admin/feature-flags',
    icon: <FiZap className="w-4 h-4" />,
    label: 'Feature Flags',
    srsId: 'REQ-SA-05',
    description: 'Enable / disable AI modules and beta features per parent company.',
    accent: 'bg-violet-50 text-violet-600',
  },
  {
    href: '/super-admin/audit-logs',
    icon: <FiLock className="w-4 h-4" />,
    label: 'Audit Logs',
    srsId: 'REQ-SA-10 · REQ-SEC-06',
    description: 'Every context swap, tenant lifecycle event, and permission change.',
    accent: 'bg-amber-50 text-amber-600',
  },
  {
    href: '/super-admin/rbac',
    icon: <FiLock className="w-4 h-4" />,
    label: 'RBAC Matrix',
    srsId: 'SRS §6',
    description: 'Roles, permissions, and access-control enforcement across the platform.',
    accent: 'bg-rose-50 text-rose-600',
  },
  {
    href: '/ai-admin',
    icon: <FiZap className="w-4 h-4" />,
    label: 'AI Platform',
    srsId: 'REQ-SA-11 · REQ-SA-12',
    description: 'AI usage metrics across tenants, global model config, anomaly detection.',
    accent: 'bg-indigo-50 text-indigo-600',
  },
];

const TENANT_ADMIN_CARDS: BannerCard[] = [
  {
    href: '/tenant-admin',
    icon: <FiServer className="w-4 h-4" />,
    label: 'Group Dashboard',
    srsId: 'REQ-TA-04 · REQ-TA-05',
    description: 'Consolidated headcount, financials, talent density, AI Group Health Score.',
    accent: 'bg-blue-50 text-blue-600',
  },
  {
    href: '/tenant-admin/companies',
    icon: <FiBriefcase className="w-4 h-4" />,
    label: 'Sub-Companies',
    srsId: 'REQ-TA-01 · REQ-TA-02 · REQ-TA-03',
    description: 'Create sub-companies with country / currency / language; assign local admins.',
    accent: 'bg-emerald-50 text-emerald-600',
  },
  {
    href: '/tenant-admin/group-companies',
    icon: <FiLayers className="w-4 h-4" />,
    label: 'Group Companies (read-only)',
    srsId: 'SRS §6',
    description: 'Group companies are super-admin-managed; you can view but not modify.',
    accent: 'bg-violet-50 text-violet-600',
  },
  {
    href: '/tenant-admin/rbac',
    icon: <FiLock className="w-4 h-4" />,
    label: 'Company RBAC',
    srsId: 'SRS §6',
    description: 'Roles and permissions scoped to your parent company.',
    accent: 'bg-rose-50 text-rose-600',
  },
  {
    href: '/settings',
    icon: <FiGlobe className="w-4 h-4" />,
    label: 'Localization',
    srsId: 'REQ-TA-09 · REQ-TA-10',
    description: 'Default UI language, currency mapping for sub-companies in other countries.',
    accent: 'bg-amber-50 text-amber-600',
  },
  {
    href: '/ai-admin',
    icon: <FiZap className="w-4 h-4" />,
    label: 'AI Insights',
    srsId: 'REQ-TA-05',
    description: 'AI-driven group health score, predictive analytics, budget overruns.',
    accent: 'bg-indigo-50 text-indigo-600',
  },
];

export default function SrsBanner({ role }: { role: 'super_admin' | 'tenant_admin' }) {
  const isSuperAdmin = role === 'super_admin';
  const cards = isSuperAdmin ? SUPER_ADMIN_CARDS : TENANT_ADMIN_CARDS;

  const title = isSuperAdmin
    ? 'Super Admin — Platform Owner'
    : 'Tenant Admin — Parent Company Owner';
  const srsRef = isSuperAdmin ? 'SRS §3 · REQ-SA-01..12' : 'SRS §4 · REQ-TA-01..10';
  const subtitle = isSuperAdmin
    ? 'Manages subscriptions, global configurations, and oversight over all Parent Companies and their subsidiaries.'
    : 'Manages the group structure, creates sub-companies, and oversees group-wide analytics for their assigned Parent Company.';
  const hierarchyNote = isSuperAdmin
    ? 'Hierarchy: Super Admin → Parent Companies (Tenants) → Group Companies → Sub-Companies → Employees'
    : 'Hierarchy: Your Parent Company → Group Companies → Sub-Companies → Employees';

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-blue-50/30 to-violet-50/20 overflow-hidden">
      {/* Banner header */}
      <div className="px-6 py-5 border-b border-slate-100 flex items-start gap-4">
        <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${
          isSuperAdmin ? 'bg-gradient-to-br from-blue-500 to-violet-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'
        }`}>
          {isSuperAdmin
            ? <FiShield className="w-6 h-6 text-white" />
            : <FiServer className="w-6 h-6 text-white" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {srsRef}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
          <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
            <FiInfo className="w-3 h-3 flex-shrink-0" />
            <span>{hierarchyNote}</span>
          </p>
        </div>
      </div>

      {/* Quick-link cards */}
      <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="group flex items-start gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-white hover:border-slate-300 hover:shadow-sm transition-all"
          >
            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${c.accent}`}>
              {c.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">{c.label}</p>
                <span className="text-[9px] font-mono font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  {c.srsId}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{c.description}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Permission rule footer */}
      <div className="px-6 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2 flex-wrap text-[11px] text-slate-600">
        {isSuperAdmin ? (
          <>
            <FiLock className="w-3 h-3 text-rose-500 flex-shrink-0" />
            <span><b>Permission rule:</b> Super admin can create <b>parent companies</b> and <b>group companies</b>. Tenant admins can only create <b>sub-companies</b> under existing groups.</span>
          </>
        ) : (
          <>
            <FiLock className="w-3 h-3 text-rose-500 flex-shrink-0" />
            <span><b>Your scope:</b> You can create <b>sub-companies</b> under existing group companies. Group companies are <b>read-only</b> — request changes from your super admin.</span>
          </>
        )}
      </div>
    </div>
  );
}
