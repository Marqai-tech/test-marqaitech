'use client';

import { useEffect, useState } from 'react';
import { FiUser, FiUserCheck, FiAlertCircle, FiChevronRight, FiUsers } from 'react-icons/fi';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface ApproverUser { id: string; name: string; email: string }
interface ApproverTier {
  tier: number;
  label: string;
  approverType: string;
  user: ApproverUser | null;
}

interface Props {
  /** Module key: 'leave' | 'wfh' | 'gatepass' | 'permission' | 'regularize' | 'overtime' | 'compoff' */
  module: 'leave' | 'wfh' | 'gatepass' | 'permission' | 'regularize' | 'overtime' | 'compoff';
  /** Optional leaveTypeId (only for leave module — different leave types can have different chains) */
  leaveTypeId?: string;
  /** Compact mode — smaller padding, used inside tight modals */
  compact?: boolean;
}

const APPROVER_TYPE_LABEL: Record<string, string> = {
  reporting_manager: 'Reporting Manager',
  department_head: 'Department Head',
  hr_admin: 'HR Admin',
  tenant_admin: 'Tenant Admin',
  specific_user: 'Specific User',
  specific_employee: 'Specific Employee',
  vp_director: 'VP / Director',
  security: 'Security (Gate)',
  project_manager: 'Project Manager',
};

export default function ApproverChainPreview({ module, leaveTypeId, compact }: Props) {
  const [tiers, setTiers] = useState<ApproverTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>('default');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ module });
    if (leaveTypeId) params.set('leaveTypeId', leaveTypeId);
    fetch(`/api/workflow/approvers?${params}`, { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(j => {
        if (cancelled) return;
        setTiers(j.tiers || []);
        setSource(j.source || 'default');
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [module, leaveTypeId]);

  if (loading) {
    return (
      <div className={`rounded-lg border border-slate-200 bg-slate-50 ${compact ? 'p-2.5' : 'p-3'}`}>
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <FiUsers className="w-3.5 h-3.5 animate-pulse" />
          Resolving approver chain…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50 ${compact ? 'p-2.5' : 'p-3'}`}>
        <p className="text-xs text-amber-800 flex items-center gap-1.5">
          <FiAlertCircle className="w-3.5 h-3.5" />
          Could not load approver chain ({error}). The request will still be submitted.
        </p>
      </div>
    );
  }

  if (!tiers.length) {
    return (
      <div className={`rounded-lg border border-slate-200 bg-slate-50 ${compact ? 'p-2.5' : 'p-3'}`}>
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <FiAlertCircle className="w-3.5 h-3.5" />
          No approver chain is configured for your account. The request will go to an HR admin.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-green-200 bg-green-50/60 ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-green-800 flex items-center gap-1.5">
          <FiUserCheck className="w-3.5 h-3.5" />
          Approval Chain
        </p>
        <span className="text-[10px] text-green-600/80 font-medium uppercase tracking-wide">
          {tiers.length} tier{tiers.length === 1 ? '' : 's'} · {source === 'tenant_config' ? 'Custom' : 'Default'}
        </span>
      </div>
      <ol className="space-y-1.5">
        {tiers.map((t, idx) => (
          <li key={t.tier} className="flex items-start gap-2">
            <div className="flex flex-col items-center">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-[10px] font-bold flex-shrink-0">
                {t.tier}
              </span>
              {idx < tiers.length - 1 && <span className="w-px h-3 bg-green-300 my-0.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-800">
                {t.label || APPROVER_TYPE_LABEL[t.approverType] || t.approverType}
              </p>
              {t.user ? (
                <p className="text-[11px] text-slate-600 truncate">
                  <FiUser className="w-3 h-3 inline mr-0.5 -mt-0.5" />
                  {t.user.name || 'Unknown'}
                  <span className="text-slate-400"> · {t.user.email}</span>
                </p>
              ) : (
                <p className="text-[11px] text-amber-700 flex items-center gap-1">
                  <FiAlertCircle className="w-3 h-3" />
                  Not yet resolved — will be assigned at runtime
                </p>
              )}
            </div>
            {idx < tiers.length - 1 && (
              <FiChevronRight className="w-3 h-3 text-slate-300 self-center hidden sm:block" />
            )}
          </li>
        ))}
      </ol>
      <p className="mt-2 pt-1.5 border-t border-green-100 text-[10px] text-green-700/80">
        Your request will be routed through this chain once submitted. You will receive an email after each tier is approved.
      </p>
    </div>
  );
}
