'use client';

import { useState, useMemo } from 'react';
import {
  FiUsers, FiBriefcase, FiDollarSign, FiTrendingUp, FiPhone, FiMail,
  FiPlus, FiSearch, FiFilter, FiEye, FiEdit2, FiTrash2, FiX,
  FiTarget, FiCalendar, FiCheckCircle, FiChevronRight, FiChevronDown,
  FiClock, FiArrowRight, FiStar, FiMapPin, FiGlobe, FiLink, FiUserPlus, FiUser,
} from 'react-icons/fi';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ── Demo Data ──
const dealPipelineData = [
  { stage: 'Qualification', value: 450000, count: 8 },
  { stage: 'Proposal', value: 680000, count: 12 },
  { stage: 'Negotiation', value: 920000, count: 6 },
  { stage: 'Closed Won', value: 1250000, count: 15 },
  { stage: 'Closed Lost', value: 380000, count: 7 },
];

const monthlyRevenueData = [
  { month: 'Jan', revenue: 125000, target: 150000 },
  { month: 'Feb', revenue: 148000, target: 150000 },
  { month: 'Mar', revenue: 172000, target: 160000 },
  { month: 'Apr', revenue: 165000, target: 170000 },
  { month: 'May', revenue: 195000, target: 180000 },
  { month: 'Jun', revenue: 210000, target: 200000 },
  { month: 'Jul', revenue: 235000, target: 220000 },
  { month: 'Aug', revenue: 228000, target: 240000 },
  { month: 'Sep', revenue: 260000, target: 250000 },
  { month: 'Oct', revenue: 285000, target: 270000 },
  { month: 'Nov', revenue: 310000, target: 290000 },
  { month: 'Dec', revenue: 340000, target: 300000 },
];

const leadSourceData = [
  { name: 'Website', value: 35, color: '#3b82f6' },
  { name: 'Referral', value: 25, color: '#10b981' },
  { name: 'LinkedIn', value: 20, color: '#8b5cf6' },
  { name: 'Events', value: 12, color: '#f59e0b' },
  { name: 'Cold Call', value: 5, color: '#ef4444' },
  { name: 'Other', value: 3, color: '#64748b' },
];

const leadStatusData = [
  { status: 'New', count: 45 },
  { status: 'Contacted', count: 32 },
  { status: 'Qualified', count: 28 },
  { status: 'Proposal', count: 18 },
  { status: 'Negotiation', count: 12 },
  { status: 'Won', count: 25 },
  { status: 'Lost', count: 15 },
];

const demoContacts = [
  { id: '1', name: 'Rajesh Kumar', company: 'TechCorp Solutions', email: 'rajesh@techcorp.com', phone: '+91 98765 43210', type: 'Customer', status: 'Active', lastContact: '2026-06-28', dealValue: 450000 },
  { id: '2', name: 'Priya Sharma', company: 'InnovateTech', email: 'priya@innovatetech.in', phone: '+91 87654 32109', type: 'Lead', status: 'New', lastContact: '2026-06-27', dealValue: 280000 },
  { id: '3', name: 'Amit Patel', company: 'CloudNine Systems', email: 'amit@cloudnine.io', phone: '+91 76543 21098', type: 'Customer', status: 'Active', lastContact: '2026-06-25', dealValue: 620000 },
  { id: '4', name: 'Sneha Reddy', company: 'DataFlow Inc', email: 'sneha@dataflow.com', phone: '+91 65432 10987', type: 'Partner', status: 'Active', lastContact: '2026-06-20', dealValue: 350000 },
  { id: '5', name: 'Vikram Singh', company: 'NexGen Labs', email: 'vikram@nexgen.com', phone: '+91 54321 09876', type: 'Lead', status: 'Contacted', lastContact: '2026-06-15', dealValue: 180000 },
  { id: '6', name: 'Deepa Nair', company: 'Zenith Corp', email: 'deepa@zenith.com', phone: '+91 43210 98765', type: 'Customer', status: 'Active', lastContact: '2026-06-12', dealValue: 520000 },
];

