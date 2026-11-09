'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  FiPlus, FiX, FiEdit2, FiTrash2, FiFileText, FiEye, FiCopy, FiUpload, FiImage, FiLayout,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { renderOfferTemplate, wrapRenderedOffer } from '@/lib/offer-template';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface OfferTemplate {
  id: string;
  tenantId: string;
  name: string;
  country: string;
  language: string;
  body: string;
  header?: string | null;
  footer?: string | null;
  clauses?: string | null;
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

const COUNTRY_OPTIONS = [
  { value: '*', label: 'All Countries (Wildcard)' },
  { value: 'IN', label: 'India' },
  { value: 'US', label: 'United States' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'DE', label: 'Germany' },
  { value: 'SG', label: 'Singapore' },
  { value: 'AU', label: 'Australia' },
  { value: 'CA', label: 'Canada' },
];

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'kn', label: 'Kannada' },
  { value: 'mr', label: 'Marathi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'ar', label: 'Arabic' },
  { value: 'de', label: 'German' },
];

const PLACEHOLDER_HINTS = [
  '{{candidateName}}',
  '{{position}}',
  '{{department}}',
  '{{salary}}',
  '{{currency}}',
  '{{ctc}}',
  '{{joiningDate}}',
  '{{probationDays}}',
  '{{reportingTo}}',
  '{{companyName}}',
  '{{todayDate}}',
];

const DEFAULT_TEMPLATE_BODY = `<h2>Offer of Employment</h2>
<p>Dear {{candidateName}},</p>
<p>We are pleased to offer you the position of <strong>{{position}}</strong> at {{companyName}}.</p>
<p><strong>Compensation:</strong> {{currency}} {{salary}} per month (CTC: {{currency}} {{ctc}} per annum).</p>
<p><strong>Joining Date:</strong> {{joiningDate}}</p>
<p><strong>Probation Period:</strong> {{probationDays}} days</p>
${'`'}${'`'}${'`'}`;

const SAMPLE_DATA = {
  candidateName: 'Aarav Sharma',
  position: 'Senior Software Engineer',
  department: 'Engineering',
  offeredSalary: 150000,
  offeredCurrency: 'INR',
  offeredCTC: 1800000,
  joiningDate: new Date(Date.now() + 14 * 86400000),
  probationPeriod: 90,
  reportingTo: 'Priya Patel (Engineering Manager)',
};

// ── Header quick-fill templates ──
// Each template inserts pre-styled HTML into the header textarea.
const HEADER_TEMPLATES = [
  {
    key: 'logo-right',
    label: 'Company Name + Logo (right)',
    html: `<div class="header-left">
  <p class="company-name">{{companyName}}</p>
  <p class="company-tagline">Offer of Employment</p>
</div>
<div class="header-right">
  <img src="LOGO_URL_HERE" alt="{{companyName}} Logo" />
</div>`,
  },
  {
    key: 'logo-left',
    label: 'Logo (left) + Company Name',
    html: `<div class="header-left">
  <img src="LOGO_URL_HERE" alt="{{companyName}} Logo" />
</div>
<div class="header-right">
  <p class="company-name">{{companyName}}</p>
  <p class="company-tagline">Offer of Employment</p>
</div>`,
  },
  {
    key: 'name-only',
    label: 'Company Name Only',
    html: `<div class="header-left">
  <h1>{{companyName}}</h1>
  <p class="company-tagline">Offer of Employment</p>
</div>`,
  },
  {
    key: 'logo-only',
    label: 'Logo Only (centered)',
    html: `<div style="text-align:center; width:100%;">
  <img src="LOGO_URL_HERE" alt="{{companyName}} Logo" style="margin: 0 auto;" />
</div>`,
  },
];

