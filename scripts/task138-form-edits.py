#!/usr/bin/env python3
"""Task 138 — employee add/edit form upgrades in employees/page.tsx:
domains multi-select + letters upload per experience row, achievements editor,
payload wiring, and row mapping. Run from repo root."""
import sys

p = 'src/app/(dashboard)/employees/page.tsx'
src = open(p, encoding='utf-8').read()
edits = 0

def rep(old, new, count=1):
    global src, edits
    n = src.count(old)
    assert n == count, f"anchor x{n} (wanted {count}): {old[:90]!r}"
    src = src.replace(old, new)
    edits += 1

# ── 1. Constants: domains, letter types, achievement categories ──
rep("""export const COMPANY_LEVEL_LABELS: Record<string, string> = {
  mnc: 'MNC', tier_1: 'Tier-1', tier_2: 'Tier-2', tier_3: 'Tier-3',
  large: 'Large Enterprise', mid: 'Mid-Size', startup: 'Startup', small: 'Small Company',
};""",
"""export const COMPANY_LEVEL_LABELS: Record<string, string> = {
  mnc: 'MNC', tier_1: 'Tier-1', tier_2: 'Tier-2', tier_3: 'Tier-3',
  large: 'Large Enterprise', mid: 'Mid-Size', startup: 'Startup', small: 'Small Company',
};

// Task 138 — domains an employee worked in at a company (multi-select).
export const EXPERIENCE_DOMAINS = [
  'Development', 'Testing / QA', 'DevOps / Infra', 'Support', 'Implementation',
  'Sales', 'Marketing', 'Operations', 'Finance & Accounts', 'Human Resources',
  'Design', 'Data & Analytics', 'Project Management', 'Consulting', 'Research',
  'Manufacturing', 'Quality', 'Procurement', 'Legal & Compliance', 'Training',
] as const;

// Task 138 — proof letters attached to a previous employer.
export const EXPERIENCE_LETTER_TYPES = [
  { value: 'offer_letter', label: 'Offer Letter' },
  { value: 'relieving_letter', label: 'Relieving Letter' },
  { value: 'experience_letter', label: 'Experience Letter' },
  { value: 'appraisal_letter', label: 'Appraisal / Increment Letter' },
  { value: 'payslip', label: 'Payslip' },
  { value: 'other', label: 'Other Letter' },
] as const;
export const EXPERIENCE_LETTER_LABELS: Record<string, string> = Object.fromEntries(
  EXPERIENCE_LETTER_TYPES.map((t) => [t.value, t.label]),
);

// Task 138 — achievements (previous company experience or any other source).
export const ACHIEVEMENT_CATEGORY_OPTIONS = [
  { value: 'previous_company', label: 'Previous Company' },
  { value: 'certification', label: 'Certification' },
  { value: 'award', label: 'Award / Recognition' },
  { value: 'academic', label: 'Academic' },
  { value: 'community', label: 'Community / Social' },
  { value: 'other', label: 'Other' },
] as const;
export const ACHIEVEMENT_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  ACHIEVEMENT_CATEGORY_OPTIONS.map((c) => [c.value, c.label]),
);""")

# ── 2. Interfaces ──
rep("""export interface FormExperience {
  id?: string;
  company: string;
  designation: string;
  fromDate: string;
  toDate: string;
  isCurrent: boolean;
  description: string;
  companyLogo: string;
  companyCategory: string;
  companyLevel: string;
}""",
"""export interface FormExperienceLetter {
  name: string;
  type: string;
  fileUrl: string;
}

export interface FormExperience {
  id?: string;
  company: string;
  designation: string;
  fromDate: string;
  toDate: string;
  isCurrent: boolean;
  description: string;
  companyLogo: string;
  companyCategory: string;
  companyLevel: string;
  // Task 138 — domains worked (multi-select) + proof letters from this company.
  domains?: string[];
  letters?: FormExperienceLetter[];
  letterType?: string; // transient pick for the next attach (not persisted as-is)
}

export interface FormAchievement {
  id?: string;
  title: string;
  category: string;
  issuer: string;
  achievedOn: string;
  description: string;
}""")

