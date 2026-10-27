#!/usr/bin/env python3
"""Task 139 — update-requests page: own-employee picker gating, revised fields,
tips, photo-approvals tab."""
p = 'src/app/(dashboard)/employees/update-requests/page.tsx'
src = open(p).read()
edits = 0

def rep(old, new, count=1):
    global src, edits
    n = src.count(old)
    assert n == count, f"anchor x{n} (wanted {count}): {old[:90]!r}"
    src = src.replace(old, new)
    edits += 1

# 1) Revised REQUESTABLE_FIELDS: locked fields removed; originalBirthday added
rep("""  { field: 'firstName', label: 'First Name', category: 'Personal (approval required)' },
  { field: 'lastName', label: 'Last Name', category: 'Personal (approval required)' },
  { field: 'dateOfBirth', label: 'Date of Birth', category: 'Personal (approval required)' },""",
"""  // Task 139 — firstName / lastName / dateOfBirth are LOCKED for self-service
  // (direct AND request) — contact HR/Admin. Original Birthday is requestable.
  { field: 'originalBirthday', label: 'Original Birthday (birthday wishes)', category: 'Personal (approval required)' },""")

# 2) Modal: own-employee gating for non-admins
rep("""function NewRequestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [field, setField] = useState('');
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/employees?limit=500', { headers: getAuthHeaders() });
        const data = await res.json();
        const list = (data.employees || data.data || []) as Array<{ id: string; firstName?: string; lastName?: string; employeeId?: string }>;
        const mapped = list.map((e) => ({ id: e.id, name: `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Unnamed', code: e.employeeId || '' }));
        setEmployees(mapped);
        if (mapped.length === 1) setEmployeeId(mapped[0].id);
      } catch { /* ignore */ }
    })();
  }, []);""",
"""function NewRequestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [field, setField] = useState('');
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'].includes(
    (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('tb_user') || '{}').role : '') || '',
  );

  useEffect(() => {
    (async () => {
      try {
        // Task 139 — employees can only raise changes for THEMSELVES (the
        // picker showed every employee in the tenant). Admins keep the picker.
        if (!isAdmin) {
          const me = await fetch('/api/users/profile', { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          const emp = (me?.employee || {}) as Record<string, unknown>;
          const own = { id: String(emp.id || ''), name: `${String(emp.firstName || '')} ${String(emp.lastName || '')}`.trim() || 'My profile', code: String(emp.employeeId || '') };
          setEmployees(own.id ? [own] : []);
          setEmployeeId(own.id);
          return;
        }
        const res = await fetch('/api/employees?limit=500', { headers: getAuthHeaders() });
        const data = await res.json();
        const list = (data.employees || data.data || []) as Array<{ id: string; firstName?: string; lastName?: string; employeeId?: string }>;
        const mapped = list.map((e) => ({ id: e.id, name: `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Unnamed', code: e.employeeId || '' }));
        setEmployees(mapped);
        if (mapped.length === 1) setEmployeeId(mapped[0].id);
      } catch { /* ignore */ }
    })();
  }, []);""")

# 3) Picker hidden for non-admins
rep("""            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">""",
"""            {isAdmin ? (
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">""")

rep("""              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.code ? ` · ${e.code}` : ''}</option>)}
            </select>""",
"""              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.code ? ` · ${e.code}` : ''}</option>)}
              </select>
            ) : (
              <input type="text" value="Your own profile" disabled className="w-full px-3 py-2 border rounded-lg text-sm bg-slate-50 text-slate-500" />
            )}""")

open(p, 'w').write(src)
print(f"OK - {edits} edits")
