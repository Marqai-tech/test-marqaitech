/**
 * Task 137 — replace-all writers for the employee module's structured row
 * collections (Experience / EmployeeSkill / Dependent).
 *
 * Raw parameterized SQL keeps this consistent with the self-service profile
 * PATCH and safe for tenant DBs whose Prisma client may lag the new columns.
 * All three helpers DELETE the employee's existing rows and insert the
 * submitted list — callers pass the FULL desired list (the client form is
 * the single source of truth).
 */
export interface ExperienceRowInput {
  id?: unknown;
  company?: unknown;
  designation?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  fromDate?: unknown;
  toDate?: unknown;
  isCurrent?: unknown;
  description?: unknown;
  companyLogo?: unknown;
  companyCategory?: unknown;
  companyLevel?: unknown;
  // Task 138 — proof letters + domains worked (multi-select).
  letters?: unknown; // Array<{ name?, type?, fileUrl? }> → JSON TEXT column
  domains?: unknown; // Array<string> → JSON TEXT column
}

export interface AchievementRowInput {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  category?: unknown;
  issuer?: unknown;
  achievedOn?: unknown;
}

export const ACHIEVEMENT_CATEGORIES = new Set([
  'previous_company', 'certification', 'award', 'academic', 'community', 'other',
]);

export interface SkillRowInput {
  skill?: unknown;
  level?: unknown;
  yearsOfExp?: unknown;
}

export interface DependentRowInput {
  name?: unknown;
  relation?: unknown;
  dateOfBirth?: unknown;
  gender?: unknown;
}

const s = (v: unknown): string => String(v ?? '').trim();

function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `t137_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Task 138 — serialize the client's letters / domains row fields into the JSON
 * TEXT columns. Letters carry a dataURL (≤3MB, same pattern as Documents) or
 * an http(s) link; junk rows are dropped silently.
 */
function lettersToJson(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const out: Array<{ name: string; type: string; fileUrl: string }> = [];
  for (const l of raw as Array<Record<string, unknown>>) {
    const fileUrl = s(l?.fileUrl);
    if (!fileUrl) continue;
    out.push({
      name: s(l?.name) || 'Letter',
      type: s(l?.type) || 'other',
      fileUrl,
    });
    if (out.length >= 10) break; // sanity cap per employer
  }
  return out.length ? JSON.stringify(out) : null;
}

function domainsToJson(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const out = Array.from(
    new Set((raw as unknown[]).map((d) => s(d)).filter((d) => d.length > 0)),
  ).slice(0, 25);
  return out.length ? JSON.stringify(out) : null;
}

export async function replaceEmployeeExperience(db: Record<string, any>, employeeId: string, rows: ExperienceRowInput[]): Promise<number> {
  await db.$executeRawUnsafe(`DELETE FROM "Experience" WHERE "employeeId" = $1`, employeeId);
  let count = 0;
  for (const exp of rows || []) {
    const company = s(exp.company);
    const designation = s(exp.designation);
    const start = exp.fromDate || exp.startDate;
    if (!company || !designation || !start) continue;
    const end = exp.toDate || exp.endDate || null;
    const isCurrent = Boolean(exp.isCurrent);
    const description = s(exp.description) || null;
    const companyLogo = s(exp.companyLogo) || null;
    const companyCategory = s(exp.companyCategory) || null;
    const companyLevel = s(exp.companyLevel) || null;
    const letters = lettersToJson(exp.letters);
    const domains = domainsToJson(exp.domains);
    const id = s(exp.id) || uuid();
    await db.$executeRawUnsafe(
      `INSERT INTO "Experience" ("id","employeeId","company","designation","startDate","endDate","isCurrent","description","companyLogo","companyCategory","companyLevel","letters","domains","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())`,
      id, employeeId, company, designation, new Date(start), end ? new Date(end) : null, isCurrent, description, companyLogo, companyCategory, companyLevel, letters, domains,
    );
    count++;
  }
  return count;
}

const SKILL_LEVELS = new Set(['beginner', 'intermediate', 'advanced', 'expert']);

export async function replaceEmployeeSkills(db: Record<string, any>, employeeId: string, rows: SkillRowInput[]): Promise<number> {
  await db.$executeRawUnsafe(`DELETE FROM "EmployeeSkill" WHERE "employeeId" = $1`, employeeId);
  let count = 0;
  for (const sk of rows || []) {
    const skill = s(sk.skill);
    if (!skill) continue;
    const level = SKILL_LEVELS.has(s(sk.level)) ? s(sk.level) : 'intermediate';
    const yearsRaw = Number(sk.yearsOfExp);
    const years = Number.isFinite(yearsRaw) && yearsRaw > 0 ? Math.min(Math.round(yearsRaw), 50) : null;
    await db.$executeRawUnsafe(
      `INSERT INTO "EmployeeSkill" ("id","employeeId","skill","level","yearsOfExp","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
      uuid(), employeeId, skill, level, years,
    );
    count++;
  }
  return count;
}

export async function replaceEmployeeDependents(db: Record<string, any>, employeeId: string, rows: DependentRowInput[]): Promise<number> {
  await db.$executeRawUnsafe(`DELETE FROM "Dependent" WHERE "employeeId" = $1`, employeeId);
  let count = 0;
  for (const dep of rows || []) {
    const name = s(dep.name);
    const relation = s(dep.relation);
    if (!name || !relation) continue;
    const dobRaw = dep.dateOfBirth ? new Date(String(dep.dateOfBirth)) : null;
    const dob = dobRaw && !isNaN(dobRaw.getTime()) ? dobRaw : null;
    const gender = s(dep.gender) || null;
    await db.$executeRawUnsafe(
      `INSERT INTO "Dependent" ("id","employeeId","name","relation","dateOfBirth","gender","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      uuid(), employeeId, name, relation, dob, gender,
    );
    count++;
  }
  return count;
}

/**
 * Task 138 — achievements section (previous company experience or any other
 * source). Same replace-all contract as the other collections.
 */
export async function replaceEmployeeAchievements(db: Record<string, any>, employeeId: string, rows: AchievementRowInput[]): Promise<number> {
  await db.$executeRawUnsafe(`DELETE FROM "EmployeeAchievement" WHERE "employeeId" = $1`, employeeId);
  let count = 0;
  for (const a of rows || []) {
    const title = s(a.title);
    if (!title) continue;
    const category = ACHIEVEMENT_CATEGORIES.has(s(a.category)) ? s(a.category) : 'other';
    const description = s(a.description) || null;
    const issuer = s(a.issuer) || null;
    const onRaw = a.achievedOn ? new Date(String(a.achievedOn)) : null;
    const achievedOn = onRaw && !isNaN(onRaw.getTime()) ? onRaw : null;
    await db.$executeRawUnsafe(
      `INSERT INTO "EmployeeAchievement" ("id","employeeId","title","description","category","issuer","achievedOn","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
      uuid(), employeeId, title, description, category, issuer, achievedOn,
    );
    count++;
  }
  return count;
}
