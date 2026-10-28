'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { validateEmail, validatePhone, validateName } from '@/lib/validators';

const industries = [
  'Technology / IT Services',
  'Consulting',
  'Manufacturing',
  'Healthcare',
  'Finance / Banking',
  'Retail / E-Commerce',
  'Education',
  'Real Estate',
  'Logistics / Transportation',
  'Hospitality',
  'Media / Entertainment',
  'Other',
];

const availableModules = [
  { key: 'employees', label: 'Employee Management', desc: 'Employee database, profiles & documents' },
  { key: 'attendance', label: 'Attendance', desc: 'Biometric, GPS & shift-based tracking' },
  { key: 'leave', label: 'Leave Management', desc: 'Leave types, balances & approval workflows' },
  { key: 'payroll', label: 'Payroll', desc: 'Salary structures, runs & payslips' },
  { key: 'recruitment', label: 'Recruitment (ATS)', desc: 'Job postings, candidate pipeline & offers' },
  { key: 'onboarding', label: 'Onboarding', desc: 'Task checklists & welcome workflows' },
  { key: 'performance', label: 'Performance', desc: 'Reviews, goals & OKR tracking' },
  { key: 'travel_expense', label: 'Travel & Expense', desc: 'Travel requests & expense claims' },
  { key: 'helpdesk', label: 'Helpdesk', desc: 'Ticket management & SLA tracking' },
  { key: 'analytics', label: 'Analytics', desc: 'Dashboards & custom reports' },
  { key: 'ai_chatbot', label: 'AI Chatbot', desc: 'AI-powered HR assistant' },
];

