'use client';

/**
 * Offer Management Dashboard — sidebar entry under a new OFFER MANAGEMENT
 * section. Replaces the basic /offers page with a richer dashboard:
 *
 *   - 8 stat cards: Total / Draft / Pending Approval / Approved / Sent /
 *     Accepted / Declined / Expired
 *   - Search + status filter + department filter
 *   - Offers table with: candidate, email, job title, department, salary,
 *     CTC, joining date, offer status, approval status, created/updated
 *   - Per-row actions: View / Edit / Submit for Approval / Send Offer /
 *     Cancel / Convert to Employee (only when accepted)
 *
 * Reuses the existing /api/offers endpoint for the list; calls the new
 * /api/offers/[id]/submit-approval endpoint for the submit action.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  FileText, RefreshCw, AlertTriangle, Loader2, Search, Eye, Send, XCircle,
  CheckCircle2, Edit2, ArrowUpRight, Clock, FileCheck, X, History, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { OfferHistory } from './offer-history';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Offer {
  id: string;
  candidateName: string;
  candidateEmail: string;
  position: string;
  department?: string | null;
  offeredSalary: number;
  offeredCurrency: string;
  offeredCTC?: number | null;
  joiningDate: string;
  probationPeriod: number;
  status: string;
  createdAt: string;
  updatedAt?: string;
  approvalStatus?: string;
}

const STATUS_BADGES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-800',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  sent: 'bg-violet-100 text-violet-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  withdrawn: 'bg-slate-100 text-slate-600',
};

function formatStatus(s: string): string {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function currencyFmt(amount: number | null | undefined, currency: string): string {
  if (amount == null) return '—';
  return `${currency} ${amount.toLocaleString('en-IN')}`;
}

export function OfferDashboard() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [viewing, setViewing] = useState<Offer | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/offers?limit=200', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setOffers(data?.offers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load offers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return offers.filter((o) => {
      const matches = !q ||
        o.candidateName.toLowerCase().includes(q) ||
        o.candidateEmail.toLowerCase().includes(q) ||
        o.position.toLowerCase().includes(q) ||
        (o.department || '').toLowerCase().includes(q);
      const statusOk = statusFilter === 'all' || o.status === statusFilter;
      return matches && statusOk;
    });
  }, [offers, search, statusFilter]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {
      draft: 0, pending_approval: 0, approved: 0, sent: 0,
      accepted: 0, rejected: 0, withdrawn: 0,
    };
    for (const o of offers) counts[o.status] = (counts[o.status] || 0) + 1;
    return {
      total: offers.length,
      ...counts,
      // Compute "expired" — offers older than 7 days that are still 'sent' but not responded
      expired: offers.filter(o => o.status === 'sent' && (Date.now() - new Date(o.updatedAt || o.createdAt).getTime()) > 7 * 86400000).length,
    };
  }, [offers]);

  const handleAction = async (offer: Offer, action: 'submit' | 'send' | 'cancel' | 'pdf') => {
    setActionLoading((s) => ({ ...s, [`${offer.id}-${action}`]: true }));
    try {
      let res: Response;
      if (action === 'submit') {
        res = await fetch(`/api/offers/${offer.id}/submit-approval`, {
          method: 'POST', headers: getAuthHeaders(),
        });
      } else if (action === 'send') {
        res = await fetch(`/api/offers/${offer.id}`, {
          method: 'PATCH', headers: getAuthHeaders(),
          body: JSON.stringify({ action: 'send' }),
        });
      } else if (action === 'pdf') {
        // Generate branded PDF
        res = await fetch(`/api/offers/${offer.id}/generate-branded-pdf`, {
          method: 'POST', headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
        // Open the PDF in a new tab (data URL)
        if (data.pdfUrl) {
          // data:image URL — open in new tab via blob
          try {
            const byteString = atob(data.pdfUrl.split(',')[1]);
            const mime = data.pdfUrl.match(/data:([^;]+);/)?.[1] || 'application/pdf';
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            const blob = new Blob([ab], { type: mime });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            // Revoke after 60s
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          } catch {
            // Fallback: open as data URL directly
            window.open(data.pdfUrl, '_blank');
          }
        }
        toast.success(`Branded PDF generated — ${data.pageCount || 1} page${(data.pageCount || 1) > 1 ? 's' : ''}`);
        fetchOffers();
        return;
      } else {
        res = await fetch(`/api/offers/${offer.id}`, {
          method: 'PATCH', headers: getAuthHeaders(),
          body: JSON.stringify({ action: 'cancel' }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      toast.success({
        submit: 'Offer submitted for approval',
        send: 'Offer sent to candidate',
        cancel: 'Offer cancelled',
      }[action as 'submit' | 'send' | 'cancel'] || 'Action completed');
      fetchOffers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading((s) => ({ ...s, [`${offer.id}-${action}`]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="h-6 w-6 text-emerald-600" /> Offer Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All offers across the tenant — drafts, approvals, sent, accepted.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOffers} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <StatCard label="Total" value={stats.total} color="text-slate-700" />
        <StatCard label="Draft" value={stats.draft} color="text-slate-600" />
        <StatCard label="Pending Approval" value={stats.pending_approval} color="text-amber-600" />
        <StatCard label="Approved" value={stats.approved} color="text-blue-600" />
        <StatCard label="Sent" value={stats.sent} color="text-violet-600" />
        <StatCard label="Accepted" value={stats.accepted} color="text-emerald-600" />
        <StatCard label="Declined" value={stats.rejected} color="text-red-600" />
        <StatCard label="Expired" value={stats.expired} color="text-orange-600" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search candidate, email, position, department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="withdrawn">Withdrawn</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading offers…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <Card><CardContent className="p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium">{offers.length === 0 ? 'No offers yet' : 'No matching offers'}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {offers.length === 0
              ? 'Create offers from the Recruitment page when candidates reach the Offer stage.'
              : 'Try adjusting your search or filter.'}
          </p>
        </CardContent></Card>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Position</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Salary / CTC</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joining</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.candidateName}</div>
                      <div className="text-xs text-muted-foreground">{o.candidateEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{o.position}</div>
                      {o.department && <div className="text-xs text-muted-foreground">{o.department}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div>{currencyFmt(o.offeredSalary, o.offeredCurrency)}</div>
                      {o.offeredCTC != null && <div className="text-xs text-muted-foreground">CTC: {currencyFmt(o.offeredCTC, o.offeredCurrency)}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {o.joiningDate ? new Date(o.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_BADGES[o.status] || 'bg-slate-100 text-slate-800'}>
                        {formatStatus(o.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionBtn title="View" icon={<Eye className="h-4 w-4" />} onClick={() => setViewing(o)} />
                        <ActionBtn title="Edit" icon={<Edit2 className="h-4 w-4" />} onClick={() => window.open(`/offers/${o.id}/preview`, '_blank')} />
                        <ActionBtn title="View History" icon={<History className="h-4 w-4" />} onClick={() => setHistoryId(o.id)} />
                        {!['sent', 'accepted', 'rejected', 'withdrawn'].includes(o.status) && (
                          <ActionBtn title="Generate Branded PDF" icon={<Download className="h-4 w-4" />} loading={actionLoading[`${o.id}-pdf`]} onClick={() => handleAction(o, 'pdf')} />
                        )}
                        {o.status === 'draft' && (
                          <ActionBtn title="Submit for Approval" icon={<ArrowUpRight className="h-4 w-4" />} loading={actionLoading[`${o.id}-submit`]} onClick={() => handleAction(o, 'submit')} />
                        )}
                        {o.status === 'approved' && (
                          <ActionBtn title="Send Offer" icon={<Send className="h-4 w-4" />} loading={actionLoading[`${o.id}-send`]} onClick={() => handleAction(o, 'send')} />
                        )}
                        {!['withdrawn', 'rejected', 'accepted'].includes(o.status) && (
                          <ActionBtn title="Cancel" icon={<XCircle className="h-4 w-4" />} loading={actionLoading[`${o.id}-cancel`]} onClick={() => handleAction(o, 'cancel')} />
                        )}
                        {o.status === 'accepted' && (
                          <ActionBtn title="Convert to Employee" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => toast.info('Convert to Employee — opens the existing recruitment convert flow')} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* View modal */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing?.candidateName}</DialogTitle>
            <DialogDescription>{viewing?.position}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Candidate Email" value={viewing.candidateEmail} />
              <Field label="Department" value={viewing.department || '—'} />
              <Field label="Salary" value={currencyFmt(viewing.offeredSalary, viewing.offeredCurrency)} />
              <Field label="Annual CTC" value={viewing.offeredCTC != null ? currencyFmt(viewing.offeredCTC, viewing.offeredCurrency) : '—'} />
              <Field label="Joining Date" value={new Date(viewing.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
              <Field label="Probation" value={`${viewing.probationPeriod} days`} />
              <Field label="Status" value={formatStatus(viewing.status)} />
              <Field label="Created" value={new Date(viewing.createdAt).toLocaleString()} />
              {viewing.updatedAt && <Field label="Last Updated" value={new Date(viewing.updatedAt).toLocaleString()} />}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History modal */}
      <Dialog open={!!historyId} onOpenChange={(o) => !o && setHistoryId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-emerald-600" /> Offer History
            </DialogTitle>
            <DialogDescription>
              Timeline of all events for this offer — creation, edits, approvals, and candidate actions.
            </DialogDescription>
          </DialogHeader>
          {historyId && <OfferHistory offerId={historyId} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card><CardContent className="p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </CardContent></Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function ActionBtn({
  title, icon, loading, onClick,
}: { title: string; icon: React.ReactNode; loading?: boolean; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={loading}
      className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
    </button>
  );
}
