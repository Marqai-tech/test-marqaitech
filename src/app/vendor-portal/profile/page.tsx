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
    <main className="min-h-screen bg-slate-50">
      <VendorPortalHeader title="My Profile" subtitle="Your vendor account, company and access information." isAdmin={isAdmin} backToPrevious backLabel="Back to previous screen" />
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 sm:p-8 flex flex-col sm:flex-row items-start gap-5 border-b">
            <div className="h-16 w-16 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center text-2xl font-bold">{(user.name || user.email || 'V').slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-900 break-words">{user.name || 'Vendor User'}</h2>
              <p className="text-sm text-slate-500 break-all">{user.email || 'Email unavailable'}</p>
              <span className="mt-2 inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">{isAdmin ? 'Vendor Administrator' : 'Vendor Employee'}</span>
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
  return <div className="rounded-xl border border-slate-200 p-4 min-w-0"><dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">{icon}{label}</dt><dd className="mt-2 text-sm font-semibold text-slate-800 break-all">{value}</dd></div>;
}
