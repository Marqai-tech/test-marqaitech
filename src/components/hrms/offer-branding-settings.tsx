'use client';

/**
 * Offer Branding Settings — sidebar entry under OFFER MANAGEMENT.
 *
 * Per-tenant company branding for offer letters. Reuses
 * /api/offers/branding (GET/PUT). Stored separately from the tenant
 * Company record so HR can keep offer-specific branding (logo, signatory,
 * legal notice, footer text) independent of the main company profile.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Building2, Save, RefreshCw, AlertTriangle, Loader2, Image as ImageIcon, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Branding {
  tenantId: string;
  logo?: string | null;
  companyName?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  colors?: string | null;
  signature?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  defaultFooterText?: string | null;
  legalNotice?: string | null;
  version?: number;
}

const EMPTY: Branding = {
  tenantId: '',
  logo: null, companyName: null, address: null, email: null, phone: null,
  website: null, colors: null, signature: null,
  signatoryName: null, signatoryDesignation: null,
  defaultFooterText: null, legalNotice: null, version: 0,
};

function parseColors(s: string | null | undefined): { primary: string; secondary: string } {
  if (!s) return { primary: '#10b981', secondary: '#0f172a' };
  try { return JSON.parse(s); } catch { return { primary: '#10b981', secondary: '#0f172a' }; }
}

export function OfferBrandingSettings() {
  const [branding, setBranding] = useState<Branding>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#10b981');
  const [secondaryColor, setSecondaryColor] = useState('#0f172a');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/offers/branding', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setBranding(data?.branding || EMPTY);
      const colors = parseColors(data?.branding?.colors);
      setPrimaryColor(colors.primary);
      setSecondaryColor(colors.secondary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load branding');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, field: 'logo' | 'signature') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setBranding((b) => ({ ...b, [field]: dataUrl }));
      toast.success(`${field === 'logo' ? 'Logo' : 'Signature'} selected — click Save to persist`);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/offers/branding', {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({
          ...branding,
          colors: JSON.stringify({ primary: primaryColor, secondary: secondaryColor }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      toast.success('Branding saved');
      fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading branding…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-emerald-600" /> Company Branding
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Per-tenant branding for offer letters. Logo, signatory, colors, and legal notice used when generating offer PDFs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={saving}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Branding
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {branding.version === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
          <ImageIcon className="h-5 w-5 shrink-0 mt-0.5" />
          <div>You haven't set up branding yet. Fill in the fields below and click Save — this will be used for all future offer letters in your tenant.</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Company info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Company Information</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Company Logo</Label>
              <div className="flex items-center gap-3 mt-1">
                {branding.logo ? (
                  <img src={branding.logo} alt="Logo" className="w-16 h-16 rounded-md object-contain border border-border bg-white p-1" />
                ) : (
                  <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
                <label className="cursor-pointer">
                  <span className="inline-flex items-center px-3 py-1.5 text-xs rounded-md border border-input bg-background hover:bg-accent">
                    <Upload className="h-3 w-3 mr-1.5" /> Upload Logo
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e, 'logo')} />
                </label>
              </div>
            </div>
            <Field label="Company Name" value={branding.companyName || ''} onChange={(v) => setBranding({ ...branding, companyName: v })} placeholder="Acme Inc." />
            <Field label="Address" value={branding.address || ''} onChange={(v) => setBranding({ ...branding, address: v })} placeholder="123 Main St, City, State, ZIP" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" value={branding.email || ''} onChange={(v) => setBranding({ ...branding, email: v })} placeholder="hr@acme.com" />
              <Field label="Phone" value={branding.phone || ''} onChange={(v) => setBranding({ ...branding, phone: v })} placeholder="+91 1234567890" />
            </div>
            <Field label="Website" value={branding.website || ''} onChange={(v) => setBranding({ ...branding, website: v })} placeholder="https://acme.com" />
          </CardContent>
        </Card>

        {/* Signatory + colors */}
        <Card>
          <CardHeader><CardTitle className="text-base">Signatory & Colors</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>HR Signature Image</Label>
              <div className="flex items-center gap-3 mt-1">
                {branding.signature ? (
                  <img src={branding.signature} alt="Signature" className="h-16 rounded border border-border bg-white p-1 object-contain" />
                ) : (
                  <div className="h-16 w-32 rounded-md bg-muted flex items-center justify-center text-muted-foreground text-xs">
                    No signature
                  </div>
                )}
                <label className="cursor-pointer">
                  <span className="inline-flex items-center px-3 py-1.5 text-xs rounded-md border border-input bg-background hover:bg-accent">
                    <Upload className="h-3 w-3 mr-1.5" /> Upload
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e, 'signature')} />
                </label>
              </div>
            </div>
            <Field label="Authorized Signatory Name" value={branding.signatoryName || ''} onChange={(v) => setBranding({ ...branding, signatoryName: v })} placeholder="Anita Sharma" />
            <Field label="Designation" value={branding.signatoryDesignation || ''} onChange={(v) => setBranding({ ...branding, signatoryDesignation: v })} placeholder="Head of HR" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Primary Color</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-12 rounded border border-input cursor-pointer" />
                  <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
                </div>
              </div>
              <div>
                <Label>Secondary Color</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-9 w-12 rounded border border-input cursor-pointer" />
                  <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="flex-1" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer + legal */}
      <Card>
        <CardHeader><CardTitle className="text-base">Footer & Legal Notice</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Default Footer Text</Label>
            <textarea
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
              placeholder="e.g. This offer is valid for 7 days from the date of issue."
              value={branding.defaultFooterText || ''}
              onChange={(e) => setBranding({ ...branding, defaultFooterText: e.target.value })}
            />
          </div>
          <div>
            <Label>Legal Notice</Label>
            <textarea
              className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
              placeholder="Confidentiality clause, governing law, dispute resolution, etc."
              value={branding.legalNotice || ''}
              onChange={(e) => setBranding({ ...branding, legalNotice: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {branding.version != null && branding.version > 0 && (
        <div className="text-xs text-muted-foreground text-center">
          Branding version: <strong>v{branding.version}</strong> — bumped on every save so generated PDFs can detect stale branding.
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1" />
    </div>
  );
}
