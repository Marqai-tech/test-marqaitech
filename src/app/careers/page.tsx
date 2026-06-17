'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import {
  FiSearch, FiMapPin, FiBriefcase, FiClock, FiArrowRight,
  FiUsers, FiTrendingUp, FiCheckCircle, FiX, FiUpload,
  FiMail, FiPhone, FiUser, FiDollarSign, FiFileText,
  FiHeart, FiShare2, FiChevronRight, FiExternalLink,
  FiGrid, FiZap, FiAward, FiTarget, FiLayers,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/* ──────────────────────────────────────────────────────────────────── */
/* Types                                                                */
/* ──────────────────────────────────────────────────────────────────── */
interface PublicJob {
  id: string;
  title: string;
  position: string;
  location?: string | null;
  type: string;
  experience?: string | null;
  salary?: string | null;
  description: string;
  requirements?: string | null;
  vacancies: number;
  postedDate: string;
  closingDate?: string | null;
  applicants: number;
  department: { id: string; name: string } | null;
  company: {
    id: string; name: string; code: string | null;
    city?: string | null; country?: string | null;
  } | null;
  tenant: { id: string; name: string; slug: string } | null;
  group: { id: string; name: string } | null;
}

interface ApplyFormState {
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  coverLetter: string;
  expectedSalary: string;
  resumeDataUrl: string;
  resumeFileName: string;
  source: string;
}

const EMPTY_FORM: ApplyFormState = {
  candidateName: '',
  candidateEmail: '',
  candidatePhone: '',
  coverLetter: '',
  expectedSalary: '',
  resumeDataUrl: '',
  resumeFileName: '',
  source: 'website',
};

