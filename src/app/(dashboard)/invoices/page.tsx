'use client';

import { useState, useMemo } from 'react';
import {
  FiFileText, FiPlus, FiDownload, FiSearch, FiEye, FiEdit2,
  FiSend, FiTrash2, FiX, FiCheck,
  FiDollarSign, FiClock, FiAlertCircle, FiFilter, FiCopy,
  FiArrowLeft, FiPrinter, FiMoreVertical, FiChevronRight,
} from 'react-icons/fi';
import { formatCurrency } from '@/lib/currency';

/* ── Helpers ── */
function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600 thb-badge',
    sent: 'thb-badge thb-badge-info',
    paid: 'thb-badge thb-badge-success',
    overdue: 'thb-badge thb-badge-error',
    partial: 'thb-badge thb-badge-warning',
    issued: 'thb-badge thb-badge-info',
    cancelled: 'bg-slate-200 text-slate-500 thb-badge',
    disputed: 'thb-badge thb-badge-error',
  };
  return map[status] || 'bg-slate-100 text-slate-600 thb-badge';
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/* ── Types ── */
interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface PaymentRecord {
  id: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
}

interface SampleInvoice {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  clientAvatar: string;
  projectName: string;
  status: string;
  currency: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  notes: string;
  payments: PaymentRecord[];
}

