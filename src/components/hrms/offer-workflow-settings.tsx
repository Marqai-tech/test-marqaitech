'use client';

/**
 * Offer Workflow Settings — sidebar entry under OFFER MANAGEMENT.
 *
 * Combines two screens from the spec into one tabbed UI:
 *   - Approval Workflow: configure approval levels (add/remove/reorder)
 *   - Workflow Rules: salary threshold, expiry days, e-signature, etc.
 *
 * Reuses /api/offers/workflow-config (GET/PUT).
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Settings, Save, RefreshCw, AlertTriangle, Loader2, Plus, Trash2, ChevronUp, ChevronDown, ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface ApprovalLevel {
  tier: number;
  approverType: string;
  approverUserId?: string | null;
  label?: string;
}

interface Rules {
  salaryThreshold?: number;
  requiredApproverRoles?: string[];
  rejectionBehavior?: string;
  candidateNotification?: boolean;
  approvalReminderDays?: number;
  offerExpiryDays?: number;
  esignatureRequired?: boolean;
  autoConvertAfterAcceptance?: boolean;
  bgvRequired?: boolean;
  preboardingAfterAcceptance?: boolean;
  employeeIdFormat?: string;
}

const APPROVER_TYPES = [
  { value: 'hr_admin', label: 'HR Admin' },
  { value: 'tenant_admin', label: 'Tenant Admin' },
  { value: 'manager', label: 'Reporting Manager' },
  { value: 'dept_head', label: 'Department Head' },
  { value: 'finance', label: 'Finance / Budget' },
  { value: 'hr_head', label: 'HR Head' },
  { value: 'ceo', label: 'CEO' },
];

const DEFAULT_LEVELS: ApprovalLevel[] = [
  { tier: 1, approverType: 'hr_admin', label: 'HR Admin Approval' },
  { tier: 2, approverType: 'finance', label: 'Finance / Budget Approval' },
  { tier: 3, approverType: 'ceo', label: 'CEO Final Approval' },
];

const DEFAULT_RULES: Rules = {
  salaryThreshold: 1500000,
  requiredApproverRoles: ['hr_admin', 'finance', 'ceo'],
  rejectionBehavior: 'send_back_to_hr',
  candidateNotification: true,
  approvalReminderDays: 2,
  offerExpiryDays: 7,
  esignatureRequired: false,
  autoConvertAfterAcceptance: false,
  bgvRequired: true,
  preboardingAfterAcceptance: true,
  employeeIdFormat: 'EMP-{YYYY}-{NNN}',
};

export function OfferWorkflowSettings() {
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [levels, setLevels] = useState<ApprovalLevel[]>(DEFAULT_LEVELS);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/offers/workflow-config', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      const cfg = data?.config;
      if (cfg) {
        setApprovalRequired(cfg.approvalRequired);
        setLevels(cfg.levels || DEFAULT_LEVELS);
        setRules(cfg.rules || DEFAULT_RULES);
        setIsDefault(!!data.isDefault);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workflow config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Level management
  const addLevel = () => {
    setLevels((l) => [...l, { tier: l.length + 1, approverType: 'hr_admin', label: `Level ${l.length + 1}` }]);
  };
  const removeLevel = (idx: number) => {
    setLevels((l) => l.filter((_, i) => i !== idx).map((lvl, i) => ({ ...lvl, tier: i + 1 })));
  };
  const moveLevel = (idx: number, dir: -1 | 1) => {
    setLevels((l) => {
      const arr = [...l];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr.map((lvl, i) => ({ ...lvl, tier: i + 1 }));
    });
  };
  const updateLevel = (idx: number, patch: Partial<ApprovalLevel>) => {
    setLevels((l) => l.map((lvl, i) => i === idx ? { ...lvl, ...patch } : lvl));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/offers/workflow-config', {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({ approvalRequired, levels, rules }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      toast.success('Workflow configuration saved');
      setIsDefault(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading workflow config…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Settings className="h-6 w-6 text-emerald-600" /> Offer Workflow Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure approval levels and rules for your tenant's offer workflow.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={saving}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Configuration
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {isDefault && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
          <ListChecks className="h-5 w-5 shrink-0 mt-0.5" />
          <div>You're using the default workflow. Customize the approval levels and rules below, then click Save to apply them to your tenant.</div>
        </div>
      )}

      {/* Approval required toggle */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <div className="font-medium">Approval Required</div>
            <div className="text-xs text-muted-foreground">When ON, offers must go through the approval chain before being sent. When OFF, offers are auto-approved on submit.</div>
          </div>
          <Switch checked={approvalRequired} onCheckedChange={setApprovalRequired} />
        </CardContent>
      </Card>

      <Tabs defaultValue="levels">
        <TabsList>
          <TabsTrigger value="levels">Approval Levels ({levels.length})</TabsTrigger>
          <TabsTrigger value="rules">Workflow Rules</TabsTrigger>
        </TabsList>

        {/* Levels tab */}
        <TabsContent value="levels" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Approval Chain</span>
                <Button size="sm" variant="outline" onClick={addLevel}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Level
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {levels.length === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No levels configured. Add one to require approval.
                </div>
              )}
              {levels.map((lvl, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-md border border-border">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold shrink-0">
                    L{lvl.tier}
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Approver Role</Label>
                      <Select value={lvl.approverType} onValueChange={(v) => updateLevel(idx, { approverType: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {APPROVER_TYPES.map((a) => (
                            <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Label (optional)</Label>
                      <Input
                        value={lvl.label || ''}
                        onChange={(e) => updateLevel(idx, { label: e.target.value })}
                        placeholder={`Level ${idx + 1}`}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => moveLevel(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 text-muted-foreground hover:text-emerald-600 disabled:opacity-30"
                      title="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveLevel(idx, 1)}
                      disabled={idx === levels.length - 1}
                      className="p-1 text-muted-foreground hover:text-emerald-600 disabled:opacity-30"
                      title="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeLevel(idx)}
                    className="p-1.5 text-muted-foreground hover:text-red-600"
                    title="Remove level"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rules tab */}
        <TabsContent value="rules" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Salary & Approval Rules</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Salary Threshold (LPA)</Label>
                  <Input
                    type="number"
                    value={rules.salaryThreshold ?? ''}
                    onChange={(e) => setRules({ ...rules, salaryThreshold: Number(e.target.value) })}
                    placeholder="1500000"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Offers above this salary require multi-level approval.</p>
                </div>
                <div>
                  <Label>Approval Reminder Days</Label>
                  <Input
                    type="number"
                    value={rules.approvalReminderDays ?? ''}
                    onChange={(e) => setRules({ ...rules, approvalReminderDays: Number(e.target.value) })}
                    placeholder="2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Days before pending approvers get a reminder.</p>
                </div>
                <div>
                  <Label>Offer Expiry Days</Label>
                  <Input
                    type="number"
                    value={rules.offerExpiryDays ?? ''}
                    onChange={(e) => setRules({ ...rules, offerExpiryDays: Number(e.target.value) })}
                    placeholder="7"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Days after which a sent offer auto-expires.</p>
                </div>
                <div>
                  <Label>Rejection Behavior</Label>
                  <Select
                    value={rules.rejectionBehavior || 'send_back_to_hr'}
                    onValueChange={(v) => setRules({ ...rules, rejectionBehavior: v })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="send_back_to_hr">Send back to HR (revise)</SelectItem>
                      <SelectItem value="reject_permanently">Reject permanently</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Required Approver Roles</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {APPROVER_TYPES.map((a) => {
                  const selected = (rules.requiredApproverRoles || []).includes(a.value);
                  return (
                    <button
                      key={a.value}
                      onClick={() => {
                        const current = rules.requiredApproverRoles || [];
                        setRules({
                          ...rules,
                          requiredApproverRoles: selected
                            ? current.filter((r) => r !== a.value)
                            : [...current, a.value],
                        });
                      }}
                      className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                        selected
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                          : 'bg-background text-muted-foreground border-border hover:bg-accent'
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Toggle Rules</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow label="Candidate Notification" description="Notify candidates by email when their offer is sent."
                checked={!!rules.candidateNotification}
                onChange={(v) => setRules({ ...rules, candidateNotification: v })} />
              <ToggleRow label="E-Signature Required" description="Require candidates to e-sign the offer before acceptance is valid."
                checked={!!rules.esignatureRequired}
                onChange={(v) => setRules({ ...rules, esignatureRequired: v })} />
              <ToggleRow label="Auto-convert to Employee" description="After acceptance, automatically start the employee conversion workflow."
                checked={!!rules.autoConvertAfterAcceptance}
                onChange={(v) => setRules({ ...rules, autoConvertAfterAcceptance: v })} />
              <ToggleRow label="BGV Required" description="Background verification must complete before employee activation."
                checked={!!rules.bgvRequired}
                onChange={(v) => setRules({ ...rules, bgvRequired: v })} />
              <ToggleRow label="Preboarding After Acceptance" description="Start preboarding checklist when the offer is accepted."
                checked={!!rules.preboardingAfterAcceptance}
                onChange={(v) => setRules({ ...rules, preboardingAfterAcceptance: v })} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Employee ID Format</CardTitle></CardHeader>
            <CardContent>
              <Label>Employee ID Pattern</Label>
              <Input
                value={rules.employeeIdFormat || ''}
                onChange={(e) => setRules({ ...rules, employeeIdFormat: e.target.value })}
                placeholder="EMP-{YYYY}-{NNN}"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Placeholders: <code>{'{YYYY}'}</code> year · <code>{'{NNN}'}</code> sequential number · <code>{'{DEPT}'}</code> department code
              </p>
              <div className="mt-2">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  Example: {(rules.employeeIdFormat || 'EMP-{YYYY}-{NNN}')
                    .replace('{YYYY}', String(new Date().getFullYear()))
                    .replace('{NNN}', '001')
                    .replace('{DEPT}', 'ENG')}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-border">
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
