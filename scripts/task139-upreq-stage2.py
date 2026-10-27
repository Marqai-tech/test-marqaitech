#!/usr/bin/env python3
"""Task 139 — update-requests stage 2: photo approvals tab + self-service tips."""
p = 'src/app/(dashboard)/employees/update-requests/page.tsx'
src = open(p).read()
edits = 0

def rep(old, new, count=1):
    global src, edits
    n = src.count(old)
    assert n == count, f"anchor x{n} (wanted {count}): {old[:90]!r}"
    src = src.replace(old, new)
    edits += 1

# 1) PhotoApprovals component (module-level, before NewRequestModal)
rep("""function NewRequestModal(""",
"""// Task 139 — profile-photo approval queue (HR/Admin confirm employee photos)
function PhotoApprovals() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/employees/avatar-approvals', { headers: getAuthHeaders() });
      const data = await res.json();
      setRows(data.pending || []);
    } catch { /* keep empty */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (employeeId: string, action: 'approve' | 'reject') => {
    let comment = '';
    if (action === 'approve') comment = window.prompt('Note for the employee? (optional)') || '';
    else {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        comment = window.prompt('Rejection reason (required):') || '';
        if (comment.trim()) break;
        if (window.confirm('A rejection reason is required. Cancel?')) return;
      }
    }
    try {
      const res = await fetch('/api/employees/avatar-approvals', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId, action, comment: comment || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(`Photo ${action}d — the employee has been notified`);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-thb-text-muted">Profile photos submitted by employees. Nothing goes public until you confirm — approving replaces the current photo; rejecting keeps it.</p>
      {loading ? (
        <div className="py-10 text-center text-sm text-thb-text-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-thb-text-muted">No photos waiting for approval.</div>
      ) : (
        rows.map((r) => (
          <div key={String(r.employeeId)} className="flex items-center gap-3 p-3.5 rounded-xl border border-thb-border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={String(r.pendingAvatar)} alt={String(r.name)} className="w-12 h-12 rounded-full object-cover border-2 border-amber-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-thb-text-primary truncate">{String(r.name)}{r.employeeCode ? ` · ${String(r.employeeCode)}` : ''}</p>
              <p className="text-xs text-thb-text-muted truncate">{String(r.designation || r.department || r.email || '')}</p>
              <p className="text-[11px] text-amber-600">Submitted {r.submittedAt ? new Date(String(r.submittedAt)).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'recently'}</p>
            </div>
            <button onClick={() => act(String(r.employeeId), 'approve')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">Approve</button>
            <button onClick={() => act(String(r.employeeId), 'reject')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-semibold hover:bg-red-100">Reject</button>
          </div>
        ))
      )}
    </div>
  );
}

function NewRequestModal(""")

# 2) scope state + tabs: add 'photos'
rep("""  const [scope, setScope] = useState<'mine' | 'inbox' | 'all'>('inbox');""",
"""  const [scope, setScope] = useState<'mine' | 'inbox' | 'all' | 'photos'>('inbox');""")

rep("""  const tabs: { key: 'mine' | 'inbox' | 'all'; label: string; icon: React.ReactNode }[] = [
    { key: 'inbox', label: 'My Approvals', icon: <FiInbox className="w-3.5 h-3.5" /> },
    { key: 'mine', label: 'My Requests', icon: <FiSend className="w-3.5 h-3.5" /> },
    ...(isAdmin ? [{ key: 'all' as const, label: 'All Requests', icon: <FiClock className="w-3.5 h-3.5" /> }] : []),
  ];""",
"""  const tabs: { key: 'mine' | 'inbox' | 'all' | 'photos'; label: string; icon: React.ReactNode }[] = [
    { key: 'inbox', label: 'My Approvals', icon: <FiInbox className="w-3.5 h-3.5" /> },
    { key: 'mine', label: 'My Requests', icon: <FiSend className="w-3.5 h-3.5" /> },
    ...(isAdmin ? [{ key: 'all' as const, label: 'All Requests', icon: <FiClock className="w-3.5 h-3.5" /> }] : []),
    ...(isAdmin ? [{ key: 'photos' as const, label: 'Photo Approvals', icon: <FiUserCheck className="w-3.5 h-3.5" /> }] : []),
  ];""")

open(p, 'w').write(src)
print(f"OK - {edits} edits")
