'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiCheckCircle, FiClock, FiXCircle, FiUpload, FiFileText, FiAlertCircle,
  FiRefreshCw, FiArrowLeft, FiShield, FiUser, FiAward, FiLoader, FiEye,
  FiCalendar, FiBriefcase,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getPortalHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_candidate_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface OnboardingDocument {
  id: string;
  documentType: string;
  documentLabel: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  status: string;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  uploadedAt?: string | null;
}

interface AttendanceRow {
  date: string | null;
  status: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  workHours: number | null;
  lateMinutes: number | null;
}

interface LeaveBalance {
  id: string;
  leaveTypeName: string;
  leaveTypeCode: string | null;
  year: number;
  total: number;
  used: number;
  remaining: number;
  carryForward: number;
}

interface OnboardingData {
  preboardingCandidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle?: string;
  department?: string;
  designation?: string;
  employmentType?: string;
  ctc?: number;
  workLocation?: string;
  joiningDate?: string;
  companyEmail?: string;
  onboardingStatus: string;
  bgvStatus: string;
  bgvNotes?: string;
  employeeId?: string;
  activatedAt?: string;
  documents: OnboardingDocument[];
  attendanceSummary?: { last30Days: Record<string, number>; totalRecords: number } | null;
  recentAttendance?: AttendanceRow[];
  leaveBalances?: LeaveBalance[] | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: <FiClock /> },
  submitted: { label: 'Submitted', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: <FiClock /> },
  approved: { label: 'Approved', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: <FiCheckCircle /> },
  rejected: { label: 'Rejected — Re-upload Required', color: 'text-red-600 bg-red-50 border-red-200', icon: <FiXCircle /> },
};

const ONBOARDING_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  bgv_pending: 'BGV Pending',
  provisional_employee: 'Provisional Employee',
  active_employee: 'Active Employee',
  bgv_failed: 'BGV Failed',
};

