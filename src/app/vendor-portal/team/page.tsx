'use client';

/**
 * Vendor Admin — Team management — /vendor-portal/team
 * (mock screens 05, 06)
 *
 * Lists Name / Work Email / Role / Invitation-Account Status / Assigned
 * Active Cases with actions: Invite Employee, Resend invitation, Cancel
 * invitation, Disable, Reactivate. Disabling someone with active work
 * returns their cases to the unassigned queue (server-side) so nothing is
 * lost. Only vendor admins of THIS company (or HR) can open this page.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUsers, FiRefreshCw, FiLoader, FiAlertCircle, FiUserPlus, FiX,
  FiRotateCcw, FiSend, FiBan, FiCheckCircle, FiInfo, FiArrowLeft, FiLock,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface TeamUser {
  id: string; name: string; email: string; role: string; status: string;
  activated: boolean; invitedAt?: string; inviteStatus?: string; inviteExpiresAt?: string; activeCases?: number;
}

export default function VendorTeamPage() {
  const router = useRouter();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [vendorCompanyId, setVendorCompanyId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Resolve own vendor company from the requests endpoint (role-scoped).
      const rr = await fetch('/api/vendor/requests', { headers: getAuthHeaders() });
      const rd = await rr.json().catch(() => ({}));
      if (!rr.ok) throw new Error(rd.error || `Failed (${rr.status})`);
      const vcid = rd.vendorCompanyId as string;
      setVendorCompanyId(vcid);
      const res = await fetch(`/api/vendors/${vcid}/users`, { headers: getAuthHeaders() });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Failed to load team'); }
      const d = await res.json();
      setUsers(d.users || []);
      // Best-effort vendor name from the first user's company? requests payload has it.
      const vendorLabel = (rd.requests || [])[0]?.vendorName;
      setVendorName(vendorLabel || '');
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const invite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) { toast.error('Name and work email are required.'); return; }
    setInviting(true);
    try {
      const res = await fetch(`/api/vendors/${vendorCompanyId}/invite-employee`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ name: inviteName.trim(), email: inviteEmail.trim().toLowerCase() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Invitation failed');
      toast.success(d.message || 'Invitation queued.');
      setInviteOpen(false); setInviteName(''); setInviteEmail('');
      load();
    } catch (e: any) { toast.error(e instanceof Error ? e.message : 'Invitation failed'); }
    finally { setInviting(false); }
  };

  const action = async (u: TeamUser, act: string) => {
    const labels: Record<string, string> = {
      resend_invite: `Re-send the activation link to ${u.email}?`,
      cancel_invite: `Cancel the pending invitation for ${u.email}? The link will stop working.`,
      disable: `Disable ${u.name}? They will be signed out and their ${u.activeCases || 0} active case(s) return to the unassigned queue.`,
      reactivate: `Reactivate ${u.name}? They will need to set a new password via a fresh activation link.`,
    };
    if (!confirm(labels[act] || 'Confirm?')) return;
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/vendors/${vendorCompanyId}/users/${u.id}`, {
        method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ action: act }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Action failed');
      toast.success(d.message || 'Done.');
      load();
    } catch (e: any) { toast.error(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusyId(null); }
  };

  if (loading) return (<div className="min-h-screen flex items-center justify-center"><FiLoader className="h-8 w-8 animate-spin text-slate-600" /></div>);
  if (error) return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto bg-white border rounded-xl p-8 text-center">
        <FiLock className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold">Team management is restricted</h2>
        <p className="text-sm text-slate-600 mt-2">{error}</p>
        <button onClick={() => router.push('/vendor-portal/dashboard')} className="mt-4 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm">Back to dashboard</button>
      </div>
    </div>
  );

  const inviteStatusChip = (u: TeamUser) => {
    if (u.status === 'active') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Active</span>;
    if (u.status === 'inactive') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Disabled</span>;
    if (u.inviteStatus === 'revoked') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Invitation cancelled</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Invitation pending</span>;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <button onClick={() => router.push('/vendor-portal/dashboard')} className="flex items-center gap-2 text-slate-300 hover:text-white mb-2 text-sm"><FiArrowLeft /> Dashboard</button>
          <h1 className="text-xl font-bold flex items-center gap-2"><FiUsers className="h-5 w-5" /> Team{vendorName ? ` — ${vendorName}` : ''}</h1>
          <p className="text-slate-300 text-sm mt-0.5">Manage your vendor team and their access to BGV cases. Each member signs in with their own work email.</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500 flex items-center gap-1.5"><FiInfo /> Employees must activate via their emailed link before they can be assigned cases. Passwords are never visible to anyone.</p>
          <div className="flex gap-2">
            <button onClick={load} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-slate-50 inline-flex items-center gap-2"><FiRefreshCw /> Refresh</button>
            <button onClick={() => setInviteOpen(true)} className="px-3.5 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 inline-flex items-center gap-2"><FiUserPlus /> Invite Employee</button>
          </div>
        </div>

        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Work Email</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">BGV Cases</th>
                <th className="text-right px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-slate-800">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.role === 'vendor_admin' ? 'Vendor Admin' : 'Vendor Employee'}</p>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3.5">{inviteStatusChip(u)}</td>
                  <td className="px-4 py-3.5 text-slate-600">{u.activeCases ?? 0} active</td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="inline-flex gap-1.5">
                      {u.status === 'pending' && (
                        <>
                          <button onClick={() => action(u, 'resend_invite')} disabled={busyId === u.id} title="Resend invitation"
                            className="inline-flex items-center gap-1 text-xs text-teal-700 border border-teal-600 hover:bg-teal-50 px-2.5 py-1.5 rounded-lg"><FiSend className="w-3 h-3" /> Resend</button>
                          <button onClick={() => action(u, 'cancel_invite')} disabled={busyId === u.id} title="Cancel invitation"
                            className="inline-flex items-center gap-1 text-xs text-slate-600 border border-slate-300 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg"><FiX className="w-3 h-3" /> Cancel</button>
                        </>
                      )}
                      {u.status === 'active' && (
                        <button onClick={() => action(u, 'disable')} disabled={busyId === u.id} title="Disable account"
                          className="inline-flex items-center gap-1 text-xs text-red-600 border border-red-200 hover:bg-red-50 px-2.5 py-1.5 rounded-lg"><FiBan className="w-3 h-3" /> Disable</button>
                      )}
                      {u.status === 'inactive' && (
                        <button onClick={() => action(u, 'reactivate')} disabled={busyId === u.id} title="Reactivate account"
                          className="inline-flex items-center gap-1 text-xs text-emerald-700 border border-emerald-200 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg"><FiRotateCcw className="w-3 h-3" /> Reactivate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">No team members yet — invite your first employee.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite employee modal (screen 06) */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !inviting && setInviteOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3.5 border-b flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><FiUserPlus className="text-teal-600" /> Invite Employee</h3>
              <button onClick={() => setInviteOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close"><FiX /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Name *</label>
                <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="w-full text-sm border rounded-md px-2.5 py-2" placeholder="e.g. Ravi" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Work email *</label>
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="w-full text-sm border rounded-md px-2.5 py-2" placeholder="ravi@example.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Role</label>
                <input readOnly value="Vendor Employee" className="w-full text-sm border rounded-md px-2.5 py-2 bg-slate-50 text-slate-500" />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-800 flex items-start gap-2">
                <FiInfo className="mt-0.5 shrink-0" /> The employee receives an activation link and creates their own password. No password is set or sent by anyone else.
              </div>
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setInviteOpen(false)} className="px-3.5 py-2 text-sm border rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={invite} disabled={inviting}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-2">
                {inviting ? <FiLoader className="h-4 w-4 animate-spin" /> : <FiSend className="h-4 w-4" />} Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
