#!/usr/bin/env python3
"""Task 139 — My Profile parity stage 3: employment skills, experience rebuild,
achievements, policies grid, documents View, avatar pending badge."""
p = 'src/app/(dashboard)/my-profile/page.tsx'
src = open(p, encoding='utf-8').read()
edits = 0

def rep(old, new, count=1):
    global src, edits
    n = src.count(old)
    assert n == count, f"anchor x{n} (wanted {count}): {old[:90]!r}"
    src = src.replace(old, new)
    edits += 1

# ── A. Employment tab: Technical Skills section (insert before Organization card) ──
rep("""            <SectionCard title="Organization" """,
"""            {/* Task 139 — Technical Skills (direct self-service) */}
            <SectionCard title="Technical Skills" icon={<FiZap className="w-4 h-4" />} accent="violet">
              {showFields ? (
                <div className="col-span-full space-y-3">
                  {profileSkills.map((s, si) => (
                    <div key={si} className="p-3 rounded-xl border border-thb-border bg-slate-50/60 grid grid-cols-1 md:grid-cols-4 gap-3">
                      <EditField label="Skill">
                        <input type="text" value={s.skill} onChange={(e) => setProfileSkills((prev) => prev.map((x, i) => (i === si ? { ...x, skill: e.target.value } : x)))} placeholder="e.g., React" className={fieldClass} />
                      </EditField>
                      <EditField label="Level">
                        <select value={s.level} onChange={(e) => setProfileSkills((prev) => prev.map((x, i) => (i === si ? { ...x, level: e.target.value } : x)))} className={fieldClass}>
                          {PROFILE_SKILL_LEVELS.map((lv) => <option key={lv} value={lv}>{lv.charAt(0).toUpperCase() + lv.slice(1)}</option>)}
                        </select>
                      </EditField>
                      <EditField label="Years of Experience">
                        <input type="number" min="0" max="50" value={s.yearsOfExp} onChange={(e) => setProfileSkills((prev) => prev.map((x, i) => (i === si ? { ...x, yearsOfExp: e.target.value } : x)))} className={fieldClass} />
                      </EditField>
                      <div className="flex items-end">
                        <button type="button" onClick={() => setProfileSkills((prev) => prev.filter((_, i) => i !== si))} className="p-2 mb-1 rounded-lg text-red-500 hover:bg-red-50" title="Remove skill">
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setProfileSkills((prev) => [...prev, { skill: '', level: 'intermediate', yearsOfExp: '' }])} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold border border-violet-200 hover:bg-violet-100">
                    <FiPlus className="w-3.5 h-3.5" /> Add Skill
                  </button>
                  <p className="text-[10px] text-thb-text-muted">Powers the skill matrix on the dashboards — saved immediately when you click Save Changes.</p>
                </div>
              ) : (
                <div className="col-span-full">
                  {profileSkills.length === 0 ? (
                    <p className="text-xs text-thb-text-muted">No technical skills added yet. Click Edit Profile to add them.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {profileSkills.map((s, si) => (
                        <span key={si} className="px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 text-xs font-medium">
                          {s.skill}{s.level ? ` · ${s.level.charAt(0).toUpperCase() + s.level.slice(1)}` : ''}{s.yearsOfExp ? ` · ${s.yearsOfExp}y` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Organization" """)

# ── B. Experience tab: replace the flat editor cards block with the structured rebuild.
# The legacy block iterates [1,2,3] with previousEmployerN EditFields; keep the
# legacy VIEW fallback but swap the EDIT side for the structured editor.
anchor = """        {activeTab === 'experience' && ("""
idx = src.index(anchor)
# find the enclosing `{activeTab === 'experience' && (` ... `)}` — locate the matching close by scanning braces
i = idx + len(anchor)
depth = 1
while depth > 0:
    ch = src[i]
    if ch in '({[':
        depth += 1
    elif ch in ')}]':
        depth -= 1
    i += 1
block = src[idx:i]
print(f"experience block length: {len(block)}")