// ── Footer quick-fill templates ──
const FOOTER_TEMPLATES = [
  {
    key: 'full',
    label: 'Full Footer (Company + Address + Contact + Confidential)',
    html: `<p class="footer-company">{{companyName}}</p>
<p class="footer-address">123 Business Park, Phase 2, Mumbai, Maharashtra 400001, India</p>
<p class="footer-contact">Phone: +91-22-1234-5678 | Email: hr@company.com | Web: www.company.com</p>
<p class="footer-confidential">This offer letter is confidential and intended solely for the named recipient. If you are not the intended recipient, please notify the sender immediately and delete this document.</p>`,
  },
  {
    key: 'address',
    label: 'Company Address',
    html: `<p class="footer-company">{{companyName}}</p>
<p class="footer-address">123 Business Park, Phase 2, Mumbai, Maharashtra 400001, India</p>`,
  },
  {
    key: 'contact',
    label: 'Contact Info',
    html: `<p class="footer-contact">Phone: +91-22-1234-5678 | Email: hr@company.com | Web: www.company.com</p>`,
  },
  {
    key: 'confidential',
    label: 'Confidentiality Notice',
    html: `<p class="footer-confidential">This offer letter is confidential and intended solely for the named recipient. If you are not the intended recipient, please notify the sender immediately and delete this document.</p>`,
  },
];

const initialForm = {
  name: '',
  country: '*',
  language: 'en',
  body: DEFAULT_TEMPLATE_BODY,
  header: '',
  footer: '',
  isActive: true,
};

