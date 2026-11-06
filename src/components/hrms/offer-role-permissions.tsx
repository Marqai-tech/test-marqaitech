'use client';

/**
 * Offer Role Permissions — sidebar entry under OFFER MANAGEMENT.
 *
 * A permission matrix editor: 8 roles × 14 permissions, each cell is an
 * Allow/Deny toggle. The candidate row is locked (only view_offers can
 * be enabled — enforced server-side too).
 *
 * Reuses /api/offers/permissions (GET returns the matrix, PUT replaces
 * the entire matrix). Changes are local until "Save Matrix" is clicked.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Shield, Save, RefreshCw, AlertTriangle, Loader2, Lock, Check, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const ROLE_LABELS: Record<string, string> = {
  hr_admin: 'HR Admin',
  tenant_admin: 'Tenant Admin',
  manager: 'Manager',
  finance: 'Finance',
  dept_head: 'Department Head',
  ceo: 'CEO',
  hr_head: 'HR Head',
  candidate: 'Candidate',
};

const PERMISSION_LABELS: Record<string, string> = {
  view_offers: 'View Offers',
  create_offer: 'Create Offer',
  edit_offer: 'Edit Offer',
  delete_draft: 'Delete Draft',
  select_template: 'Select Template',
  generate_preview: 'Generate Preview',
  download_pdf: 'Download PDF',
  submit_for_approval: 'Submit for Approval',
  approve_offer: 'Approve Offer',
  reject_offer: 'Reject Offer',
  send_offer: 'Send Offer',
  cancel_offer: 'Cancel Offer',
  view_offer_history: 'View History',
  convert_employee: 'Convert Employee',
};

// candidate permissions that can NEVER be enabled (server enforces this)
const CANDIDATE_LOCKED = new Set([
  'create_offer', 'edit_offer', 'delete_draft', 'select_template',
  'generate_preview', 'download_pdf', 'submit_for_approval',
  'approve_offer', 'reject_offer', 'send_offer', 'cancel_offer',
  'view_offer_history', 'convert_employee',
]);

type Matrix = Record<string, Record<string, boolean>>;

export function OfferRolePermissions() {
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [originalMatrix, setOriginalMatrix] = useState<Matrix>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/offers/permissions', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setRoles(data?.roles || []);
      setPermissions(data?.permissions || []);
      setMatrix(data?.matrix || {});
      // Deep clone for dirty-checking
      setOriginalMatrix(JSON.parse(JSON.stringify(data?.matrix || {})));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isDirty = useMemo(() => {
    return JSON.stringify(matrix) !== JSON.stringify(originalMatrix);
  }, [matrix, originalMatrix]);

  const toggleCell = (role: string, permission: string) => {
    // Lock candidate permissions (except view_offers)
    if (role === 'candidate' && CANDIDATE_LOCKED.has(permission)) {
      toast.error('Candidates cannot be granted this permission (safety rule)');
      return;
    }
    setMatrix((m) => ({
      ...m,
      [role]: { ...(m[role] || {}), [permission]: !m[role]?.[permission] },
    }));
  };

  const toggleRow = (role: string, value: boolean) => {
    if (role === 'candidate') {
      // Only view_offers can be toggled for candidates
      setMatrix((m) => ({ ...m, [role]: { ...(m[role] || {}), view_offers: value } }));
      return;
    }
    setMatrix((m) => {
      const newRow: Record<string, boolean> = {};
      for (const p of permissions) newRow[p] = value;
      return { ...m, [role]: newRow };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/offers/permissions', {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({ matrix }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      toast.success(`Permission matrix saved — ${data.upserted} rules`);
      setOriginalMatrix(JSON.parse(JSON.stringify(matrix)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setMatrix(JSON.parse(JSON.stringify(originalMatrix)));
    toast.info('Reverted unsaved changes');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading permissions…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-600" /> Role Permissions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure which roles can perform each offer-related action. Candidate row is locked for safety.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={saving}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={!isDirty || saving}>
            Revert
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Matrix
          </Button>
        </div>
      </div>

      {/* Safety notice */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
        <Lock className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong>Safety rules enforced:</strong>
          <ul className="list-disc ml-4 mt-1 space-y-0.5">
            <li>Candidates can never approve, edit, send, or convert offers</li>
            <li>Candidates can only be granted "View Offers"</li>
            <li>Changes are local until you click "Save Matrix"</li>
          </ul>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Dirty indicator */}
      {isDirty && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          You have unsaved changes. Click "Save Matrix" to persist them.
        </div>
      )}

      {/* Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permission Matrix</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky left-0 bg-muted/50">
                  Permission
                </th>
                {roles.map((role) => (
                  <th key={role} className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[110px] text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span>{ROLE_LABELS[role] || role}</span>
                      {role === 'candidate' && <Lock className="h-3 w-3 text-amber-600" />}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">All</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((perm, pIdx) => (
                <tr key={perm} className={`border-b last:border-0 ${pIdx % 2 === 0 ? '' : 'bg-muted/20'}`}>
                  <td className="px-4 py-3 font-medium sticky left-0 bg-card">
                    {PERMISSION_LABELS[perm] || perm}
                  </td>
                  {roles.map((role) => {
                    const allowed = !!matrix[role]?.[perm];
                    const isLocked = role === 'candidate' && CANDIDATE_LOCKED.has(perm);
                    return (
                      <td key={role} className="px-3 py-3 text-center">
                        {isLocked ? (
                          <div className="flex items-center justify-center">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <Switch
                              checked={allowed}
                              onCheckedChange={() => toggleCell(role, perm)}
                              disabled={isLocked}
                            />
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => {
                          // Set this permission to allow for all non-candidate roles
                          setMatrix((m) => {
                            const next = { ...m };
                            for (const r of roles) {
                              if (r === 'candidate' && CANDIDATE_LOCKED.has(perm)) continue;
                              next[r] = { ...(next[r] || {}), [perm]: true };
                            }
                            return next;
                          });
                        }}
                        className="text-emerald-600 hover:text-emerald-700 p-1"
                        title="Allow for all roles"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setMatrix((m) => {
                            const next = { ...m };
                            for (const r of roles) next[r] = { ...(next[r] || {}), [perm]: false };
                            return next;
                          });
                        }}
                        className="text-red-500 hover:text-red-600 p-1"
                        title="Deny for all roles"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30 border-t">
              <tr>
                <td className="px-4 py-2 font-semibold text-xs uppercase tracking-wider">Allowed count</td>
                {roles.map((role) => {
                  const count = Object.values(matrix[role] || {}).filter(Boolean).length;
                  return (
                    <td key={role} className="px-3 py-2 text-center">
                      <Badge variant="outline" className={count > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}>
                        {count}/{permissions.length}
                      </Badge>
                    </td>
                  );
                })}
                <td className="px-3 py-2"></td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-semibold text-xs uppercase tracking-wider">Quick toggle</td>
                {roles.map((role) => (
                  <td key={role} className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => toggleRow(role, true)}
                        className="text-emerald-600 hover:text-emerald-700 p-1"
                        title="Allow all"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => toggleRow(role, false)}
                        className="text-red-500 hover:text-red-600 p-1"
                        title="Deny all"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                ))}
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* Permission key reference */}
      <Card>
        <CardHeader><CardTitle className="text-base">Permission Reference</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {permissions.map((p) => (
              <div key={p} className="text-xs">
                <code className="font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{p}</code>
                <span className="text-muted-foreground ml-2">{PERMISSION_LABELS[p] || p}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
