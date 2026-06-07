'use client';

import { useState } from 'react';
import {
  FiLayers, FiPlus, FiX, FiSearch, FiEdit2, FiTrash2, FiEye,
  FiMapPin, FiBriefcase, FiAward, FiClock, FiCalendar, FiSun, FiMoon,
  FiFileText, FiUsers, FiDollarSign,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Demo Data ── */
const companies = [
  { id: 'comp-1', name: 'Nexus Technologies', code: 'NEXTECH', city: 'Mumbai', state: 'Maharashtra', status: 'Active', branches: 3, departments: 8, employees: 31, gst: '27AABCN1234F1Z5', phone: '+91 22 4567 8901' },
  { id: 'comp-2', name: 'Nexus Solutions', code: 'NEXSOL', city: 'Hyderabad', state: 'Telangana', status: 'Active', branches: 2, departments: 8, employees: 10, gst: '36AABCN5678F1Z3', phone: '+91 40 2345 6789' },
  { id: 'comp-3', name: 'Nexus Staffing', code: 'NEXSTAFF', city: 'Pune', state: 'Maharashtra', status: 'Active', branches: 1, departments: 8, employees: 10, gst: '27AABCN9012F1Z1', phone: '+91 20 3456 7890' },
];

const branches = [
  { id: 'br-1', name: 'Mumbai HQ', company: 'NEXTECH', city: 'Mumbai', state: 'Maharashtra', address: 'BKC, Bandra East', status: 'Active', head: 'Aarav Sharma' },
  { id: 'br-2', name: 'Bangalore Tech Park', company: 'NEXTECH', city: 'Bangalore', state: 'Karnataka', address: 'Whitefield Main Road', status: 'Active', head: 'Priya Patel' },
  { id: 'br-3', name: 'Delhi NCR Office', company: 'NEXTECH', city: 'New Delhi', state: 'Delhi', address: 'Connaught Place', status: 'Active', head: 'Rohan Kumar' },
  { id: 'br-4', name: 'Hyderabad Campus', company: 'NEXSOL', city: 'Hyderabad', state: 'Telangana', address: 'HITEC City, Madhapur', status: 'Active', head: 'Amit Rao' },
  { id: 'br-5', name: 'Chennai Center', company: 'NEXSOL', city: 'Chennai', state: 'Tamil Nadu', address: 'OMR, Thoraipakkam', status: 'Active', head: 'Suresh Babu' },
  { id: 'br-6', name: 'Pune Office', company: 'NEXSTAFF', city: 'Pune', state: 'Maharashtra', address: 'Hinjewadi Phase 2', status: 'Active', head: 'Sanjay Deshmukh' },
];

const departments = [
  { id: 'dept-1', name: 'Engineering', head: 'Aarav Sharma', employees: 8, budget: '₹1.2Cr', status: 'Active' },
  { id: 'dept-2', name: 'HR', head: 'Ananya Singh', employees: 4, budget: '₹45L', status: 'Active' },
  { id: 'dept-3', name: 'Finance', head: 'Neha Gupta', employees: 3, budget: '₹38L', status: 'Active' },
  { id: 'dept-4', name: 'Sales', head: 'Arjun Mehta', employees: 3, budget: '₹55L', status: 'Active' },
  { id: 'dept-5', name: 'Marketing', head: 'Sneha Joshi', employees: 3, budget: '₹32L', status: 'Active' },
  { id: 'dept-6', name: 'Operations', head: 'Karan Verma', employees: 3, budget: '₹42L', status: 'Active' },
  { id: 'dept-7', name: 'Quality', head: 'Divya Nair', employees: 3, budget: '₹28L', status: 'Active' },
  { id: 'dept-8', name: 'Admin', head: 'Vikram Reddy', employees: 3, budget: '₹22L', status: 'Active' },
];

const designations = [
  { id: 'des-1', name: 'Software Engineer', grade: 'E1', department: 'Engineering', minSalary: '₹3L', maxSalary: '₹6L', status: 'Active' },
  { id: 'des-2', name: 'Senior Engineer', grade: 'E2', department: 'Engineering', minSalary: '₹6L', maxSalary: '₹12L', status: 'Active' },
  { id: 'des-3', name: 'Tech Lead', grade: 'E3', department: 'Engineering', minSalary: '₹12L', maxSalary: '₹20L', status: 'Active' },
  { id: 'des-4', name: 'HR Executive', grade: 'E1', department: 'HR', minSalary: '₹3L', maxSalary: '₹6L', status: 'Active' },
  { id: 'des-5', name: 'HR Manager', grade: 'M1', department: 'HR', minSalary: '₹20L', maxSalary: '₹35L', status: 'Active' },
  { id: 'des-6', name: 'Finance Manager', grade: 'M1', department: 'Finance', minSalary: '₹20L', maxSalary: '₹35L', status: 'Active' },
  { id: 'des-7', name: 'Sales Manager', grade: 'M1', department: 'Sales', minSalary: '₹20L', maxSalary: '₹35L', status: 'Active' },
  { id: 'des-8', name: 'Operations Manager', grade: 'M1', department: 'Operations', minSalary: '₹20L', maxSalary: '₹35L', status: 'Active' },
];

const grades = [
  { id: 'gr-1', name: 'E1 - Junior', code: 'E1', range: '₹3-6L', min: 300000, max: 600000, employees: 8, status: 'Active' },
  { id: 'gr-2', name: 'E2 - Mid Level', code: 'E2', range: '₹6-12L', min: 600000, max: 1200000, employees: 6, status: 'Active' },
  { id: 'gr-3', name: 'E3 - Senior', code: 'E3', range: '₹12-20L', min: 1200000, max: 2000000, employees: 4, status: 'Active' },
  { id: 'gr-4', name: 'M1 - Manager', code: 'M1', range: '₹20-35L', min: 2000000, max: 3500000, employees: 5, status: 'Active' },
];

const shifts = [
  { id: 'sh-1', name: 'General Shift', code: 'GS', startTime: '09:00 AM', endTime: '06:00 PM', breakTime: '1 hour', graceMinutes: 15, status: 'Active' },
  { id: 'sh-2', name: 'Morning Shift', code: 'MS', startTime: '06:00 AM', endTime: '02:00 PM', breakTime: '30 min', graceMinutes: 10, status: 'Active' },
  { id: 'sh-3', name: 'Evening Shift', code: 'ES', startTime: '02:00 PM', endTime: '10:00 PM', breakTime: '30 min', graceMinutes: 10, status: 'Active' },
  { id: 'sh-4', name: 'Night Shift', code: 'NS', startTime: '10:00 PM', endTime: '06:00 AM', breakTime: '30 min', graceMinutes: 10, status: 'Active' },
];

const holidays = [
  { id: 'hol-1', name: 'Republic Day', date: 'Jan 26, 2026', day: 'Monday', type: 'National', status: 'Active' },
  { id: 'hol-2', name: 'Holi', date: 'Mar 10, 2026', day: 'Tuesday', type: 'Festival', status: 'Active' },
  { id: 'hol-3', name: 'Maharashtra Day', date: 'May 1, 2026', day: 'Friday', type: 'State', status: 'Active' },
  { id: 'hol-4', name: 'Eid ul-Fitr', date: 'Apr 2, 2026', day: 'Thursday', type: 'Festival', status: 'Active' },
  { id: 'hol-5', name: 'Independence Day', date: 'Aug 15, 2026', day: 'Saturday', type: 'National', status: 'Active' },
  { id: 'hol-6', name: 'Ganesh Chaturthi', date: 'Aug 27, 2026', day: 'Thursday', type: 'Festival', status: 'Active' },
  { id: 'hol-7', name: 'Gandhi Jayanti', date: 'Oct 2, 2026', day: 'Friday', type: 'National', status: 'Active' },
  { id: 'hol-8', name: 'Dussehra', date: 'Oct 20, 2026', day: 'Tuesday', type: 'Festival', status: 'Active' },
  { id: 'hol-9', name: 'Diwali', date: 'Nov 10, 2026', day: 'Tuesday', type: 'Festival', status: 'Active' },
  { id: 'hol-10', name: 'Christmas', date: 'Dec 25, 2026', day: 'Friday', type: 'Festival', status: 'Active' },
];

const policies = [
  { id: 'pol-1', name: 'Leave Policy', category: 'Leave', version: '3.2', lastUpdated: 'Jun 1, 2026', status: 'Active' },
  { id: 'pol-2', name: 'Attendance Policy', category: 'Attendance', version: '2.1', lastUpdated: 'May 15, 2026', status: 'Active' },
  { id: 'pol-3', name: 'Code of Conduct', category: 'HR', version: '4.0', lastUpdated: 'Apr 20, 2026', status: 'Active' },
  { id: 'pol-4', name: 'Remote Work Policy', category: 'Work', version: '1.5', lastUpdated: 'Jun 3, 2026', status: 'Active' },
  { id: 'pol-5', name: 'Travel & Expense Policy', category: 'Finance', version: '2.3', lastUpdated: 'Mar 10, 2026', status: 'Active' },
  { id: 'pol-6', name: 'IT Security Policy', category: 'IT', version: '3.0', lastUpdated: 'May 1, 2026', status: 'Active' },
];

/* ── Status Badge ── */
function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    Active: 'nexus-badge nexus-badge-success',
    Inactive: 'nexus-badge nexus-badge-error',
    Draft: 'nexus-badge nexus-badge-primary',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getTypeBadge(type: string) {
  const map: Record<string, string> = {
    National: 'bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2 py-0.5 rounded-full',
    Festival: 'bg-purple-50 text-purple-700 border border-purple-200 text-xs font-medium px-2 py-0.5 rounded-full',
    State: 'bg-teal-50 text-teal-700 border border-teal-200 text-xs font-medium px-2 py-0.5 rounded-full',
  };
  return map[type] || 'bg-slate-50 text-slate-700 text-xs font-medium px-2 py-0.5 rounded-full';
}

/* ── Tab Config ── */
const TABS = [
  { key: 'companies', label: 'Companies', icon: <FiLayers className="w-4 h-4" /> },
  { key: 'branches', label: 'Branches', icon: <FiMapPin className="w-4 h-4" /> },
  { key: 'departments', label: 'Departments', icon: <FiBriefcase className="w-4 h-4" /> },
  { key: 'designations', label: 'Designations', icon: <FiAward className="w-4 h-4" /> },
  { key: 'grades', label: 'Grades', icon: <FiUsers className="w-4 h-4" /> },
  { key: 'shifts', label: 'Shifts', icon: <FiClock className="w-4 h-4" /> },
  { key: 'holidays', label: 'Holidays', icon: <FiCalendar className="w-4 h-4" /> },
  { key: 'policies', label: 'Policies', icon: <FiFileText className="w-4 h-4" /> },
];

export default function CompanyManagementPage() {
  const [activeTab, setActiveTab] = useState('companies');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const handleAddNew = () => {
    setShowForm(true);
    setViewingId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
  };

  const filteredCompanies = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()));
  const filteredBranches = branches.filter(b => b.name.toLowerCase().includes(search.toLowerCase()) || b.city.toLowerCase().includes(search.toLowerCase()));
  const filteredDepartments = departments.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
  const filteredDesignations = designations.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
  const filteredGrades = grades.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));
  const filteredShifts = shifts.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  const filteredHolidays = holidays.filter(h => h.name.toLowerCase().includes(search.toLowerCase()));
  const filteredPolicies = policies.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiLayers className="w-6 h-6 text-teal-500" />
            Company Management
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage companies, branches, departments, and organizational structure</p>
        </div>
        <button onClick={handleAddNew} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiPlus className="w-4 h-4" /> Add {activeTab.charAt(0).toUpperCase() + activeTab.slice(1, -1)}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <FiSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-nexus-text-muted" />
        <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit flex-wrap">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setShowForm(false); setViewingId(null); }} className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === tab.key ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="nexus-card p-4"><p className="text-sm text-nexus-text-secondary">Total Companies</p><p className="text-2xl font-bold text-nexus-text-primary">{companies.length}</p></div>
        <div className="nexus-card p-4"><p className="text-sm text-nexus-text-secondary">Total Branches</p><p className="text-2xl font-bold text-nexus-text-primary">{branches.length}</p></div>
        <div className="nexus-card p-4"><p className="text-sm text-nexus-text-secondary">Total Employees</p><p className="text-2xl font-bold text-emerald-600">{companies.reduce((acc, c) => acc + c.employees, 0)}</p></div>
      </div>

      {/* Companies Tab */}
      {activeTab === 'companies' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredCompanies.map(c => (
            <div key={c.id} className="nexus-card nexus-card-hover p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center"><FiLayers className="w-5 h-5 text-teal-600" /></div>
                <div className="flex gap-1">
                  <button onClick={() => { setViewingId(c.id); setShowForm(false); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors"><FiEye className="w-3.5 h-3.5" /></button>
                  <button className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"><FiEdit2 className="w-3.5 h-3.5" /></button>
                  <button className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"><FiTrash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <h3 className="text-nexus-text-primary font-semibold text-lg">{c.name}</h3>
              <p className="text-nexus-text-muted text-sm mb-1">{c.code} · {c.city}, {c.state}</p>
              <p className="text-nexus-text-muted text-xs mb-4">GST: {c.gst} · {c.phone}</p>
              <div className="grid grid-cols-3 gap-2 text-center border-t border-nexus-border pt-3">
                <div><p className="text-lg font-bold text-nexus-text-primary">{c.branches}</p><p className="text-xs text-nexus-text-muted">Branches</p></div>
                <div><p className="text-lg font-bold text-nexus-text-primary">{c.departments}</p><p className="text-xs text-nexus-text-muted">Depts</p></div>
                <div><p className="text-lg font-bold text-emerald-600">{c.employees}</p><p className="text-xs text-nexus-text-muted">Employees</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Branches Tab */}
      {activeTab === 'branches' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Branch</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">City</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Address</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Branch Head</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBranches.map(b => (
                  <tr key={b.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary flex items-center gap-2"><FiMapPin className="w-4 h-4 text-teal-500" />{b.name}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-primary">{b.company}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{b.city}, {b.state}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-muted">{b.address}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-primary">{b.head}</td>
                    <td className="px-4 py-3"><span className={getStatusBadge(b.status)}>{b.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"><FiEdit2 className="w-3.5 h-3.5" /></button>
                        <button className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"><FiTrash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Departments Tab */}
      {activeTab === 'departments' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Department</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Head</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employees</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Budget</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDepartments.map(d => (
                  <tr key={d.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{d.name}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-primary">{d.head}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{d.employees}</td>
                    <td className="px-4 py-3 text-sm font-medium text-emerald-600">{d.budget}</td>
                    <td className="px-4 py-3"><span className={getStatusBadge(d.status)}>{d.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"><FiEdit2 className="w-3.5 h-3.5" /></button>
                        <button className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"><FiTrash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Designations Tab */}
      {activeTab === 'designations' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Designation</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Grade</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Department</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Salary Range</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDesignations.map(d => (
                  <tr key={d.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{d.name}</td>
                    <td className="px-4 py-3"><span className="bg-teal-50 text-teal-700 border border-teal-200 text-xs font-medium px-2 py-0.5 rounded-full">{d.grade}</span></td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{d.department}</td>
                    <td className="px-4 py-3 text-sm font-medium text-emerald-600">{d.minSalary} - {d.maxSalary}</td>
                    <td className="px-4 py-3"><span className={getStatusBadge(d.status)}>{d.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"><FiEdit2 className="w-3.5 h-3.5" /></button>
                        <button className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"><FiTrash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grades Tab */}
      {activeTab === 'grades' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredGrades.map(g => (
            <div key={g.id} className="nexus-card nexus-card-hover p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="bg-teal-50 text-teal-700 border border-teal-200 text-base font-bold px-3 py-1 rounded-full">{g.code}</span>
                <span className={getStatusBadge(g.status)}>{g.status}</span>
              </div>
              <p className="text-nexus-text-primary font-semibold text-lg">{g.name}</p>
              <p className="text-emerald-600 text-2xl font-bold mt-2">{g.range}</p>
              <p className="text-nexus-text-muted text-sm mt-1">Per annum</p>
              <div className="mt-3 pt-3 border-t border-nexus-border">
                <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Employees</span><span className="text-nexus-text-primary font-medium">{g.employees}</span></div>
                <div className="flex justify-between text-sm mt-1"><span className="text-nexus-text-secondary">Min</span><span className="text-nexus-text-secondary">{(g.min / 100000).toFixed(0)}L</span></div>
                <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Max</span><span className="text-nexus-text-secondary">{(g.max / 100000).toFixed(0)}L</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Shifts Tab */}
      {activeTab === 'shifts' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Shift</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Start Time</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">End Time</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Break</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Grace</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredShifts.map(s => (
                  <tr key={s.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary flex items-center gap-2">
                      {s.code === 'NS' ? <FiMoon className="w-4 h-4 text-indigo-500" /> : <FiSun className="w-4 h-4 text-amber-500" />}
                      {s.name}
                    </td>
                    <td className="px-4 py-3"><span className="bg-slate-100 text-slate-700 text-xs font-mono font-medium px-2 py-0.5 rounded">{s.code}</span></td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{s.startTime}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{s.endTime}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{s.breakTime}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{s.graceMinutes} min</td>
                    <td className="px-4 py-3"><span className={getStatusBadge(s.status)}>{s.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"><FiEdit2 className="w-3.5 h-3.5" /></button>
                        <button className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"><FiTrash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Holidays Tab */}
      {activeTab === 'holidays' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Holiday</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Day</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHolidays.map(h => (
                  <tr key={h.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{h.name}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{h.date}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-muted">{h.day}</td>
                    <td className="px-4 py-3"><span className={getTypeBadge(h.type)}>{h.type}</span></td>
                    <td className="px-4 py-3"><span className={getStatusBadge(h.status)}>{h.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors"><FiEye className="w-3.5 h-3.5" /></button>
                        <button className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"><FiEdit2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Policy</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Version</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Last Updated</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPolicies.map(p => (
                  <tr key={p.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{p.name}</td>
                    <td className="px-4 py-3"><span className="bg-slate-100 text-slate-700 text-xs font-medium px-2 py-0.5 rounded-full">{p.category}</span></td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary font-mono">v{p.version}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-muted">{p.lastUpdated}</td>
                    <td className="px-4 py-3"><span className={getStatusBadge(p.status)}>{p.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors"><FiEye className="w-3.5 h-3.5" /></button>
                        <button className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"><FiEdit2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Embedded Form */}
      {showForm && (
        <div id="crud-form" className="nexus-card border-l-4 border-l-blue-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Add New {activeTab.charAt(0).toUpperCase() + activeTab.slice(1, -1)}</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label>
                <input className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Enter name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Code</label>
                <input className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Code" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                <select className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={() => { toast.success('Saved successfully'); handleCancelForm(); }} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm shadow-blue-500/25 transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
