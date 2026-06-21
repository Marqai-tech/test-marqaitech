'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function EWAPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [earnedToDate, setEarnedToDate] = useState(0);
  const [maxWithdrawable, setMaxWithdrawable] = useState(0);
  const [amount, setAmount] = useState(0);
  useEffect(() => { load(); }, []);
  async function load(): Promise<void> {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    if (!u.employeeId) return;
    const token = localStorage.getItem('token');
    const r = await fetch(`/api/ewa?employeeId=${u.employeeId}`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    setRequests(d.requests || []);
  }
  async function request(): Promise<void> {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    if (!u.employeeId || amount <= 0) return;
    const token = localStorage.getItem('token');
    const r = await fetch('/api/ewa', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ employeeId: u.employeeId, requestedAmount: amount }) });
    if (r.ok) { const d = await r.json(); setEarnedToDate(d.earnedToDate); setMaxWithdrawable(d.maxWithdrawable); setAmount(0); load(); alert(`EWA approved! Fee: ${d.feeAmount}`); }
    else { const e = await r.json(); alert(e.error); }
  }
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Earned Wage Access</h1>
        <p className="text-sm text-gray-600 mt-1">Real-time balance · 70% cap · Auto-settled on payroll (REQ-FIN-01/02/03)</p>
      </div>
      <div className="bg-gradient-to-br from-yellow-500 to-orange-500 text-white rounded-lg p-6 shadow-lg">
        <div className="text-sm opacity-90">Available to withdraw (70% of earned-to-date)</div>
        <div className="text-4xl font-bold mt-1">INR {Math.max(0, maxWithdrawable).toFixed(0)}</div>
        <div className="text-xs opacity-75 mt-2">Earned to date: INR {earnedToDate.toFixed(0)} · Fee: 2% · Settles on next payroll</div>
      </div>
      <div className="bg-white border rounded-lg p-4 flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs text-gray-600">Amount (INR)</label>
          <input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value))} className="w-full border rounded px-3 py-2" />
        </div>
        <button onClick={request} className="px-6 py-2 bg-blue-600 text-white rounded">Request Advance</button>
      </div>
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold mb-3">History</h3>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-right">Requested</th><th className="px-3 py-2 text-right">Fee</th><th className="px-3 py-2 text-center">Status</th></tr></thead>
          <tbody>
            {requests.map(r => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right">{r.currency} {r.requestedAmount}</td>
                <td className="px-3 py-2 text-right text-red-600">{r.feeAmount}</td>
                <td className="px-3 py-2 text-center"><span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
