'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FiUser,
  FiMail,
  FiPhone,
  FiMapPin,
  FiBriefcase,
  FiHeart,
  FiDollarSign,
  FiShield,
  FiFileText,
  FiCalendar,
  FiClock,
  FiEdit2,
  FiSave,
  FiX,
  FiAlertTriangle,
  FiHome,
  FiCreditCard,
  FiBookOpen,
  FiStar,
  FiCheckCircle,
  FiInfo,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ──────────────────────────────────────────────
   Auth Helper
   ────────────────────────────────────────────── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ──────────────────────────────────────────────
   Tab definitions
   ────────────────────────────────────────────── */
type ProfileTab = 'personal' | 'address' | 'employment' | 'bank' | 'salary' | 'emergency' | 'health' | 'policies' | 'documents' | 'experience';

const profileTabs: { key: ProfileTab; label: string; icon: React.ReactNode }[] = [
  { key: 'personal', label: 'Personal', icon: <FiUser className="w-4 h-4" /> },
  { key: 'address', label: 'Address', icon: <FiMapPin className="w-4 h-4" /> },
  { key: 'employment', label: 'Employment', icon: <FiBriefcase className="w-4 h-4" /> },
  { key: 'bank', label: 'Bank & Finance', icon: <FiCreditCard className="w-4 h-4" /> },
  { key: 'salary', label: 'Salary', icon: <FiDollarSign className="w-4 h-4" /> },
  { key: 'emergency', label: 'Emergency', icon: <FiHeart className="w-4 h-4" /> },
  { key: 'health', label: 'Health', icon: <FiShield className="w-4 h-4" /> },
  { key: 'policies', label: 'Policies', icon: <FiFileText className="w-4 h-4" /> },
  { key: 'experience', label: 'Experience', icon: <FiStar className="w-4 h-4" /> },
  { key: 'documents', label: 'Documents', icon: <FiBookOpen className="w-4 h-4" /> },
];

/* ──────────────────────────────────────────────
   Helper components
   ────────────────────────────────────────────── */
function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-thb-text-muted mb-1">{icon && <span className="inline-flex items-center gap-1">{icon}</span>} {label}</label>
      <p className="px-3 py-2 text-sm text-thb-text-primary bg-slate-50 rounded-lg border border-thb-border/50">{value || '—'}</p>
    </div>
  );
}

