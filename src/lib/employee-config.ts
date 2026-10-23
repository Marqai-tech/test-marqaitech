import { getAuthInfo } from '@/lib/companyScope';

export type EmployeeFieldRule = { sensitivity: 'low' | 'high' | 'restricted'; category: string; label: string };

export const DEFAULT_EMPLOYEE_FIELD_RULES: Record<string, EmployeeFieldRule> = {
  // Contact (low — direct update)
  phone: { sensitivity: 'low', category: 'contact', label: 'Phone Number' },
  address: { sensitivity: 'low', category: 'contact', label: 'Address' },
  city: { sensitivity: 'low', category: 'contact', label: 'City' },
  state: { sensitivity: 'low', category: 'contact', label: 'State' },
  zipCode: { sensitivity: 'low', category: 'contact', label: 'ZIP Code' },
  country: { sensitivity: 'low', category: 'contact', label: 'Country' },
  emergencyContactName: { sensitivity: 'low', category: 'contact', label: 'Emergency Contact Name' },
  emergencyContactPhone: { sensitivity: 'low', category: 'contact', label: 'Emergency Contact Phone' },
  emergencyContactRelation: { sensitivity: 'low', category: 'contact', label: 'Emergency Contact Relation' },
  personalEmail: { sensitivity: 'low', category: 'contact', label: 'Personal Email' },
  currentAddress: { sensitivity: 'low', category: 'contact', label: 'Current Address' },
  currentCity: { sensitivity: 'low', category: 'contact', label: 'Current City' },
  currentState: { sensitivity: 'low', category: 'contact', label: 'Current State' },
  currentZipCode: { sensitivity: 'low', category: 'contact', label: 'Current ZIP Code' },
  currentCountry: { sensitivity: 'low', category: 'contact', label: 'Current Country' },
  // Personal (high — approval required)
  firstName: { sensitivity: 'high', category: 'personal', label: 'First Name' },
  lastName: { sensitivity: 'high', category: 'personal', label: 'Last Name' },
  dateOfBirth: { sensitivity: 'high', category: 'personal', label: 'Date of Birth' },
  gender: { sensitivity: 'high', category: 'personal', label: 'Gender' },
  maritalStatus: { sensitivity: 'high', category: 'personal', label: 'Marital Status' },
  nationality: { sensitivity: 'high', category: 'personal', label: 'Nationality' },
  bloodGroup: { sensitivity: 'high', category: 'personal', label: 'Blood Group' },
  // Employment (high — approval required)
  departmentId: { sensitivity: 'high', category: 'employment', label: 'Department' },
  designationId: { sensitivity: 'high', category: 'employment', label: 'Designation' },
  branchId: { sensitivity: 'high', category: 'employment', label: 'Branch' },
  reportingManagerId: { sensitivity: 'high', category: 'employment', label: 'Reporting Manager' },
  employeeType: { sensitivity: 'high', category: 'employment', label: 'Employee Type' },
  employeeStatus: { sensitivity: 'high', category: 'employment', label: 'Employee Status' },
  // Financial (high — approval required)
  bankName: { sensitivity: 'high', category: 'financial', label: 'Bank Name' },
  bankAccountNo: { sensitivity: 'high', category: 'financial', label: 'Bank Account Number' },
  bankIfscCode: { sensitivity: 'high', category: 'financial', label: 'Bank IFSC Code' },
  // KYC (high — approval required)
  panNumber: { sensitivity: 'high', category: 'kyc', label: 'PAN Number' },
  aadhaarNumber: { sensitivity: 'high', category: 'kyc', label: 'Aadhaar Number' },
  taxId: { sensitivity: 'high', category: 'kyc', label: 'Tax ID' },
  // PF (high — approval required)
  pfNumber: { sensitivity: 'high', category: 'kyc', label: 'PF Number' },
  pfUAN: { sensitivity: 'high', category: 'kyc', label: 'PF UAN' },
  pfNomineeName: { sensitivity: 'high', category: 'kyc', label: 'PF Nominee Name' },
  pfNomineeRelation: { sensitivity: 'high', category: 'kyc', label: 'PF Nominee Relation' },
  pfNomineePercentage: { sensitivity: 'high', category: 'kyc', label: 'PF Nominee Percentage' },
  // ESI (high — approval required)
  esiNumber: { sensitivity: 'high', category: 'kyc', label: 'ESI Number' },
  esiDispensary: { sensitivity: 'high', category: 'kyc', label: 'ESI Dispensary' },
  esiNomineeName: { sensitivity: 'high', category: 'kyc', label: 'ESI Nominee Name' },
  esiNomineeRelation: { sensitivity: 'high', category: 'kyc', label: 'ESI Nominee Relation' },
  // Tax/Welfare (high — approval required)
  professionalTaxNumber: { sensitivity: 'high', category: 'kyc', label: 'Professional Tax Number' },
  lwfNumber: { sensitivity: 'high', category: 'kyc', label: 'LWF Number' },
  // Health (low — direct update)
  hasChronicIllness: { sensitivity: 'low', category: 'health', label: 'Has Chronic Illness' },
  chronicIllnessDetails: { sensitivity: 'low', category: 'health', label: 'Chronic Illness Details' },
  hasAllergies: { sensitivity: 'low', category: 'health', label: 'Has Allergies' },
  allergyDetails: { sensitivity: 'low', category: 'health', label: 'Allergy Details' },
  hasDisability: { sensitivity: 'low', category: 'health', label: 'Has Disability' },
  disabilityDetails: { sensitivity: 'low', category: 'health', label: 'Disability Details' },
  isOnMedication: { sensitivity: 'low', category: 'health', label: 'Is On Medication' },
  medicationDetails: { sensitivity: 'low', category: 'health', label: 'Medication Details' },
  hasHadSurgery: { sensitivity: 'low', category: 'health', label: 'Has Had Surgery' },
  surgeryDetails: { sensitivity: 'low', category: 'health', label: 'Surgery Details' },
  emergencyMedicalCondition: { sensitivity: 'low', category: 'health', label: 'Emergency Medical Condition' },
  primaryPhysicianName: { sensitivity: 'low', category: 'health', label: 'Primary Physician Name' },
  primaryPhysicianPhone: { sensitivity: 'low', category: 'health', label: 'Primary Physician Phone' },
  healthInsuranceProvider: { sensitivity: 'low', category: 'health', label: 'Health Insurance Provider' },
  healthInsurancePolicyNo: { sensitivity: 'low', category: 'health', label: 'Health Insurance Policy No' },
  // Experience (low — direct update)
  previousEmployer1: { sensitivity: 'low', category: 'experience', label: 'Previous Employer 1' },
  previousDesignation1: { sensitivity: 'low', category: 'experience', label: 'Previous Designation 1' },
  previousDuration1: { sensitivity: 'low', category: 'experience', label: 'Previous Duration 1' },
  previousReason1: { sensitivity: 'low', category: 'experience', label: 'Previous Reason 1' },
  previousEmployer2: { sensitivity: 'low', category: 'experience', label: 'Previous Employer 2' },
  previousDesignation2: { sensitivity: 'low', category: 'experience', label: 'Previous Designation 2' },
  previousDuration2: { sensitivity: 'low', category: 'experience', label: 'Previous Duration 2' },
  previousReason2: { sensitivity: 'low', category: 'experience', label: 'Previous Reason 2' },
  previousEmployer3: { sensitivity: 'low', category: 'experience', label: 'Previous Employer 3' },
  previousDesignation3: { sensitivity: 'low', category: 'experience', label: 'Previous Designation 3' },
  previousDuration3: { sensitivity: 'low', category: 'experience', label: 'Previous Duration 3' },
  previousReason3: { sensitivity: 'low', category: 'experience', label: 'Previous Reason 3' },
  totalExperience: { sensitivity: 'low', category: 'experience', label: 'Total Experience' },
  // System (restricted — never self-service editable)
  email: { sensitivity: 'restricted', category: 'system', label: 'Official Email' },
  employeeId: { sensitivity: 'restricted', category: 'system', label: 'Employee ID' },
  userId: { sensitivity: 'restricted', category: 'system', label: 'User ID' },
  salary: { sensitivity: 'restricted', category: 'system', label: 'Salary' },
  salaryCurrency: { sensitivity: 'restricted', category: 'system', label: 'Salary Currency' },
  salaryStructureId: { sensitivity: 'restricted', category: 'system', label: 'Salary Structure' },
  dateOfJoining: { sensitivity: 'restricted', category: 'system', label: 'Date of Joining' },
  status: { sensitivity: 'restricted', category: 'system', label: 'Employee Status' },
  companyId: { sensitivity: 'restricted', category: 'system', label: 'Company' },
};