const demoDeals = [
  { id: '1', name: 'ERP Implementation', company: 'TechCorp Solutions', value: 450000, stage: 'Negotiation', probability: 75, closeDate: '2026-07-15', owner: 'Sales Team A' },
  { id: '2', name: 'Cloud Migration', company: 'InnovateTech', value: 280000, stage: 'Proposal', probability: 50, closeDate: '2026-08-01', owner: 'Sales Team B' },
  { id: '3', name: 'Data Analytics Platform', company: 'CloudNine Systems', value: 620000, stage: 'Qualification', probability: 30, closeDate: '2026-09-30', owner: 'Sales Team A' },
  { id: '4', name: 'HRMS Customization', company: 'Zenith Corp', value: 180000, stage: 'Closed Won', probability: 100, closeDate: '2026-06-20', owner: 'Sales Team C' },
  { id: '5', name: 'Security Audit', company: 'DataFlow Inc', value: 95000, stage: 'Proposal', probability: 60, closeDate: '2026-07-30', owner: 'Sales Team A' },
  { id: '6', name: 'Managed Services', company: 'NexGen Labs', value: 350000, stage: 'Qualification', probability: 20, closeDate: '2026-10-15', owner: 'Sales Team B' },
];

const demoLeads = [
  { id: '1', name: 'Rahul Mehta', company: 'StartUp X', email: 'rahul@startupx.io', phone: '+91 99887 76655', source: 'Website', score: 85, temperature: 'Hot', status: 'Qualified', assignedTo: 'Sales Rep A', createdAt: '2026-06-28' },
  { id: '2', name: 'Anita Desai', company: 'Growth Co', email: 'anita@growthco.in', phone: '+91 88776 65544', source: 'Referral', score: 72, temperature: 'Hot', status: 'Contacted', assignedTo: 'Sales Rep B', createdAt: '2026-06-25' },
  { id: '3', name: 'Karthik Iyer', company: 'ScaleUp Tech', email: 'karthik@scaleup.com', phone: '+91 77665 54433', source: 'LinkedIn', score: 58, temperature: 'Warm', status: 'New', assignedTo: 'Sales Rep A', createdAt: '2026-06-22' },
  { id: '4', name: 'Meera Joshi', company: 'BizPro Solutions', email: 'meera@bizpro.com', phone: '+91 66554 43322', source: 'Events', score: 45, temperature: 'Warm', status: 'Contacted', assignedTo: 'Sales Rep C', createdAt: '2026-06-18' },
  { id: '5', name: 'Arjun Rao', company: 'TechVentures', email: 'arjun@techventures.in', phone: '+91 55443 32211', source: 'Cold Call', score: 25, temperature: 'Cold', status: 'New', assignedTo: 'Sales Rep B', createdAt: '2026-06-15' },
];

type TabKey = 'dashboard' | 'contacts' | 'deals' | 'leads' | 'activities';

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <FiTarget className="w-4 h-4" /> },
  { key: 'contacts', label: 'Contacts', icon: <FiUsers className="w-4 h-4" /> },
  { key: 'deals', label: 'Deals Pipeline', icon: <FiBriefcase className="w-4 h-4" /> },
  { key: 'leads', label: 'Leads', icon: <FiUser className="w-4 h-4" /> },
  { key: 'activities', label: 'Activities', icon: <FiClock className="w-4 h-4" /> },
];

function getStageColor(stage: string) {
  const map: Record<string, string> = {
    Qualification: 'bg-blue-100 text-blue-700',
    Proposal: 'bg-purple-100 text-purple-700',
    Negotiation: 'bg-amber-100 text-amber-700',
    'Closed Won': 'bg-emerald-100 text-emerald-700',
    'Closed Lost': 'bg-red-100 text-red-700',
  };
  return map[stage] || 'bg-slate-100 text-slate-700';
}

function getTempBadge(temp: string) {
  const map: Record<string, string> = {
    Hot: 'thb-badge thb-badge-error',
    Warm: 'thb-badge thb-badge-warning',
    Cold: 'thb-badge thb-badge-info',
  };
  return map[temp] || 'thb-badge thb-badge-info';
}

