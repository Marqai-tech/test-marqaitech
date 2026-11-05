#!/usr/bin/env python3
"""Task 139 — My Profile parity stage 2: UI sections (JSX)."""
p = 'src/app/(dashboard)/my-profile/page.tsx'
src = open(p, encoding='utf-8').read()
edits = 0

def rep(old, new, count=1):
    global src, edits
    n = src.count(old)
    assert n == count, f"anchor x{n} (wanted {count}): {old[:90]!r}"
    src = src.replace(old, new)
    edits += 1

# ── A. Tips banner (edit mode) above the tab bar ──
rep("""      <div className="thb-card overflow-hidden">
        <div className="bg-slate-50/60 border-b border-thb-border overflow-x-auto">
          <nav className="flex min-w-max px-1">
            {profileTabs.map((tab) => {""",
"""      {/* Task 139 — self-service tips: what you can change vs what goes for approval */}
      {showFields && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-900 space-y-1.5">
          <p className="font-bold flex items-center gap-1.5"><FiZap className="w-3.5 h-3.5" /> What you can change yourself — tips</p>
          <p><span className="font-semibold">Applied immediately:</span> phone, personal email, addresses, emergency contacts, interests, technical skills, experience entries, achievements and family details save straight to your profile.</p>
          <p><span className="font-semibold">Goes to HR/Admin for approval:</span> bank / PF / ESI / KYC numbers, gender, marital status, nationality, blood group and health details are routed as approval requests. Your submitted profile photo also needs HR/Admin confirmation before other employees can see it.</p>
          <p><span className="font-semibold">Locked (contact HR/Admin):</span> first name, last name and Date of Birth cannot be changed from self-service. Original Birthday IS editable — it drives your birthday wishes.</p>
          <p><span className="font-semibold">Need something else changed?</span> Use the "Request Change" option in Employee → Update Requests for approval-routed field changes.</p>
        </div>
      )}

      <div className="thb-card overflow-hidden">
        <div className="bg-slate-50/60 border-b border-thb-border overflow-x-auto">
          <nav className="flex min-w-max px-1">
            {profileTabs.map((tab) => {""")

# ── B. Personal tab VIEW: Original Birthday + Interests rows ──
rep("""                  <InfoRow label="Date of Birth" value={formatDate(emp?.dateOfBirth)} icon={<FiCalendar className="w-3.5 h-3.5" />} />""",
"""                  <InfoRow label="Date of Birth" value={formatDate(emp?.dateOfBirth)} icon={<FiCalendar className="w-3.5 h-3.5" />} />
                  <InfoRow label="Original Birthday (birthday wishes)" value={formatDate(emp?.originalBirthday) || 'Not set — falls back to Date of Birth'} icon={<FiCalendar className="w-3.5 h-3.5" />} />
                  <InfoRow label="Interests" value={str(emp?.interests) || null} icon={<FiZap className="w-3.5 h-3.5" />} />""")

# ── C. Personal tab EDIT: interests input after Original Birthday ──
rep("""                  <EditField label="Original Birthday (for birthday wishes)">""",
"""                  <EditField label="Interests (comma-separated, e.g., Gardening, Music)">
                    {/* Task 139 — interests chips (direct self-service) */}
                    <input type="text" value={editForm.interests || ''} onChange={e => updateEditField('interests', e.target.value)} placeholder="Gardening, Chess, Music…" className={fieldClass} />
                  </EditField>
                  <EditField label="Original Birthday (for birthday wishes)">""")

# ── D. Dependents editor (Health tab, after Emergency Medical & Insurance card) ──
anchor_dep = """            <SectionCard title="Emergency Medical & Insurance" icon={<FiActivity className="w-4 h-4" />} accent="amber">"""
# find the END of this SectionCard — safer: insert BEFORE it a new card
rep(anchor_dep,
"""            {/* Task 139 — Family Details (Medical Insurance) editor */}
            <SectionCard title="Family Details (Medical Insurance)" icon={<FiHeart className="w-4 h-4" />} accent="rose">
              {showFields ? (
                <div className="col-span-full space-y-3">
                  {profileDependents.map((dep, di) => (
                    <div key={di} className="p-3 rounded-xl border border-thb-border bg-slate-50/60 grid grid-cols-1 md:grid-cols-4 gap-3">
                      <EditField label="Name">
                        <input type="text" value={dep.name} onChange={(e) => setProfileDependents((prev) => prev.map((x, i) => (i === di ? { ...x, name: e.target.value } : x)))} className={fieldClass} />
                      </EditField>
                      <EditField label="Relationship">
                        <select value={dep.relationship} onChange={(e) => setProfileDependents((prev) => prev.map((x, i) => (i === di ? { ...x, relationship: e.target.value } : x)))} className={fieldClass}>
                          <option value="">Select</option>
                          {['spouse', 'son', 'daughter', 'father', 'mother', 'other'].map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                        </select>
                      </EditField>
                      <EditField label="Date of Birth">
                        <input type="date" value={dep.dateOfBirth} onChange={(e) => setProfileDependents((prev) => prev.map((x, i) => (i === di ? { ...x, dateOfBirth: e.target.value } : x)))} className={fieldClass} />
                      </EditField>
                      <div className="flex items-end gap-2">
                        <EditField label="Gender">
                          <select value={dep.gender} onChange={(e) => setProfileDependents((prev) => prev.map((x, i) => (i === di ? { ...x, gender: e.target.value } : x)))} className={fieldClass}>
                            <option value="">Select</option>
                            {['male', 'female', 'other'].map((g) => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                          </select>
                        </EditField>
                        <button type="button" onClick={() => setProfileDependents((prev) => prev.filter((_, i) => i !== di))} className="p-2 mb-1 rounded-lg text-red-500 hover:bg-red-50" title="Remove">
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setProfileDependents((prev) => [...prev, { name: '', relationship: '', dateOfBirth: '', gender: '' }])} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-semibold border border-rose-200 hover:bg-rose-100">
                    <FiPlus className="w-3.5 h-3.5" /> Add Family Member
                  </button>
                  <p className="text-[10px] text-thb-text-muted">Used for medical insurance cover — saved immediately when you click Save Changes.</p>
                </div>
              ) : (
                <div className="col-span-full">
                  {profileDependents.length === 0 ? (
                    <p className="text-xs text-thb-text-muted">No family details added yet. Click Edit Profile to add them for medical insurance.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {profileDependents.map((dep, di) => (
                        <div key={di} className="p-3 rounded-xl border border-thb-border bg-slate-50/60">
                          <p className="text-sm font-semibold text-thb-text-primary">{dep.name || `Member ${di + 1}`}</p>
                          <p className="text-xs text-thb-text-muted">{dep.relationship ? dep.relationship.charAt(0).toUpperCase() + dep.relationship.slice(1) : '—'}{dep.dateOfBirth ? ` · ${formatDate(dep.dateOfBirth)}` : ''}{dep.gender ? ` · ${dep.gender}` : ''}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Emergency Medical & Insurance" icon={<FiActivity className="w-4 h-4" />} accent="amber">""")

open(p, 'w', encoding='utf-8').write(src)
print(f"stage 2 OK — {edits} edits")