/* ── Sample Data ── */
const sampleInvoices: SampleInvoice[] = [
  {
    id: 'inv-001', invoiceNumber: 'INV-2024-001', clientName: 'Acme Corporation', clientEmail: 'billing@acme.com',
    clientAvatar: 'AC', projectName: 'Website Redesign', status: 'paid', currency: 'USD',
    subtotal: 12500, taxRate: 10, taxAmount: 1250, discountAmount: 0, totalAmount: 13750,
    issueDate: '2024-01-15', dueDate: '2024-02-15',
    items: [
      { id: 'li1', description: 'UI/UX Design - Homepage', quantity: 40, rate: 125, amount: 5000 },
      { id: 'li2', description: 'Frontend Development - React', quantity: 60, rate: 125, amount: 7500 },
    ],
    notes: 'Payment received via wire transfer.',
    payments: [{ id: 'p1', date: '2024-02-10', amount: 13750, method: 'Wire Transfer', reference: 'WT-20240210' }],
  },
  {
    id: 'inv-002', invoiceNumber: 'INV-2024-002', clientName: 'TechStart Inc', clientEmail: 'finance@techstart.io',
    clientAvatar: 'TS', projectName: 'Mobile App MVP', status: 'sent', currency: 'USD',
    subtotal: 18500, taxRate: 10, taxAmount: 1850, discountAmount: 500, totalAmount: 19850,
    issueDate: '2024-02-01', dueDate: '2024-03-01',
    items: [
      { id: 'li3', description: 'Mobile App Architecture', quantity: 30, rate: 150, amount: 4500 },
      { id: 'li4', description: 'iOS Development', quantity: 80, rate: 150, amount: 12000 },
      { id: 'li5', description: 'API Integration', quantity: 20, rate: 100, amount: 2000 },
    ],
    notes: 'Net 30 payment terms. Early payment discount of 2% available.',
    payments: [],
  },
  {
    id: 'inv-003', invoiceNumber: 'INV-2024-003', clientName: 'Global Finance Ltd', clientEmail: 'ap@globalfinance.com',
    clientAvatar: 'GF', projectName: 'ERP Integration', status: 'overdue', currency: 'USD',
    subtotal: 32000, taxRate: 10, taxAmount: 3200, discountAmount: 0, totalAmount: 35200,
    issueDate: '2024-01-01', dueDate: '2024-01-31',
    items: [
      { id: 'li6', description: 'SAP Integration Module', quantity: 120, rate: 150, amount: 18000 },
      { id: 'li7', description: 'Data Migration Services', quantity: 80, rate: 175, amount: 14000 },
    ],
    notes: 'OVERDUE - Please remit payment immediately. Late fees may apply.',
    payments: [{ id: 'p2', date: '2024-02-05', amount: 15000, method: 'Wire Transfer', reference: 'WT-20240205' }],
  },
  {
    id: 'inv-004', invoiceNumber: 'INV-2024-004', clientName: 'MediaWave Corp', clientEmail: 'billing@mediawave.com',
    clientAvatar: 'MW', projectName: 'Streaming Platform', status: 'draft', currency: 'USD',
    subtotal: 8500, taxRate: 10, taxAmount: 850, discountAmount: 0, totalAmount: 9350,
    issueDate: '2024-03-01', dueDate: '2024-04-01',
    items: [
      { id: 'li8', description: 'Video Transcoding Service', quantity: 50, rate: 170, amount: 8500 },
    ],
    notes: 'Draft - pending review before sending to client.',
    payments: [],
  },
  {
    id: 'inv-005', invoiceNumber: 'INV-2024-005', clientName: 'HealthPlus Systems', clientEmail: 'accounts@healthplus.com',
    clientAvatar: 'HP', projectName: 'Patient Portal', status: 'paid', currency: 'USD',
    subtotal: 22000, taxRate: 10, taxAmount: 2200, discountAmount: 1000, totalAmount: 23200,
    issueDate: '2024-01-10', dueDate: '2024-02-10',
    items: [
      { id: 'li9', description: 'Patient Portal Design', quantity: 60, rate: 150, amount: 9000 },
      { id: 'li10', description: 'Backend Development', quantity: 80, rate: 150, amount: 12000 },
      { id: 'li11', description: 'HIPAA Compliance Review', quantity: 10, rate: 100, amount: 1000 },
    ],
    notes: 'Volume discount applied for multi-module engagement.',
    payments: [{ id: 'p3', date: '2024-02-08', amount: 23200, method: 'ACH', reference: 'ACH-20240208' }],
  },
  {
    id: 'inv-006', invoiceNumber: 'INV-2024-006', clientName: 'RetailMax Group', clientEmail: 'finance@retailmax.com',
    clientAvatar: 'RM', projectName: 'E-Commerce Platform', status: 'partial', currency: 'USD',
    subtotal: 15000, taxRate: 10, taxAmount: 1500, discountAmount: 0, totalAmount: 16500,
    issueDate: '2024-02-15', dueDate: '2024-03-15',
    items: [
      { id: 'li12', description: 'E-Commerce Frontend', quantity: 80, rate: 125, amount: 10000 },
      { id: 'li13', description: 'Payment Gateway Integration', quantity: 50, rate: 100, amount: 5000 },
    ],
    notes: 'Partial payment of $8,250 received on March 1.',
    payments: [{ id: 'p4', date: '2024-03-01', amount: 8250, method: 'Wire Transfer', reference: 'WT-20240301' }],
  },
  {
    id: 'inv-007', invoiceNumber: 'INV-2024-007', clientName: 'Acme Corporation', clientEmail: 'billing@acme.com',
    clientAvatar: 'AC', projectName: 'Website Redesign Phase 2', status: 'paid', currency: 'USD',
    subtotal: 5600, taxRate: 10, taxAmount: 560, discountAmount: 0, totalAmount: 6160,
    issueDate: '2024-02-20', dueDate: '2024-03-20',
    items: [
      { id: 'li14', description: 'Additional Page Designs', quantity: 24, rate: 125, amount: 3000 },
      { id: 'li15', description: 'QA & Testing', quantity: 20, rate: 130, amount: 2600 },
    ],
    notes: 'Phase 2 follow-up invoice.',
    payments: [{ id: 'p5', date: '2024-03-15', amount: 6160, method: 'Credit Card', reference: 'CC-20240315' }],
  },
  {
    id: 'inv-008', invoiceNumber: 'INV-2024-008', clientName: 'DataSync Labs', clientEmail: 'ap@datasync.io',
    clientAvatar: 'DS', projectName: 'Data Pipeline', status: 'sent', currency: 'USD',
    subtotal: 9800, taxRate: 10, taxAmount: 980, discountAmount: 0, totalAmount: 10780,
    issueDate: '2024-03-01', dueDate: '2024-04-01',
    items: [
      { id: 'li16', description: 'ETL Pipeline Setup', quantity: 40, rate: 150, amount: 6000 },
      { id: 'li17', description: 'Data Quality Monitoring', quantity: 30, rate: 100, amount: 3000 },
      { id: 'li18', description: 'Documentation', quantity: 8, rate: 100, amount: 800 },
    ],
    notes: 'Awaiting client approval.',
    payments: [],
  },
  {
    id: 'inv-009', invoiceNumber: 'INV-2024-009', clientName: 'EduLearn Platform', clientEmail: 'finance@edulearn.com',
    clientAvatar: 'EL', projectName: 'LMS Development', status: 'draft', currency: 'USD',
    subtotal: 4200, taxRate: 10, taxAmount: 420, discountAmount: 0, totalAmount: 4620,
    issueDate: '2024-03-05', dueDate: '2024-04-05',
    items: [
      { id: 'li19', description: 'Course Module Development', quantity: 28, rate: 150, amount: 4200 },
    ],
    notes: 'Draft pending internal review.',
    payments: [],
  },
  {
    id: 'inv-010', invoiceNumber: 'INV-2024-010', clientName: 'GreenEnergy Co', clientEmail: 'billing@greenenergy.com',
    clientAvatar: 'GE', projectName: 'IoT Dashboard', status: 'paid', currency: 'USD',
    subtotal: 7800, taxRate: 10, taxAmount: 780, discountAmount: 200, totalAmount: 8380,
    issueDate: '2024-01-20', dueDate: '2024-02-20',
    items: [
      { id: 'li20', description: 'Dashboard UI Design', quantity: 30, rate: 130, amount: 3900 },
      { id: 'li21', description: 'IoT Data Visualization', quantity: 30, rate: 130, amount: 3900 },
    ],
    notes: 'Sustainability partner discount applied.',
    payments: [{ id: 'p6', date: '2024-02-18', amount: 8380, method: 'Wire Transfer', reference: 'WT-20240218' }],
  },
  {
    id: 'inv-011', invoiceNumber: 'INV-2024-011', clientName: 'TechStart Inc', clientEmail: 'finance@techstart.io',
    clientAvatar: 'TS', projectName: 'Mobile App Phase 2', status: 'overdue', currency: 'USD',
    subtotal: 6400, taxRate: 10, taxAmount: 640, discountAmount: 0, totalAmount: 7040,
    issueDate: '2024-01-25', dueDate: '2024-02-25',
    items: [
      { id: 'li22', description: 'Android Development', quantity: 32, rate: 150, amount: 4800 },
      { id: 'li23', description: 'Push Notification System', quantity: 16, rate: 100, amount: 1600 },
    ],
    notes: 'Second notice sent. Please remit payment.',
    payments: [],
  },
  {
    id: 'inv-012', invoiceNumber: 'INV-2024-012', clientName: 'FinServ Partners', clientEmail: 'ap@finserv.com',
    clientAvatar: 'FS', projectName: 'Risk Analysis Tool', status: 'sent', currency: 'USD',
    subtotal: 16000, taxRate: 10, taxAmount: 1600, discountAmount: 500, totalAmount: 17100,
    issueDate: '2024-02-10', dueDate: '2024-03-10',
    items: [
      { id: 'li24', description: 'Risk Model Development', quantity: 60, rate: 175, amount: 10500 },
      { id: 'li25', description: 'Regulatory Compliance Module', quantity: 30, rate: 150, amount: 4500 },
      { id: 'li26', description: 'Testing & Validation', quantity: 10, rate: 100, amount: 1000 },
    ],
    notes: 'Regulatory compliance module included as per SOW amendment.',
    payments: [],
  },
  {
    id: 'inv-013', invoiceNumber: 'INV-2024-013', clientName: 'Global Finance Ltd', clientEmail: 'ap@globalfinance.com',
    clientAvatar: 'GF', projectName: 'ERP Phase 2', status: 'paid', currency: 'USD',
    subtotal: 2400, taxRate: 10, taxAmount: 240, discountAmount: 0, totalAmount: 2640,
    issueDate: '2024-02-25', dueDate: '2024-03-25',
    items: [
      { id: 'li27', description: 'Custom Report Builder', quantity: 16, rate: 150, amount: 2400 },
    ],
    notes: 'Add-on to ERP Integration project.',
    payments: [{ id: 'p7', date: '2024-03-20', amount: 2640, method: 'ACH', reference: 'ACH-20240320' }],
  },
  {
    id: 'inv-014', invoiceNumber: 'INV-2024-014', clientName: 'LogiTrack Systems', clientEmail: 'billing@logitrack.com',
    clientAvatar: 'LT', projectName: 'Fleet Management', status: 'draft', currency: 'USD',
    subtotal: 11200, taxRate: 10, taxAmount: 1120, discountAmount: 0, totalAmount: 12320,
    issueDate: '2024-03-10', dueDate: '2024-04-10',
    items: [
      { id: 'li28', description: 'GPS Tracking Module', quantity: 40, rate: 140, amount: 5600 },
      { id: 'li29', description: 'Route Optimization Engine', quantity: 40, rate: 140, amount: 5600 },
    ],
    notes: 'Awaiting project kickoff confirmation.',
    payments: [],
  },
  {
    id: 'inv-015', invoiceNumber: 'INV-2024-015', clientName: 'MediaWave Corp', clientEmail: 'billing@mediawave.com',
    clientAvatar: 'MW', projectName: 'Content Analytics', status: 'paid', currency: 'USD',
    subtotal: 3500, taxRate: 10, taxAmount: 350, discountAmount: 0, totalAmount: 3850,
    issueDate: '2024-01-05', dueDate: '2024-02-05',
    items: [
      { id: 'li30', description: 'Analytics Dashboard', quantity: 20, rate: 175, amount: 3500 },
    ],
    notes: 'Completed and paid.',
    payments: [{ id: 'p8', date: '2024-02-03', amount: 3850, method: 'Wire Transfer', reference: 'WT-20240203' }],
  },
  {
    id: 'inv-016', invoiceNumber: 'INV-2024-016', clientName: 'CloudNet Solutions', clientEmail: 'ap@cloudnet.com',
    clientAvatar: 'CN', projectName: 'Cloud Migration', status: 'sent', currency: 'USD',
    subtotal: 20000, taxRate: 10, taxAmount: 2000, discountAmount: 1000, totalAmount: 21000,
    issueDate: '2024-02-20', dueDate: '2024-03-20',
    items: [
      { id: 'li31', description: 'AWS Infrastructure Setup', quantity: 60, rate: 150, amount: 9000 },
      { id: 'li32', description: 'Application Migration', quantity: 60, rate: 150, amount: 9000 },
      { id: 'li33', description: 'Performance Optimization', quantity: 20, rate: 100, amount: 2000 },
    ],
    notes: 'Enterprise migration discount applied.',
    payments: [],
  },
  {
    id: 'inv-017', invoiceNumber: 'INV-2024-017', clientName: 'RetailMax Group', clientEmail: 'finance@retailmax.com',
    clientAvatar: 'RM', projectName: 'Inventory System', status: 'paid', currency: 'USD',
    subtotal: 8800, taxRate: 10, taxAmount: 880, discountAmount: 0, totalAmount: 9680,
    issueDate: '2024-01-12', dueDate: '2024-02-12',
    items: [
      { id: 'li34', description: 'Inventory Tracking Module', quantity: 40, rate: 140, amount: 5600 },
      { id: 'li35', description: 'Barcode Integration', quantity: 24, rate: 100, amount: 2400 },
      { id: 'li36', description: 'Warehouse Dashboard', quantity: 8, rate: 100, amount: 800 },
    ],
    notes: 'Successfully delivered and paid.',
    payments: [{ id: 'p9', date: '2024-02-10', amount: 9680, method: 'ACH', reference: 'ACH-20240210' }],
  },
  {
    id: 'inv-018', invoiceNumber: 'INV-2024-018', clientName: 'HealthPlus Systems', clientEmail: 'accounts@healthplus.com',
    clientAvatar: 'HP', projectName: 'Telehealth Module', status: 'sent', currency: 'USD',
    subtotal: 14500, taxRate: 10, taxAmount: 1450, discountAmount: 0, totalAmount: 15950,
    issueDate: '2024-03-01', dueDate: '2024-04-01',
    items: [
      { id: 'li37', description: 'Video Consultation Feature', quantity: 60, rate: 150, amount: 9000 },
      { id: 'li38', description: 'Appointment Scheduling', quantity: 40, rate: 125, amount: 5000 },
      { id: 'li39', description: 'E-Prescriptions', quantity: 5, rate: 100, amount: 500 },
    ],
    notes: 'HIPAA-compliant telehealth solution.',
    payments: [],
  },
  {
    id: 'inv-019', invoiceNumber: 'INV-2024-019', clientName: 'DataSync Labs', clientEmail: 'ap@datasync.io',
    clientAvatar: 'DS', projectName: 'ML Pipeline', status: 'draft', currency: 'USD',
    subtotal: 5600, taxRate: 10, taxAmount: 560, discountAmount: 0, totalAmount: 6160,
    issueDate: '2024-03-08', dueDate: '2024-04-08',
    items: [
      { id: 'li40', description: 'ML Model Training Pipeline', quantity: 28, rate: 200, amount: 5600 },
    ],
    notes: 'Scope to be finalized.',
    payments: [],
  },
  {
    id: 'inv-020', invoiceNumber: 'INV-2024-020', clientName: 'EduLearn Platform', clientEmail: 'finance@edulearn.com',
    clientAvatar: 'EL', projectName: 'Assessment Engine', status: 'paid', currency: 'USD',
    subtotal: 7200, taxRate: 10, taxAmount: 720, discountAmount: 0, totalAmount: 7920,
    issueDate: '2024-01-18', dueDate: '2024-02-18',
    items: [
      { id: 'li41', description: 'Assessment Builder', quantity: 32, rate: 150, amount: 4800 },
      { id: 'li42', description: 'Grading Automation', quantity: 24, rate: 100, amount: 2400 },
    ],
    notes: 'Paid on time.',
    payments: [{ id: 'p10', date: '2024-02-15', amount: 7920, method: 'Wire Transfer', reference: 'WT-20240215' }],
  },
  {
    id: 'inv-021', invoiceNumber: 'INV-2024-021', clientName: 'GreenEnergy Co', clientEmail: 'billing@greenenergy.com',
    clientAvatar: 'GE', projectName: 'Energy Analytics', status: 'sent', currency: 'USD',
    subtotal: 4500, taxRate: 10, taxAmount: 450, discountAmount: 0, totalAmount: 4950,
    issueDate: '2024-03-02', dueDate: '2024-04-02',
    items: [
      { id: 'li43', description: 'Energy Consumption Analytics', quantity: 30, rate: 150, amount: 4500 },
    ],
    notes: 'Monthly analytics reporting module.',
    payments: [],
  },
  {
    id: 'inv-022', invoiceNumber: 'INV-2024-022', clientName: 'CloudNet Solutions', clientEmail: 'ap@cloudnet.com',
    clientAvatar: 'CN', projectName: 'DevOps Setup', status: 'paid', currency: 'USD',
    subtotal: 2800, taxRate: 10, taxAmount: 280, discountAmount: 0, totalAmount: 3080,
    issueDate: '2024-02-05', dueDate: '2024-03-05',
    items: [
      { id: 'li44', description: 'CI/CD Pipeline Setup', quantity: 14, rate: 200, amount: 2800 },
    ],
    notes: 'Delivered and paid.',
    payments: [{ id: 'p11', date: '2024-03-03', amount: 3080, method: 'Credit Card', reference: 'CC-20240303' }],
  },
  {
    id: 'inv-023', invoiceNumber: 'INV-2024-023', clientName: 'FinServ Partners', clientEmail: 'ap@finserv.com',
    clientAvatar: 'FS', projectName: 'Compliance Dashboard', status: 'overdue', currency: 'USD',
    subtotal: 8400, taxRate: 10, taxAmount: 840, discountAmount: 0, totalAmount: 9240,
    issueDate: '2024-01-08', dueDate: '2024-02-08',
    items: [
      { id: 'li45', description: 'Compliance Monitoring Dashboard', quantity: 40, rate: 150, amount: 6000 },
      { id: 'li46', description: 'Audit Trail System', quantity: 24, rate: 100, amount: 2400 },
    ],
    notes: 'Payment reminder sent on Feb 15 and March 1.',
    payments: [],
  },
  {
    id: 'inv-024', invoiceNumber: 'INV-2024-024', clientName: 'LogiTrack Systems', clientEmail: 'billing@logitrack.com',
    clientAvatar: 'LT', projectName: 'Driver App', status: 'paid', currency: 'USD',
    subtotal: 6300, taxRate: 10, taxAmount: 630, discountAmount: 0, totalAmount: 6930,
    issueDate: '2024-02-12', dueDate: '2024-03-12',
    items: [
      { id: 'li47', description: 'Mobile Driver App - iOS', quantity: 30, rate: 140, amount: 4200 },
      { id: 'li48', description: 'Mobile Driver App - Android', quantity: 15, rate: 140, amount: 2100 },
    ],
    notes: 'Both platforms delivered and accepted.',
    payments: [{ id: 'p12', date: '2024-03-10', amount: 6930, method: 'Wire Transfer', reference: 'WT-20240310' }],
  },
];

