'use client';

/**
 * Vendor Employee Workspace — vendor-portal/requests/[id]
 *
 * Assigned vendor employee can:
 * - View candidate info + shared documents
 * - Update check progress + findings
 * - Submit final report to HR
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  FiArrowLeft, FiShield, FiLoader, FiAlertCircle, FiCheckCircle,
  FiFileText, FiUpload, FiSend,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Check {
  id: string;
  checkType: string;
  checkLabel?: string;
  status: string;
  result?: string;
  findings?: string;
}

interface RequestDetail {
  id: string;
  candidateEmail: string;
  candidateName?: string;
  status: string;
  vendorName?: string;
  instructions?: string;
  checks: Check[];
  sharedDocuments: Array<{ id: string; documentLabel: string; documentType: string; fileUrl?: string }>;
  reports: Array<{ id: string; version: number; summary?: string; status: string }>;
}

export default function VendorRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.id as string;
  const [data, setData] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingCheck, setUpdatingCheck] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSummary, setReportSummary] = useState('');
  const [reportResult, setReportResult] = useState('Clear');

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      try {
        const res = await fetch(`/api/vendor/requests`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const data = await res.json();
        const req = (data.requests || []).find((r: any) => r.id === requestId);
        if (!req) throw new Error('Request not found or not assigned to you');
        setData(req);
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
      finally { setLoading(false); }
    }
    fetchDetail();
  }, [requestId]);

  const updateCheck = async (checkId: string, status: string, result?: string, findings?: string) => {
    setUpdatingCheck(checkId);
    try {
      const body: Record<string, unknown> = { status };
      if (result !== undefined) body.result = result;
      if (findings !== undefined) body.findings = findings;
      const res = await fetch(`/api/vendor/requests/${requestId}/checks/${checkId}`, {
        method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Check updated');
      // Refresh data
      const refreshRes = await fetch('/api/vendor/requests', { headers: getAuthHeaders() });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        const req = (refreshData.requests || []).find((r: any) => r.id === requestId);
        if (req) setData(req);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setUpdatingCheck(null); }
  };

  const submitReport = async () => {
    if (!reportSummary.trim()) { toast.error('Summary required'); return; }
    setSubmittingReport(true);
    try {
      const res = await fetch(`/api/vendor/requests/${requestId}/submit-report`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ summary: reportSummary, overallResult: reportResult }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(data.message || 'Report submitted');
      router.push('/vendor-portal/dashboard');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setSubmittingReport(false); }
  };

  if (loading) return (<div className="min-h-screen flex items-center justify-center"><FiLoader className="h-8 w-8 animate-spin text-slate-600" /></div>);
  if (error || !data) return (<div className="min-h-screen p-6"><div className="max-w-3xl mx-auto bg-white rounded-xl p-8 text-center"><FiAlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" /><h2 className="text-xl font-bold">Error</h2><p className="text-slate-600 mt-2">{error || 'Not found'}</p><button onClick={() => router.push('/vendor-portal/dashboard')} className="mt-4 px-4 py-2 bg-slate-700 text-white rounded-lg">Back to Dashboard</button></div></div>);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-700 text-white">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <button onClick={() => router.push('/vendor-portal/dashboard')} className="flex items-center gap-2 text-slate-300 hover:text-white mb-2 text-sm"><FiArrowLeft /> Back to Dashboard</button>
          <h1 className="text-xl font-bold flex items-center gap-2"><FiShield className="h-5 w-5" /> BGV Request: {data.candidateName || data.candidateEmail}</h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Candidate Info */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-2">Candidate Information</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-500">Name:</span> {data.candidateName || '—'}</div>
            <div><span className="text-slate-500">Email:</span> {data.candidateEmail}</div>
            <div><span className="text-slate-500">Status:</span> {data.status}</div>
            {data.instructions && <div className="col-span-2"><span className="text-slate-500">Instructions:</span> {data.instructions}</div>}
          </div>
        </div>

        {/* Shared Documents */}
        {data.sharedDocuments && data.sharedDocuments.length > 0 && (
          <div className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold mb-2 flex items-center gap-2"><FiFileText className="h-4 w-4" /> Shared Documents ({data.sharedDocuments.length})</h2>
            <div className="space-y-2">
              {data.sharedDocuments.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 p-2 border rounded text-sm">
                  <FiFileText className="h-4 w-4 text-slate-400" />
                  <span>{doc.documentLabel || doc.documentType}</span>
                  {doc.fileUrl && <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs ml-auto">View</a>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verification Checks */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-3">Verification Checks ({data.checks?.length || 0})</h2>
          <div className="space-y-3">
            {data.checks?.map(check => (
              <div key={check.id} className="border rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-sm">{check.checkLabel || check.checkType}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${check.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : check.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{check.status}</span>
                </div>
                {check.result && <div className="text-xs mb-2"><span className="text-slate-500">Result:</span> <strong>{check.result}</strong></div>}
                {check.findings && <div className="text-xs mb-2 p-2 bg-slate-50 rounded">{check.findings}</div>}
                {data.status === 'assigned' || data.status === 'in_progress' ? (
                  <div className="flex gap-2 flex-wrap">
                    {check.status === 'pending' && <button onClick={() => updateCheck(check.id, 'in_progress')} disabled={updatingCheck === check.id} className="text-xs px-2 py-1 border rounded hover:bg-slate-50">Start</button>}
                    {check.status !== 'completed' && <>
                      <button onClick={() => { const f = prompt('Findings:'); updateCheck(check.id, 'completed', 'Clear', f || ''); }} disabled={updatingCheck === check.id} className="text-xs px-2 py-1 border rounded text-emerald-600 hover:bg-emerald-50">Mark Clear</button>
                      <button onClick={() => { const f = prompt('Discrepancy details:'); updateCheck(check.id, 'completed', 'Discrepancy Found', f || ''); }} disabled={updatingCheck === check.id} className="text-xs px-2 py-1 border rounded text-red-600 hover:bg-red-50">Discrepancy</button>
                      <button onClick={() => { const f = prompt('Unable to verify reason:'); updateCheck(check.id, 'completed', 'Unable to Verify', f || ''); }} disabled={updatingCheck === check.id} className="text-xs px-2 py-1 border rounded text-amber-600 hover:bg-amber-50">Unable to Verify</button>
                    </>}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Submit Report */}
        {(data.status === 'assigned' || data.status === 'in_progress') && (
          <div className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold mb-3 flex items-center gap-2"><FiSend className="h-4 w-4" /> Submit Final Report</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Summary</label>
                <textarea value={reportSummary} onChange={(e) => setReportSummary(e.target.value)} className="w-full min-h-[80px] px-3 py-2 border rounded text-sm" placeholder="Overall verification summary…" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Overall Result</label>
                <select value={reportResult} onChange={(e) => setReportResult(e.target.value)} className="w-full px-3 py-2 border rounded text-sm">
                  <option value="Clear">Clear</option>
                  <option value="Discrepancy Found">Discrepancy Found</option>
                  <option value="Unable to Verify">Unable to Verify</option>
                </select>
              </div>
              <button onClick={submitReport} disabled={submittingReport} className="w-full py-2.5 bg-slate-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                {submittingReport ? <FiLoader className="h-4 w-4 animate-spin" /> : <FiSend className="h-4 w-4" />} Submit Report to HR
              </button>
            </div>
          </div>
        )}

        {/* Submitted Reports */}
        {data.reports && data.reports.length > 0 && (
          <div className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold mb-2">Submitted Reports ({data.reports.length})</h2>
            {data.reports.map(r => (
              <div key={r.id} className="border rounded p-2 mb-2 text-sm">
                <div className="font-medium">Version {r.version} — {r.status}</div>
                {r.summary && <div className="text-xs text-slate-600 mt-1">{r.summary}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