const JOB_TYPE_LABELS: Record<string, string> = {
  'full-time': 'Full Time',
  'part-time': 'Part Time',
  contract: 'Contract',
  internship: 'Internship',
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ──────────────────────────────────────────────────────────────────── */
/* Page                                                                 */
/* ──────────────────────────────────────────────────────────────────── */
export default function CareersPage() {
  const router = useRouter();
  const params = useParams<{ tenantSlug?: string }>();
  // tenantSlug from /careers/[tenantSlug]/... — undefined on the main /careers page
  const tenantSlug = params?.tenantSlug;
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [showApply, setShowApply] = useState(false);
  const [applyJob, setApplyJob] = useState<PublicJob | null>(null);
  const [form, setForm] = useState<ApplyFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  /* ── Role-based scoping state ──
   * The job portal is public, but if a logged-in user opens it we honor
   * their role:
   *   - super_admin  → see ALL jobs across every tenant
   *   - tenant_admin → see ONLY their own tenant's jobs
   *   - other roles  → see ONLY their own tenant's jobs (same as tenant_admin)
   *   - not logged in → see ALL jobs (default public behavior)
   *
   * The URL path /careers/[tenantSlug] always wins — it forces the filter
   * to that tenant regardless of who's viewing. This lets each tenant
   * company embed `/careers/<their-slug>` on their own website.
   */
  const [scopeInfo, setScopeInfo] = useState<{
    checked: boolean;
    userRole: string | null;
    userTenantSlug: string | null;
    userTenantName: string | null;
    effectiveTenantSlug: string | null; // what we actually filter by
  }>({
    checked: false,
    userRole: null,
    userTenantSlug: null,
    userTenantName: null,
    effectiveTenantSlug: null,
  });

  // Determine the effective tenant slug to filter by:
  //   1. If the URL has /careers/[tenantSlug], use that (highest priority — tenant embeds)
  //   2. If a logged-in user is tenant_admin / non-super-admin, use their tenant slug
  //   3. If a logged-in user is super_admin, no filter (see all jobs)
  //   4. If not logged in, no filter (see all jobs)
  //   5. If on a tenant subdomain (detected via x-tenant-slug header from middleware),
  //      use that — this lets tenants embed the careers portal on their own subdomain
  useEffect(() => {
    let cancelled = false;
    async function detectScope() {
      // Case 1: URL path wins
      if (tenantSlug) {
        setScopeInfo({
          checked: true,
          userRole: null,
          userTenantSlug: null,
          userTenantName: null,
          effectiveTenantSlug: tenantSlug,
        });
        return;
      }

      // Case 5: Try hostname-based detection via the middleware-set header.
      // We do a fetch to a no-op endpoint and read the response header to
      // learn what subdomain the middleware detected. (We can't read
      // request headers directly from a client component.)
      let subdomainTenantSlug: string | null = null;
      try {
        // A lightweight probe — same origin, just to read response headers.
        const probe = await fetch('/api/public/jobs?limit=1', { method: 'GET' });
        // The middleware sets x-tenant-slug on every response too — but browsers
        // strip most custom headers. As a fallback, we expose tenant slug via a
        // custom response header that is in the CORS safe-list.
        subdomainTenantSlug = probe.headers.get('x-tenant-slug') || null;
      } catch {
        subdomainTenantSlug = null;
      }

      // Case 2-4: Check if user is logged in
      const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
      if (!token) {
        setScopeInfo({
          checked: true,
          userRole: null,
          userTenantSlug: null,
          userTenantName: null,
          effectiveTenantSlug: subdomainTenantSlug,
        });
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          // Token invalid — treat as not logged in (still honor subdomain)
          setScopeInfo({
            checked: true,
            userRole: null,
            userTenantSlug: null,
            userTenantName: null,
            effectiveTenantSlug: subdomainTenantSlug,
          });
          return;
        }
        const user = await res.json();
        const role = (user.role || '').toLowerCase();
        const tSlug = user.tenant?.slug || null;
        const tName = user.tenant?.name || null;
        // super_admin: no filter (all jobs). Everyone else: filter to own tenant.
        // Subdomain detection is overridden by an authenticated user's own tenant
        // (so a logged-in tenant_admin visiting another tenant's subdomain still
        // sees only their own tenant's jobs).
        let effective: string | null;
        if (role === 'super_admin') {
          effective = null;
        } else if (tSlug) {
          effective = tSlug;
        } else {
          effective = subdomainTenantSlug;
        }
        if (!cancelled) {
          setScopeInfo({
            checked: true,
            userRole: role,
            userTenantSlug: tSlug,
            userTenantName: tName,
            effectiveTenantSlug: effective,
          });
        }
      } catch {
        setScopeInfo({
          checked: true,
          userRole: null,
          userTenantSlug: null,
          userTenantName: null,
          effectiveTenantSlug: subdomainTenantSlug,
        });
      }
    }
    detectScope();
    return () => { cancelled = true; };
  }, [tenantSlug]);

  /* ── Fetch jobs ── */
  const fetchJobs = useCallback(async () => {
    // Wait until scope detection has completed so we know whether to filter by tenant
    if (!scopeInfo.checked) return;
    setLoading(true);
    try {
      const p = new URLSearchParams();
      // Apply the effective tenant slug (from URL or logged-in user's tenant)
      if (scopeInfo.effectiveTenantSlug) p.set('tenantSlug', scopeInfo.effectiveTenantSlug);
      if (search) p.set('search', search);
      if (typeFilter) p.set('type', typeFilter);
      if (locationFilter) p.set('location', locationFilter);
      p.set('limit', '50');
      const res = await fetch(`/api/public/jobs?${p.toString()}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [scopeInfo.checked, scopeInfo.effectiveTenantSlug, search, typeFilter, locationFilter]);

  useEffect(() => {
    const t = setTimeout(() => fetchJobs(), 250); // debounce
    return () => clearTimeout(t);
  }, [fetchJobs]);

  /* ── Derived: unique companies + locations for filter dropdowns ── */
  const companies = useMemo(() => {
    const m = new Map<string, string>();
    jobs.forEach((j) => { if (j.company) m.set(j.company.id, j.company.name); });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [jobs]);

  const locations = useMemo(() => {
    const s = new Set<string>();
    jobs.forEach((j) => { if (j.location) s.add(j.location); });
    return Array.from(s).sort();
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (companyFilter && j.company?.id !== companyFilter) return false;
      return true;
    });
  }, [jobs, companyFilter]);

  /* ── Apply modal handlers ── */
  const openApply = (job: PublicJob) => {
    setApplyJob(job);
    setForm(EMPTY_FORM);
    setShowApply(true);
  };
  const closeApply = () => {
    setShowApply(false);
    setApplyJob(null);
    setForm(EMPTY_FORM);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Resume must be under 5 MB');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((f) => ({ ...f, resumeDataUrl: dataUrl, resumeFileName: file.name }));
      toast.success(`Loaded: ${file.name}`);
    } catch {
      toast.error('Failed to read file');
    }
  };

  const handleSubmitApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyJob) return;
    if (!form.candidateName.trim() || !form.candidateEmail.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.candidateEmail)) {
      toast.error('Please enter a valid email');
      return;
    }
    if (!form.resumeDataUrl) {
      toast.error('Please attach your resume');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/public/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobPostingId: applyJob.id,
          ...form,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          toast.success(data.error || "You've already applied — we'll be in touch!");
          closeApply();
          return;
        }
        throw new Error(data.error || 'Failed to submit');
      }
      toast.success(data.message || 'Application submitted successfully!');
      closeApply();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Stats for hero ── */
  const totalOpen = jobs.length;
  const totalCompanies = companies.length;
  const totalApplicants = jobs.reduce((s, j) => s + (j.applicants || 0), 0);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ───────────── Top Navigation ───────────── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
              <FiBriefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-extrabold text-base leading-tight">3 Boxes HRMS</p>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Career Portal</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#openings" className="hover:text-indigo-600 transition-colors">Openings</a>
            <a href="#companies" className="hover:text-indigo-600 transition-colors">Companies</a>
            <a href="#why" className="hover:text-indigo-600 transition-colors">Why Join Us</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:text-indigo-600 transition-colors"
            >
              Sign In <FiExternalLink className="w-3.5 h-3.5" />
            </Link>
            <a
              href="#openings"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:shadow-lg hover:shadow-indigo-500/30 transition-all"
            >
              Browse Jobs <FiArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* ───────────── Hero ───────────── */}
      <section className="relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl" />
          <div className="absolute -top-40 right-0 w-[28rem] h-[28rem] bg-violet-200/40 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold ring-1 ring-indigo-200 mb-5">
              <FiZap className="w-3.5 h-3.5" /> {totalOpen} open positions across {totalCompanies} companies
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] mb-5">
              Find the work <br />
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
                that moves you.
              </span>
            </h1>
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto mb-8">
              {scopeInfo.effectiveTenantSlug
                ? `Browse open roles at ${scopeInfo.userTenantName || 'this company'}, upload your resume, and apply in seconds. No account required — your application goes straight to the hiring team.`
                : `Browse open roles across all our group companies, upload your resume once, and apply in seconds. No account required — your application goes straight to the hiring team.`}
            </p>

            {/* Scope badge — shows whether the viewer is seeing all jobs or just one tenant's jobs */}
            {scopeInfo.checked && (
              <div className="mb-6">
                {scopeInfo.effectiveTenantSlug ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 text-violet-700 text-[11px] font-semibold ring-1 ring-violet-200">
                    <FiLayers className="w-3 h-3" />
                    {scopeInfo.userRole
                      ? `Scoped to your tenant: ${scopeInfo.userTenantName || scopeInfo.effectiveTenantSlug}`
                      : `Scoped to tenant: ${scopeInfo.effectiveTenantSlug}`}
                  </span>
                ) : scopeInfo.userRole === 'super_admin' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold ring-1 ring-emerald-200">
                    <FiUsers className="w-3 h-3" /> Super Admin view — showing ALL tenants' openings
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 text-slate-600 text-[11px] font-semibold ring-1 ring-slate-200">
                    <FiGrid className="w-3 h-3" /> Showing openings across all companies
                  </span>
                )}
              </div>
            )}

            {/* Search bar */}
            <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 ring-1 ring-slate-200 p-2 max-w-2xl mx-auto flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center gap-2 px-3">
                <FiSearch className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Job title, keyword, or company"
                  className="w-full py-2.5 text-sm outline-none placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-center gap-2 px-3 sm:border-l border-slate-200">
                <FiMapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  placeholder="Location"
                  className="w-full sm:w-32 py-2.5 text-sm outline-none placeholder:text-slate-400"
                />
              </div>
              <button
                onClick={() => fetchJobs()}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:shadow-lg hover:shadow-indigo-500/30 transition-all"
              >
                Search <FiArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mt-10">
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-extrabold text-indigo-600">{totalOpen}</p>
                <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Open Roles</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-extrabold text-violet-600">{totalCompanies}</p>
                <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Companies</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-extrabold text-purple-600">{totalApplicants}</p>
                <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Applicants</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── Job Filters ───────────── */}
      <section id="openings" className="border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Open Positions</h2>
              <p className="text-sm text-slate-500 mt-1">
                Showing <b>{filteredJobs.length}</b> {filteredJobs.length === 1 ? 'role' : 'roles'}
                {companyFilter && <span> filtered by <b>{companies.find((c) => c.id === companyFilter)?.name}</b></span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              >
                <option value="">All types</option>
                {Object.entries(JOB_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              >
                <option value="">All companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Job grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 animate-pulse">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-slate-200 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-20 bg-slate-200 rounded" />
                      <div className="h-4 w-32 bg-slate-100 rounded" />
                    </div>
                  </div>
                  <div className="h-4 w-3/4 bg-slate-100 rounded mb-2" />
                  <div className="h-3 w-full bg-slate-50 rounded mb-1" />
                  <div className="h-3 w-5/6 bg-slate-50 rounded" />
                  <div className="flex gap-2 mt-4">
                    <div className="h-6 w-16 bg-slate-100 rounded-full" />
                    <div className="h-6 w-20 bg-slate-100 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <FiBriefcase className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-lg font-semibold text-slate-700">No open positions match your search</p>
              <p className="text-sm text-slate-500 mt-1">Try clearing filters or check back soon — new roles open weekly.</p>
              <button
                onClick={() => { setSearch(''); setTypeFilter(''); setLocationFilter(''); setCompanyFilter(''); }}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                <FiX className="w-3.5 h-3.5" /> Clear all filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredJobs.map((job) => (
                <JobCard key={job.id} job={job} onApply={() => openApply(job)} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ───────────── Companies section ───────────── */}
      {companies.length > 0 && (
        <section id="companies" className="bg-slate-50 border-t border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Hiring Companies</h2>
              <p className="text-sm text-slate-500 mt-1.5">
                Roles across our family of companies — pick the team that fits you best.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {companies.map((c) => {
                const count = jobs.filter((j) => j.company?.id === c.id).length;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCompanyFilter(c.id)}
                    className="text-left bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-md transition-all"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold mb-3">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{count} open {count === 1 ? 'role' : 'roles'}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ───────────── Why Join Us ───────────── */}
      <section id="why" className="bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 text-violet-700 text-xs font-semibold ring-1 ring-violet-200 mb-4">
              <FiAward className="w-3.5 h-3.5" /> Why candidates choose us
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">More than just a job</h2>
            <p className="text-sm text-slate-500 mt-2">
              From day one, you'll join a culture built on growth, ownership, and impact.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: FiTrendingUp, title: 'Fast Growth', desc: 'Clear career paths and promotion cycles — most team leads were promoted from within.', color: 'from-emerald-500 to-teal-600' },
              { icon: FiUsers, title: 'Mentorship', desc: 'Every new hire is paired with a senior mentor for their first 90 days.', color: 'from-indigo-500 to-violet-600' },
              { icon: FiTarget, title: 'Real Impact', desc: 'Work on production systems from week one — no busy work, no make-work projects.', color: 'from-amber-500 to-orange-600' },
              { icon: FiHeart, title: 'Wellness First', desc: 'Flexible hours, remote-friendly, comprehensive health coverage, and generous PTO.', color: 'from-pink-500 to-rose-600' },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${f.color} flex items-center justify-center text-white mb-3`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="font-bold text-slate-900">{f.title}</p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────────── Footer ───────────── */}
      <footer className="bg-slate-900 text-slate-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <FiBriefcase className="w-4 h-4 text-white" />
                </div>
                <p className="font-extrabold text-white">3 Boxes HRMS</p>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                A unified talent platform connecting candidates with opportunities across
                our group companies. Apply once — get considered across all open roles.
              </p>
            </div>
            <div>
              <p className="font-semibold text-white text-sm mb-3">For Candidates</p>
              <ul className="space-y-2 text-xs">
                <li><a href="#openings" className="hover:text-white transition-colors">Browse Openings</a></li>
                <li><a href="#companies" className="hover:text-white transition-colors">Hiring Companies</a></li>
                <li><a href="#why" className="hover:text-white transition-colors">Why Join Us</a></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Sign In to Portal</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-white text-sm mb-3">For Employers</p>
              <ul className="space-y-2 text-xs">
                <li><Link href="/login" className="hover:text-white transition-colors">Post a Job</Link></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Review Applications</Link></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Schedule Interviews</Link></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Tenant Admin Console</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-slate-500">© {new Date().getFullYear()} 3 Boxes HRMS — Career Portal. All rights reserved.</p>
            <p className="text-xs text-slate-500">Powered by 3 Boxes HRMS</p>
          </div>
        </div>
      </footer>

      {/* ───────────── Apply Modal ───────────── */}
      {showApply && applyJob && (
        <ApplyModal
          job={applyJob}
          form={form}
          setForm={setForm}
          onClose={closeApply}
          onSubmit={handleSubmitApply}
          onFileChange={handleFileChange}
          submitting={submitting}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* Job Card                                                             */
/* ──────────────────────────────────────────────────────────────────── */
function JobCard({ job, onApply }: { job: PublicJob; onApply: () => void }) {
  return (
    <div className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-lg hover:shadow-slate-200/50 transition-all flex flex-col">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
          {job.company?.name?.charAt(0) || 'J'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-500 truncate">
            {job.company?.name || 'Confidential'}
            {job.tenant && <span className="text-slate-400"> · {job.tenant.name}</span>}
          </p>
          <p className="font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
            {job.title}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {job.type && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-semibold ring-1 ring-indigo-100">
            <FiClock className="w-3 h-3" /> {JOB_TYPE_LABELS[job.type] || job.type}
          </span>
        )}
        {job.location && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 text-[11px] font-semibold ring-1 ring-slate-100">
            <FiMapPin className="w-3 h-3" /> {job.location}
          </span>
        )}
        {job.experience && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold ring-1 ring-emerald-100">
            <FiBriefcase className="w-3 h-3" /> {job.experience}
          </span>
        )}
      </div>

      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 mb-4 flex-1">
        {job.description.replace(/<[^>]+>/g, '').slice(0, 180)}
        {job.description.length > 180 && '…'}
      </p>

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="text-[11px] text-slate-500 flex items-center gap-3">
          <span className="flex items-center gap-1"><FiClock className="w-3 h-3" /> {formatRelativeTime(job.postedDate)}</span>
          {job.applicants > 0 && (
            <span className="flex items-center gap-1"><FiUsers className="w-3 h-3" /> {job.applicants} applied</span>
          )}
        </div>
        <button
          onClick={onApply}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:shadow-md hover:shadow-indigo-500/30 transition-all"
        >
          Apply <FiArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* Apply Modal                                                          */
/* ──────────────────────────────────────────────────────────────────── */
function ApplyModal({
  job,
  form,
  setForm,
  onClose,
  onSubmit,
  onFileChange,
  submitting,
}: {
  job: PublicJob;
  form: ApplyFormState;
  setForm: React.Dispatch<React.SetStateAction<ApplyFormState>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  submitting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-indigo-700 font-semibold uppercase tracking-wider">Apply for</p>
            <h3 className="font-bold text-slate-900">{job.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {job.company?.name}{job.location && ` · ${job.location}`}{job.type && ` · ${JOB_TYPE_LABELS[job.type] || job.type}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 text-slate-500 hover:text-slate-900">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Full Name *" icon={<FiUser className="w-3.5 h-3.5" />}>
              <input
                value={form.candidateName}
                onChange={(e) => setForm({ ...form, candidateName: e.target.value })}
                required
                placeholder="Jane Doe"
                className="form-input"
              />
            </Field>
            <Field label="Email *" icon={<FiMail className="w-3.5 h-3.5" />}>
              <input
                type="email"
                value={form.candidateEmail}
                onChange={(e) => setForm({ ...form, candidateEmail: e.target.value })}
                required
                placeholder="jane@example.com"
                className="form-input"
              />
            </Field>
            <Field label="Phone" icon={<FiPhone className="w-3.5 h-3.5" />}>
              <input
                value={form.candidatePhone}
                onChange={(e) => setForm({ ...form, candidatePhone: e.target.value })}
                placeholder="+91 98765 43210"
                className="form-input"
              />
            </Field>
            <Field label="Expected Salary" icon={<FiDollarSign className="w-3.5 h-3.5" />}>
              <input
                value={form.expectedSalary}
                onChange={(e) => setForm({ ...form, expectedSalary: e.target.value })}
                placeholder="₹12 LPA"
                className="form-input"
              />
            </Field>
          </div>

          <Field label="Cover Letter" icon={<FiFileText className="w-3.5 h-3.5" />}>
            <textarea
              value={form.coverLetter}
              onChange={(e) => setForm({ ...form, coverLetter: e.target.value })}
              rows={3}
              placeholder="Tell us why you're a great fit for this role…"
              className="form-input resize-none"
            />
          </Field>

          {/* Resume upload */}
          <Field label="Resume *" icon={<FiUpload className="w-3.5 h-3.5" />}>
            <label className="flex items-center gap-3 px-3 py-3 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-all">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                <FiUpload className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700">
                  {form.resumeFileName || 'Click to upload your resume'}
                </p>
                <p className="text-[10px] text-slate-500">PDF, DOC, DOCX, RTF or TXT — max 5 MB</p>
              </div>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.rtf,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf,text/plain"
                onChange={onFileChange}
                className="hidden"
              />
            </label>
            {form.resumeFileName && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-emerald-700 font-medium">
                <FiCheckCircle className="w-3.5 h-3.5" /> {form.resumeFileName} ready to submit
              </div>
            )}
          </Field>

          <div className="px-3 py-2.5 rounded-lg bg-slate-50 text-[11px] text-slate-600 flex items-start gap-2">
            <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p>
              By submitting, you consent to {job.company?.name || 'the hiring team'} reviewing your
              application and contacting you about this role. Your data is stored securely and never shared externally.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:shadow-lg hover:shadow-indigo-500/30 disabled:opacity-60 transition-all"
          >
            {submitting ? 'Submitting…' : <>Submit Application <FiArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1 mb-1">
        {icon}{label}
      </span>
      {children}
    </label>
  );
}