export default function OfferTemplatesPage() {
  const { user } = useAuthStore();
  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/offers/templates', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : data.templates || []);
      } else {
        setTemplates([]);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load offer templates');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => fetchTemplates());
  }, [fetchTemplates]);

  // Re-render the preview whenever the form body changes
  useEffect(() => {
    try {
      const rendered = renderOfferTemplate(form.body || '', SAMPLE_DATA as any);
      const wrapped = wrapRenderedOffer(rendered.html, {
        header: form.header,
        footer: form.footer,
        title: 'Offer Letter Preview',
      });
      setPreviewHtml(wrapped);
    } catch (err) {
      setPreviewHtml('<p style="color:#dc2626;">Preview rendering failed.</p>');
    }
  }, [form.body, form.header, form.footer]);

  const handleAddNew = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(true);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleEdit = (t: OfferTemplate) => {
    setForm({
      name: t.name || '',
      country: t.country || '*',
      language: t.language || 'en',
      body: t.body || '',
      header: t.header || '',
      footer: t.footer || '',
      isActive: t.isActive !== false,
    });
    setEditingId(t.id);
    setShowForm(true);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const insertPlaceholder = (ph: string) => {
    setForm((prev) => ({ ...prev, body: `${prev.body}${prev.body.endsWith('\n') ? '' : ' '}${ph}` }));
  };

  // ── Logo upload: converts image file to data URL and inserts an <img> tag
  // into the header textarea. The data URL is self-contained (no external
  // storage needed) and renders in both the preview and the generated PDF.
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'header' | 'footer') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, SVG, etc.)');
      e.target.value = '';
      return;
    }
    if (file.size > 500 * 1024) {
      toast.error('Logo must be under 500KB to keep the template lightweight');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const imgTag = `<img src="${dataUrl}" alt="Company Logo" />`;
      setForm((prev) => ({
        ...prev,
        [target]: prev[target] ? `${prev[target]}\n${imgTag}` : imgTag,
      }));
      toast.success('Logo added to ' + target);
    };
    reader.onerror = () => toast.error('Failed to read logo file');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Quick-fill: insert a pre-built template into header or footer
  const applyHeaderTemplate = (html: string) => {
    setForm((prev) => ({ ...prev, header: html }));
    toast.success('Header template applied');
  };
  const applyFooterTemplate = (html: string) => {
    setForm((prev) => ({ ...prev, footer: html }));
    toast.success('Footer template applied');
  };

  // ── Clear header or footer
  const clearHeader = () => setForm((prev) => ({ ...prev, header: '' }));
  const clearFooter = () => setForm((prev) => ({ ...prev, footer: '' }));

  const handleSubmit = async () => {
    if (!form.name || !form.body) {
      toast.error('Name and body are required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        country: form.country,
        language: form.language,
        body: form.body,
        header: form.header || null,
        footer: form.footer || null,
        isActive: form.isActive,
      };
      if (editingId) {
        const res = await fetch(`/api/offers/templates/${editingId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Failed to update template');
        }
        toast.success('Template updated');
      } else {
        const res = await fetch('/api/offers/templates', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Failed to create template');
        }
        toast.success('Template created');
      }
      handleCancelForm();
      fetchTemplates();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/offers/templates/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      toast.success('Template deleted');
      setDeleteConfirmId(null);
      fetchTemplates();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (t: OfferTemplate) => {
    try {
      const res = await fetch(`/api/offers/templates/${t.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Template ${!t.isActive ? 'activated' : 'deactivated'}`);
      fetchTemplates();
    } catch {
      toast.error('Failed to toggle template');
    }
  };

  const handleDuplicate = async (t: OfferTemplate) => {
    try {
      const res = await fetch('/api/offers/templates', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: `${t.name} (Copy)`,
          country: t.country,
          language: t.language,
          body: t.body,
          header: t.header,
          footer: t.footer,
          isActive: false,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Template duplicated');
      fetchTemplates();
    } catch {
      toast.error('Failed to duplicate template');
    }
  };

  const groupedByCountry = useMemo(() => {
    const map = new Map<string, OfferTemplate[]>();
    for (const t of templates) {
      const key = t.country || '*';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [templates]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
            <FiFileText className="w-6 h-6 text-green-500" />
            Offer Letter Templates
          </h1>
          <p className="text-thb-text-secondary mt-1">
            Country-specific offer letter templates with placeholder substitution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/offers"
            className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors"
          >
            Back to Offers
          </Link>
          <button
            onClick={handleAddNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium text-sm shadow-sm shadow-green-500/25 transition-colors"
          >
            <FiPlus className="w-4 h-4" /> New Template
          </button>
        </div>
      </div>

      {/* Embedded Form */}
      {showForm && (
        <div id="crud-form" className="thb-card border-l-4 border-l-green-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-thb-text-primary">
                {editingId ? 'Edit Template' : 'Create New Template'}
              </h2>
              <button
                onClick={handleCancelForm}
                className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1">Template Name <span className="text-red-500 font-bold">*</span></label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                    placeholder="e.g., India Standard Offer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-thb-text-secondary mb-1">Country</label>
                    <select
                      value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                    >
                      {COUNTRY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-thb-text-secondary mb-1">Language</label>
                    <select
                      value={form.language}
                      onChange={(e) => setForm({ ...form, language: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                    >
                      {LANGUAGE_OPTIONS.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1">
                    Body * (HTML with placeholders)
                  </label>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {PLACEHOLDER_HINTS.map((ph) => (
                      <button
                        key={ph}
                        type="button"
                        onClick={() => insertPlaceholder(ph)}
                        className="px-2 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-700 rounded border border-slate-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200 transition-colors"
                        title={`Insert ${ph}`}
                      >
                        {ph}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={14}
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                    placeholder="Enter the offer letter body..."
                  />
                </div>

                {/* ═══ HEADER SECTION (with logo upload + quick-fill templates) ═══ */}
                <div className="thb-card p-4 border-l-4 border-l-blue-400 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-thb-text-secondary uppercase tracking-wide">
                      <FiLayout className="w-3.5 h-3.5" />
                      Header
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="header-logo-upload"
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => handleLogoUpload(e, 'header')}
                      />
                      <label
                        htmlFor="header-logo-upload"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-600 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 cursor-pointer transition-colors"
                        title="Upload a company logo (PNG/JPG/SVG, max 500KB)"
                      >
                        <FiUpload className="w-3 h-3" />
                        Upload Logo
                      </label>
                      {form.header && (
                        <button
                          type="button"
                          onClick={clearHeader}
                          className="px-2.5 py-1 text-[11px] font-medium text-red-500 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick-fill header templates */}
                  <div>
                    <p className="text-[10px] text-thb-text-muted mb-1.5">Quick-fill templates:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {HEADER_TEMPLATES.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => applyHeaderTemplate(t.html)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-600 bg-slate-100 rounded border border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
                          title={t.label}
                        >
                          <FiImage className="w-2.5 h-2.5" />
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    rows={5}
                    value={form.header}
                    onChange={(e) => setForm({ ...form, header: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    placeholder="Enter header HTML — upload a logo or use a quick-fill template above. Example: <h1>Company Name</h1><img src='...' />"
                  />
                  <p className="text-[10px] text-thb-text-muted">
                    💡 The header appears at the top of the offer letter with a blue bottom border. Upload a logo (PNG/JPG/SVG, max 500KB) or pick a template above. Replace <code className="bg-slate-100 px-1 rounded">LOGO_URL_HERE</code> with your logo URL, or use the Upload Logo button to embed it.
                  </p>
                </div>

                {/* ═══ FOOTER SECTION (with quick-fill templates) ═══ */}
                <div className="thb-card p-4 border-l-4 border-l-slate-400 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-thb-text-secondary uppercase tracking-wide">
                      <FiLayout className="w-3.5 h-3.5" />
                      Footer
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="footer-logo-upload"
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => handleLogoUpload(e, 'footer')}
                      />
                      <label
                        htmlFor="footer-logo-upload"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 rounded-lg border border-slate-200 hover:bg-slate-200 cursor-pointer transition-colors"
                        title="Upload a logo/image for the footer"
                      >
                        <FiUpload className="w-3 h-3" />
                        Upload Image
                      </label>
                      {form.footer && (
                        <button
                          type="button"
                          onClick={clearFooter}
                          className="px-2.5 py-1 text-[11px] font-medium text-red-500 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick-fill footer templates */}
                  <div>
                    <p className="text-[10px] text-thb-text-muted mb-1.5">Quick-fill templates:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {FOOTER_TEMPLATES.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => applyFooterTemplate(t.html)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-600 bg-slate-100 rounded border border-slate-200 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                          title={t.label}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    rows={5}
                    value={form.footer}
                    onChange={(e) => setForm({ ...form, footer: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-400"
                    placeholder="Enter footer HTML — use a quick-fill template above or write your own. Example: company address, contact info, confidentiality notice."
                  />
                  <p className="text-[10px] text-thb-text-muted">
                    💡 The footer appears at the bottom with a top border. Common uses: company address, contact info, GST/CIN number, confidentiality notice. Edit the template text to match your company details.
                  </p>
                </div>

                <label className="flex items-center gap-2 text-sm text-thb-text-secondary">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="rounded border-thb-border"
                  />
                  Active (available for selection when creating offers)
                </label>
              </div>

              {/* Right: Live Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-thb-text-secondary">Live Preview (with sample data)</label>
                  <span className="text-[10px] text-thb-text-muted font-mono">candidateName=Aarav Sharma, position=Senior SE, salary=150000 INR</span>
                </div>
                <iframe
                  title="Template Preview"
                  srcDoc={previewHtml}
                  className="w-full h-[560px] rounded-lg border border-thb-border bg-white"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-thb-border">
              <button
                onClick={handleCancelForm}
                className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 shadow-sm shadow-green-500/25 transition-colors"
              >
                {submitting ? 'Saving...' : editingId ? 'Update Template' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates grouped by country */}
      {loading ? (
        <div className="thb-card p-12 text-center text-thb-text-muted">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="thb-card p-12 text-center">
          <FiFileText className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
          <p className="text-thb-text-secondary font-medium">No offer templates yet</p>
          <p className="text-sm text-thb-text-muted mt-1">Create your first template to standardize offer letters by country.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByCountry.map(([country, list]) => {
            const countryLabel = COUNTRY_OPTIONS.find((c) => c.value === country)?.label || country;
            return (
              <div key={country} className="thb-card overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-thb-border flex items-center gap-2">
                  <span className="text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">
                    {countryLabel}
                  </span>
                  <span className="text-[10px] text-thb-text-muted">({list.length})</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-thb-border bg-slate-50/30">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Name</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Language</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Updated</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((t) => (
                        <tr key={t.id} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                          {deleteConfirmId === t.id ? (
                            <td colSpan={5} className="px-4 py-3 bg-red-50">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-red-700 font-medium">Delete &quot;{t.name}&quot;?</span>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => handleDelete(t.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                                    {deleting ? 'Deleting...' : 'Confirm'}
                                  </button>
                                  <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-thb-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                                </div>
                              </div>
                            </td>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-sm font-medium text-thb-text-primary">{t.name}</td>
                              <td className="px-4 py-3 text-sm text-thb-text-secondary uppercase">{t.language}</td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleToggleActive(t)}
                                  className={`text-xs font-medium px-2 py-1 rounded-lg transition-colors ${t.isActive ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}
                                >
                                  {t.isActive ? 'Active' : 'Inactive'}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-xs text-thb-text-muted">
                                {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : '—'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => handleEdit(t)} className="p-2 rounded-lg text-thb-text-muted hover:text-green-500 hover:bg-green-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                                  <button onClick={() => handleDuplicate(t)} className="p-2 rounded-lg text-thb-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Duplicate"><FiCopy className="w-4 h-4" /></button>
                                  <button onClick={() => setDeleteConfirmId(t.id)} className="p-2 rounded-lg text-thb-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
