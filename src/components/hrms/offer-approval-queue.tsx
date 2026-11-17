'use client';

/**
 * Offer Approval Queue — sidebar entry under OFFER MANAGEMENT.
 *
 * Lists all OfferApproval rows for the tenant that are pending action.
 * HR/Admin sees all pending approvals. Non-admin approvers see only
 * approvals where their role or userId matches.
 *
 * Approve / Reject / Send Back actions call POST /api/offers/approvals.
 * Reject and send_back require comments.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  CheckCircle2, XCircle, RotateCcw, RefreshCw, AlertTriangle, Loader2, Clock, Mail, Briefcase, DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Approval {
  id: string;
  offerId: string;
  level: number;
  approverRole: string;
  approverUserId?: string | null;
  status: string;
  comments?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  dueDate?: string | null;
  createdAt: string;
  // Joined from Offer:
  candidateName?: string;
  candidateEmail?: string;
  position?: string;
  department?: string | null;
  offeredSalary?: number;
  offeredCurrency?: string;
  joiningDate?: string;
  offerStatus?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  sent_back: 'bg-blue-100 text-blue-800',
};

function formatStatus(s: string): string {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function OfferApprovalQueue() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [acting, setActing] = useState<Approval | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'send_back'>('approve');
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/offers/approvals?status=${statusFilter}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setApprovals(data?.approvals || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const stats = useMemo(() => ({
    total: approvals.length,
    pending: approvals.filter(a => a.status === 'pending').length,
    approved: approvals.filter(a => a.status === 'approved').length,
    rejected: approvals.filter(a => a.status === 'rejected').length,
  }), [approvals]);

  const openAction = (approval: Approval, action: 'approve' | 'reject' | 'send_back') => {
    setActing(approval);
    setActionType(action);
    setComments('');
  };

  const submitAction = async () => {
    if (!acting) return;
    if ((actionType === 'reject' || actionType === 'send_back') && !comments.trim()) {
      toast.error('Comments are required for reject / send back');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/offers/approvals', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ approvalId: acting.id, action: actionType, comments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      toast.success({
        approve: 'Offer approved at this level',
        reject: 'Offer rejected',
        send_back: 'Offer sent back to HR',
      }[actionType] || 'Action completed');
      setActing(null);
      fetchApprovals();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Clock className="h-6 w-6 text-emerald-600" /> Approval Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Approve, reject, or send back offers pending your review.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchApprovals} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-bold mt-1">{stats.total}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Pending</div><div className="text-2xl font-bold mt-1 text-amber-600">{stats.pending}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Approved</div><div className="text-2xl font-bold mt-1 text-emerald-600">{stats.approved}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Rejected</div><div className="text-2xl font-bold mt-1 text-red-600">{stats.rejected}</div></CardContent></Card>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="p-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-64"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="sent_back">Sent Back</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
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
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading approvals…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && approvals.length === 0 && (
        <Card><CardContent className="p-12 text-center">
          <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium">No {statusFilter !== 'all' ? formatStatus(statusFilter) : ''} approvals</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {statusFilter === 'pending'
              ? 'You\'re all caught up. New approvals will appear here when offers are submitted.'
              : 'Try changing the filter to see other statuses.'}
          </p>
        </CardContent></Card>
      )}

      {/* List */}
      {!loading && !error && approvals.length > 0 && (
        <div className="space-y-2">
          {approvals.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold shrink-0">
                      L{a.level}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {a.candidateName || 'Candidate'}
                        <Badge variant="outline">Level {a.level} · {a.approverRole}</Badge>
                        <Badge className={STATUS_COLORS[a.status] || 'bg-slate-100 text-slate-800'}>{formatStatus(a.status)}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {a.position || 'Position TBD'}</span>
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {a.candidateEmail || '—'}</span>
                        <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {a.offeredCurrency} {a.offeredSalary?.toLocaleString()}</span>
                        <span>Joining: {a.joiningDate ? new Date(a.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD'}</span>
                      </div>
                      {a.comments && (
                        <div className="text-xs text-muted-foreground mt-2 p-2 rounded-md bg-muted/30 border border-border">
                          <span className="font-medium">Comments:</span> {a.comments}
                        </div>
                      )}
                      {a.dueDate && a.status === 'pending' && (
                        <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Due: {new Date(a.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  </div>
                  {a.status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => openAction(a, 'approve')}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openAction(a, 'reject')}>
                        <XCircle className="h-3.5 w-3.5 mr-1 text-red-600" /> Reject
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openAction(a, 'send_back')}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1 text-blue-600" /> Send Back
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Action modal */}
      <Dialog open={!!acting} onOpenChange={(o) => !o && setActing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionType === 'approve' ? 'Approve Offer' : actionType === 'reject' ? 'Reject Offer' : 'Send Back for Changes'}</DialogTitle>
            <DialogDescription>
              {acting?.candidateName} — {acting?.position} (Level {acting?.level} · {acting?.approverRole})
            </DialogDescription>
          </DialogHeader>
          {(actionType === 'reject' || actionType === 'send_back') && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Comments are required when rejecting or sending back an offer.
            </div>
          )}
          <div>
            <Label>Comments {actionType !== 'approve' && <span className="text-red-500">*</span>}</Label>
            <textarea
              className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
              placeholder={actionType === 'approve'
                ? 'Optional — add notes for the audit log'
                : actionType === 'reject'
                ? 'Explain why this offer is being rejected…'
                : 'Explain what changes HR should make before resubmitting…'}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActing(null)} disabled={submitting}>Cancel</Button>
            <Button
              variant={actionType === 'approve' ? 'default' : actionType === 'reject' ? 'destructive' : 'outline'}
              onClick={submitAction}
              disabled={submitting || ((actionType === 'reject' || actionType === 'send_back') && !comments.trim())}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {actionType === 'approve' ? 'Approve' : actionType === 'reject' ? 'Reject Offer' : 'Send Back'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
