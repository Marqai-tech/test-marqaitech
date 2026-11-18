'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { FiBriefcase, FiMail, FiShield, FiUser } from 'react-icons/fi';
import VendorPortalHeader from '../VendorPortalHeader';

type VendorUser = { id?: string; name?: string; email?: string; role?: string; vendorCompanyId?: string };

export default function VendorProfilePage() {
  const [user, setUser] = useState<VendorUser>({});
  const [vendorName, setVendorName] = useState('');

  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem('tb_user') || '{}')); } catch { setUser({}); }
    const token = localStorage.getItem('tb_token');
    fetch('/api/vendor/requests', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(d => setVendorName(d?.requests?.[0]?.vendorName || ''))
      .catch(() => null);
  }, []);

  const isAdmin = user.role === 'vendor_admin';
  return (
    <main className="min-h-screen bg-[#f4f7fb]">
      <VendorPortalHeader title="My Profile" subtitle="Your vendor account, company and access information." isAdmin={isAdmin} backToPrevious backLabel="Back to previous screen" />
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <div className="bg-white border border-slate-200/80 rounded-3xl shadow-lg shadow-slate-200/40 overflow-hidden">
          <div className="relative p-6 sm:p-9 flex flex-col sm:flex-row items-start gap-5 border-b bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 text-white">
            <div className="h-20 w-20 rounded-3xl bg-white/10 text-white ring-1 ring-white/20 flex items-center justify-center text-2xl font-bold shadow-xl">{(user.name || user.email || 'V').slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0">
              <h2 className="text-2xl font-bold break-words">{user.name || 'Vendor User'}</h2>
              <p className="text-sm text-slate-300 break-all">{user.email || 'Email unavailable'}</p>
              <span className="mt-3 inline-flex rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1 text-xs font-semibold text-teal-100">{isAdmin ? 'Vendor Administrator' : 'Vendor Employee'}</span>
            </div>
          </div>
          <dl className="grid sm:grid-cols-2 gap-4 p-5 sm:p-8">
            <ProfileItem icon={<FiUser />} label="Full name" value={user.name || 'Not available'} />
            <ProfileItem icon={<FiMail />} label="Work email" value={user.email || 'Not available'} />
            <ProfileItem icon={<FiBriefcase />} label="Vendor company" value={vendorName || 'Assigned vendor company'} />
            <ProfileItem icon={<FiShield />} label="Portal role" value={isAdmin ? 'Vendor Administrator' : 'Vendor Employee'} />
          </dl>
          <div className="mx-5 mb-5 sm:mx-8 sm:mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Contact your vendor administrator or HR to update your name, work email, company assignment, or access role.
          </div>
        </div>
      </div>
    </main>
  );
}

function ProfileItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 min-w-0 transition hover:border-teal-200 hover:bg-teal-50/40"><dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm">{icon}</span>{label}</dt><dd className="mt-3 text-sm font-semibold text-slate-800 break-all">{value}</dd></div>;
}
