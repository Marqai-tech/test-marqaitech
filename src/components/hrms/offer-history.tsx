'use client';

/**
 * Offer History timeline — embedded inside the Offer Dashboard's view
 * modal, and also reusable as a standalone widget.
 *
 * Fetches /api/offers/[id]/history and renders a vertical timeline
 * combining audit log events and per-level approval events.
 */
import React, { useEffect, useState } from 'react';
import {
  FileText, CheckCircle2, XCircle, RotateCcw, Send, Eye, Download,
  Trash2, ArrowUpRight, User, AlertTriangle, Loader2, FileCheck, UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface TimelineEvent {
  id: string;
  type: 'audit' | 'approval';
  action: string;
  label: string;
  user?: string;
  userEmail?: string;
  details?: string;
  comments?: string;
  level?: number;
  approverRole?: string;
  status?: string;
  timestamp: string;
}

interface Props {
  offerId: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  CREATE_OFFER: <FileText className="h-4 w-4 text-blue-600" />,
  UPDATE_OFFER_STATUS: <ArrowUpRight className="h-4 w-4 text-amber-600" />,
  UPDATE_OFFER: <FileText className="h-4 w-4 text-slate-600" />,
  DELETE_OFFER: <Trash2 className="h-4 w-4 text-red-600" />,
  OFFER_SUBMIT_APPROVAL: <ArrowUpRight className="h-4 w-4 text-amber-600" />,
  OFFER_APPROVE: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  OFFER_REJECT: <XCircle className="h-4 w-4 text-red-600" />,
  OFFER_SEND_BACK: <RotateCcw className="h-4 w-4 text-blue-600" />,
  OFFER_SEND: <Send className="h-4 w-4 text-violet-600" />,
  OFFER_ACCEPTED: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  OFFER_DECLINED: <XCircle className="h-4 w-4 text-red-600" />,
  OFFER_VIEWED: <Eye className="h-4 w-4 text-slate-600" />,
  OFFER_DOWNLOADED: <Download className="h-4 w-4 text-slate-600" />,
  OFFER_CANCELLED: <XCircle className="h-4 w-4 text-red-600" />,
  OFFER_CONVERTED: <UserCheck className="h-4 w-4 text-emerald-700" />,
  OFFER_PDF_GENERATED: <FileCheck className="h-4 w-4 text-blue-600" />,
  UPDATE_OFFER_PERMISSIONS: <FileText className="h-4 w-4 text-slate-600" />,
  UPDATE_OFFER_WORKFLOW_CONFIG: <FileText className="h-4 w-4 text-slate-600" />,
};

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ts; }
}

export function OfferHistory({ offerId }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/offers/${offerId}/history`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const data = await res.json();
        if (!cancelled) setEvents(data?.events || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [offerId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>{error}</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No history events yet. The timeline will populate as this offer moves through its lifecycle.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Timeline ({events.length} events)
      </div>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
        <div className="space-y-3">
          {events.map((event, idx) => {
            const icon = ACTION_ICONS[event.action] ||
              (event.type === 'approval'
                ? event.status === 'approved'
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  : event.status === 'rejected'
                  ? <XCircle className="h-4 w-4 text-red-600" />
                  : <ArrowUpRight className="h-4 w-4 text-amber-600" />
                : <FileText className="h-4 w-4 text-slate-600" />
              );
            return (
              <div key={`${event.id}-${idx}`} className="relative flex gap-3">
                {/* Icon */}
                <div className="relative z-10 shrink-0 w-8 h-8 rounded-full bg-background border-2 border-border flex items-center justify-center">
                  {icon}
                </div>
                {/* Content */}
                <div className="flex-1 pb-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{event.label}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <User className="h-3 w-3" />
                        {event.user || 'System'}
                        {event.userEmail && <span className="text-muted-foreground">· {event.userEmail}</span>}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {formatDate(event.timestamp)}
                    </div>
                  </div>
                  {event.comments && (
                    <div className="mt-1.5 text-xs rounded-md border border-border bg-muted/30 p-2">
                      <span className="font-medium">Comments:</span> {event.comments}
                    </div>
                  )}
                  {event.details && !event.comments && (
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {event.details}
                    </div>
                  )}
                  {event.type === 'approval' && (
                    <Badge variant="outline" className="mt-1.5 text-[10px]">
                      Level {event.level} · {event.approverRole}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