const STATUS_TABS = [
  { key: '', label: 'All', count: 24 },
  { key: 'draft', label: 'Draft', count: 3 },
  { key: 'sent', label: 'Sent', count: 6 },
  { key: 'paid', label: 'Paid', count: 10 },
  { key: 'overdue', label: 'Overdue', count: 3 },
];

const AVATAR_COLORS: Record<string, string> = {
  AC: 'bg-blue-100 text-blue-700',
  TS: 'bg-violet-100 text-violet-700',
  GF: 'bg-amber-100 text-amber-700',
  MW: 'bg-pink-100 text-pink-700',
  HP: 'bg-emerald-100 text-emerald-700',
  RM: 'bg-orange-100 text-orange-700',
  DS: 'bg-cyan-100 text-cyan-700',
  EL: 'bg-rose-100 text-rose-700',
  GE: 'bg-green-100 text-green-700',
  FS: 'bg-indigo-100 text-indigo-700',
  LT: 'bg-teal-100 text-teal-700',
  CN: 'bg-purple-100 text-purple-700',
};

const CLIENT_NAMES = [...new Set(sampleInvoices.map(i => i.clientName))];

/* ── Component ── */
export default function InvoicesPage() {
  // State
  const [invoices, setInvoices] = useState<SampleInvoice[]>(sampleInvoices);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SampleInvoice | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Create invoice form
  const [createForm, setCreateForm] = useState({
    clientName: '',
    projectName: '',
    currency: 'USD',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    taxRate: 10,
    notes: '',
  });
  const [createItems, setCreateItems] = useState([
    { description: '', quantity: 1, rate: 0 },
  ]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter && inv.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!inv.invoiceNumber.toLowerCase().includes(q) &&
            !inv.clientName.toLowerCase().includes(q) &&
            !inv.projectName.toLowerCase().includes(q)) return false;
      }
      if (clientFilter && inv.clientName !== clientFilter) return false;
      if (dateFrom && new Date(inv.issueDate) < new Date(dateFrom)) return false;
      if (dateTo && new Date(inv.issueDate) > new Date(dateTo)) return false;
      return true;
    });
  }, [invoices, statusFilter, searchQuery, clientFilter, dateFrom, dateTo]);

  // Stats
  const stats = useMemo(() => {
    const all = invoices;
    return {
      total: all.length,
      paid: all.filter(i => i.status === 'paid').reduce((s, i) => s + i.totalAmount, 0),
      pending: all.filter(i => ['sent', 'partial'].includes(i.status)).reduce((s, i) => s + i.totalAmount - i.payments.reduce((ps, p) => ps + p.amount, 0), 0),
      overdue: all.filter(i => i.status === 'overdue').reduce((s, i) => s + i.totalAmount - i.payments.reduce((ps, p) => ps + p.amount, 0), 0),
    };
  }, [invoices]);

  // Tab counts (dynamic)
  const tabCounts = useMemo(() => ({
    '': invoices.length,
    draft: invoices.filter(i => i.status === 'draft').length,
    sent: invoices.filter(i => i.status === 'sent').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
  }), [invoices]);

  // Handlers
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredInvoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInvoices.map(i => i.id)));
    }
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
    setActionMenuOpen(null);
  };

  const handleDelete = (id: string) => {
    setInvoices(prev => prev.filter(i => i.id !== id));
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    setActionMenuOpen(null);
  };

  const handleDuplicate = (inv: SampleInvoice) => {
    const newInv: SampleInvoice = {
      ...inv,
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-2024-${String(invoices.length + 1).padStart(3, '0')}`,
      status: 'draft',
      issueDate: new Date().toISOString().split('T')[0],
      payments: [],
    };
    setInvoices(prev => [newInv, ...prev]);
    setActionMenuOpen(null);
  };

  const handleCreateSubmit = () => {
    if (!createForm.clientName || createItems.every(it => !it.description)) return;
    const subtotal = createItems.reduce((s, it) => s + it.quantity * it.rate, 0);
    const taxAmount = subtotal * (createForm.taxRate / 100);
    const totalAmount = subtotal + taxAmount;
    const newInv: SampleInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-2024-${String(invoices.length + 1).padStart(3, '0')}`,
      clientName: createForm.clientName,
      clientEmail: '',
      clientAvatar: createForm.clientName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase(),
      projectName: createForm.projectName,
      status: 'draft',
      currency: createForm.currency,
      subtotal,
      taxRate: createForm.taxRate,
      taxAmount,
      discountAmount: 0,
      totalAmount,
      issueDate: createForm.issueDate,
      dueDate: createForm.dueDate || '',
      items: createItems.map((it, idx) => ({
        id: `new-li-${idx}`,
        description: it.description,
        quantity: it.quantity,
        rate: it.rate,
        amount: it.quantity * it.rate,
      })),
      notes: createForm.notes,
      payments: [],
    };
    setInvoices(prev => [newInv, ...prev]);
    setShowCreateModal(false);
    setCreateForm({ clientName: '', projectName: '', currency: 'USD', issueDate: new Date().toISOString().split('T')[0], dueDate: '', taxRate: 10, notes: '' });
    setCreateItems([{ description: '', quantity: 1, rate: 0 }]);
  };

  const createSubtotal = createItems.reduce((s, it) => s + it.quantity * it.rate, 0);
  const createTax = createSubtotal * (createForm.taxRate / 100);
  const createTotal = createSubtotal + createTax;

  // Invoice detail view
  if (selectedInvoice) {
    const inv = selectedInvoice;
    const paidAmount = inv.payments.reduce((s, p) => s + p.amount, 0);
    const balanceDue = inv.totalAmount - paidAmount;

    return (
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Back button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedInvoice(null)}
            className="flex items-center gap-2 text-thb-text-secondary hover:text-thb-text-primary transition-colors text-sm font-medium"
          >
            <FiArrowLeft className="w-4 h-4" /> Back to Invoices
          </button>
          <FiChevronRight className="w-4 h-4 text-thb-text-muted" />
          <span className="text-sm font-semibold text-thb-text-primary">{inv.invoiceNumber}</span>
        </div>

        {/* Invoice Header */}
        <div className="thb-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FiFileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-thb-text-primary">{inv.invoiceNumber}</h1>
                <p className="text-thb-text-secondary mt-0.5">{inv.projectName}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className={getStatusBadge(inv.status)}>{formatStatus(inv.status)}</span>
                  <span className="text-xs text-thb-text-muted">{inv.currency}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {inv.status === 'draft' && (
                <>
                  <button onClick={() => { handleStatusChange(inv.id, 'sent'); setSelectedInvoice({ ...inv, status: 'sent' }); }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                    <FiSend className="w-3.5 h-3.5" /> Send
                  </button>
                  <button onClick={() => { handleStatusChange(inv.id, 'paid'); setSelectedInvoice({ ...inv, status: 'paid' }); }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                    <FiCheck className="w-3.5 h-3.5" /> Mark Paid
                  </button>
                </>
              )}
              {inv.status === 'sent' && (
                <button onClick={() => { handleStatusChange(inv.id, 'paid'); setSelectedInvoice({ ...inv, status: 'paid' }); }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                  <FiCheck className="w-3.5 h-3.5" /> Mark Paid
                </button>
              )}
              <button className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors">
                <FiPrinter className="w-3.5 h-3.5" /> Print
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors">
                <FiDownload className="w-3.5 h-3.5" /> Download PDF
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Invoice Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Client & Dates */}
            <div className="thb-card p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-thb-text-muted mb-3">Bill To</h3>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${AVATAR_COLORS[inv.clientAvatar] || 'bg-slate-100 text-slate-600'}`}>
                      {inv.clientAvatar}
                    </div>
                    <div>
                      <p className="font-semibold text-thb-text-primary">{inv.clientName}</p>
                      <p className="text-sm text-thb-text-secondary">{inv.clientEmail}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-thb-text-muted mb-3">Invoice Details</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-thb-text-secondary">Issue Date</span>
                      <span className="font-medium text-thb-text-primary">{formatDate(inv.issueDate)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-thb-text-secondary">Due Date</span>
                      <span className={`font-medium ${inv.status === 'overdue' ? 'text-red-600' : 'text-thb-text-primary'}`}>{formatDate(inv.dueDate)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-thb-text-secondary">Project</span>
                      <span className="font-medium text-thb-text-primary">{inv.projectName}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="thb-card overflow-hidden">
              <div className="px-6 py-4 border-b border-thb-border">
                <h3 className="text-sm font-semibold text-thb-text-primary">Line Items</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Description</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Qty</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Rate</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-thb-border">
                    {inv.items.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3.5 text-thb-text-primary">{item.description}</td>
                        <td className="px-4 py-3.5 text-right text-thb-text-secondary">{item.quantity}</td>
                        <td className="px-4 py-3.5 text-right text-thb-text-secondary">{formatCurrency(item.rate, inv.currency)}</td>
                        <td className="px-6 py-3.5 text-right font-medium text-thb-text-primary">{formatCurrency(item.amount, inv.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Totals */}
              <div className="px-6 py-4 bg-slate-50/50 border-t border-thb-border">
                <div className="max-w-xs ml-auto space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-thb-text-secondary">Subtotal</span>
                    <span className="text-thb-text-primary">{formatCurrency(inv.subtotal, inv.currency)}</span>
                  </div>
                  {inv.discountAmount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-thb-text-secondary">Discount</span>
                      <span className="text-emerald-600">-{formatCurrency(inv.discountAmount, inv.currency)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-thb-text-secondary">Tax ({inv.taxRate}%)</span>
                    <span className="text-thb-text-primary">{formatCurrency(inv.taxAmount, inv.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-base font-bold pt-2 border-t border-thb-border">
                    <span className="text-thb-text-primary">Total</span>
                    <span className="text-thb-text-primary">{formatCurrency(inv.totalAmount, inv.currency)}</span>
                  </div>
                  {inv.payments.length > 0 && (
                    <>
                      <div className="flex items-center justify-between text-sm pt-1">
                        <span className="text-emerald-600">Paid</span>
                        <span className="text-emerald-600">-{formatCurrency(paidAmount, inv.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm font-bold pt-2 border-t border-thb-border">
                        <span className={balanceDue > 0 ? 'text-amber-600' : 'text-emerald-600'}>Balance Due</span>
                        <span className={balanceDue > 0 ? 'text-amber-600' : 'text-emerald-600'}>{formatCurrency(balanceDue, inv.currency)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            {inv.notes && (
              <div className="thb-card p-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-thb-text-muted mb-2">Notes</h3>
                <p className="text-sm text-thb-text-secondary leading-relaxed">{inv.notes}</p>
              </div>
            )}
          </div>

          {/* Right: Payment History & Summary */}
          <div className="space-y-6">
            {/* Payment Summary */}
            <div className="thb-card p-6">
              <h3 className="text-sm font-semibold text-thb-text-primary mb-4">Payment Summary</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-thb-text-secondary">Invoice Total</span>
                  <span className="text-sm font-bold text-thb-text-primary">{formatCurrency(inv.totalAmount, inv.currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-thb-text-secondary">Amount Paid</span>
                  <span className="text-sm font-semibold text-emerald-600">{formatCurrency(paidAmount, inv.currency)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${inv.status === 'paid' ? 'bg-emerald-500' : inv.status === 'overdue' ? 'bg-red-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, (paidAmount / inv.totalAmount) * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-thb-border">
                  <span className="text-sm font-semibold">Balance Due</span>
                  <span className={`text-sm font-bold ${balanceDue > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {formatCurrency(balanceDue, inv.currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment History */}
            <div className="thb-card p-6">
              <h3 className="text-sm font-semibold text-thb-text-primary mb-4">Payment History</h3>
              {inv.payments.length === 0 ? (
                <div className="text-center py-6">
                  <FiDollarSign className="w-8 h-8 text-thb-text-muted mx-auto mb-2" />
                  <p className="text-sm text-thb-text-muted">No payments recorded</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inv.payments.map(p => (
                    <div key={p.id} className="flex items-start gap-3 pb-3 border-b border-thb-border last:border-0 last:pb-0">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <FiCheck className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-thb-text-primary">{formatCurrency(p.amount, inv.currency)}</p>
                          <span className="text-xs text-thb-text-muted">{formatDate(p.date)}</span>
                        </div>
                        <p className="text-xs text-thb-text-secondary mt-0.5">{p.method} · {p.reference}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main list view
  return (
    <div className="p-6 space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <FiFileText className="w-5 h-5 text-blue-600" />
            </div>
            Invoices
          </h1>
          <p className="text-sm text-thb-text-secondary mt-1.5 ml-11.5">
            Create, send, and track client invoices. Manage billing cycles and payment collections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary transition-colors">
            <FiDownload className="w-4 h-4" /> Export
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-thb-primary text-white hover:bg-thb-primary-dark shadow-sm transition-colors"
          >
            <FiPlus className="w-4 h-4" /> Create Invoice
          </button>
        </div>
      </div>

      {/* ─── Stats Row ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="thb-card p-5 thb-card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-thb-text-muted">Total Invoices</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <FiFileText className="w-4 h-4 text-slate-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-thb-text-primary">{stats.total}</p>
          <p className="text-xs text-thb-text-muted mt-1">All time</p>
        </div>
        <div className="thb-card p-5 thb-card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-thb-text-muted">Paid</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <FiDollarSign className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.paid, 'USD')}</p>
          <p className="text-xs text-thb-text-muted mt-1">{invoices.filter(i => i.status === 'paid').length} invoices</p>
        </div>
        <div className="thb-card p-5 thb-card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-thb-text-muted">Pending</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <FiClock className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-600">{formatCurrency(stats.pending, 'USD')}</p>
          <p className="text-xs text-thb-text-muted mt-1">{invoices.filter(i => ['sent', 'partial'].includes(i.status)).length} invoices</p>
        </div>
        <div className="thb-card p-5 thb-card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-thb-text-muted">Overdue</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <FiAlertCircle className="w-4 h-4 text-red-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.overdue, 'USD')}</p>
          <p className="text-xs text-thb-text-muted mt-1">{invoices.filter(i => i.status === 'overdue').length} invoices</p>
        </div>
      </div>

      {/* ─── Filter Bar ─── */}
      <div className="thb-card">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 border-b border-thb-border px-4 overflow-x-auto">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                statusFilter === tab.key
                  ? 'border-thb-primary text-thb-primary'
                  : 'border-transparent text-thb-text-secondary hover:text-thb-text-primary'
              }`}
            >
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                statusFilter === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-thb-text-muted'
              }`}>
                {tabCounts[tab.key as keyof typeof tabCounts] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Filters */}
        <div className="px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
            <input
              type="text"
              placeholder="Search by invoice #, client, or project..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary transition-colors bg-white"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
              showFilters ? 'border-thb-primary bg-blue-50 text-thb-primary' : 'border-thb-border text-thb-text-secondary hover:bg-slate-50'
            }`}
          >
            <FiFilter className="w-4 h-4" /> Filters
            {(clientFilter || dateFrom || dateTo) && (
              <span className="w-2 h-2 rounded-full bg-thb-primary" />
            )}
          </button>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="px-4 pb-4 pt-1 border-t border-thb-border bg-slate-50/50 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1.5">Client</label>
                <select
                  value={clientFilter}
                  onChange={e => setClientFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white"
                >
                  <option value="">All Clients</option>
                  {CLIENT_NAMES.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1.5">Date From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1.5">Date To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white"
                />
              </div>
            </div>
            {(clientFilter || dateFrom || dateTo) && (
              <button
                onClick={() => { setClientFilter(''); setDateFrom(''); setDateTo(''); }}
                className="mt-3 text-xs font-medium text-thb-primary hover:text-thb-primary-dark transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Invoices Table ─── */}
      <div className="thb-card overflow-hidden">
        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between animate-fade-in">
            <span className="text-sm font-medium text-blue-700">
              {selectedIds.size} invoice{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 transition-colors">
                <FiSend className="w-3.5 h-3.5" /> Send Selected
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <FiX className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-thb-border">
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredInvoices.length && filteredInvoices.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-thb-primary focus:ring-thb-primary/20 cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Invoice #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Invoice Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Due Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-thb-border">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <FiFileText className="w-6 h-6 text-thb-text-muted" />
                      </div>
                      <p className="text-thb-text-secondary font-medium">No invoices found</p>
                      <p className="text-xs text-thb-text-muted">Try adjusting your filters or create a new invoice</p>
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-thb-primary text-white hover:bg-thb-primary-dark transition-colors"
                      >
                        <FiPlus className="w-4 h-4" /> Create Invoice
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredInvoices.map(inv => {
                const paidAmount = inv.payments.reduce((s, p) => s + p.amount, 0);
                const isPartial = paidAmount > 0 && paidAmount < inv.totalAmount;
                const displayStatus = inv.status === 'partial' || isPartial ? 'partial' : inv.status;
                return (
                  <tr key={inv.id} className={`hover:bg-slate-50/50 transition-colors ${selectedIds.has(inv.id) ? 'bg-blue-50/30' : ''}`}>
                    {/* Checkbox */}
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(inv.id)}
                        onChange={() => toggleSelect(inv.id)}
                        className="w-4 h-4 rounded border-slate-300 text-thb-primary focus:ring-thb-primary/20 cursor-pointer"
                      />
                    </td>
                    {/* Invoice # */}
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => setSelectedInvoice(inv)}
                        className="font-medium text-thb-primary hover:text-thb-primary-dark transition-colors hover:underline"
                      >
                        {inv.invoiceNumber}
                      </button>
                    </td>
                    {/* Client */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${AVATAR_COLORS[inv.clientAvatar] || 'bg-slate-100 text-slate-600'}`}>
                          {inv.clientAvatar}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-thb-text-primary truncate">{inv.clientName}</p>
                          <p className="text-xs text-thb-text-muted truncate">{inv.projectName}</p>
                        </div>
                      </div>
                    </td>
                    {/* Invoice Date */}
                    <td className="px-4 py-3.5 text-thb-text-secondary">{formatDate(inv.issueDate)}</td>
                    {/* Due Date */}
                    <td className="px-4 py-3.5">
                      <span className={inv.status === 'overdue' ? 'text-red-600 font-medium' : 'text-thb-text-secondary'}>
                        {formatDate(inv.dueDate)}
                      </span>
                    </td>
                    {/* Amount */}
                    <td className="px-4 py-3.5 text-right">
                      <p className="font-semibold text-thb-text-primary">{formatCurrency(inv.totalAmount, inv.currency)}</p>
                      {paidAmount > 0 && paidAmount < inv.totalAmount && (
                        <p className="text-xs text-emerald-600 mt-0.5">{formatCurrency(paidAmount, inv.currency)} paid</p>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span className={getStatusBadge(displayStatus)}>{formatStatus(displayStatus)}</span>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="p-1.5 text-thb-text-muted hover:text-thb-primary hover:bg-blue-50 rounded-md transition-colors"
                          title="View"
                        >
                          <FiEye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="p-1.5 text-thb-text-muted hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                          title="Edit"
                        >
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        {inv.status === 'draft' && (
                          <button
                            onClick={() => handleStatusChange(inv.id, 'sent')}
                            className="p-1.5 text-thb-text-muted hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="Send"
                          >
                            <FiSend className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          className="p-1.5 text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 rounded-md transition-colors"
                          title="Download"
                        >
                          <FiDownload className="w-4 h-4" />
                        </button>
                        {/* More Actions Dropdown */}
                        <div className="relative">
                          <button
                            onClick={() => setActionMenuOpen(actionMenuOpen === inv.id ? null : inv.id)}
                            className="p-1.5 text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 rounded-md transition-colors"
                            title="More actions"
                          >
                            <FiMoreVertical className="w-4 h-4" />
                          </button>
                          {actionMenuOpen === inv.id && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-thb-border py-1 z-50 animate-fade-in">
                              <button
                                onClick={() => handleDuplicate(inv)}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary transition-colors"
                              >
                                <FiCopy className="w-3.5 h-3.5" /> Duplicate
                              </button>
                              {inv.status !== 'paid' && (
                                <button
                                  onClick={() => handleStatusChange(inv.id, 'paid')}
                                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition-colors"
                                >
                                  <FiCheck className="w-3.5 h-3.5" /> Mark as Paid
                                </button>
                              )}
                              {inv.status === 'draft' && (
                                <button
                                  onClick={() => handleDelete(inv.id)}
                                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <FiTrash2 className="w-3.5 h-3.5" /> Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        {filteredInvoices.length > 0 && (
          <div className="px-4 py-3 border-t border-thb-border bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-xs text-thb-text-muted">
              Showing {filteredInvoices.length} of {invoices.length} invoices
            </p>
            <div className="flex items-center gap-1">
              <span className="text-xs text-thb-text-muted mr-2">
                Total: <strong className="text-thb-text-primary">{formatCurrency(filteredInvoices.reduce((s, i) => s + i.totalAmount, 0), 'USD')}</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Create Invoice Modal ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slide-in-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-thb-border sticky top-0 bg-white z-10 rounded-t-2xl">
              <div>
                <h2 className="text-lg font-semibold text-thb-text-primary flex items-center gap-2">
                  <FiPlus className="w-5 h-5 text-thb-primary" /> Create New Invoice
                </h2>
                <p className="text-xs text-thb-text-muted mt-0.5">Fill in the details to create a draft invoice</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-slate-100 rounded-lg text-thb-text-muted hover:text-thb-text-primary transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5">
              {/* Client & Project */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1.5">
                    Client Name <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={createForm.clientName}
                    onChange={e => setCreateForm({ ...createForm, clientName: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white"
                  >
                    <option value="">Select client...</option>
                    {CLIENT_NAMES.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    <option value="__new__">+ New Client</option>
                  </select>
                  {createForm.clientName === '__new__' && (
                    <input
                      type="text"
                      placeholder="Enter new client name"
                      onChange={e => setCreateForm({ ...createForm, clientName: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white mt-2"
                      autoFocus
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1.5">Project</label>
                  <input
                    type="text"
                    placeholder="Project name"
                    value={createForm.projectName}
                    onChange={e => setCreateForm({ ...createForm, projectName: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white"
                  />
                </div>
              </div>

              {/* Dates & Currency */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1.5">Issue Date</label>
                  <input
                    type="date"
                    value={createForm.issueDate}
                    onChange={e => setCreateForm({ ...createForm, issueDate: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={createForm.dueDate}
                    onChange={e => setCreateForm({ ...createForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1.5">Currency</label>
                  <select
                    value={createForm.currency}
                    onChange={e => setCreateForm({ ...createForm, currency: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="SGD">SGD (S$)</option>
                    <option value="AED">AED (د.إ)</option>
                  </select>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-thb-text-primary">Line Items</h3>
                  <button
                    onClick={() => setCreateItems([...createItems, { description: '', quantity: 1, rate: 0 }])}
                    className="inline-flex items-center gap-1 text-xs font-medium text-thb-primary hover:text-thb-primary-dark transition-colors"
                  >
                    <FiPlus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 px-2">
                    <div className="col-span-5 text-xs font-medium text-thb-text-muted">Description</div>
                    <div className="col-span-2 text-xs font-medium text-thb-text-muted">Qty</div>
                    <div className="col-span-2 text-xs font-medium text-thb-text-muted">Rate</div>
                    <div className="col-span-2 text-xs font-medium text-thb-text-muted text-right">Amount</div>
                    <div className="col-span-1" />
                  </div>
                  {createItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <input
                          type="text"
                          placeholder="Item description"
                          value={item.description}
                          onChange={e => {
                            const next = [...createItems];
                            next[idx] = { ...next[idx], description: e.target.value };
                            setCreateItems(next);
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => {
                            const next = [...createItems];
                            next[idx] = { ...next[idx], quantity: Number(e.target.value) || 0 };
                            setCreateItems(next);
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={e => {
                            const next = [...createItems];
                            next[idx] = { ...next[idx], rate: Number(e.target.value) || 0 };
                            setCreateItems(next);
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white"
                        />
                      </div>
                      <div className="col-span-2 text-right text-sm font-medium text-thb-text-primary">
                        {formatCurrency(item.quantity * item.rate, createForm.currency)}
                      </div>
                      <div className="col-span-1 flex justify-center">
                        {createItems.length > 1 && (
                          <button
                            onClick={() => setCreateItems(createItems.filter((_, i) => i !== idx))}
                            className="p-1 text-thb-text-muted hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <FiX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="mt-4 pt-4 border-t border-thb-border">
                  <div className="max-w-sm ml-auto space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-thb-text-secondary">Subtotal</span>
                      <span className="text-thb-text-primary font-medium">{formatCurrency(createSubtotal, createForm.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-thb-text-secondary">Tax</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={createForm.taxRate}
                          onChange={e => setCreateForm({ ...createForm, taxRate: Number(e.target.value) || 0 })}
                          className="w-16 px-2 py-1 rounded border border-thb-border text-xs text-center focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white"
                        />
                        <span className="text-xs text-thb-text-muted">%</span>
                      </div>
                      <span className="text-thb-text-primary font-medium">{formatCurrency(createTax, createForm.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between text-base font-bold pt-2 border-t border-thb-border">
                      <span>Total</span>
                      <span>{formatCurrency(createTotal, createForm.currency)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1.5">Notes</label>
                <textarea
                  value={createForm.notes}
                  onChange={e => setCreateForm({ ...createForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Additional notes or payment instructions..."
                  className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary bg-white resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-thb-border bg-slate-50/50 sticky bottom-0 rounded-b-2xl">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2.5 text-sm font-medium rounded-lg border border-thb-border text-thb-text-secondary hover:bg-white hover:text-thb-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSubmit}
                disabled={!createForm.clientName}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-thb-primary text-white hover:bg-thb-primary-dark shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FiFileText className="w-4 h-4" /> Create Draft Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click-away for action menus */}
      {actionMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setActionMenuOpen(null)} />
      )}
    </div>
  );
}
