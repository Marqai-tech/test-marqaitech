'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiClock,
  FiCalendar,
  FiShield,
  FiStar,
  FiUsers,
  FiBookOpen,
  FiFileText,
  FiFolder,
  FiTag,
  FiBell,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiEye,
  FiCheckCircle,
  FiXCircle,
  FiSettings,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ─────────── shared helpers ─────────── */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = { active: 'nexus-badge nexus-badge-success', inactive: 'nexus-badge nexus-badge-error' };
  return map[status] || 'nexus-badge';
}

function getToggleBadge(val: boolean, yes = 'Yes', no = 'No') {
  return val ? (
    <span className="nexus-badge nexus-badge-success">{yes}</span>
  ) : (
    <span className="nexus-badge nexus-badge-error">{no}</span>
  );
}

/* ─────────── field / column types ─────────── */

type FieldType = 'text' | 'number' | 'select' | 'date' | 'textarea' | 'checkbox';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  colSpan?: number; // 1 | 2 | 3
  rows?: number; // for textarea
}

interface ColDef {
  key: string;
  header: string;
  render?: (item: Record<string, unknown>) => React.ReactNode;
}

interface MasterConfig {
  key: string;
  label: string;
  icon: React.ReactNode;
  iconColor: string;
  apiBase: string;
  fields: FieldDef[];
  columns: ColDef[];
  requiredFields: string[];
  searchFields: string[];
  initialForm: Record<string, unknown>;
}

/* ─────────── master configurations ─────────── */