function SectionCard({ title, icon, iconBg, iconColor, children }: {
  title: string; icon: React.ReactNode; iconBg: string; iconColor: string; children: React.ReactNode;
}) {
  return (
    <div className="thb-card">
      <div className="p-5">
        <h4 className="text-sm font-semibold text-thb-text-primary mb-4 flex items-center gap-2 pb-3 border-b border-thb-border">
          <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
            <span className={iconColor}>{icon}</span>
          </div>
          {title}
        </h4>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Main Component
   ────────────────────────────────────────────── */
export default function MyProfilePage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ProfileTab>('personal');
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/users/profile', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Failed to load profile');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const emp = profileData?.employee as Record<string, unknown> | null | undefined;
  const tenant = profileData?.tenant as Record<string, unknown> | null | undefined;

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const formatDate = (val: unknown) => {
    if (!val || typeof val !== 'string') return '—';
    try { return new Date(val + 'T00:00:00').toLocaleDateString(); } catch { return '—'; }
  };

  const str = (val: unknown): string => (val as string) || '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-thb-text-muted">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="thb-card p-12 text-center max-w-md">
          <FiAlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-thb-text-primary mb-2">Failed to Load Profile</h2>
          <p className="text-sm text-thb-text-secondary mb-4">{error}</p>
          <button onClick={() => fetchProfile()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
            <FiUser className="w-6 h-6 text-slate-500" />
            My Profile
          </h1>
          <p className="text-thb-text-secondary mt-1">View your employee details as configured by HR</p>
        </div>
      </div>

      {/* Profile Summary Card */}
      <div className="thb-card">
        <div className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-blue-500/20">
              {user?.name ? getInitials(user.name) : '??'}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-thb-text-primary">{user?.name || 'User'}</h3>
              <p className="text-sm text-thb-text-muted">{user?.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="thb-badge thb-badge-success capitalize">{user?.role?.replace('_', ' ') || 'employee'}</span>
                {emp?.employeeId && (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-mono">{String(emp.employeeId)}</span>
                )}
                {emp?.status && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium capitalize ${
                    emp.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
                    emp.status === 'on_leave' ? 'bg-amber-50 text-amber-600' :
                    'bg-red-50 text-red-600'
                  }`}>{String(emp.status).replace('_', ' ')}</span>
                )}
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-sm text-thb-text-secondary">
              {emp?.department && (
                <div className="flex items-center gap-1.5">
                  <FiBriefcase className="w-4 h-4 text-blue-500" />
                  <span>{String(emp.department)}</span>
                </div>
              )}
              {emp?.designation && (
                <div className="flex items-center gap-1.5">
                  <FiStar className="w-4 h-4 text-amber-500" />
                  <span>{String(emp.designation)}</span>
                </div>
              )}
              {emp?.dateOfJoining && (
                <div className="flex items-center gap-1.5">
                  <FiCalendar className="w-4 h-4 text-emerald-500" />
                  <span>Joined {formatDate(emp.dateOfJoining)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="thb-card">
        <div className="border-b border-thb-border overflow-x-auto">
          <nav className="flex min-w-max">
            {profileTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                    : 'border-transparent text-thb-text-secondary hover:text-thb-text-primary hover:bg-slate-50'
                }`}
              >
                <span className={activeTab === tab.key ? 'text-blue-500' : 'text-thb-text-muted'}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {/* Personal Tab */}
        {activeTab === 'personal' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Basic Information" icon={<FiUser className="w-4 h-4" />} iconBg="bg-blue-50" iconColor="text-blue-500">
              <InfoRow label="Full Name" value={`${str(emp?.firstName)} ${str(emp?.lastName)}`} icon={<FiUser className="w-3 h-3" />} />
              <InfoRow label="Official Email" value={str(emp?.email)} icon={<FiMail className="w-3 h-3" />} />
              <InfoRow label="Phone" value={str(emp?.phone)} icon={<FiPhone className="w-3 h-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Gender" value={str(emp?.gender) ? String(emp?.gender).charAt(0).toUpperCase() + String(emp?.gender).slice(1) : ''} />
                <InfoRow label="Blood Group" value={str(emp?.bloodGroup)} />
              </div>
              <InfoRow label="Date of Birth" value={formatDate(emp?.dateOfBirth)} icon={<FiCalendar className="w-3 h-3" />} />
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Marital Status" value={str(emp?.maritalStatus) ? String(emp?.maritalStatus).charAt(0).toUpperCase() + String(emp?.maritalStatus).slice(1) : ''} />
                <InfoRow label="Nationality" value={str(emp?.nationality)} />
              </div>
            </SectionCard>

            <SectionCard title="Quick Info" icon={<FiInfo className="w-4 h-4" />} iconBg="bg-emerald-50" iconColor="text-emerald-500">
              <InfoRow label="Employee ID" value={str(emp?.employeeId)} />
              <InfoRow label="Status" value={str(emp?.status) ? String(emp?.status).replace('_', ' ').charAt(0).toUpperCase() + String(emp?.status).replace('_', ' ').slice(1) : ''} />
              <InfoRow label="Department" value={str(emp?.department)} />
              <InfoRow label="Designation" value={str(emp?.designation)} />
              <InfoRow label="Branch" value={str(emp?.branch)} />
              <InfoRow label="Date of Joining" value={formatDate(emp?.dateOfJoining)} />
              <InfoRow label="Company" value={str(tenant?.name)} />
            </SectionCard>

            {/* Dependents */}
            {Array.isArray(emp?.dependents) && (emp?.dependents as unknown[]).length > 0 && (
              <SectionCard title="Dependents" icon={<FiHeart className="w-4 h-4" />} iconBg="bg-rose-50" iconColor="text-rose-500">
                {(emp?.dependents as Record<string, unknown>[]).map((dep, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-thb-border/50">
                    <div className="grid grid-cols-2 gap-3">
                      <InfoRow label="Name" value={str(dep.name)} />
                      <InfoRow label="Relationship" value={str(dep.relationship)} />
                      <InfoRow label="Date of Birth" value={formatDate(dep.dateOfBirth)} />
                      <InfoRow label="Gender" value={str(dep.gender)} />
                    </div>
                  </div>
                ))}
              </SectionCard>
            )}
          </div>
        )}

        {/* Address Tab */}
        {activeTab === 'address' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Residential Address" icon={<FiHome className="w-4 h-4" />} iconBg="bg-violet-50" iconColor="text-violet-500">
              <InfoRow label="Street Address" value={str(emp?.address)} />
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="City" value={str(emp?.city)} />
                <InfoRow label="State" value={str(emp?.state)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="ZIP / Postal Code" value={str(emp?.zipCode)} />
                <InfoRow label="Country" value={str(emp?.country)} />
              </div>
            </SectionCard>
          </div>
        )}

        {/* Employment Tab */}
        {activeTab === 'employment' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Employment Details" icon={<FiBriefcase className="w-4 h-4" />} iconBg="bg-blue-50" iconColor="text-blue-500">
              <InfoRow label="Employee ID" value={str(emp?.employeeId)} icon={<FiBriefcase className="w-3 h-3" />} />
              <InfoRow label="Department" value={str(emp?.department)} />
              <InfoRow label="Designation" value={str(emp?.designation)} />
              <InfoRow label="Branch" value={str(emp?.branch)} />
              <InfoRow label="Date of Joining" value={formatDate(emp?.dateOfJoining)} icon={<FiCalendar className="w-3 h-3" />} />
              <InfoRow label="Status" value={str(emp?.status) ? String(emp?.status).replace('_', ' ').charAt(0).toUpperCase() + String(emp?.status).replace('_', ' ').slice(1) : ''} />
            </SectionCard>

            <SectionCard title="Organization" icon={<FiInfo className="w-4 h-4" />} iconBg="bg-emerald-50" iconColor="text-emerald-500">
              <InfoRow label="Company" value={str(tenant?.name)} />
              <InfoRow label="Company Plan" value={str(tenant?.plan)} />
              <InfoRow label="Currency" value={str(tenant?.currency)} />
              <InfoRow label="Timezone" value={str(tenant?.timezone)} />
            </SectionCard>
          </div>
        )}

        {/* Bank & Finance Tab */}
        {activeTab === 'bank' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Bank Account Details" icon={<FiCreditCard className="w-4 h-4" />} iconBg="bg-emerald-50" iconColor="text-emerald-500">
              <InfoRow label="Bank Name" value={str(emp?.bankName)} />
              <InfoRow label="Account Number" value={str(emp?.bankAccountNo)} />
              <InfoRow label="IFSC Code" value={str(emp?.bankIfscCode)} />
            </SectionCard>

            <SectionCard title="Identity & Tax" icon={<FiShield className="w-4 h-4" />} iconBg="bg-violet-50" iconColor="text-violet-500">
              <InfoRow label="PAN Number" value={str(emp?.panNumber)} />
              <InfoRow label="Aadhaar Number" value={str(emp?.aadhaarNumber)} />
              <InfoRow label="Tax ID" value={str(emp?.taxId)} />
            </SectionCard>
          </div>
        )}

        {/* Salary Tab */}
        {activeTab === 'salary' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Compensation" icon={<FiDollarSign className="w-4 h-4" />} iconBg="bg-emerald-50" iconColor="text-emerald-500">
              <InfoRow label="Salary" value={emp?.salary ? `${str(emp?.salaryCurrency) || 'INR'} ${Number(emp.salary).toLocaleString()}` : ''} icon={<FiDollarSign className="w-3 h-3" />} />
              <InfoRow label="Currency" value={str(emp?.salaryCurrency) || 'INR'} />
              <InfoRow label="Salary Structure" value={str(emp?.salaryStructureId) ? 'Assigned' : 'Not Assigned'} />
            </SectionCard>
          </div>
        )}

        {/* Emergency Tab */}
        {activeTab === 'emergency' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Emergency Contact" icon={<FiHeart className="w-4 h-4" />} iconBg="bg-red-50" iconColor="text-red-500">
              <InfoRow label="Contact Name" value={str(emp?.emergencyContactName)} icon={<FiUser className="w-3 h-3" />} />
              <InfoRow label="Contact Phone" value={str(emp?.emergencyContactPhone)} icon={<FiPhone className="w-3 h-3" />} />
            </SectionCard>
          </div>
        )}

        {/* Health Tab */}
        {activeTab === 'health' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Health Information" icon={<FiShield className="w-4 h-4" />} iconBg="bg-rose-50" iconColor="text-rose-500">
              <InfoRow label="Blood Group" value={str(emp?.bloodGroup)} />
              <InfoRow label="Date of Birth" value={formatDate(emp?.dateOfBirth)} />
              <InfoRow label="Gender" value={str(emp?.gender) ? String(emp?.gender).charAt(0).toUpperCase() + String(emp?.gender).slice(1) : ''} />
              <InfoRow label="Marital Status" value={str(emp?.maritalStatus) ? String(emp?.maritalStatus).charAt(0).toUpperCase() + String(emp?.maritalStatus).slice(1) : ''} />
            </SectionCard>
          </div>
        )}

        {/* Policies Tab */}
        {activeTab === 'policies' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Assigned Policies" icon={<FiFileText className="w-4 h-4" />} iconBg="bg-amber-50" iconColor="text-amber-500">
              <InfoRow label="Leave Policy" value={str(emp?.leavePolicyId) ? 'Assigned' : 'Not Assigned'} icon={<FiCalendar className="w-3 h-3" />} />
              <InfoRow label="Attendance Policy" value={str(emp?.attendancePolicyId) ? 'Assigned' : 'Not Assigned'} icon={<FiClock className="w-3 h-3" />} />
              <InfoRow label="Travel Policy" value={str(emp?.travelPolicyId) ? 'Assigned' : 'Not Assigned'} icon={<FiMapPin className="w-3 h-3" />} />
              <InfoRow label="Salary Structure" value={str(emp?.salaryStructureId) ? 'Assigned' : 'Not Assigned'} icon={<FiDollarSign className="w-3 h-3" />} />
            </SectionCard>
          </div>
        )}

        {/* Experience Tab */}
        {activeTab === 'experience' && (
          <div className="space-y-4">
            {Array.isArray(emp?.experiences) && (emp?.experiences as unknown[]).length > 0 ? (
              (emp?.experiences as Record<string, unknown>[]).map((exp, idx) => (
                <SectionCard key={idx} title={`Experience ${idx + 1}`} icon={<FiBriefcase className="w-4 h-4" />} iconBg="bg-blue-50" iconColor="text-blue-500">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <InfoRow label="Company" value={str(exp.company)} />
                    <InfoRow label="Designation" value={str(exp.designation)} />
                    <InfoRow label="From" value={formatDate(exp.fromDate)} />
                    <InfoRow label="To" value={formatDate(exp.toDate)} />
                  </div>
                  {str(exp.description) && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-thb-border/50">
                      <label className="block text-xs font-medium text-thb-text-muted mb-1">Description</label>
                      <p className="text-sm text-thb-text-primary">{str(exp.description)}</p>
                    </div>
                  )}
                </SectionCard>
              ))
            ) : (
              <div className="thb-card p-12 text-center">
                <FiBriefcase className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-thb-text-primary mb-1">No Experience Records</h3>
                <p className="text-xs text-thb-text-muted">Previous experience details have not been added yet.</p>
              </div>
            )}

            {/* Qualifications */}
            {Array.isArray(emp?.qualifications) && (emp?.qualifications as unknown[]).length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-thb-text-primary mb-3 flex items-center gap-2">
                  <FiBookOpen className="w-4 h-4 text-violet-500" />
                  Qualifications
                </h3>
                {(emp?.qualifications as Record<string, unknown>[]).map((qual, idx) => (
                  <SectionCard key={idx} title={`Qualification ${idx + 1}`} icon={<FiBookOpen className="w-4 h-4" />} iconBg="bg-violet-50" iconColor="text-violet-500">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <InfoRow label="Degree / Course" value={str(qual.degree)} />
                      <InfoRow label="Institution" value={str(qual.institution)} />
                      <InfoRow label="Year" value={str(qual.year)} />
                      <InfoRow label="Grade / Percentage" value={str(qual.grade)} />
                    </div>
                  </SectionCard>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            {Array.isArray(emp?.documents) && (emp?.documents as unknown[]).length > 0 ? (
              <SectionCard title="Uploaded Documents" icon={<FiBookOpen className="w-4 h-4" />} iconBg="bg-blue-50" iconColor="text-blue-500">
                <div className="space-y-2">
                  {(emp?.documents as Record<string, unknown>[]).map((doc, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-thb-border/50">
                      <div className="flex items-center gap-3">
                        <FiFileText className="w-4 h-4 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium text-thb-text-primary">{str(doc.name)}</p>
                          <p className="text-xs text-thb-text-muted">{str(doc.type)}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                        str(doc.status) === 'verified' ? 'bg-emerald-50 text-emerald-600' :
                        str(doc.status) === 'pending' ? 'bg-amber-50 text-amber-600' :
                        'bg-slate-50 text-slate-500'
                      }`}>{str(doc.status) || 'Uploaded'}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ) : (
              <div className="thb-card p-12 text-center">
                <FiFileText className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-thb-text-primary mb-1">No Documents</h3>
                <p className="text-xs text-thb-text-muted">No documents have been uploaded yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
