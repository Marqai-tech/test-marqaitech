'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { FiBookOpen, FiAward, FiUsers, FiTrendingUp, FiCheckCircle, FiClock, FiAlertTriangle, FiFileText, FiArrowRight, FiTarget, FiShield } from 'react-icons/fi';
import ModuleTips from '@/components/ModuleTips';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface DashboardData {
  admin: { courseCount: number; pathCount: number; totalEnrollments: number; byStatus: Record<string, number>; certCount: number; activeCompliance: number; pendingRequests: number; openSkillGaps: number; publishedSignoffs: number };
  employee: { myLearning: { id: string; status: string; progress: number; dueDate: string | null; course: { id: string; title: string; category: string; mode: string; durationHours: number } }[]; myCertCount: number; myPendingSignoffs: number };
  manager: { teamPendingRequests: number };
  role: string;
}

const KPI = ({ icon, label, value, sub, tone = 'emerald' }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; tone?: string }) => (
  <div className="thb-card p-4 flex items-start gap-3">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0 bg-${tone}-500`}>{icon}</div>
    <div className="min-w-0">
      <div className="text-2xl font-bold thb-text-primary">{value}</div>
      <div className="text-xs thb-text-secondary font-medium">{label}</div>
      {sub ? <div className="text-[11px] thb-text-muted mt-0.5">{sub}</div> : null}
    </div>
  </div>
);

const HUB_LINKS = [
  { href: '/learning/catalog', label: 'Course Catalog', desc: 'Content hub: e-learning, documents, quizzes, external links', icon: <FiBookOpen /> },
  { href: '/learning/paths', label: 'Learning Paths', desc: 'Onboarding, compliance & promotion-track sequences', icon: <FiTarget /> },
  { href: '/learning/enrollments', label: 'Assignments & Enrolment', desc: 'Assign to individuals, teams or departments with deadlines', icon: <FiUsers /> },
  { href: '/learning/requests', label: 'Course Requests', desc: 'TNI nominations, supervisor approvals, budgets', icon: <FiCheckCircle /> },
  { href: '/learning/certifications', label: 'Certifications', desc: 'Digital certificates, validity & renewal alerts', icon: <FiAward /> },
  { href: '/learning/compliance', label: 'Compliance Center', desc: 'POSH / cybersecurity tracks, sign-offs, audit export', icon: <FiShield /> },
  { href: '/learning/analytics', label: 'Analytics & ROI', desc: 'Kirkpatrick 4-level evaluation, training ROI', icon: <FiTrendingUp /> },
];

export default function LearningHubPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_manager'].includes(user?.role || '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/learning/dashboard', { headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      setData(j.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load L&D dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const startCourse = async (id: string) => {
    try {
      const res = await fetch(`/api/learning/enrollments/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ action: 'start' }) });
      if (!res.ok) throw new Error('Failed');
      toast.success('Course started — continue from My Learning');
      load();
    } catch { toast.error('Could not start course'); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold thb-text-primary flex items-center gap-2"><FiBookOpen className="text-emerald-500" /> Learning &amp; Development</h1>
          <p className="text-sm thb-text-secondary mt-1">Upskilling, compliance tracking and professional growth through an automated digital workflow.</p>
        </div>
        {isAdmin && <Link href="/learning/catalog" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition">Manage Catalog <FiArrowRight /></Link>}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="thb-card h-24 animate-pulse" />)}</div>
      ) : data ? (
        <>
          {/* Employee self-service panel */}
          {data.employee.myLearning.length > 0 || data.employee.myCertCount > 0 ? (
            <div className="thb-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold thb-text-primary flex items-center gap-2"><FiClock className="text-emerald-500" /> My Learning</h2>
                <span className="text-xs thb-text-secondary">{data.employee.myCertCount} active certificate{data.employee.myCertCount === 1 ? '' : 's'} · {data.employee.myPendingSignoffs} signature{data.employee.myPendingSignoffs === 1 ? '' : 's'} pending</span>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {data.employee.myLearning.length === 0 ? <p className="text-sm thb-text-muted py-4 text-center">No assigned courses pending — browse the catalog to request training.</p> :
                  data.employee.myLearning.map((e) => (
                    <div key={e.id} className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between p-3 rounded-lg border thb-border">
                      <div className="min-w-0">
                        <div className="text-sm font-medium thb-text-primary truncate">{e.course?.title}</div>
                        <div className="text-[11px] thb-text-secondary">{e.course?.category} · {e.course?.mode} · {e.course?.durationHours}h {e.dueDate ? `· due ${new Date(e.dueDate).toLocaleDateString('en-IN')}` : ''}</div>
                        <div className="mt-1.5 h-1.5 w-40 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${e.progress}%` }} /></div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`thb-badge ${e.status === 'in_progress' ? 'thb-badge-info' : 'thb-badge-warning'}`}>{e.status.replace('_', ' ')}</span>
                        <button onClick={() => startCourse(e.id)} className="px-3 py-1.5 text-xs rounded-md bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100">{e.progress > 0 ? 'Continue' : 'Start'}</button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          {/* Admin KPIs */}
          {isAdmin ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPI icon={<FiBookOpen size={18} />} label="Published courses" value={data.admin.courseCount} sub={`${data.admin.pathCount} learning paths`} />
              <KPI icon={<FiUsers size={18} />} label="Enrolments" value={data.admin.totalEnrollments} sub={`${data.admin.byStatus.completed || 0} completed · ${data.admin.byStatus.in_progress || 0} in progress`} tone="violet" />
              <KPI icon={<FiAward size={18} />} label="Certificates issued" value={data.admin.certCount} sub="auto-issued on passing assessments" tone="amber" />
              <KPI icon={<FiShield size={18} />} label="Compliance tracks" value={data.admin.activeCompliance} sub={`${data.admin.pendingRequests} requests pending`} tone="rose" />
            </div>
          ) : null}

          {(isAdmin || data.manager.teamPendingRequests > 0) && (data.admin.pendingRequests > 0 || data.admin.openSkillGaps > 0 || data.manager.teamPendingRequests > 0) ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.admin.pendingRequests > 0 && isAdmin ? (
                <Link href="/learning/requests" className="thb-card p-4 flex items-center gap-3 hover:border-emerald-400 transition group">
                  <FiAlertTriangle className="text-amber-500 text-xl" />
                  <div className="flex-1"><div className="text-sm font-semibold thb-text-primary">{data.admin.pendingRequests} course request{data.admin.pendingRequests === 1 ? '' : 's'} awaiting approval</div><div className="text-xs thb-text-secondary">Review nominations &amp; budgets</div></div>
                  <FiArrowRight className="thb-text-muted group-hover:translate-x-0.5 transition" />
                </Link>
              ) : null}
              {data.admin.openSkillGaps > 0 && isAdmin ? (
                <Link href="/learning/enrollments" className="thb-card p-4 flex items-center gap-3 hover:border-emerald-400 transition group">
                  <FiTarget className="text-violet-500 text-xl" />
                  <div className="flex-1"><div className="text-sm font-semibold thb-text-primary">{data.admin.openSkillGaps} open skill gap{data.admin.openSkillGaps === 1 ? '' : 's'}</div><div className="text-xs thb-text-secondary">From performance reviews (TNI)</div></div>
                  <FiArrowRight className="thb-text-muted group-hover:translate-x-0.5 transition" />
                </Link>
              ) : null}
              {data.manager.teamPendingRequests > 0 ? (
                <Link href="/learning/requests" className="thb-card p-4 flex items-center gap-3 hover:border-emerald-400 transition group">
                  <FiUsers className="text-emerald-500 text-xl" />
                  <div className="flex-1"><div className="text-sm font-semibold thb-text-primary">{data.manager.teamPendingRequests} team request{data.manager.teamPendingRequests === 1 ? '' : 's'} to approve</div><div className="text-xs thb-text-secondary">As direct supervisor</div></div>
                  <FiArrowRight className="thb-text-muted group-hover:translate-x-0.5 transition" />
                </Link>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {/* Module navigation */}
      <div>
        <h2 className="text-sm font-semibold thb-text-secondary uppercase tracking-wide mb-3">L&amp;D Modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {HUB_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="thb-card p-5 hover:border-emerald-400 hover:shadow-sm transition group">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">{l.icon}</div>
                <div>
                  <div className="font-semibold text-sm thb-text-primary flex items-center gap-1">{l.label} <FiArrowRight className="opacity-0 group-hover:opacity-100 transition text-emerald-500" /></div>
                  <p className="text-xs thb-text-secondary mt-1 leading-relaxed">{l.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Workflow */}
      <div className="thb-card p-5">
        <h2 className="font-semibold thb-text-primary mb-3 flex items-center gap-2"><FiFileText className="text-emerald-500" /> L&amp;D Workflow</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {['TNI: skill gap identified', 'Course nomination', 'Supervisor / L&D approval', 'Auto-enrolment & calendar invite', 'Delivery & participation', 'Assessment & certification', 'Feedback & ROI evaluation', 'Skill record updated'].map((s, i) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className={`px-3 py-1.5 rounded-full font-medium ${i === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 thb-text-secondary'}`}>{i + 1}. {s}</span>
              {i < 7 ? <FiArrowRight className="thb-text-muted" /> : null}
            </span>
          ))}
        </div>
      </div>

      <ModuleTips moduleKey="learning" userRole={user?.role} />
    </div>
  );
}
