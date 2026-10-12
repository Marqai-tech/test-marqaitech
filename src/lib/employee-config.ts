import { getAuthInfo } from '@/lib/companyScope';

export type EmployeeFieldRule = { sensitivity: 'low' | 'high' | 'restricted'; category: string; label: string };

export const DEFAULT_EMPLOYEE_FIELD_RULES: Record<string, EmployeeFieldRule> = {
  phone: { sensitivity: 'low', category: 'contact', label: 'Phone Number' },
  address: { sensitivity: 'low', category: 'contact', label: 'Address' },
  city: { sensitivity: 'low', category: 'contact', label: 'City' },
  state: { sensitivity: 'low', category: 'contact', label: 'State' },
  zipCode: { sensitivity: 'low', category: 'contact', label: 'ZIP Code' },
  country: { sensitivity: 'low', category: 'contact', label: 'Country' },
  emergencyContactName: { sensitivity: 'low', category: 'contact', label: 'Emergency Contact Name' },
  emergencyContactPhone: { sensitivity: 'low', category: 'contact', label: 'Emergency Contact Phone' },
  personalEmail: { sensitivity: 'low', category: 'contact', label: 'Personal Email' },
  firstName: { sensitivity: 'high', category: 'personal', label: 'First Name' },
  lastName: { sensitivity: 'high', category: 'personal', label: 'Last Name' },
  dateOfBirth: { sensitivity: 'high', category: 'personal', label: 'Date of Birth' },
  gender: { sensitivity: 'high', category: 'personal', label: 'Gender' },
  maritalStatus: { sensitivity: 'high', category: 'personal', label: 'Marital Status' },
  nationality: { sensitivity: 'high', category: 'personal', label: 'Nationality' },
  departmentId: { sensitivity: 'high', category: 'employment', label: 'Department' },
  designationId: { sensitivity: 'high', category: 'employment', label: 'Designation' },
  branchId: { sensitivity: 'high', category: 'employment', label: 'Branch' },
  reportingManagerId: { sensitivity: 'high', category: 'employment', label: 'Reporting Manager' },
  employeeType: { sensitivity: 'high', category: 'employment', label: 'Employee Type' },
  employeeStatus: { sensitivity: 'high', category: 'employment', label: 'Employee Status' },
  bankName: { sensitivity: 'high', category: 'financial', label: 'Bank Name' },
  bankAccountNo: { sensitivity: 'high', category: 'financial', label: 'Bank Account Number' },
  bankIfscCode: { sensitivity: 'high', category: 'financial', label: 'Bank IFSC Code' },
  panNumber: { sensitivity: 'high', category: 'kyc', label: 'PAN Number' },
  aadhaarNumber: { sensitivity: 'high', category: 'kyc', label: 'Aadhaar Number' },
  taxId: { sensitivity: 'high', category: 'kyc', label: 'Tax ID' },
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
    return parsed && typeof parsed === 'object' ? parsed : DEFAULT_EMPLOYEE_FIELD_RULES;
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