# ── 3. emptyExperience ──
rep("""export const emptyExperience = (): FormExperience => ({
  company: '', designation: '', fromDate: '', toDate: '', isCurrent: false,
  description: '', companyLogo: '', companyCategory: '', companyLevel: '',
});""",
"""export const emptyExperience = (): FormExperience => ({
  company: '', designation: '', fromDate: '', toDate: '', isCurrent: false,
  description: '', companyLogo: '', companyCategory: '', companyLevel: '',
  domains: [], letters: [], letterType: 'offer_letter',
});
export const emptyAchievement = (): FormAchievement => ({
  title: '', category: 'previous_company', issuer: '', achievedOn: '', description: '',
});""")

# ── 4. initialForm collections ──
rep("""  experiences: [] as FormExperience[],
  skills: [] as FormSkill[],
  dependents: [] as FormDependent[],
};""",
"""  experiences: [] as FormExperience[],
  skills: [] as FormSkill[],
  dependents: [] as FormDependent[],
  achievements: [] as FormAchievement[],
};""")

# ── 5. mapEmployeeRows: letters/domains + achievements ──
rep("""          companyLogo: String(x.companyLogo || ''),
          companyCategory: String(x.companyCategory || ''),
          companyLevel: String(x.companyLevel || ''),
        }))
      : undefined,""",
"""          companyLogo: String(x.companyLogo || ''),
          companyCategory: String(x.companyCategory || ''),
          companyLevel: String(x.companyLevel || ''),
          domains: Array.isArray(x.domains)
            ? (x.domains as unknown[]).map((d) => String(d)).filter(Boolean)
            : (() => { try { const v = typeof x.domains === 'string' ? JSON.parse(x.domains) : null; return Array.isArray(v) ? v.map((d) => String(d)).filter(Boolean) : []; } catch { return []; } })(),
          letters: Array.isArray(x.letters)
            ? (x.letters as Array<Record<string, unknown>>).map((l) => ({
                name: String(l.name || 'Letter'),
                type: String(l.type || 'other'),
                fileUrl: String(l.fileUrl || ''),
              })).filter((l) => l.fileUrl)
            : (() => { try { const v = typeof x.letters === 'string' ? JSON.parse(x.letters) : null; return Array.isArray(v) ? v.map((l) => ({ name: String(l?.name || 'Letter'), type: String(l?.type || 'other'), fileUrl: String(l?.fileUrl || '') })).filter((l) => l.fileUrl) : []; } catch { return []; } })(),
        }))
      : undefined,
    achievements: Array.isArray(emp.achievements)
      ? (emp.achievements as Array<Record<string, unknown>>).map((a) => ({
          id: String(a.id || ''),
          title: String(a.title || ''),
          category: String(a.category || 'other'),
          issuer: String(a.issuer || ''),
          achievedOn: a.achievedOn ? String(a.achievedOn).slice(0, 10) : '',
          description: String(a.description || ''),
        }))
      : undefined,""")

# ── 6. payload builder ──
rep("""      const cleanedDependents = Array.isArray(form.dependents)
        ? form.dependents.filter((d) => d.name.trim() && d.relation.trim())
        : undefined;
      const payload = {
        ...form,
        ...(cleanedExperiences !== undefined ? { experiences: cleanedExperiences } : {}),
        ...(cleanedSkills !== undefined ? { skills: cleanedSkills } : {}),
        ...(cleanedDependents !== undefined ? { dependents: cleanedDependents } : {}),""",
"""      const cleanedDependents = Array.isArray(form.dependents)
        ? form.dependents.filter((d) => d.name.trim() && d.relation.trim())
        : undefined;
      const cleanedAchievements = Array.isArray(form.achievements)
        ? form.achievements.filter((a) => a.title.trim())
        : undefined;
      const payload = {
        ...form,
        ...(cleanedExperiences !== undefined ? { experiences: cleanedExperiences } : {}),
        ...(cleanedSkills !== undefined ? { skills: cleanedSkills } : {}),
        ...(cleanedDependents !== undefined ? { dependents: cleanedDependents } : {}),
        ...(cleanedAchievements !== undefined ? { achievements: cleanedAchievements } : {}),""")