export default function TrialRegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingCode, setCheckingCode] = useState(false);
  const [codeAvailable, setCodeAvailable] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [registrationCode, setRegistrationCode] = useState('');
  const [autoApproved, setAutoApproved] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    companyName: '',
    companyCode: '',
    companyEmail: '',
    companyPhone: '',
    companyWebsite: '',
    industry: '',
    country: 'IN',
    currency: 'INR',
    employeeCount: 10,
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    designation: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    selectedModules: [] as string[],
    companyLogo: '' as string,
    employeeDataJson: '' as string,
  });

  const handleCodeCheck = async () => {
    if (!form.companyCode || form.companyCode.length < 3) return;
    setCheckingCode(true);
    setCodeAvailable(null);
    try {
      const res = await fetch('/api/trial/check-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyCode: form.companyCode }),
      });
      const data = await res.json();
      setCodeAvailable(data.available);
      if (data.available) {
        setRegistrationCode(data.slug);
      }
    } catch {
      setCodeAvailable(null);
    } finally {
      setCheckingCode(false);
    }
  };

  // TC_054-058: Logo upload with full file validation
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // TC_057: Size check — max 2MB
    const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 MB
    if (file.size > MAX_LOGO_SIZE) {
      toast.error('Maximum file size is 2 MB.');
      e.target.value = ''; // reset input
      return;
    }

    // TC_054/055/056: File type validation — only PNG, JPG, SVG allowed
    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg'];
    const fileExtension = '.' + (file.name.split('.').pop() || '').toLowerCase();

    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(fileExtension)) {
      toast.error('Only PNG, JPG, or SVG files are allowed.');
      e.target.value = '';
      return;
    }

    // TC_058: Magic bytes validation — detect actual file content, not just extension
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const uint8 = new Uint8Array(arrayBuffer);

      // Check magic bytes for common image formats
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      // JPEG: FF D8 FF
      // SVG: check for XML/text starting with <?xml or <svg
      const isPNG = uint8.length >= 8 &&
        uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4E && uint8[3] === 0x47;
      const isJPEG = uint8.length >= 3 &&
        uint8[0] === 0xFF && uint8[1] === 0xD8 && uint8[2] === 0xFF;
      // SVG is XML text — check for <svg or <?xml
      const headerStr = new TextDecoder().decode(uint8.slice(0, 256)).toLowerCase();
      const isSVG = headerStr.includes('<svg') || headerStr.includes('<?xml');
      // PDF: 25 50 44 46 (%PDF)
      const isPDF = uint8.length >= 4 &&
        uint8[0] === 0x25 && uint8[1] === 0x50 && uint8[2] === 0x44 && uint8[3] === 0x46;

      if (isPDF) {
        toast.error('Only PNG, JPG, or SVG files are allowed. PDF files are not accepted.');
        e.target.value = '';
        return;
      }
      if (!isPNG && !isJPEG && !isSVG) {
        toast.error('Only PNG, JPG, or SVG files are allowed. The file content does not match a valid image format.');
        e.target.value = '';
        return;
      }

      // Valid image — convert to data URL and store
      const dataUrlReader = new FileReader();
      dataUrlReader.onload = () => {
        setForm({ ...form, companyLogo: dataUrlReader.result as string });
        toast.success('Logo uploaded successfully.');
      };
      dataUrlReader.readAsDataURL(file);
    };
    reader.readAsArrayBuffer(file);
  };

  // TC_061-065: Employee data upload with xlsx/CSV parsing and validation
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // TC_063: Reject PDF and other non-spreadsheet files
    const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];
    const fileExtension = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      toast.error('Please choose an Excel or CSV file.');
      e.target.value = '';
      return;
    }

    // File size limit (10MB for employee data — larger than logo)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File is too large. Maximum size is 10 MB.');
      e.target.value = '';
      return;
    }

    try {
      // Dynamically import xlsx library for proper Excel parsing
      const xlsx = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = xlsx.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) {
        toast.error('The file does not contain any employee records.');
        e.target.value = '';
        return;
      }
      const rows: Record<string, unknown>[] = xlsx.utils.sheet_to_json(firstSheet, { defval: '' });

      // TC_065: Empty file check
      if (rows.length === 0) {
        toast.error('The file does not contain any employee records.');
        e.target.value = '';
        return;
      }

      // TC_064: Max 5 employees check
      if (rows.length > 5) {
        toast.error(`Maximum 5 employees are allowed. Your file contains ${rows.length} employees.`);
        e.target.value = '';
        return;
      }

      // TC_065: Required columns validation
      const REQUIRED_COLUMNS = ['EmployeeId', 'FirstName', 'LastName', 'Email', 'Phone', 'Department', 'Designation', 'DateOfJoining'];
      const headers = Object.keys(rows[0]);
      const missingColumns = REQUIRED_COLUMNS.filter(col => !headers.includes(col));
      if (missingColumns.length > 0) {
        toast.error(`Missing required columns: ${missingColumns.join(', ')}. Please download the template for the correct format.`);
        e.target.value = '';
        return;
      }

      // Validate each row has required fields
      const invalidRows: number[] = [];
      rows.forEach((row, i) => {
        const hasAllRequired = REQUIRED_COLUMNS.every(col => {
          const val = row[col];
          return val !== undefined && val !== null && String(val).trim() !== '';
        });
        if (!hasAllRequired) invalidRows.push(i + 2); // +2 for 1-indexed + header row
      });
      if (invalidRows.length > 0) {
        toast.error(`Row(s) ${invalidRows.join(', ')} are missing required fields. Please fill in all required columns.`);
        e.target.value = '';
        return;
      }

      // Valid — store as JSON
      setForm({ ...form, employeeDataJson: JSON.stringify(rows) });
      toast.success(`${rows.length} employee(s) loaded from ${file.name}.`);
    } catch (err) {
      console.error('Employee upload parse error:', err);
      toast.error('Could not parse the file. Please ensure it is a valid Excel or CSV file with the correct columns.');
      e.target.value = '';
    }
  };

  const toggleModule = (key: string) => {
    setForm(prev => ({
      ...prev,
      selectedModules: prev.selectedModules.includes(key)
        ? prev.selectedModules.filter(m => m !== key)
        : [...prev.selectedModules, key],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validation using centralized validators
    const companyNameResult = validateName(form.companyName, 'Company name');
    if (!companyNameResult.valid) { setError(companyNameResult.error!); return; }

    if (!form.companyCode || form.companyCode.trim().length < 3) {
      setError('Company code must be at least 3 characters'); return;
    }
    if (!/^[a-z0-9-]+$/i.test(form.companyCode.trim())) {
      setError('Company code can only contain letters, numbers, and hyphens'); return;
    }

    const companyEmailResult = validateEmail(form.companyEmail);
    if (!companyEmailResult.valid) { setError(companyEmailResult.error!); return; }

    // BUG_004: Company Phone is now mandatory
    if (!form.companyPhone || form.companyPhone.trim() === '') {
      setError('Company phone is required'); return;
    }
    const companyPhoneResult = validatePhone(form.companyPhone);
    if (!companyPhoneResult.valid) { setError(companyPhoneResult.error!); return; }

    // BUG_004: Industry is now mandatory — placeholder "Select industry" not accepted
    if (!form.industry || form.industry.trim() === '') {
      setError('Please select an industry'); return;
    }

    // BUG_004: Country is now mandatory
    if (!form.country || form.country.trim() === '') {
      setError('Please select a country'); return;
    }

    // BUG_004: Expected Employees is now mandatory
    if (!form.employeeCount || form.employeeCount < 1) {
      setError('Please enter the expected number of employees'); return;
    }

    const contactNameResult = validateName(form.contactName, 'Contact name');
    if (!contactNameResult.valid) { setError(contactNameResult.error!); return; }

    const contactEmailResult = validateEmail(form.contactEmail);
    if (!contactEmailResult.valid) { setError(contactEmailResult.error!); return; }

    // BUG_004: Contact Phone is now mandatory
    if (!form.contactPhone || form.contactPhone.trim() === '') {
      setError('Contact phone is required'); return;
    }
    const contactPhoneResult = validatePhone(form.contactPhone);
    if (!contactPhoneResult.valid) { setError(contactPhoneResult.error!); return; }

    // BUG_004: Address, City, State, ZIP are now mandatory
    if (!form.address || form.address.trim() === '') {
      setError('Company address is required'); return;
    }
    if (!form.city || form.city.trim() === '') {
      setError('City is required'); return;
    }
    if (!form.state || form.state.trim() === '') {
      setError('State is required'); return;
    }
    if (!form.zipCode || form.zipCode.trim() === '') {
      setError('ZIP code is required'); return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/trial/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed. Please try again.');
        return;
      }

      setRegistrationCode(data.companyCode);
      setAutoApproved(data.autoApproved || false);
      // BUG_019: capture tempPassword from response so we can show it on
      // the confirmation screen (also sent via email as a backup).
      setTempPassword(data.tempPassword || '');
      setSubmitted(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl">
          {/* Success Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-t-2xl p-8 text-center text-white">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">
              {autoApproved ? 'Your Trial is Ready!' : 'Registration Submitted!'}
            </h2>
            <p className="text-emerald-100">
              {autoApproved
                ? 'Your 3Boxes HRMS trial has been automatically activated. Login credentials are below.'
                : 'Thank you for your interest. Our team will review and approve your request within 24 hours.'}
            </p>
          </div>

          <div className="p-8 space-y-6">
            {/* Company Info */}
            <div className="bg-green-50 rounded-xl p-5">
              <h3 className="font-semibold text-green-900 mb-3">Your Trial Details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-green-600">Company:</span> <span className="font-medium">{form.companyName}</span></div>
                <div><span className="text-green-600">Company Code:</span> <span className="font-mono bg-white px-2 py-0.5 rounded">{registrationCode}</span></div>
                <div><span className="text-green-600">Subdomain:</span> <span className="font-mono text-sm">{registrationCode}.3boxeshrms.com</span></div>
                <div><span className="text-green-600">Trial Period:</span> <span className="font-medium">15 days</span></div>
              </div>
            </div>

            {/* Auto-approved credentials */}
            {autoApproved && (
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-5">
                <h3 className="font-semibold text-emerald-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743A11.05 11.05 0 0110.5 7.5a2 2 0 114 0M9 15H7.5a2 2 0 01-2-2V7a2 2 0 012-2h5.5" />
                  </svg>
                  Your Login Credentials
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 bg-white p-3 rounded-lg border">
                    <span className="text-gray-500 w-24">Email:</span>
                    <span className="font-mono font-medium">{form.contactEmail}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white p-3 rounded-lg border">
                    <span className="text-gray-500 w-24">Password:</span>
                    <span className="font-mono font-medium text-emerald-700">{tempPassword || 'Check your email'}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white p-3 rounded-lg border">
                    <span className="text-gray-500 w-24">Login URL:</span>
                    <span className="font-mono text-sm text-emerald-700">https://{registrationCode}.3boxeshrms.com/login</span>
                  </div>
                </div>
                <p className="text-xs text-emerald-600 mt-3">
                  A temporary password has been sent to <strong>{form.contactEmail}</strong>. 
                  Please check your inbox (and spam folder). You will be asked to change it on first login.
                </p>
              </div>
            )}

            {/* Module selection summary */}
            {form.selectedModules.length > 0 && (
              <div className="bg-emerald-50 rounded-xl p-5">
                <h3 className="font-semibold text-emerald-900 mb-3">Selected Modules for Trial</h3>
                <div className="flex flex-wrap gap-2">
                  {form.selectedModules.map(key => {
                    const mod = availableModules.find(m => m.key === key);
                    return (
                      <span key={key} className="px-3 py-1.5 bg-white rounded-lg text-sm font-medium text-emerald-700 border border-emerald-200">
                        {mod?.label || key}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Next steps */}
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 mb-3">What happens next?</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                  <div>
                    <p className="font-medium text-gray-800">Explore the platform</p>
                    <p className="text-gray-500">Login and try all the modules you selected. Upload sample employee data to test imports.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                  <div>
                    <p className="font-medium text-gray-800">Before trial ends</p>
                    <p className="text-gray-500">Choose a subscription plan to continue using 3Boxes HRMS without interruption.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                  <div>
                    <p className="font-medium text-gray-800">Full access after subscription</p>
                    <p className="text-gray-500">All your trial data, settings and configurations are preserved when you upgrade.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              {/* TC_068: Navigate to trial login. On Vercel preview deploys the
                  *.3boxeshrms.com wildcard may not resolve, so we use the same
                  host with ?tenant=<slug> which middleware resolves via
                  x-tenant-slug header. This avoids "Network error" when the
                  custom domain DNS isn't configured. */}
              <button
                onClick={() => router.push(`/login?tenant=${encodeURIComponent(registrationCode)}`)}
                className="flex-1 py-3 px-6 bg-gradient-to-r from-green-600 to-emerald-700 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-800 transition-all shadow-lg shadow-green-500/25"
              >
                Go to My Trial Login →
              </button>
              <button
                onClick={() => router.push('/login')}
                className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Back to Main Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-700 text-white py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl mb-6 backdrop-blur-sm">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-3">Start Your Free Trial</h1>
          <p className="text-lg text-green-100 max-w-2xl mx-auto">
            Experience the full power of 3Boxes HRMS — HR, Payroll, Attendance, Recruitment, and more — free for 15 days. No credit card required.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto -mt-6 px-4 pb-16">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Step 1: Company Information */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 bg-green-100 text-green-700 rounded-lg flex items-center justify-center text-sm font-bold">1</span>
              Company Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="e.g., Acme Technologies Pvt Ltd"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Code * <span className="text-xs text-gray-400">(becomes your subdomain)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={form.companyCode}
                    onChange={(e) => {
                      setForm({ ...form, companyCode: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') });
                      setCodeAvailable(null);
                    }}
                    onBlur={handleCodeCheck}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="e.g., acme-tech"
                  />
                  <button
                    type="button"
                    onClick={handleCodeCheck}
                    disabled={checkingCode || !form.companyCode}
                    className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 disabled:opacity-50 text-sm font-medium"
                  >
                    {checkingCode ? '...' : 'Check'}
                  </button>
                </div>
                {codeAvailable === true && (
                  <p className="text-xs text-green-600 mt-1">✓ Available — your URL: https://{form.companyCode}.3boxeshrms.com</p>
                )}
                {codeAvailable === false && (
                  <p className="text-xs text-red-600 mt-1">✗ This code is already taken</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Official Email *</label>
                <input
                  type="email"
                  required
                  value={form.companyEmail}
                  onChange={(e) => setForm({ ...form, companyEmail: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="info@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Phone <span className="text-red-500">*</span></label>
                <input type="tel" required value={form.companyPhone} onChange={(e) => setForm({ ...form, companyPhone: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website <span className="text-xs text-gray-400 font-normal">(optional)</span></label>
                <input type="url" value={form.companyWebsite} onChange={(e) => setForm({ ...form, companyWebsite: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="https://www.company.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industry <span className="text-red-500">*</span></label>
                <select required value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500">
                  <option value="">Select industry</option>
                  {industries.map((ind) => (<option key={ind} value={ind}>{ind}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country <span className="text-red-500">*</span></label>
                <select required value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500">
                  <option value="IN">India</option>
                  <option value="US">United States</option>
                  <option value="GB">United Kingdom</option>
                  <option value="SG">Singapore</option>
                  <option value="AE">UAE</option>
                  <option value="AU">Australia</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expected Employees <span className="text-red-500">*</span></label>
                <input type="number" required min={1} max={10000} value={form.employeeCount} onChange={(e) => setForm({ ...form, employeeCount: parseInt(e.target.value) || 10 })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500" />
              </div>
            </div>
          </div>

          {/* Step 2: Contact Person */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 bg-green-100 text-green-700 rounded-lg flex items-center justify-center text-sm font-bold">2</span>
              Contact Person <span className="text-xs text-gray-400 font-normal">(will become the admin)</span>
            </h3>
            <p className="text-xs text-gray-500 mb-3">All fields marked <span className="text-red-500">*</span> are required.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input type="text" required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" required value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="john@company.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-red-500">*</span></label>
                <input type="tel" required value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Designation <span className="text-xs text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="HR Manager / CEO / Director" />
              </div>
            </div>
          </div>

          {/* Step 3: Company Address */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 bg-green-100 text-green-700 rounded-lg flex items-center justify-center text-sm font-bold">3</span>
              Company Address <span className="text-xs text-red-500 font-normal">* all fields required</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address <span className="text-red-500">*</span></label>
                <input type="text" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="123 Business Park, Sector 5" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City <span className="text-red-500">*</span></label>
                <input type="text" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="Mumbai" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State <span className="text-red-500">*</span></label>
                <input type="text" required value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="Maharashtra" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code <span className="text-red-500">*</span></label>
                <input type="text" required value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500" placeholder="400001" />
              </div>
            </div>
          </div>

          {/* Step 4: Logo Upload */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 bg-teal-100 text-teal-700 rounded-lg flex items-center justify-center text-sm font-bold">4</span>
              Company Logo
            </h3>
            <div className="flex items-center gap-6">
              {form.companyLogo ? (
                <div className="w-24 h-24 rounded-xl border-2 border-gray-200 overflow-hidden">
                  <img src={form.companyLogo} alt="Logo preview" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                  </svg>
                </div>
              )}
              <div>
                <label className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 cursor-pointer transition-colors text-sm font-medium">
                  Upload Logo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-gray-500 mt-1">PNG, JPG or SVG. Max 2MB. Will appear in your HRMS portal.</p>
              </div>
            </div>
          </div>

          {/* Step 5: Sample Employee Data Upload */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center text-sm font-bold">5</span>
              Sample Employee Data <span className="text-xs text-gray-400 font-normal">(Optional)</span>
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload a sample of up to 5 employees to test the platform. Download our{' '}
              <a
                href="/api/trial/excel-template"
                className="text-green-600 underline hover:text-green-800 font-medium"
              >
                Excel template here
              </a>
              . You can always add more employees after your trial is activated.
            </p>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-green-400 transition-colors">
              <svg className="w-10 h-10 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <label className="px-4 py-2 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 cursor-pointer transition-colors text-sm font-medium">
                Choose File (CSV or Excel)
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleExcelUpload}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-gray-500 mt-2">
                Columns: EmployeeId, FirstName, LastName, Email, Phone, Department, Designation, DateOfJoining
              </p>
            </div>
          </div>

          {/* Step 6: Module Selection */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center text-sm font-bold">6</span>
              Select Modules for Trial <span className="text-xs text-gray-400 font-normal">(at least 3 recommended)</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {availableModules.map((mod) => {
                const selected = form.selectedModules.includes(mod.key);
                return (
                  <button
                    key={mod.key}
                    type="button"
                    onClick={() => toggleModule(mod.key)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      selected
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className={`font-medium text-sm ${selected ? 'text-emerald-900' : 'text-gray-800'}`}>
                          {mod.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{mod.desc}</p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          selected ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                        }`}
                      >
                        {selected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              {form.selectedModules.length === 0
                ? 'No modules selected. You can add modules later from Settings.'
                : `${form.selectedModules.length} module${form.selectedModules.length !== 1 ? 's' : ''} selected. These will be enabled in your trial environment.`}
            </p>
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={loading || codeAvailable === false}
              className="w-full py-3 px-6 bg-gradient-to-r from-green-600 to-emerald-700 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-green-500/25"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Setting up your trial...
                </span>
              ) : (
                'Start Free Trial — 15 Days, No Credit Card'
              )}
            </button>
            <p className="text-xs text-gray-400 text-center mt-3">
              By registering, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
