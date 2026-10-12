// Probe via APP APIs only (the app's own DB view is the truth)
const LIVE = 'https://marqaitechgroup.3boxeshrms.com';
const login = await fetch(LIVE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }) });
const lb = await login.json();
const bearer = lb?.token || '';
const api = async (path, opts = {}) => {
  const res = await fetch(LIVE + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, ...(opts.headers || {}) } });
  const text = await res.text(); let b; try { b = JSON.parse(text); } catch { b = text.slice(0, 300); }
  return { status: res.status, body: b };
};
const wf = await api('/api/employees/workflow-config?type=update_profile');
const cfg = wf.body?.configs?.[0] || {};
console.log('ACTIVE workflow config:');
console.log('  id:', cfg.id, '| name:', cfg.name, '| isActive:', cfg.isActive, '| type:', cfg.workflowType);
try { console.log('  tiers:', JSON.stringify(JSON.parse(cfg.config || '{}').tiers)); } catch { console.log('  config:', cfg.config); }

for (const scope of ['inbox', 'mine', 'all']) {
  const r = await api(`/api/employees/update-requests?scope=${scope}`);
  const list = r.body?.requests || [];
  console.log(`\nscope=${scope}: ${list.length} requests`);
  list.slice(0, 6).forEach(x => console.log(`  - ${x.fieldLabel} | ${x.status} | tier ${x.currentTier} | ${x.employee?.firstName} ${x.employee?.lastName} | steps: ${(x.approvalSteps||[]).map(s => `T${s.tier}:${s.approverType}${s.approverUserId?'+uid':'-uid'}:${s.status}`).join(', ')}`));
}
