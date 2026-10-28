export interface LeaveTypeLike {
  id?: string;
  name?: string | null;
  code?: string | null;
  probationRestricted?: boolean | null;
}

export interface LeaveBalanceLike {
  id?: string;
  employeeId?: string;
  leaveTypeId?: string;
  leaveType: LeaveTypeLike;
  total?: number | null;
  used?: number | null;
  remaining?: number | null;
  carryForward?: number | null;
}

type LeaveCategory = 'maternity' | 'paternity' | 'parental' | 'lop' | 'casual' | 'sick' | 'earned' | 'personal' | 'other';

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function codeTokens(value: unknown): string[] {
  return String(value ?? '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
}

export function getLeaveCategory(type: LeaveTypeLike): LeaveCategory {
  const name = normalize(type.name);
  const tokens = codeTokens(type.code);
  const codeHas = (...values: string[]) => values.some(value => tokens.includes(value));

  if (name.includes('maternity') && name.includes('paternity')) return 'parental';
  if (name.includes('maternity')) return 'maternity';
  if (name.includes('paternity')) return 'paternity';
  if (codeHas('MAT', 'MATERNITY', 'ML')) return 'maternity';
  if (codeHas('PAT', 'PATERNITY', 'PTL')) return 'paternity';
  if (name.includes('parental')) return 'parental';
  if (name.includes('loss of pay') || codeHas('LOP', 'LWP')) return 'lop';
  if (name.includes('casual') || codeHas('CL')) return 'casual';
  if (name.includes('sick') || codeHas('SL')) return 'sick';
  if (name.includes('earned') || name.includes('annual') || codeHas('EL', 'AL')) return 'earned';
  if (name.includes('personal') || codeHas('PL')) return 'personal';
  return 'other';
}

function normalizedGender(gender: unknown): 'male' | 'female' | null {
  const value = normalize(gender);
  if (['male', 'man', 'm'].includes(value)) return 'male';
  if (['female', 'woman', 'f'].includes(value)) return 'female';
  return null;
}

function isVisibleForGender(type: LeaveTypeLike, gender: unknown): boolean {
  const category = getLeaveCategory(type);
  const normalized = normalizedGender(gender);
  if (!normalized) return true;
  if (category === 'maternity') return normalized === 'female';
  if (category === 'paternity') return normalized === 'male';
  return true;
}

function typeForGender(type: LeaveTypeLike, gender: unknown): LeaveTypeLike {
  if (getLeaveCategory(type) !== 'parental') return type;
  const normalized = normalizedGender(gender);
  if (normalized === 'female') return { ...type, name: 'Maternity Leave' };
  if (normalized === 'male') return { ...type, name: 'Paternity Leave' };
  return type;
}

function leaveTypeKey(type: LeaveTypeLike): string {
  const category = getLeaveCategory(type);
  if (category !== 'other') return category;
  const name = normalize(type.name);
  if (name) return `name:${name}`;
  const code = codeTokens(type.code).join('-');
  return code ? `code:${code}` : '';
}

/**
 * Apply the ESS display rules consistently: show only the gender-appropriate
 * maternity/paternity type, collapse duplicate type aliases, and zero every
 * numeric balance during the active probation period. LOP remains requestable;
 * its separate UI note communicates the prior-approval requirement.
 */
export function normalizeLeaveBalances<T extends LeaveBalanceLike>(
  balances: T[],
  options: { gender?: unknown; probation?: boolean } = {},
): T[] {
  const unique = new Map<string, T>();

  for (const balance of balances) {
    if (!balance?.leaveType || !isVisibleForGender(balance.leaveType, options.gender)) continue;
    const leaveType = typeForGender(balance.leaveType, options.gender);
    const normalizedBalance = {
      ...balance,
      leaveType,
      ...(options.probation ? { total: 0, used: 0, remaining: 0, carryForward: 0 } : {}),
    } as T;
    const key = leaveTypeKey(leaveType) || `id:${balance.leaveTypeId || balance.id || unique.size}`;
    const existing = unique.get(key);

    // Never add duplicate entitlements together. Outside probation, preserve
    // the most complete configured entitlement as the single representative.
    if (!existing || (Number(normalizedBalance.total || 0) > Number(existing.total || 0))) {
      unique.set(key, normalizedBalance);
    }
  }

  return Array.from(unique.values());
}