# ── 7. Experience letter + domain handlers after handleDocFilePick ──
rep("""    const reader = new FileReader();
    reader.onloadend = () => {
      setDocDraft(prev => ({ ...prev, fileUrl: reader.result as string, fileName: file.name }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };""",
"""    const reader = new FileReader();
    reader.onloadend = () => {
      setDocDraft(prev => ({ ...prev, fileUrl: reader.result as string, fileName: file.name }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /* ── Task 138 — experience letters + domains handlers ── */
  const handleExperienceLetterPick = (rowIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Letter must be under 3MB. For larger files, paste a shareable link in the Documents tab instead.', { duration: 6000 });
      return;
    }
    if (file.size === 0 || !['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)) {
      toast.error('Invalid file — attach a PDF, image or Word document.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setForm(prev => {
        const rows = [...(prev.experiences || [])];
        if (!rows[rowIndex]) return prev;
        const row = rows[rowIndex];
        const type = row.letterType || 'offer_letter';
        const letters = [...(row.letters || []), { name: file.name, type, fileUrl: reader.result as string }];
        rows[rowIndex] = { ...row, letters };
        return { ...prev, experiences: rows };
      });
      toast.success('Letter attached — remember to save the employee');
    };
    reader.readAsDataURL(file);
  };

  const removeExperienceLetter = (rowIndex: number, letterIndex: number) => {
    setForm(prev => {
      const rows = [...(prev.experiences || [])];
      if (!rows[rowIndex]) return prev;
      const row = rows[rowIndex];
      rows[rowIndex] = { ...row, letters: (row.letters || []).filter((_, j) => j !== letterIndex) };
      return { ...prev, experiences: rows };
    });
  };

  const toggleExperienceDomain = (rowIndex: number, domain: string) => {
    setForm(prev => {
      const rows = [...(prev.experiences || [])];
      if (!rows[rowIndex]) return prev;
      const row = rows[rowIndex];
      const cur = row.domains || [];
      const next = cur.includes(domain) ? cur.filter((d) => d !== domain) : [...cur, domain];
      rows[rowIndex] = { ...row, domains: next };
      return { ...prev, experiences: rows };
    });
  };""")

# ── 8. Domains + letters UI inside each experience row (after Reason for Leaving) ──
rep("""                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">Reason for Leaving</label>
                              <input
                                type="text"
                                value={exp.description}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], description: e.target.value }; return { ...prev, experiences: rows }; })}
                                placeholder="Optional — why did you leave?"
                                className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                              />
                            </div>
                          </div>
                        </div>
                        );""",
"""                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">Reason for Leaving</label>
                              <input
                                type="text"
                                value={exp.description}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], description: e.target.value }; return { ...prev, experiences: rows }; })}
                                placeholder="Optional — why did you leave?"
                                className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                              />
                            </div>
                          </div>

                          {/* Task 138 — domains worked (multi-select) */}
                          <div>
                            <p className="text-[10px] font-semibold text-thb-text-muted uppercase tracking-wider mb-1.5">Domains worked in <span className="normal-case font-normal">(select all that apply)</span></p>
                            <div className="flex flex-wrap gap-1.5">
                              {EXPERIENCE_DOMAINS.map((d) => {
                                const active = (exp.domains || []).includes(d);
                                return (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => toggleExperienceDomain(i, d)}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${active ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-thb-border text-thb-text-muted hover:border-amber-200'}`}
                                  >
                                    {active ? '\\u2713 ' : ''}{d}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Task 138 — letters from this company (offer / relieving / …) */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-semibold text-thb-text-muted uppercase tracking-wider">Letters from this company <span className="normal-case font-normal">(offer letter, relieving letter, appraisal…)</span></p>
                            {(exp.letters || []).length > 0 && (
                              <div className="space-y-1.5">
                                {(exp.letters || []).map((l, li) => (
                                  <div key={li} className="flex items-center gap-2 text-xs bg-white border border-thb-border rounded-lg px-2.5 py-1.5">
                                    <FiFileText className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                                    <span className="font-semibold text-thb-text-primary flex-shrink-0">{EXPERIENCE_LETTER_LABELS[l.type] || 'Letter'}</span>
                                    <span className="truncate text-thb-text-secondary flex-1">{l.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => removeExperienceLetter(i, li)}
                                      className="p-1 rounded text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                      title="Remove letter"
                                    >
                                      <FiTrash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                              <select
                                value={exp.letterType || 'offer_letter'}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], letterType: e.target.value }; return { ...prev, experiences: rows }; })}
                                className="px-2.5 py-1.5 rounded-lg border border-thb-border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                              >
                                {EXPERIENCE_LETTER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">
                                <FiPaperclip className="w-3.5 h-3.5" /> Attach letter (PDF / image / Word, max 3MB)
                                <input type="file" className="hidden" accept=".pdf,image/jpeg,image/png,.doc,.docx" onChange={(e) => handleExperienceLetterPick(i, e)} />
                              </label>
                            </div>
                          </div>
                        </div>
                        );""")