export default function CRMPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showAddDealModal, setShowAddDealModal] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);

  const filteredContacts = useMemo(() => {
    return demoContacts.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.company.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm]);

  const filteredDeals = useMemo(() => {
    return demoDeals.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()) || d.company.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm]);

  const filteredLeads = useMemo(() => {
    return demoLeads.filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase()) || l.company.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-6 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">CRM & Sales</h1>
              <p className="text-emerald-100 mt-1">Manage contacts, deals pipeline, leads, and sales activities</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAddDealModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors">
                <FiPlus className="w-4 h-4" /> New Deal
              </button>
              <button onClick={() => setShowAddContactModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors">
                <FiUserPlus className="w-4 h-4" /> New Contact
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Contacts', value: '248', icon: <FiUsers className="w-5 h-5" />, color: 'text-blue-600', bg: 'bg-blue-50', trend: '+12' },
          { label: 'Active Deals', value: '34', icon: <FiBriefcase className="w-5 h-5" />, color: 'text-purple-600', bg: 'bg-purple-50', trend: '+5' },
          { label: 'Pipeline Value', value: '₹38.5L', icon: <FiDollarSign className="w-5 h-5" />, color: 'text-emerald-600', bg: 'bg-emerald-50', trend: '+8.2%' },
          { label: 'Won This Month', value: '8', icon: <FiCheckCircle className="w-5 h-5" />, color: 'text-emerald-600', bg: 'bg-emerald-50', trend: '+3' },
          { label: 'Lost This Month', value: '3', icon: <FiX className="w-5 h-5" />, color: 'text-red-600', bg: 'bg-red-50', trend: '-1' },
          { label: 'Win Rate', value: '72%', icon: <FiTrendingUp className="w-5 h-5" />, color: 'text-teal-600', bg: 'bg-teal-50', trend: '+4%' },
        ].map((stat) => (
          <div key={stat.label} className="thb-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className={`p-2 rounded-lg ${stat.bg} ${stat.color}`}>{stat.icon}</div>
              <span className={`text-xs font-medium ${stat.color}`}>{stat.trend}</span>
            </div>
            <p className="text-xl font-bold text-thb-text-primary">{stat.value}</p>
            <p className="text-xs text-thb-text-secondary mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-slate-200 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.key ? 'bg-emerald-500 text-white shadow-sm' : 'text-thb-text-secondary hover:bg-slate-50'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="thb-card p-5">
              <h3 className="text-sm font-semibold text-thb-text-primary mb-4">Deal Pipeline by Stage</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dealPipelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v: number) => `₹${v / 100000}L`} />
                  <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, '']} />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="thb-card p-5">
              <h3 className="text-sm font-semibold text-thb-text-primary mb-4">Monthly Revenue vs Target</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={monthlyRevenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v: number) => `₹${v / 1000}K`} />
                  <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, '']} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.1} name="Revenue" />
                  <Area type="monotone" dataKey="target" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} name="Target" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="thb-card p-5">
              <h3 className="text-sm font-semibold text-thb-text-primary mb-4">Lead Sources</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={leadSourceData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {leadSourceData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="thb-card p-5">
              <h3 className="text-sm font-semibold text-thb-text-primary mb-4">Lead Status Distribution</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={leadStatusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="status" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {/* Hot Deals */}
          <div className="thb-card p-5">
            <h3 className="text-sm font-semibold text-thb-text-primary mb-4">🔥 Hot Deals</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-3 font-semibold text-thb-text-secondary">Deal</th>
                    <th className="text-left py-2 px-3 font-semibold text-thb-text-secondary">Company</th>
                    <th className="text-right py-2 px-3 font-semibold text-thb-text-secondary">Value</th>
                    <th className="text-left py-2 px-3 font-semibold text-thb-text-secondary">Stage</th>
                    <th className="text-left py-2 px-3 font-semibold text-thb-text-secondary">Close Date</th>
                    <th className="text-center py-2 px-3 font-semibold text-thb-text-secondary">Probability</th>
                  </tr>
                </thead>
                <tbody>
                  {demoDeals.filter(d => d.probability >= 50).map(deal => (
                    <tr key={deal.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-medium text-thb-text-primary">{deal.name}</td>
                      <td className="py-2.5 px-3 text-thb-text-secondary">{deal.company}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-emerald-600">₹{deal.value.toLocaleString()}</td>
                      <td className="py-2.5 px-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${getStageColor(deal.stage)}`}>{deal.stage}</span></td>
                      <td className="py-2.5 px-3 text-thb-text-secondary">{deal.closeDate}</td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${deal.probability}%` }} /></div>
                          <span className="text-xs font-medium text-thb-text-secondary">{deal.probability}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Contacts Tab */}
      {activeTab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search contacts..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <button onClick={() => setShowAddContactModal(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors ml-auto">
              <FiPlus className="w-4 h-4" /> Add Contact
            </button>
          </div>
          <div className="thb-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Company</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Email</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Phone</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Type</th>
                  <th className="text-center py-3 px-4 font-semibold text-thb-text-secondary">Status</th>
                  <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Deal Value</th>
                  <th className="text-center py-3 px-4 font-semibold text-thb-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map(contact => (
                  <tr key={contact.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold">{contact.name.split(' ').map(n => n[0]).join('')}</div>
                        <span className="font-medium text-thb-text-primary">{contact.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-thb-text-secondary">{contact.company}</td>
                    <td className="py-3 px-4 text-thb-text-secondary">{contact.email}</td>
                    <td className="py-3 px-4 text-thb-text-secondary">{contact.phone}</td>
                    <td className="py-3 px-4"><span className={`px-2 py-1 rounded-full text-xs font-medium ${contact.type === 'Customer' ? 'bg-emerald-100 text-emerald-700' : contact.type === 'Lead' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{contact.type}</span></td>
                    <td className="py-3 px-4 text-center"><span className={contact.status === 'Active' ? 'thb-badge thb-badge-success' : 'thb-badge thb-badge-warning'}>{contact.status}</span></td>
                    <td className="py-3 px-4 text-right font-medium text-emerald-600">₹{contact.dealValue.toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"><FiEye className="w-3.5 h-3.5" /></button>
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"><FiEdit2 className="w-3.5 h-3.5" /></button>
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><FiTrash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deals Pipeline Tab */}
      {activeTab === 'deals' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search deals..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <button onClick={() => setShowAddDealModal(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors ml-auto">
              <FiPlus className="w-4 h-4" /> New Deal
            </button>
          </div>
          {/* Pipeline Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total Pipeline', value: '₹38.5L', color: 'text-blue-600' },
              { label: 'Weighted Pipeline', value: '₹22.8L', color: 'text-purple-600' },
              { label: 'Avg Deal Size', value: '₹3.5L', color: 'text-emerald-600' },
              { label: 'Avg Close Time', value: '28 days', color: 'text-amber-600' },
            ].map(s => (
              <div key={s.label} className="thb-card p-3 text-center">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-thb-text-secondary">{s.label}</p>
              </div>
            ))}
          </div>
          {/* Kanban Pipeline */}
          <div className="grid grid-cols-5 gap-3 overflow-x-auto">
            {['Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'].map(stage => {
              const stageDeals = filteredDeals.filter(d => d.stage === stage);
              return (
                <div key={stage} className="min-w-[220px]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-2 h-2 rounded-full ${stage === 'Closed Won' ? 'bg-emerald-500' : stage === 'Closed Lost' ? 'bg-red-500' : stage === 'Negotiation' ? 'bg-amber-500' : stage === 'Proposal' ? 'bg-purple-500' : 'bg-blue-500'}`} />
                    <span className="text-xs font-semibold text-thb-text-primary">{stage}</span>
                    <span className="text-xs text-thb-text-muted bg-slate-100 px-1.5 py-0.5 rounded">{stageDeals.length}</span>
                  </div>
                  <div className="space-y-2">
                    {stageDeals.map(deal => (
                      <div key={deal.id} className="thb-card p-3 hover:shadow-md transition-shadow cursor-pointer">
                        <p className="text-sm font-medium text-thb-text-primary mb-1">{deal.name}</p>
                        <p className="text-xs text-thb-text-secondary">{deal.company}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm font-bold text-emerald-600">₹{(deal.value / 100000).toFixed(1)}L</span>
                          <span className="text-xs text-thb-text-muted">{deal.probability}%</span>
                        </div>
                        <div className="flex items-center gap-1 mt-2 text-xs text-thb-text-muted">
                          <FiCalendar className="w-3 h-3" /> {deal.closeDate}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Leads Tab */}
      {activeTab === 'leads' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search leads..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <button onClick={() => setShowAddLeadModal(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors ml-auto">
              <FiPlus className="w-4 h-4" /> Add Lead
            </button>
          </div>
          <div className="thb-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Lead</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Company</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Source</th>
                  <th className="text-center py-3 px-4 font-semibold text-thb-text-secondary">Score</th>
                  <th className="text-center py-3 px-4 font-semibold text-thb-text-secondary">Temperature</th>
                  <th className="text-center py-3 px-4 font-semibold text-thb-text-secondary">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Assigned To</th>
                  <th className="text-center py-3 px-4 font-semibold text-thb-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map(lead => (
                  <tr key={lead.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold">{lead.name.split(' ').map(n => n[0]).join('')}</div>
                        <div>
                          <p className="font-medium text-thb-text-primary">{lead.name}</p>
                          <p className="text-xs text-thb-text-muted">{lead.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-thb-text-secondary">{lead.company}</td>
                    <td className="py-3 px-4"><span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{lead.source}</span></td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${lead.score >= 70 ? 'bg-emerald-500' : lead.score >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${lead.score}%` }} /></div>
                        <span className="text-xs font-medium">{lead.score}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center"><span className={getTempBadge(lead.temperature)}>{lead.temperature}</span></td>
                    <td className="py-3 px-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-medium ${lead.status === 'Qualified' ? 'bg-emerald-100 text-emerald-700' : lead.status === 'Contacted' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>{lead.status}</span></td>
                    <td className="py-3 px-4 text-thb-text-secondary">{lead.assignedTo}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"><FiPhone className="w-3.5 h-3.5" /></button>
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-colors"><FiMail className="w-3.5 h-3.5" /></button>
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"><FiCalendar className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activities Tab */}
      {activeTab === 'activities' && (
        <div className="thb-card p-5">
          <h3 className="text-sm font-semibold text-thb-text-primary mb-4">Recent Activities</h3>
          <div className="space-y-3">
            {[
              { type: 'call', icon: <FiPhone className="w-4 h-4" />, color: 'text-blue-500 bg-blue-50', title: 'Call with Rajesh Kumar', desc: 'Discussed ERP implementation timeline', time: '2 hours ago' },
              { type: 'email', icon: <FiMail className="w-4 h-4" />, color: 'text-emerald-500 bg-emerald-50', title: 'Email to Priya Sharma', desc: 'Sent proposal for cloud migration project', time: '4 hours ago' },
              { type: 'meeting', icon: <FiUsers className="w-4 h-4" />, color: 'text-purple-500 bg-purple-50', title: 'Meeting with Amit Patel', desc: 'Quarterly review and next steps discussion', time: 'Yesterday' },
              { type: 'deal', icon: <FiBriefcase className="w-4 h-4" />, color: 'text-amber-500 bg-amber-50', title: 'Deal Won: HRMS Customization', desc: 'Closed deal with Zenith Corp worth ₹1.8L', time: '2 days ago' },
              { type: 'task', icon: <FiCheckCircle className="w-4 h-4" />, color: 'text-teal-500 bg-teal-50', title: 'Follow-up: DataFlow Inc', desc: 'Schedule security audit proposal presentation', time: '3 days ago' },
            ].map((activity, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                <div className={`p-2 rounded-lg ${activity.color}`}>{activity.icon}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-thb-text-primary">{activity.title}</p>
                  <p className="text-xs text-thb-text-secondary">{activity.desc}</p>
                </div>
                <span className="text-xs text-thb-text-muted">{activity.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddContactModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddContactModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-thb-text-primary">Add Contact</h3>
              <button onClick={() => setShowAddContactModal(false)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Name</label><input type="text" placeholder="Contact name" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Email</label><input type="email" placeholder="email@company.com" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Company</label><input type="text" placeholder="Company name" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Phone</label><input type="tel" placeholder="+91 XXXXX XXXXX" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Type</label><select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"><option>Lead</option><option>Customer</option><option>Partner</option></select></div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowAddContactModal(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-thb-text-primary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={() => { setShowAddContactModal(false); toast.success('Contact added'); }} className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors">Add Contact</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Deal Modal */}
      {showAddDealModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddDealModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-thb-text-primary">New Deal</h3>
              <button onClick={() => setShowAddDealModal(false)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Deal Name</label><input type="text" placeholder="e.g., ERP Implementation" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Company</label><input type="text" placeholder="Client company" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Value (₹)</label><input type="number" placeholder="0" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Stage</label><select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"><option>Qualification</option><option>Proposal</option><option>Negotiation</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Close Date</label><input type="date" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Probability %</label><input type="number" placeholder="50" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowAddDealModal(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-thb-text-primary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={() => { setShowAddDealModal(false); toast.success('Deal created'); }} className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors">Create Deal</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {showAddLeadModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddLeadModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-thb-text-primary">Add Lead</h3>
              <button onClick={() => setShowAddLeadModal(false)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Lead Name</label><input type="text" placeholder="Full name" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Email</label><input type="email" placeholder="lead@company.com" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Company</label><input type="text" placeholder="Company" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Source</label><select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"><option>Website</option><option>Referral</option><option>LinkedIn</option><option>Events</option><option>Cold Call</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Score (1-100)</label><input type="number" min="1" max="100" defaultValue="50" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-sm font-medium text-thb-text-secondary mb-1">Assigned To</label><select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"><option>Sales Rep A</option><option>Sales Rep B</option><option>Sales Rep C</option></select></div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowAddLeadModal(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-thb-text-primary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={() => { setShowAddLeadModal(false); toast.success('Lead added'); }} className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors">Add Lead</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