export async function loadEmployeeFieldRules(db: Record<string, any>, req: Request): Promise<Record<string, EmployeeFieldRule>> {
  try {
    const auth = await getAuthInfo(req);
    if (!auth?.tenantId) return DEFAULT_EMPLOYEE_FIELD_RULES;
    const row = await db.setting.findFirst({ where: { tenantId: auth.tenantId, category: 'employee', key: 'employee_field_rules' } });
    if (!row) {
      await db.setting.create({ data: { tenantId: auth.tenantId, category: 'employee', key: 'employee_field_rules', value: JSON.stringify(DEFAULT_EMPLOYEE_FIELD_RULES), dataType: 'json', description: 'Employee profile field approval rules' } });
      return DEFAULT_EMPLOYEE_FIELD_RULES;
    }
    const parsed = JSON.parse(row.value);
    // Merge: DB-stored rules take precedence for existing fields, but
    // any NEW fields in DEFAULT_EMPLOYEE_FIELD_RULES that aren't in the
    // DB cache are added automatically. This ensures newly-added fields
    // (like PF/ESI/LWF/PT) work even when the DB has an older cached version.
    if (parsed && typeof parsed === 'object') {
      const merged = { ...DEFAULT_EMPLOYEE_FIELD_RULES, ...parsed };
      // If new fields were added, update the DB cache
      const dbKeys = Object.keys(parsed);
      const defaultKeys = Object.keys(DEFAULT_EMPLOYEE_FIELD_RULES);
      const hasNewFields = defaultKeys.some(k => !dbKeys.includes(k));
      if (hasNewFields) {
        try {
          await db.setting.update({ where: { id: row.id }, data: { value: JSON.stringify(merged) } });
        } catch { /* best-effort */ }
      }
      return merged;
    }
    return DEFAULT_EMPLOYEE_FIELD_RULES;
  } catch { return DEFAULT_EMPLOYEE_FIELD_RULES; }
}

export async function loadEmployeeSetting<T>(db: Record<string, any>, req: Request, key: string, seed: T): Promise<T> {
  try {
    const auth = await getAuthInfo(req);
    if (!auth?.tenantId) return seed;
    const row = await db.setting.findFirst({ where: { tenantId: auth.tenantId, category: 'employee', key } });
    if (!row) {
      await db.setting.create({ data: { tenantId: auth.tenantId, category: 'employee', key, value: JSON.stringify(seed), dataType: typeof seed === 'object' ? 'json' : typeof seed, description: `Employee setting: ${key}` } });
      return seed;
    }
    return JSON.parse(row.value) as T;
  } catch { return seed; }
}
