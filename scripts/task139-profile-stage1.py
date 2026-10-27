#!/usr/bin/env python3
"""Task 139 — My Profile parity rebuild in my-profile/page.tsx.
Adds: interests, technical skills, structured experience (letters+domains),
achievements, family/dependents editor, real policies grid, document View
buttons, avatar pending badge, original birthday view row, self-service tips."""
import sys

p = 'src/app/(dashboard)/my-profile/page.tsx'
src = open(p, encoding='utf-8').read()
edits = 0

def rep(old, new, count=1):
    global src, edits
    n = src.count(old)
    assert n == count, f"anchor x{n} (wanted {count}): {old[:90]!r}"
    src = src.replace(old, new)
    edits += 1

# ── 1. imports ──
rep("  FiDownload,", "  FiDownload,\n  FiPlus,\n  FiTrash2,\n  FiEye,\n  FiPaperclip,\n  FiAward,\n  FiZap,")

# ── 2. profileTab type unchanged; add interests helper import at top ──
rep("import { canEditEmployeeRecords", "import { canEditEmployeeRecords", 0) if False else None
if "from '@/lib/document-viewer'" not in src:
    lines = src.split('\n')
    idx = next(i for i, l in enumerate(lines) if l.startswith('import ') and 'react-hot-toast' in l) + 1
    lines.insert(idx, "import { openDocumentInNewTab } from '@/lib/document-viewer';")
    src = '\n'.join(lines)
    edits += 1

# ── 3. state: collections in editForm + avatar pending + company policies ──
rep("  const [editForm, setEditForm] = useState<Record<string, string>>({});",
"""  const [editForm, setEditForm] = useState<Record<string, string>>({});
  // Task 139 — structured collections for My Profile parity
  const [profileSkills, setProfileSkills] = useState<Array<{ skill: string; level: string; yearsOfExp: string }>>([]);
  const [profileExperiences, setProfileExperiences] = useState<Array<{ id?: string; company: string; designation: string; fromDate: string; toDate: string; isCurrent: boolean; description: string; companyLogo: string; companyCategory: string; companyLevel: string; domains: string[]; letters: Array<{ name: string; type: string; fileUrl: string }>; letterType: string }>>([]);
  const [profileAchievements, setProfileAchievements] = useState<Array<{ id?: string; title: string; category: string; issuer: string; achievedOn: string; description: string }>>([]);
  const [profileDependents, setProfileDependents] = useState<Array<{ name: string; relationship: string; dateOfBirth: string; gender: string }>>([]);
  const [avatarPendingUrl, setAvatarPendingUrl] = useState<string | null>(null);
  const [companyPolicies, setCompanyPolicies] = useState<Array<Record<string, unknown>>>([]);
  const [policiesLoaded, setPoliciesLoaded] = useState(false);

  const PROFILE_SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];
  const PROFILE_EXP_DOMAINS = ['Development', 'Testing / QA', 'DevOps / Infra', 'Support', 'Implementation', 'Sales', 'Marketing', 'Operations', 'Finance & Accounts', 'Human Resources', 'Design', 'Data & Analytics', 'Project Management', 'Consulting', 'Research', 'Manufacturing', 'Quality', 'Procurement', 'Legal & Compliance', 'Training'];
  const PROFILE_LETTER_TYPES = [
    { value: 'offer_letter', label: 'Offer Letter' },
    { value: 'relieving_letter', label: 'Relieving Letter' },
    { value: 'experience_letter', label: 'Experience Letter' },
    { value: 'appraisal_letter', label: 'Appraisal / Increment Letter' },
    { value: 'payslip', label: 'Payslip' },
    { value: 'other', label: 'Other Letter' },
  ];
  const PROFILE_ACHIEVEMENT_CATEGORIES = [
    { value: 'previous_company', label: 'Previous Company' },
    { value: 'certification', label: 'Certification' },
    { value: 'award', label: 'Award / Recognition' },
    { value: 'academic', label: 'Academic' },
    { value: 'community', label: 'Community / Social' },
    { value: 'other', label: 'Other' },
  ];""")