const MASTERS: MasterConfig[] = [
  /* 1 ── Shifts ─────────────────────────────── */
  {
    key: 'shifts',
    label: 'Shifts',
    icon: <FiClock className="w-4 h-4" />,
    iconColor: 'text-blue-500',
    apiBase: '/api/shifts',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Shift name', required: true },
      { key: 'startTime', label: 'Start Time', type: 'text', placeholder: '09:00' },
      { key: 'endTime', label: 'End Time', type: 'text', placeholder: '18:00' },
      { key: 'breakDuration', label: 'Break Duration (min)', type: 'number', placeholder: '60' },
      { key: 'graceTime', label: 'Grace Time (min)', type: 'number', placeholder: '15' },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    ],
    columns: [
      { key: 'name', header: 'Name', render: (i) => <span className="font-medium text-nexus-text-primary">{String(i.name)}</span> },
      { key: 'startTime', header: 'Start' },
      { key: 'endTime', header: 'End' },
      { key: 'breakDuration', header: 'Break (min)' },
      { key: 'graceTime', header: 'Grace (min)' },
      { key: 'status', header: 'Status', render: (i) => <span className={getStatusBadge(String(i.status))}>{String(i.status)}</span> },
    ],
    requiredFields: ['name'],
    searchFields: ['name'],
    initialForm: { name: '', startTime: '', endTime: '', breakDuration: '', graceTime: '', status: 'active' },
  },

  /* 2 ── Holidays ───────────────────────────── */
  {
    key: 'holidays',
    label: 'Holidays',
    icon: <FiCalendar className="w-4 h-4" />,
    iconColor: 'text-rose-500',
    apiBase: '/api/holidays',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Holiday name', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'type', label: 'Type', type: 'select', options: [{ value: 'public', label: 'Public' }, { value: 'company', label: 'Company' }, { value: 'optional', label: 'Optional' }] },
      { key: 'country', label: 'Country', type: 'text', placeholder: 'Country' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Description...', colSpan: 3, rows: 2 },
    ],
    columns: [
      { key: 'name', header: 'Name', render: (i) => <span className="font-medium text-nexus-text-primary">{String(i.name)}</span> },
      { key: 'date', header: 'Date', render: (i) => <span>{i.date ? new Date(String(i.date)).toLocaleDateString() : '—'}</span> },
      { key: 'type', header: 'Type', render: (i) => <span className="nexus-badge">{String(i.type || 'public')}</span> },
      { key: 'country', header: 'Country' },
    ],
    requiredFields: ['name', 'date'],
    searchFields: ['name', 'country'],
    initialForm: { name: '', date: '', type: 'public', country: '', description: '' },
  },

  /* 3 ── Leave Types ────────────────────────── */
  {
    key: 'leaveTypes',
    label: 'Leave Types',
    icon: <FiShield className="w-4 h-4" />,
    iconColor: 'text-violet-500',
    apiBase: '/api/leave-types',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Leave type name', required: true },
      { key: 'code', label: 'Code', type: 'text', placeholder: 'LT001', required: true },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Description...', colSpan: 3, rows: 2 },
      { key: 'defaultDays', label: 'Default Days', type: 'number', placeholder: '12' },
      { key: 'isPaid', label: 'Is Paid', type: 'checkbox' },
      { key: 'carryForward', label: 'Carry Forward', type: 'checkbox' },
      { key: 'maxCarryForward', label: 'Max Carry Forward', type: 'number', placeholder: '0' },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    ],
    columns: [
      { key: 'name', header: 'Name', render: (i) => <span className="font-medium text-nexus-text-primary">{String(i.name)}</span> },
      { key: 'code', header: 'Code' },
      { key: 'defaultDays', header: 'Default Days' },
      { key: 'isPaid', header: 'Paid', render: (i) => getToggleBadge(!!i.isPaid) },
      { key: 'carryForward', header: 'Carry Fwd', render: (i) => getToggleBadge(!!i.carryForward) },
      { key: 'status', header: 'Status', render: (i) => <span className={getStatusBadge(String(i.status))}>{String(i.status)}</span> },
    ],
    requiredFields: ['name', 'code'],
    searchFields: ['name', 'code'],
    initialForm: { name: '', code: '', description: '', defaultDays: '', isPaid: true, carryForward: false, maxCarryForward: '', status: 'active' },
  },

  /* 4 ── Skills ─────────────────────────────── */
  {
    key: 'skills',
    label: 'Skills',
    icon: <FiStar className="w-4 h-4" />,
    iconColor: 'text-amber-500',
    apiBase: '/api/skills',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Skill name', required: true },
      { key: 'category', label: 'Category', type: 'text', placeholder: 'Category' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Description...', colSpan: 3, rows: 2 },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    ],
    columns: [
      { key: 'name', header: 'Name', render: (i) => <span className="font-medium text-nexus-text-primary">{String(i.name)}</span> },
      { key: 'category', header: 'Category' },
      { key: 'status', header: 'Status', render: (i) => <span className={getStatusBadge(String(i.status))}>{String(i.status)}</span> },
    ],
    requiredFields: ['name'],
    searchFields: ['name', 'category'],
    initialForm: { name: '', category: '', description: '', status: 'active' },
  },

  /* 5 ── Employee Types ─────────────────────── */
  {
    key: 'employeeTypes',
    label: 'Employee Types',
    icon: <FiUsers className="w-4 h-4" />,
    iconColor: 'text-cyan-500',
    apiBase: '/api/employee-types',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Employee type name', required: true },
      { key: 'code', label: 'Code', type: 'text', placeholder: 'ET001', required: true },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Description...', colSpan: 3, rows: 2 },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    ],
    columns: [
      { key: 'name', header: 'Name', render: (i) => <span className="font-medium text-nexus-text-primary">{String(i.name)}</span> },
      { key: 'code', header: 'Code' },
      { key: 'status', header: 'Status', render: (i) => <span className={getStatusBadge(String(i.status))}>{String(i.status)}</span> },
    ],
    requiredFields: ['name', 'code'],
    searchFields: ['name', 'code'],
    initialForm: { name: '', code: '', description: '', status: 'active' },
  },

  /* 6 ── Training Types ─────────────────────── */
  {
    key: 'trainingTypes',
    label: 'Training Types',
    icon: <FiBookOpen className="w-4 h-4" />,
    iconColor: 'text-emerald-500',
    apiBase: '/api/training-types',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Training type name', required: true },
      { key: 'code', label: 'Code', type: 'text', placeholder: 'TT001', required: true },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Description...', colSpan: 3, rows: 2 },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    ],
    columns: [
      { key: 'name', header: 'Name', render: (i) => <span className="font-medium text-nexus-text-primary">{String(i.name)}</span> },
      { key: 'code', header: 'Code' },
      { key: 'status', header: 'Status', render: (i) => <span className={getStatusBadge(String(i.status))}>{String(i.status)}</span> },
    ],
    requiredFields: ['name', 'code'],
    searchFields: ['name', 'code'],
    initialForm: { name: '', code: '', description: '', status: 'active' },
  },

  /* 7 ── Document Types ─────────────────────── */
  {
    key: 'documentTypes',
    label: 'Document Types',
    icon: <FiFileText className="w-4 h-4" />,
    iconColor: 'text-orange-500',
    apiBase: '/api/document-types',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Document type name', required: true },
      { key: 'code', label: 'Code', type: 'text', placeholder: 'DT001', required: true },
      { key: 'category', label: 'Category', type: 'select', options: [{ value: 'identity', label: 'Identity' }, { value: 'compliance', label: 'Compliance' }, { value: 'contract', label: 'Contract' }, { value: 'certificate', label: 'Certificate' }, { value: 'other', label: 'Other' }] },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Description...', colSpan: 3, rows: 2 },
      { key: 'isExpiryApplicable', label: 'Expiry Applicable', type: 'checkbox' },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    ],
    columns: [
      { key: 'name', header: 'Name', render: (i) => <span className="font-medium text-nexus-text-primary">{String(i.name)}</span> },
      { key: 'code', header: 'Code' },
      { key: 'category', header: 'Category', render: (i) => <span className="nexus-badge">{String(i.category || 'other')}</span> },
      { key: 'isExpiryApplicable', header: 'Expiry', render: (i) => getToggleBadge(!!i.isExpiryApplicable, 'Yes', 'No') },
      { key: 'status', header: 'Status', render: (i) => <span className={getStatusBadge(String(i.status))}>{String(i.status)}</span> },
    ],
    requiredFields: ['name', 'code'],
    searchFields: ['name', 'code'],
    initialForm: { name: '', code: '', category: 'identity', description: '', isExpiryApplicable: false, status: 'active' },
  },

  /* 8 ── Project Types ──────────────────────── */
  {
    key: 'projectTypes',
    label: 'Project Types',
    icon: <FiFolder className="w-4 h-4" />,
    iconColor: 'text-teal-500',
    apiBase: '/api/project-types',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Project type name', required: true },
      { key: 'code', label: 'Code', type: 'text', placeholder: 'PT001', required: true },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Description...', colSpan: 3, rows: 2 },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    ],
    columns: [
      { key: 'name', header: 'Name', render: (i) => <span className="font-medium text-nexus-text-primary">{String(i.name)}</span> },
      { key: 'code', header: 'Code' },
      { key: 'status', header: 'Status', render: (i) => <span className={getStatusBadge(String(i.status))}>{String(i.status)}</span> },
    ],
    requiredFields: ['name', 'code'],
    searchFields: ['name', 'code'],
    initialForm: { name: '', code: '', description: '', status: 'active' },
  },

  /* 9 ── Ticket Categories ──────────────────── */
  {
    key: 'ticketCategories',
    label: 'Ticket Categories',
    icon: <FiTag className="w-4 h-4" />,
    iconColor: 'text-pink-500',
    apiBase: '/api/ticket-categories',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Category name', required: true },
      { key: 'code', label: 'Code', type: 'text', placeholder: 'TC001', required: true },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Description...', colSpan: 3, rows: 2 },
      { key: 'priority', label: 'Priority', type: 'select', options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' }] },
      { key: 'slaHours', label: 'SLA Hours', type: 'number', placeholder: '24' },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    ],
    columns: [
      { key: 'name', header: 'Name', render: (i) => <span className="font-medium text-nexus-text-primary">{String(i.name)}</span> },
      { key: 'code', header: 'Code' },
      { key: 'priority', header: 'Priority', render: (i) => {
        const p = String(i.priority || 'medium');
        const colors: Record<string, string> = { low: 'bg-slate-100 text-slate-700', medium: 'bg-blue-50 text-blue-700', high: 'bg-amber-50 text-amber-700', critical: 'bg-red-50 text-red-700' };
        return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[p] || 'nexus-badge'}`}>{p}</span>;
      }},
      { key: 'slaHours', header: 'SLA (hrs)' },
      { key: 'status', header: 'Status', render: (i) => <span className={getStatusBadge(String(i.status))}>{String(i.status)}</span> },
    ],
    requiredFields: ['name', 'code'],
    searchFields: ['name', 'code'],
    initialForm: { name: '', code: '', description: '', priority: 'medium', slaHours: '', status: 'active' },
  },

  /* 10 ── Notification Templates ────────────── */
  {
    key: 'notificationTemplates',
    label: 'Notif. Templates',
    icon: <FiBell className="w-4 h-4" />,
    iconColor: 'text-indigo-500',
    apiBase: '/api/notification-templates',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Template name', required: true },
      { key: 'code', label: 'Code', type: 'text', placeholder: 'NTMPL001', required: true },
      { key: 'type', label: 'Type', type: 'select', options: [{ value: 'email', label: 'Email' }, { value: 'sms', label: 'SMS' }, { value: 'push', label: 'Push' }, { value: 'in_app', label: 'In-App' }] },
      { key: 'category', label: 'Category', type: 'select', options: [{ value: 'system', label: 'System' }, { value: 'auth', label: 'Auth' }, { value: 'leave', label: 'Leave' }, { value: 'payroll', label: 'Payroll' }, { value: 'recruitment', label: 'Recruitment' }, { value: 'performance', label: 'Performance' }, { value: 'workflow', label: 'Workflow' }, { value: 'alert', label: 'Alert' }] },
      { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Email subject', colSpan: 2 },
      { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Template body...', required: true, colSpan: 3, rows: 4 },
      { key: 'variables', label: 'Variables', type: 'text', placeholder: 'name, email, date', colSpan: 2 },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    ],
    columns: [
      { key: 'name', header: 'Name', render: (i) => <span className="font-medium text-nexus-text-primary">{String(i.name)}</span> },
      { key: 'code', header: 'Code' },
      { key: 'type', header: 'Type', render: (i) => <span className="nexus-badge">{String(i.type || 'email')}</span> },
      { key: 'category', header: 'Category', render: (i) => <span className="nexus-badge">{String(i.category || 'system')}</span> },
      { key: 'status', header: 'Status', render: (i) => <span className={getStatusBadge(String(i.status))}>{String(i.status)}</span> },
    ],
    requiredFields: ['name', 'code', 'body'],
    searchFields: ['name', 'code'],
    initialForm: { name: '', code: '', type: 'email', category: 'system', subject: '', body: '', variables: '', status: 'active' },
  },
];

/* ─────────── generic tab content component ─────────── */

function MasterTabContent({ config, isAdmin, addTrigger }: { config: MasterConfig; isAdmin: boolean; addTrigger: number }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({ ...config.initialForm });
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${config.apiBase}?limit=100`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || data[config.key] || []);
      }
    } catch (err) {
      console.error(err);
      toast.error(`Failed to load ${config.label}`);
    } finally {
      setLoading(false);
    }
  }, [config.apiBase, config.key, config.label]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  // Listen for add trigger from parent header button
  useEffect(() => {
    if (addTrigger > 0) handleOpenAdd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTrigger]);

  /* ── handlers ── */
  const handleOpenAdd = () => {
    setForm({ ...config.initialForm });
    setEditingId(null);
    setShowForm(true);
    setViewingId(null);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById(`crud-form-${config.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenEdit = (item: Record<string, unknown>) => {
    const formValues: Record<string, unknown> = {};
    config.fields.forEach(f => {
      const val = item[f.key];
      if (f.type === 'checkbox') {
        formValues[f.key] = !!val;
      } else if (f.type === 'number') {
        formValues[f.key] = val != null ? val : '';
      } else if (f.type === 'date' && val) {
        // Convert Date to YYYY-MM-DD string for input
        const d = new Date(String(val));
        formValues[f.key] = d.toISOString().split('T')[0];
      } else {
        formValues[f.key] = val ?? (f.type === 'select' ? (f.options?.[0]?.value || '') : '');
      }
    });
    setForm(formValues);
    setEditingId(String(item.id));
    setShowForm(true);
    setViewingId(null);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById(`crud-form-${config.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenView = (item: Record<string, unknown>) => {
    setViewingId(String(item.id));
    setShowForm(false);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById(`view-panel-${config.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCloseView = () => setViewingId(null);
  const handleCancelForm = () => { setShowForm(false); setEditingId(null); setForm({ ...config.initialForm }); };

  const handleSubmit = async () => {
    // Validate required fields
    for (const rf of config.requiredFields) {
      const val = form[rf];
      if (!val || (typeof val === 'string' && !val.trim())) {
        const field = config.fields.find(f => f.key === rf);
        toast.error(`Please fill in the ${field?.label || rf}`);
        return;
      }
    }

    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {};
      config.fields.forEach(f => {
        const val = form[f.key];
        if (f.type === 'checkbox') {
          payload[f.key] = !!val;
        } else if (f.type === 'number') {
          payload[f.key] = val !== '' && val != null ? Number(val) : null;
        } else if (f.type === 'textarea' || f.type === 'text') {
          payload[f.key] = typeof val === 'string' && val.trim() ? val.trim() : (f.required ? val : null);
        } else {
          payload[f.key] = val || null;
        }
      });

      const url = editingId ? `${config.apiBase}/${editingId}` : config.apiBase;
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? `${config.label} updated` : `${config.label} created`);
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`${config.apiBase}/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(`${config.label} deleted`);
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  /* ── computed ── */
  const filtered = items.filter(item => {
    const matchSearch = !search || config.searchFields.some(sf => {
      const v = item[sf];
      return v && String(v).toLowerCase().includes(search.toLowerCase());
    });
    const matchStatus = !filterStatus || item.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalCount = items.length;
  const activeCount = items.filter(i => i.status === 'active').length;
  const inactiveCount = items.filter(i => i.status === 'inactive').length;

  const viewingItem = viewingId ? items.find(i => String(i.id) === viewingId) : null;

  /* ── render field input ── */
  const renderField = (f: FieldDef) => {
    const cls = 'w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400';
    const val = form[f.key] ?? (f.type === 'checkbox' ? false : '');

    if (f.type === 'select') {
      return (
        <select value={String(val)} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className={cls}>
          {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (f.type === 'textarea') {
      return (
        <textarea rows={f.rows || 2} value={String(val)} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className={`${cls} resize-none`} placeholder={f.placeholder} />
      );
    }
    if (f.type === 'checkbox') {
      return (
        <label className="flex items-center gap-2 cursor-pointer py-2.5">
          <input type="checkbox" checked={!!val} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.checked }))} className="w-4 h-4 rounded border-nexus-border text-blue-500 focus:ring-blue-500/20" />
          <span className="text-sm text-nexus-text-secondary">Enable</span>
        </label>
      );
    }
    if (f.type === 'date') {
      return <input type="date" value={String(val)} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className={cls} />;
    }
    if (f.type === 'number') {
      return <input type="number" value={String(val)} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className={cls} placeholder={f.placeholder} />;
    }
    return <input type="text" value={String(val)} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className={cls} placeholder={f.placeholder} />;
  };

  /* ── JSX ── */
  const colCount = config.columns.length + 1; // +1 for actions

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <div className={config.iconColor}>{config.icon}</div>
            </div>
            <div><p className="text-lg font-bold text-nexus-text-primary">{totalCount}</p><p className="text-xs text-nexus-text-muted">Total</p></div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div>
            <div><p className="text-lg font-bold text-nexus-text-primary">{activeCount}</p><p className="text-xs text-nexus-text-muted">Active</p></div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><FiXCircle className="w-5 h-5 text-red-500" /></div>
            <div><p className="text-lg font-bold text-nexus-text-primary">{inactiveCount}</p><p className="text-xs text-nexus-text-muted">Inactive</p></div>
          </div>
        </div>
      </div>

      {/* View panel */}
      {viewingItem && (
        <div id={`view-panel-${config.key}`} className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">{config.label} Details</h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {config.fields.map(f => (
                <div key={f.key} className={f.colSpan === 2 ? 'sm:col-span-2' : f.colSpan === 3 ? 'sm:col-span-2 lg:col-span-3' : ''}>
                  <p className="text-xs font-medium text-nexus-text-muted">{f.label}{f.required ? ' *' : ''}</p>
                  <div className="mt-0.5">
                    {f.type === 'checkbox' ? (
                      getToggleBadge(!!viewingItem[f.key])
                    ) : f.type === 'select' && f.options ? (
                      <span className="nexus-badge">{String(viewingItem[f.key] || '—')}</span>
                    ) : f.key === 'status' ? (
                      <span className={getStatusBadge(String(viewingItem[f.key] || ''))}>{String(viewingItem[f.key] || '—')}</span>
                    ) : f.type === 'date' && viewingItem[f.key] ? (
                      <p className="text-sm font-medium text-nexus-text-primary">{new Date(String(viewingItem[f.key])).toLocaleDateString()}</p>
                    ) : (
                      <p className="text-sm font-medium text-nexus-text-primary">{String(viewingItem[f.key] || '—')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border">
              <button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div id={`crud-form-${config.key}`} className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? `Edit ${config.label}` : `Add ${config.label}`}</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {config.fields.map(f => (
                <div key={f.key} className={f.colSpan === 2 ? 'sm:col-span-2' : f.colSpan === 3 ? 'sm:col-span-2 lg:col-span-3' : ''}>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">
                    {f.label}{f.required ? ' *' : ''}
                  </label>
                  {renderField(f)}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">
                {submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder={`Search ${config.label.toLowerCase()}...`} />
        </div>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-nexus-text-muted" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                {config.columns.map(col => (
                  <th key={col.key} className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">{col.header}</th>
                ))}
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    {config.columns.map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    ))}
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center">
                    <div className={config.iconColor + ' flex justify-center mb-3'}>{config.icon}</div>
                    <p className="text-nexus-text-secondary font-medium">No {config.label.toLowerCase()} found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(item => (
                  <tr key={String(item.id)} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === String(item.id) ? (
                      <td colSpan={colCount} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Delete &quot;{String(item.name || item.code || '')}&quot;?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(String(item.id))} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        {config.columns.map(col => (
                          <td key={col.key} className="px-4 py-3 text-sm text-nexus-text-secondary">
                            {col.render ? col.render(item) : (item[col.key] != null ? String(item[col.key]) : '—')}
                          </td>
                        ))}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleOpenView(item)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                            {isAdmin && (
                              <>
                                <button onClick={() => handleOpenEdit(item)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                                <button onClick={() => { setDeleteConfirmId(String(item.id)); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─────────── main page ─────────── */

export default function MastersPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');
  const [activeTab, setActiveTab] = useState(MASTERS[0].key);
  const [addTrigger, setAddTrigger] = useState(0);

  const activeConfig = MASTERS.find(m => m.key === activeTab) || MASTERS[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiSettings className="w-6 h-6 text-blue-500" />
            Master Management
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage system master data and configurations</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setAddTrigger(p => p + 1)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors"
          >
            <FiPlus className="w-4 h-4" />
            Add {activeConfig.label}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="flex border-b border-nexus-border min-w-max">
            {MASTERS.map(m => (
              <button
                key={m.key}
                onClick={() => { setActiveTab(m.key); setAddTrigger(0); }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === m.key
                    ? 'border-b-blue-500 text-blue-600 bg-blue-50/50'
                    : 'border-b-transparent text-nexus-text-secondary hover:text-nexus-text-primary hover:bg-slate-50'
                }`}
              >
                <span className={activeTab === m.key ? 'text-blue-500' : 'text-nexus-text-muted'}>{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Active tab content */}
      <MasterTabContent key={activeTab} config={activeConfig} isAdmin={isAdmin} addTrigger={addTrigger} />
    </div>
  );
}
