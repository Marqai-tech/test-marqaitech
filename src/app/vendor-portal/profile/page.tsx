'use client';

import { useRouter } from 'next/navigation';
import { FiArrowLeft, FiLogOut, FiUser } from 'react-icons/fi';

export default function VendorProfilePage() {
  const router = useRouter();
  const logout = () => { localStorage.removeItem('tb_token'); localStorage.removeItem('tb_user'); router.push('/login'); };
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto bg-white border rounded-xl shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"><FiArrowLeft /> Back</button>
          <button onClick={logout} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-red-600"><FiLogOut /> Logout</button>
        </div>
        <div className="p-8">
          <h1 className="text-xl font-bold text-slate-900 inline-flex items-center gap-2"><FiUser /> My Profile</h1>
          <p className="text-sm text-slate-500 mt-2">Vendor account profile and access information.</p>
          <div className="mt-6 rounded-lg bg-slate-50 border p-4 text-sm text-slate-600">Profile details are managed by the vendor administrator or HR.</div>
        </div>
      </div>
    </main>
  );
}