# ── 4. fetchProfile: map collections + avatar pending ──
rep("""      if (res.ok) {
        const data = await res.json();
        setProfileData(data);""",
"""      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
        // Task 139 — load the structured collections returned by the GET
        const empAll = (data.employee || {}) as Record<string, unknown>;
        setProfileSkills(Array.isArray(empAll.skills) ? (empAll.skills as Array<Record<string, unknown>>).map((s) => ({ skill: String(s.skill || ''), level: String(s.level || 'intermediate'), yearsOfExp: s.yearsOfExp != null ? String(s.yearsOfExp) : '' })) : []);
        setProfileExperiences(Array.isArray(empAll.experiences) ? (empAll.experiences as Array<Record<string, unknown>>).map((x) => ({
          id: String(x.id || ''),
          company: String(x.company || ''),
          designation: String(x.designation || ''),
          fromDate: x.startDate ? String(x.startDate).slice(0, 10) : '',
          toDate: x.endDate ? String(x.endDate).slice(0, 10) : '',
          isCurrent: Boolean(x.isCurrent),
          description: String(x.description || ''),
          companyLogo: String(x.companyLogo || ''),
          companyCategory: String(x.companyCategory || ''),
          companyLevel: String(x.companyLevel || ''),
          domains: Array.isArray(x.domains) ? (x.domains as unknown[]).map((d) => String(d)) : [],
          letters: Array.isArray(x.letters) ? (x.letters as Array<Record<string, unknown>>).map((l) => ({ name: String(l.name || 'Letter'), type: String(l.type || 'other'), fileUrl: String(l.fileUrl || '') })) : [],
          letterType: 'offer_letter',
        })) : []);
        setProfileAchievements(Array.isArray(empAll.achievements) ? (empAll.achievements as Array<Record<string, unknown>>).map((a) => ({
          id: String(a.id || ''),
          title: String(a.title || ''),
          category: String(a.category || 'other'),
          issuer: String(a.issuer || ''),
          achievedOn: a.achievedOn ? String(a.achievedOn).slice(0, 10) : '',
          description: String(a.description || ''),
        })) : []);
        setProfileDependents(Array.isArray(empAll.dependents) ? (empAll.dependents as Array<Record<string, unknown>>).map((d) => ({
          name: String(d.name || ''),
          relationship: String(d.relationship || d.relation || ''),
          dateOfBirth: d.dateOfBirth ? String(d.dateOfBirth).slice(0, 10) : '',
          gender: String(d.gender || ''),
        })) : []);""")

# ── 5. handleSave: send collections ──
rep("""        body: JSON.stringify({
          ...editForm,
          name: `${editForm.firstName || ''} ${editForm.lastName || ''}`.trim() || editForm.name,
        }),""",
"""        body: JSON.stringify({
          ...editForm,
          name: `${editForm.firstName || ''} ${editForm.lastName || ''}`.trim() || editForm.name,
          // Task 139 — structured collections (direct self-service writes)
          interests: editForm.interests || '',
          skills: profileSkills.filter((s) => s.skill.trim()),
          experiences: profileExperiences
            .filter((x) => x.company.trim() && x.designation.trim() && x.fromDate && (x.isCurrent || x.toDate))
            .map((x) => ({
              id: x.id || undefined, company: x.company, designation: x.designation,
              fromDate: x.fromDate, toDate: x.isCurrent ? undefined : x.toDate, isCurrent: x.isCurrent,
              description: x.description, companyLogo: x.companyLogo, companyCategory: x.companyCategory,
              companyLevel: x.companyLevel, domains: x.domains, letters: x.letters,
            })),
          achievements: profileAchievements.filter((a) => a.title.trim()).map((a) => ({
            id: a.id || undefined, title: a.title, category: a.category, issuer: a.issuer,
            achievedOn: a.achievedOn || undefined, description: a.description,
          })),
          dependents: profileDependents.filter((d) => d.name.trim() && d.relationship.trim()).map((d) => ({
            name: d.name, relation: d.relationship, dateOfBirth: d.dateOfBirth || undefined, gender: d.gender || undefined,
          })),
        }),""")

# ── 6. policies fetch when tab opens (tab click handler) ──
rep("""                    if (tab.key === 'documents' && employeeRecordId && documentsLoadedFor !== employeeRecordId) {
                      void loadDocuments(employeeRecordId);
                    }""",
"""                    if (tab.key === 'documents' && employeeRecordId && documentsLoadedFor !== employeeRecordId) {
                      void loadDocuments(employeeRecordId);
                    }
                    // Task 139 — assigned company policies grid (View/Download)
                    if (tab.key === 'policies' && !policiesLoaded) {
                      setPoliciesLoaded(true);
                      fetch('/api/policies?status=active&includeFile=1&limit=100', { headers: getAuthHeaders() })
                        .then((r) => (r.ok ? r.json() : null))
                        .then((d) => {
                          const list = (d?.data || d?.policies || []) as Array<Record<string, unknown>>;
                          setCompanyPolicies(Array.isArray(list) ? list.filter((x) => x.status !== 'inactive') : []);
                        })
                        .catch(() => setCompanyPolicies([]));
                    }""")

# ── 7. handlePhotoChange: toast on pending ──
rep("""      const photo = await fileToProfilePhotoDataUrl(file);
      if (!photo.ok) {""",
"""      const photo = await fileToProfilePhotoDataUrl(file);
      if (!photo.ok) {""")
src_ = open(p, encoding='utf-8').read()

open(p, 'w', encoding='utf-8').write(src)
print(f"stage 1 OK — {edits} edits")