# ── 9. Achievements editor before the experience tab nav buttons ──
rep("""                        {(() => {
                          const yrs = totalExperienceYears((form.experiences || []).filter(x => x.company.trim() && x.designation.trim() && x.fromDate && (x.isCurrent || x.toDate)));
                          return yrs > 0 ? `Computed from the entries above: ${yrs} yr${yrs === 1 ? '' : 's'} (overrides this field when shown)` : 'Leave blank to compute from the entries above';
                        })()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">""",
"""                        {(() => {
                          const yrs = totalExperienceYears((form.experiences || []).filter(x => x.company.trim() && x.designation.trim() && x.fromDate && (x.isCurrent || x.toDate)));
                          return yrs > 0 ? `Computed from the entries above: ${yrs} yr${yrs === 1 ? '' : 's'} (overrides this field when shown)` : 'Leave blank to compute from the entries above';
                        })()}
                      </p>
                    </div>
                  </div>

                  {/* Task 138 — Achievements (previous company experience or any other) */}
                  <div className="pt-4 border-t border-thb-border/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Achievements</h4>
                        <p className="text-[10px] text-thb-text-muted mt-0.5">Awards, certifications and recognitions from the previous company experience or any other source.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, achievements: [...(prev.achievements || []), emptyAchievement()] }))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold border border-violet-200 hover:bg-violet-100 transition-colors"
                      >
                        <FiPlus className="w-3.5 h-3.5" /> Add Achievement
                      </button>
                    </div>

                    {(form.achievements || []).length === 0 ? (
                      <p className="text-xs text-thb-text-muted py-2">No achievements added yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {(form.achievements || []).map((a, ai) => (
                          <div key={a.id || `ach-${ai}`} className="p-4 rounded-xl border border-violet-100 bg-violet-50/40 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-semibold text-thb-text-primary truncate">{a.title || `Achievement ${ai + 1}`}</p>
                              <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, achievements: (prev.achievements || []).filter((_, j) => j !== ai) }))}
                                className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                title="Remove achievement"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Title <span className="text-red-500 font-bold">*</span></label>
                                <input
                                  type="text"
                                  value={a.title}
                                  onChange={(e) => setForm(prev => { const rows = [...(prev.achievements || [])]; rows[ai] = { ...rows[ai], title: e.target.value }; return { ...prev, achievements: rows }; })}
                                  placeholder="e.g., Star Performer of the Year"
                                  className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Category</label>
                                <select
                                  value={a.category}
                                  onChange={(e) => setForm(prev => { const rows = [...(prev.achievements || [])]; rows[ai] = { ...rows[ai], category: e.target.value }; return { ...prev, achievements: rows }; })}
                                  className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                                >
                                  {ACHIEVEMENT_CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Issued by</label>
                                <input
                                  type="text"
                                  value={a.issuer}
                                  onChange={(e) => setForm(prev => { const rows = [...(prev.achievements || [])]; rows[ai] = { ...rows[ai], issuer: e.target.value }; return { ...prev, achievements: rows }; })}
                                  placeholder="e.g., Infosys Ltd / AWS"
                                  className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Date</label>
                                <input
                                  type="date"
                                  value={a.achievedOn}
                                  onChange={(e) => setForm(prev => { const rows = [...(prev.achievements || [])]; rows[ai] = { ...rows[ai], achievedOn: e.target.value }; return { ...prev, achievements: rows }; })}
                                  className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">Description</label>
                              <input
                                type="text"
                                value={a.description}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.achievements || [])]; rows[ai] = { ...rows[ai], description: e.target.value }; return { ...prev, achievements: rows }; })}
                                placeholder="Optional — what was it awarded for?"
                                className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">""")

open(p, 'w', encoding='utf-8').write(src)
print(f"OK — {edits} edits applied")