export default function CandidateOnboardingPage() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/candidate-portal/onboarding', { headers: getPortalHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (d.code === 'NOT_IN_ONBOARDING') {
          setError(d.error || 'You are not in the onboarding pipeline yet.');
        } else {
          throw new Error(d.error || `Failed (${res.status})`);
        }
        return;
      }
      const d = await res.json();
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load onboarding data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFileUpload = async (docId: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('File too large — maximum 10MB'); return; }
    setUploadingDocId(docId);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const res = await fetch('/api/onboarding/documents/upload', {
          method: 'POST', headers: getPortalHeaders(),
          body: JSON.stringify({ documentId: docId, fileDataUrl: dataUrl, fileName: file.name, fileSize: file.size, mimeType: file.type }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Upload failed');
        toast.success(`Document uploaded: ${file.name}`);
        fetchData();
      };
      reader.onerror = () => toast.error('Could not read file');
      reader.readAsDataURL(file);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingDocId(null);
    }
  };

  const handleViewDocument = (doc: OnboardingDocument) => {
    if (!doc.fileUrl) return;
    const win = window.open();
    if (win) { win.document.write(`<iframe src="${doc.fileUrl}" style="width:100%;height:100vh;border:none;"></iframe>`); }
  };

  if (loading) {
    return (<div className="min-h-screen bg-slate-50 flex items-center justify-center"><FiLoader className="h-8 w-8 animate-spin text-emerald-500" /></div>);
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg p-8 text-center">
          <FiAlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Onboarding Not Started</h2>
          <p className="text-slate-600 mb-4">{error || 'You are not in the onboarding pipeline yet.'}</p>
          <button onClick={() => router.push('/candidate-portal/dashboard')} className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const approvedDocs = data.documents.filter(d => d.status === 'approved').length;
  const totalDocs = data.documents.length;
  const progressPct = totalDocs > 0 ? Math.round((approvedDocs / totalDocs) * 100) : 0;

  const showAttendanceLeave = data.onboardingStatus === 'provisional_employee' || data.onboardingStatus === 'active_employee';

  // Attendance helpers
  const att = data.attendanceSummary?.last30Days || {};
  const presentDays = att['present'] || 0;
  const lateDays = att['late'] || 0;
  const absentDays = att['absent'] || 0;
  const halfDays = att['half_day'] || att['half-day'] || 0;
  const onLeaveDays = att['on_leave'] || att['leave'] || 0;
  const weekendDays = att['weekend'] || 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <button onClick={() => router.push('/candidate-portal/dashboard')} className="flex items-center gap-2 text-emerald-100 hover:text-white mb-4 text-sm"><FiArrowLeft /> Back to Dashboard</button>
          <h1 className="text-2xl font-bold flex items-center gap-3"><FiShield className="h-7 w-7" /> Onboarding</h1>
          <p className="text-emerald-100 mt-1">Welcome, {data.candidateName}! Here&apos;s your onboarding progress.</p>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Status Banner */}
        <div className={`rounded-xl border-2 p-4 ${data.onboardingStatus === 'active_employee' ? 'border-emerald-300 bg-emerald-50' : data.onboardingStatus === 'provisional_employee' ? 'border-blue-300 bg-blue-50' : data.onboardingStatus === 'bgv_failed' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
          <div className="flex items-center gap-3">
            {data.onboardingStatus === 'active_employee' ? <FiCheckCircle className="h-6 w-6 text-emerald-600" /> : data.onboardingStatus === 'provisional_employee' ? <FiClock className="h-6 w-6 text-blue-600" /> : data.onboardingStatus === 'bgv_failed' ? <FiXCircle className="h-6 w-6 text-red-600" /> : <FiShield className="h-6 w-6 text-amber-600" />}
            <div>
              <div className="font-bold text-slate-800">Status: {ONBOARDING_STATUS_LABELS[data.onboardingStatus] || data.onboardingStatus}</div>
              <div className="text-sm text-slate-600">{data.onboardingStatus === 'active_employee' && data.employeeId ? `Your Employee ID is ${data.employeeId}. Full access activated!` : data.onboardingStatus === 'provisional_employee' ? 'You have provisional access to attendance and leave. Full access after BGV approval.' : data.onboardingStatus === 'bgv_failed' ? 'Background verification has failed. Please contact HR.' : 'Your Employee ID will be assigned after BGV approval.'}</div>
            </div>
          </div>
        </div>

        {/* Employment Details */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><FiUser className="h-5 w-5 text-emerald-600" /> Employment Details {data.onboardingStatus !== 'active_employee' && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending Activation</span>}</h2>
          </div>
          <div className="px-6 py-4 grid grid-cols-2 gap-4 text-sm">
            <Detail label="Position" value={data.jobTitle || '—'} />
            <Detail label="Department" value={data.department || '—'} />
            <Detail label="Designation" value={data.designation || '—'} />
            <Detail label="Employment Type" value={data.employmentType || '—'} />
            <Detail label="CTC" value={data.ctc ? `\u20B9${data.ctc.toLocaleString('en-IN')}` : '—'} />
            <Detail label="Work Location" value={data.workLocation || '—'} />
            <Detail label="Joining Date" value={data.joiningDate ? new Date(data.joiningDate).toLocaleDateString('en-IN') : '—'} />
            <Detail label="Company Email" value={data.companyEmail || 'Will be assigned'} />
            <Detail label="Employee ID" value={data.employeeId && !data.employeeId.startsWith('PROV-') ? data.employeeId : 'Will be assigned after BGV'} />
          </div>
        </div>

        {/* BGV Status */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200"><h2 className="font-bold text-slate-800 flex items-center gap-2"><FiShield className="h-5 w-5 text-emerald-600" /> Background Verification (BGV)</h2></div>
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-2"><span className="text-sm text-slate-600">BGV Status:</span><span className={`font-semibold capitalize ${data.bgvStatus === 'cleared' || data.bgvStatus === 'approved' ? 'text-emerald-600' : data.bgvStatus === 'failed' ? 'text-red-600' : data.bgvStatus === 'in_progress' ? 'text-blue-600' : 'text-amber-600'}`}>{data.bgvStatus || 'pending'}</span></div>
            {data.bgvNotes && <div className="text-sm text-slate-600 mt-2 p-3 bg-slate-50 rounded-lg"><strong>Notes:</strong> {data.bgvNotes}</div>}
          </div>
        </div>

        {/* Attendance + Leave (only when provisional or active) */}
        {showAttendanceLeave && (
          <>
            {/* Attendance Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-bold text-slate-800 flex items-center gap-2"><FiCalendar className="h-5 w-5 text-emerald-600" /> Attendance — Last 30 Days</h2>
                <span className="text-xs text-slate-500">{data.attendanceSummary?.totalRecords || 0} records</span>
              </div>
              <div className="px-6 py-4">
                {data.attendanceSummary && data.attendanceSummary.totalRecords > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
                      <StatCard label="Present" value={presentDays} color="text-emerald-600 bg-emerald-50" />
                      <StatCard label="Late" value={lateDays} color="text-amber-600 bg-amber-50" />
                      <StatCard label="Half Day" value={halfDays} color="text-yellow-600 bg-yellow-50" />
                      <StatCard label="Absent" value={absentDays} color="text-red-600 bg-red-50" />
                      <StatCard label="On Leave" value={onLeaveDays} color="text-blue-600 bg-blue-50" />
                    </div>
                    {data.recentAttendance && data.recentAttendance.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-700 mb-2">Recent Records</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-100 text-slate-600">
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Status</th>
                                <th className="px-3 py-2 text-left">Check In</th>
                                <th className="px-3 py-2 text-left">Check Out</th>
                                <th className="px-3 py-2 text-left">Work Hours</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.recentAttendance.slice(0, 10).map((row, i) => (
                                <tr key={i} className="border-b border-slate-100">
                                  <td className="px-3 py-2 text-slate-700">{row.date ? new Date(row.date).toLocaleDateString('en-IN') : '—'}</td>
                                  <td className="px-3 py-2 capitalize">{row.status || '—'}</td>
                                  <td className="px-3 py-2">{row.checkInTime || '—'}</td>
                                  <td className="px-3 py-2">{row.checkOutTime || '—'}</td>
                                  <td className="px-3 py-2">{row.workHours ? `${row.workHours}h` : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-slate-500 text-center py-4">
                    No attendance records yet. Your attendance will appear here once HR sets up your roster.
                  </div>
                )}
              </div>
            </div>

            {/* Leave Balances */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200"><h2 className="font-bold text-slate-800 flex items-center gap-2"><FiBriefcase className="h-5 w-5 text-emerald-600" /> Leave Balances — {new Date().getFullYear()}</h2></div>
              <div className="px-6 py-4">
                {data.leaveBalances && data.leaveBalances.length > 0 ? (
                  <div className="space-y-3">
                    {data.leaveBalances.map((lb) => {
                      const usedPct = lb.total > 0 ? Math.round((lb.used / lb.total) * 100) : 0;
                      return (
                        <div key={lb.id} className="border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-medium text-slate-800 text-sm">{lb.leaveTypeName}</div>
                            <div className="text-xs text-slate-500">{lb.remaining} / {lb.total} days left</div>
                          </div>
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${100 - usedPct}%` }} />
                          </div>
                          <div className="flex justify-between mt-1 text-xs text-slate-500">
                            <span>Used: {lb.used}</span>
                            <span>Carry Forward: {lb.carryForward}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 text-center py-4">
                    No leave balances allocated yet. They will be assigned when HR completes your profile.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Document Upload */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><FiFileText className="h-5 w-5 text-emerald-600" /> Required Documents</h2>
            <div className="text-sm text-slate-600">{approvedDocs} of {totalDocs} approved ({progressPct}%)</div>
          </div>
          <div className="px-6 pt-2"><div className="h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progressPct}%` }} /></div></div>
          <div className="px-6 py-4 space-y-3">
            {data.documents.map((doc) => {
              const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
              return (
                <div key={doc.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${doc.status === 'approved' ? 'bg-emerald-100 text-emerald-600' : doc.status === 'rejected' ? 'bg-red-100 text-red-600' : doc.status === 'submitted' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}><FiFileText className="h-5 w-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 text-sm">{doc.documentLabel}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-2">{doc.fileName && <span>{doc.fileName}</span>}{doc.uploadedAt && <span>· {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}</span>}</div>
                    {doc.reviewNotes && <div className="text-xs text-red-600 mt-1">HR Note: {doc.reviewNotes}</div>}
                  </div>
                  <div className={`text-xs font-medium px-2 py-1 rounded-full border ${cfg.color} flex items-center gap-1 shrink-0`}>{cfg.icon} {cfg.label}</div>
                  {doc.fileUrl && doc.status !== 'pending' && <button onClick={() => handleViewDocument(doc)} className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="View uploaded document"><FiEye className="h-4 w-4" /></button>}
                  {(doc.status === 'pending' || doc.status === 'rejected') && (
                    <label className="cursor-pointer">
                      <span className={`inline-flex items-center px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${uploadingDocId === doc.id ? 'bg-slate-200 text-slate-400' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>
                        {uploadingDocId === doc.id ? <><FiLoader className="h-3 w-3 mr-1 animate-spin" /> Uploading...</> : <><FiUpload className="h-3 w-3 mr-1" /> {doc.status === 'rejected' ? 'Re-upload' : 'Upload'}</>}
                      </span>
                      <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" disabled={uploadingDocId === doc.id} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(doc.id, file); }} />
                    </label>
                  )}
                </div>
              );
            })}
            {data.documents.length === 0 && <div className="text-center py-6 text-slate-500 text-sm">No documents required yet. HR will configure them shortly.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (<div><div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div><div className="font-medium text-slate-800 mt-0.5">{value}</div></div>);
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg p-3 ${color}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
