'use client';

/**
 * Create Offer — sidebar entry under OFFER MANAGEMENT.
 *
 * A dedicated full-page form for creating offers with:
 *   - Candidate details (name, email, position, department, etc.)
 *   - Offer details (salary, CTC, joining date, probation, reporting manager)
 *   - Template selection dropdown (loads OfferTemplate list for tenant)
 *   - Live preview pane showing the rendered template body with
 *     {{placeholders}} replaced with the current form values
 *
 * Submits to existing POST /api/offers. After successful creation,
 * redirects to the Offer Dashboard.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Save, Eye, RefreshCw, AlertTriangle, Loader2, X, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/store/app-store';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Template {
  id: string;
  name: string;
  body: string;
  country: string;
  language: string;
  isActive: boolean;
}

interface JobPosting { id: string; title: string; department?: string | null; }

const initialForm = {
  candidateName: '',
  candidateEmail: '',
  position: '',
  department: '',
  offeredSalary: '' as string | number,
  offeredCurrency: 'INR',
  offeredCTC: '' as string | number,
  salaryBreakdown: '',
  joiningDate: '',
  probationPeriod: '90' as string | number,
  reportingTo: '',
  jobApplicationId: '',
  jobPostingId: '',
  templateId: '',
};

export function CreateOffer() {
  const { setActiveModule } = useAppStore();
  const [form, setForm] = useState(initialForm);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tplRes, jobRes] = await Promise.all([
        fetch('/api/offers/templates', { headers: getAuthHeaders() }),
        fetch('/api/recruitment?limit=100', { headers: getAuthHeaders() }),
      ]);
      if (tplRes.ok) {
        const tplData = await tplRes.json();
        const list: Template[] = tplData?.templates || tplData || [];
        setTemplates(Array.isArray(list) ? list.filter((t) => t.isActive !== false) : []);
      }
      if (jobRes.ok) {
        const jobData = await jobRes.json();
        setJobs((jobData?.jobPostings || []).map((j: any) => ({ id: j.id, title: j.title, department: j.department })));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates / jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Live preview rendering
  const previewHtml = useMemo(() => {
    const tpl = templates.find((t) => t.id === form.templateId);
    if (!tpl) {
      return `<div style="text-align:center;color:#94a3b8;padding:40px;font-family:Arial,sans-serif;">
        <h3>No template selected</h3>
        <p style="font-size:13px;">Choose an offer template above to see a live preview of the offer letter.</p>
      </div>`;
    }
    const replacements: Record<string, string> = {
      candidateName: form.candidateName || '[Candidate Name]',
      candidateEmail: form.candidateEmail || '[candidate@email.com]',
      position: form.position || '[Position]',
      department: form.department || '[Department]',
      location: '[Location]',
      employmentType: 'Full-time',
      salary: form.offeredSalary ? `${form.offeredCurrency} ${Number(form.offeredSalary).toLocaleString('en-IN')}` : '[Salary]',
      ctc: form.offeredCTC ? `${form.offeredCurrency} ${Number(form.offeredCTC).toLocaleString('en-IN')}` : (form.offeredSalary ? `${form.offeredCurrency} ${Number(form.offeredSalary).toLocaleString('en-IN')}` : '[CTC]'),
      currency: form.offeredCurrency || 'INR',
      joiningDate: form.joiningDate ? new Date(form.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '[Joining Date]',
      probationDays: String(form.probationPeriod || 90),
      reportingTo: form.reportingTo || '[Reporting Manager]',
      noticePeriod: '30 days',
      companyName: '[Company Name]',
      companyAddress: '[Company Address]',
      companyEmail: '[hr@company.com]',
      companyPhone: '[+91 9876543210]',
      companyWebsite: '[www.company.com]',
      offerDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
      expiryDate: new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    };
    let out = tpl.body;
    for (const [key, val] of Object.entries(replacements)) {
      out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    }
    return out;
  }, [form, templates]);

  const handleSubmit = async () => {
    setError(null);
    if (!form.candidateName || !form.candidateEmail || !form.position || !form.offeredSalary || !form.joiningDate) {
      setError('Required fields: Candidate Name, Email, Position, Salary, Joining Date');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.candidateEmail)) {
      setError('Candidate email is invalid');
      return;
    }
    const salaryNum = Number(form.offeredSalary);
    if (!Number.isFinite(salaryNum) || salaryNum < 0) {
      setError('Salary must be a non-negative number');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        candidateId: form.jobApplicationId || `candidate-${Date.now()}`,
        jobApplicationId: form.jobApplicationId || undefined,
        jobPostingId: form.jobPostingId || undefined,
        candidateName: form.candidateName,
        candidateEmail: form.candidateEmail,
        position: form.position,
        department: form.department || undefined,
        offeredSalary: salaryNum,
        offeredCurrency: form.offeredCurrency,
        offeredCTC: form.offeredCTC ? Number(form.offeredCTC) : undefined,
        salaryBreakdown: form.salaryBreakdown || undefined,
        joiningDate: form.joiningDate,
        probationPeriod: Number(form.probationPeriod) || 90,
        reportingTo: form.reportingTo || undefined,
        templateId: form.templateId || undefined,
      };
      const res = await fetch('/api/offers', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      toast.success('Offer created — draft saved');
      setActiveModule('offer_dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create offer');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading templates…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Plus className="h-6 w-6 text-emerald-600" /> Create Offer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fill in candidate + offer details, pick a template, preview the letter, and save as draft.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="h-4 w-4 mr-2" /> {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setForm(initialForm)}>
            <RefreshCw className="h-4 w-4 mr-2" /> Reset
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <div className={`grid gap-4 ${showPreview ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
        {/* Form */}
        <div className="space-y-4">
          {/* Candidate section */}
          <Card>
            <CardHeader><CardTitle className="text-base">Candidate Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Candidate Name *" value={form.candidateName} onChange={(v) => setForm({ ...form, candidateName: v })} placeholder="Rahul Sharma" />
              <Field label="Candidate Email *" type="email" value={form.candidateEmail} onChange={(v) => setForm({ ...form, candidateEmail: v })} placeholder="rahul@example.com" />
              <Field label="Position *" value={form.position} onChange={(v) => setForm({ ...form, position: v })} placeholder="Senior Software Engineer" />
              <Field label="Department" value={form.department} onChange={(v) => setForm({ ...form, department: v })} placeholder="Engineering" />
              <div className="md:col-span-2">
                <Label>Link to Job Posting</Label>
                <Select value={form.jobPostingId} onValueChange={(v) => setForm({ ...form, jobPostingId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="(optional) — pre-fills from job" /></SelectTrigger>
                  <SelectContent>
                    {jobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>{j.title}{j.department ? ` · ${j.department}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Job Application ID</Label>
                <Input
                  value={form.jobApplicationId}
                  onChange={(e) => setForm({ ...form, jobApplicationId: e.target.value })}
                  placeholder="ja-... (optional, used to link offer to recruitment pipeline)"
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Offer details */}
          <Card>
            <CardHeader><CardTitle className="text-base">Offer Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Monthly Salary *" type="number" value={form.offeredSalary} onChange={(v) => setForm({ ...form, offeredSalary: v })} placeholder="50000" />
              <div>
                <Label>Currency</Label>
                <Select value={form.offeredCurrency} onValueChange={(v) => setForm({ ...form, offeredCurrency: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR (₹)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="AED">AED (د.إ)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field label="Annual CTC" type="number" value={form.offeredCTC} onChange={(v) => setForm({ ...form, offeredCTC: v })} placeholder="600000" />
              <Field label="Joining Date *" type="date" value={form.joiningDate} onChange={(v) => setForm({ ...form, joiningDate: v })} />
              <Field label="Probation Period (days)" type="number" value={form.probationPeriod} onChange={(v) => setForm({ ...form, probationPeriod: v })} placeholder="90" />
              <Field label="Reporting Manager" value={form.reportingTo} onChange={(v) => setForm({ ...form, reportingTo: v })} placeholder="Anita Sharma" />
              <div className="md:col-span-2">
                <Label>Salary Breakdown (optional)</Label>
                <Input value={form.salaryBreakdown} onChange={(e) => setForm({ ...form, salaryBreakdown: e.target.value })} placeholder="Basic: 50%, HRA: 20%, Allowances: 30%" className="mt-1" />
              </div>
            </CardContent>
          </Card>

          {/* Template section */}
          <Card>
            <CardHeader><CardTitle className="text-base">Offer Template</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Select Template</Label>
                <Select value={form.templateId} onValueChange={(v) => setForm({ ...form, templateId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="(optional) — defaults to standard offer letter" /></SelectTrigger>
                  <SelectContent>
                    {templates.length === 0 && <SelectItem value="" disabled>No templates — using default</SelectItem>}
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.country}, {t.language})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.templateId && (
                <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    {templates.find((t) => t.id === form.templateId)?.name || 'Unknown'}
                  </Badge>
                  <span className="text-muted-foreground ml-2">
                    Country: {templates.find((t) => t.id === form.templateId)?.country || '—'} ·
                    Language: {templates.find((t) => t.id === form.templateId)?.language || '—'}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setActiveModule('offer_dashboard')}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save as Draft
            </Button>
          </div>
        </div>

        {/* Live preview */}
        {showPreview && (
          <Card className="self-start sticky top-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600" /> Live Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="border border-border rounded-md bg-white p-4 max-h-[600px] overflow-y-auto text-sm"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Placeholders in <code className="bg-muted px-1 rounded">[brackets]</code> will be replaced when you fill in the corresponding field.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: { label: string; value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1"
      />
    </div>
  );
}