new_block = """{activeTab === 'experience' && (
          <div className="space-y-5">
            {/* Task 139 — structured experience entries (parity with Add/Edit Employee) */}
            <SectionCard title="Previous Experience" icon={<FiBriefcase className="w-4 h-4" />} accent="amber">
              {showFields ? (
                <div className="col-span-full space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-thb-text-muted">Add as many entries as your real career history — logos are picked automatically from the web.</p>
                    <button type="button" onClick={() => setProfileExperiences((prev) => [...prev, { company: '', designation: '', fromDate: '', toDate: '', isCurrent: false, description: '', companyLogo: '', companyCategory: '', companyLevel: '', domains: [], letters: [], letterType: 'offer_letter' }])} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200 hover:bg-amber-100">
                      <FiPlus className="w-3.5 h-3.5" /> Add Experience
                    </button>
                  </div>
                  {profileExperiences.length === 0 && <p className="text-xs text-thb-text-muted py-2">No experience entries yet.</p>}
                  {profileExperiences.map((exp, xi) => (
                    <div key={xi} className="p-4 rounded-xl border border-thb-border bg-slate-50/60 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-lg bg-white border border-thb-border flex items-center justify-center overflow-hidden flex-shrink-0">
                            {exp.companyLogo ? <img src={exp.companyLogo} alt={exp.company || 'Company'} className="w-8 h-8 object-contain" /> : <FiBriefcase className="w-5 h-5 text-slate-300" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-thb-text-primary truncate">{exp.company || `Experience ${xi + 1}`}</p>
                            <p className="text-xs text-thb-text-muted truncate">{exp.designation || 'Designation'}{exp.isCurrent ? ' · Current' : ''}</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => setProfileExperiences((prev) => prev.filter((_, i) => i !== xi))} className="p-2 rounded-lg text-red-500 hover:bg-red-50 flex-shrink-0" title="Remove experience">
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <EditField label="Previous Employer *">
                          <input type="text" value={exp.company} onChange={(e) => setProfileExperiences((prev) => prev.map((x, i) => (i === xi ? { ...x, company: e.target.value } : x)))} placeholder="e.g., Infosys" className={fieldClass} />
                        </EditField>
                        <EditField label="Designation *">
                          <input type="text" value={exp.designation} onChange={(e) => setProfileExperiences((prev) => prev.map((x, i) => (i === xi ? { ...x, designation: e.target.value } : x)))} placeholder="e.g., Senior Engineer" className={fieldClass} />
                        </EditField>
                        <EditField label="Company Logo URL">
                          <input type="text" value={exp.companyLogo} onChange={(e) => setProfileExperiences((prev) => prev.map((x, i) => (i === xi ? { ...x, companyLogo: e.target.value } : x)))} placeholder="Auto/manual logo URL" className={fieldClass} />
                        </EditField>
                        <EditField label="From Date *">
                          <input type="date" value={exp.fromDate} onChange={(e) => setProfileExperiences((prev) => prev.map((x, i) => (i === xi ? { ...x, fromDate: e.target.value } : x)))} className={fieldClass} />
                        </EditField>
                        <EditField label="To Date">
                          <input type="date" value={exp.toDate} disabled={exp.isCurrent} onChange={(e) => setProfileExperiences((prev) => prev.map((x, i) => (i === xi ? { ...x, toDate: e.target.value } : x)))} className={`${fieldClass} disabled:bg-slate-100`} />
                          <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-thb-text-secondary cursor-pointer">
                            <input type="checkbox" checked={exp.isCurrent} onChange={(e) => setProfileExperiences((prev) => prev.map((x, i) => (i === xi ? { ...x, isCurrent: e.target.checked, toDate: e.target.checked ? '' : x.toDate } : x)))} className="w-3.5 h-3.5 accent-amber-600" />
                            Currently working here
                          </label>
                        </EditField>
                        <EditField label="Reason for Leaving">
                          <input type="text" value={exp.description} onChange={(e) => setProfileExperiences((prev) => prev.map((x, i) => (i === xi ? { ...x, description: e.target.value } : x)))} placeholder="Optional" className={fieldClass} />
                        </EditField>
                      </div>
                      {/* domains multi-select */}
                      <div>
                        <p className="text-[10px] font-semibold text-thb-text-muted uppercase tracking-wider mb-1.5">Domains worked in <span className="normal-case font-normal">(select all that apply)</span></p>
                        <div className="flex flex-wrap gap-1.5">
                          {PROFILE_EXP_DOMAINS.map((d) => {
                            const active = exp.domains.includes(d);
                            return (
                              <button key={d} type="button" onClick={() => setProfileExperiences((prev) => prev.map((x, i) => (i === xi ? { ...x, domains: active ? x.domains.filter((y) => y !== d) : [...x.domains, d] } : x)))} className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${active ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-thb-border text-thb-text-muted hover:border-amber-200'}`}>
                                {active ? '\\u2713 ' : ''}{d}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {/* letters attach */}
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold text-thb-text-muted uppercase tracking-wider">Letters from this company (offer / relieving / …)</p>
                        {exp.letters.map((l, li) => (
                          <div key={li} className="flex items-center gap-2 text-xs bg-white border border-thb-border rounded-lg px-2.5 py-1.5">
                            <FiFileText className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                            <span className="font-semibold text-thb-text-primary flex-shrink-0">{(PROFILE_LETTER_TYPES.find((t) => t.value === l.type) || {}).label || 'Letter'}</span>
                            <span className="truncate text-thb-text-secondary flex-1">{l.name}</span>
                            <button type="button" onClick={() => openDocumentInNewTab(l.fileUrl, l.name)} className="p-1 rounded text-teal-600 hover:bg-teal-50" title="View letter"><FiEye className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => setProfileExperiences((prev) => prev.map((x, i) => (i === xi ? { ...x, letters: x.letters.filter((_, j) => j !== li) } : x)))} className="p-1 rounded text-red-500 hover:bg-red-50" title="Remove letter"><FiTrash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 flex-wrap">
                          <select value={exp.letterType} onChange={(e) => setProfileExperiences((prev) => prev.map((x, i) => (i === xi ? { ...x, letterType: e.target.value } : x)))} className="px-2.5 py-1.5 rounded-lg border border-thb-border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20">
                            {PROFILE_LETTER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100">
                            <FiPaperclip className="w-3.5 h-3.5" /> Attach letter (PDF / image / Word, max 3MB)
                            <input type="file" className="hidden" accept=".pdf,image/jpeg,image/png,.doc,.docx" onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (!file) return;
                              if (file.size > 3 * 1024 * 1024) { toast.error('Letter must be under 3MB.'); return; }
                              const reader = new FileReader();
                              reader.onloadend = () => setProfileExperiences((prev) => prev.map((x, i) => (i === xi ? { ...x, letters: [...x.letters, { name: file.name, type: x.letterType || 'offer_letter', fileUrl: String(reader.result) }] } : x)));
                              reader.readAsDataURL(file);
                            }} />
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="col-span-full space-y-3">
                  {profileExperiences.length === 0 ? (
                    <p className="text-xs text-thb-text-muted">No experience entries yet. Click Edit Profile to add them.</p>
                  ) : (
                    profileExperiences.map((exp, xi) => (
                      <div key={xi} className="p-4 rounded-xl border border-thb-border bg-slate-50/60 flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-white border border-thb-border flex items-center justify-center overflow-hidden flex-shrink-0">
                          {exp.companyLogo ? <img src={exp.companyLogo} alt={exp.company} className="w-9 h-9 object-contain" /> : <FiBriefcase className="w-5 h-5 text-slate-300" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-thb-text-primary flex items-center gap-2 flex-wrap">
                            {exp.company}
                            {exp.isCurrent && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200">Current</span>}
                          </p>
                          <p className="text-xs text-thb-text-muted">{exp.designation}{exp.fromDate ? ` · ${exp.fromDate} → ${exp.isCurrent ? 'present' : exp.toDate || '—'}` : ''}</p>
                          {exp.domains.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {exp.domains.map((d) => <span key={d} className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-medium">{d}</span>)}
                            </div>
                          )}
                          {exp.letters.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {exp.letters.filter((l) => l.fileUrl).map((l, li) => (
                                <button key={li} type="button" onClick={() => openDocumentInNewTab(l.fileUrl, l.name)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-[11px] font-medium hover:bg-teal-100">
                                  <FiFileText className="w-3.5 h-3.5" /> {(PROFILE_LETTER_TYPES.find((t) => t.value === l.type) || {}).label || 'Letter'}
                                </button>
                              ))}
                            </div>
                          )}
                          {exp.description && <p className="text-xs text-thb-text-muted mt-1">{exp.description}</p>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </SectionCard>

            {/* Task 139 — Achievements (direct self-service) */}
            <SectionCard title="Achievements" icon={<FiAward className="w-4 h-4" />} accent="violet">
              {showFields ? (
                <div className="col-span-full space-y-3">
                  {profileAchievements.map((a, ai) => (
                    <div key={ai} className="p-3 rounded-xl border border-violet-100 bg-violet-50/40 grid grid-cols-1 md:grid-cols-4 gap-3">
                      <EditField label="Title *">
                        <input type="text" value={a.title} onChange={(e) => setProfileAchievements((prev) => prev.map((x, i) => (i === ai ? { ...x, title: e.target.value } : x)))} placeholder="e.g., Star Performer" className={fieldClass} />
                      </EditField>
                      <EditField label="Category">
                        <select value={a.category} onChange={(e) => setProfileAchievements((prev) => prev.map((x, i) => (i === ai ? { ...x, category: e.target.value } : x)))} className={fieldClass}>
                          {PROFILE_ACHIEVEMENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </EditField>
                      <EditField label="Issued by">
                        <input type="text" value={a.issuer} onChange={(e) => setProfileAchievements((prev) => prev.map((x, i) => (i === ai ? { ...x, issuer: e.target.value } : x)))} placeholder="e.g., Infosys / AWS" className={fieldClass} />
                      </EditField>
                      <div className="flex items-end gap-2">
                        <EditField label="Date">
                          <input type="date" value={a.achievedOn} onChange={(e) => setProfileAchievements((prev) => prev.map((x, i) => (i === ai ? { ...x, achievedOn: e.target.value } : x)))} className={fieldClass} />
                        </EditField>
                        <button type="button" onClick={() => setProfileAchievements((prev) => prev.filter((_, i) => i !== ai))} className="p-2 mb-1 rounded-lg text-red-500 hover:bg-red-50" title="Remove">
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="md:col-span-3 lg:col-span-4">
                        <EditField label="Description">
                          <input type="text" value={a.description} onChange={(e) => setProfileAchievements((prev) => prev.map((x, i) => (i === ai ? { ...x, description: e.target.value } : x)))} placeholder="Optional — what was it awarded for?" className={fieldClass} />
                        </EditField>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setProfileAchievements((prev) => [...prev, { title: '', category: 'previous_company', issuer: '', achievedOn: '', description: '' }])} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold border border-violet-200 hover:bg-violet-100">
                    <FiPlus className="w-3.5 h-3.5" /> Add Achievement
                  </button>
                </div>
              ) : (
                <div className="col-span-full">
                  {profileAchievements.length === 0 ? (
                    <p className="text-xs text-thb-text-muted">No achievements added yet. Click Edit Profile to add them.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {profileAchievements.map((a, ai) => (
                        <div key={ai} className="p-3 rounded-xl border border-thb-border bg-slate-50/60">
                          <p className="text-sm font-semibold text-thb-text-primary">{a.title}</p>
                          <p className="text-xs text-thb-text-muted">{(PROFILE_ACHIEVEMENT_CATEGORIES.find((c) => c.value === a.category) || {}).label || 'Other'}{a.issuer ? ` · ${a.issuer}` : ''}{a.achievedOn ? ` · ${formatDate(a.achievedOn)}` : ''}</p>
                          {a.description && <p className="text-xs text-thb-text-muted mt-1">{a.description}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* Legacy flat rows (pre-parity data) — view fallback only */}
            {!showFields && [1, 2, 3].map((n) => (
              str(emp?.[`previousEmployer${n}`]) ? (
                <SectionCard key={n} title={`Legacy Experience ${n}`} icon={<FiBriefcase className="w-4 h-4" />} accent="slate">
                  <InfoRow label="Previous Employer" value={str(emp?.[`previousEmployer${n}`])} icon={<FiBriefcase className="w-3.5 h-3.5" />} />
                  <InfoRow label="Designation" value={str(emp?.[`previousDesignation${n}`])} icon={<FiStar className="w-3.5 h-3.5" />} />
                  <InfoRow label="Duration" value={str(emp?.[`previousDuration${n}`])} icon={<FiClock className="w-3.5 h-3.5" />} />
                  <InfoRow label="Reason for Leaving" value={str(emp?.[`previousReason${n}`])} />
                </SectionCard>
              ) : null
            ))}
            <SectionCard title="Total Experience" icon={<FiStar className="w-4 h-4" />} accent="teal">
              {showFields ? (
                <EditField label="Total Experience">
                  <input type="text" value={editForm.totalExperience || ''} onChange={e => updateEditField('totalExperience', e.target.value)} placeholder="e.g., 5 years" className={fieldClass} />
                </EditField>
              ) : (
                <InfoRow label="Total Experience" value={str(emp?.totalExperience)} />
              )}
            </SectionCard>
          </div>
        )}"""

src = src[:idx] + new_block + src[i:]
edits += 1

open(p, 'w', encoding='utf-8').write(src)
print(f"stage 3 OK — {edits} edits (experience block rebuilt, {len(block)} chars replaced)")
