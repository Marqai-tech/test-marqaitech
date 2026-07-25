'use client';

import { useState, useMemo } from 'react';
import {
  FiFolder, FiUpload, FiPlus, FiGrid, FiList, FiStar, FiDownload,
  FiShare2, FiTrash2, FiClock, FiFileText, FiFile, FiImage,
  FiChevronRight, FiChevronDown, FiSearch, FiMoreVertical,
  FiHardDrive, FiUsers, FiGlobe, FiEdit3, FiCopy, FiLock,
  FiX, FiActivity, FiUser, FiCalendar, FiHash, FiArrowUp,
  FiRefreshCw, FiTrash,
} from 'react-icons/fi';

// ─── Types ───────────────────────────────────────────────────────────────────

type FileType = 'folder' | 'pdf' | 'doc' | 'xls' | 'img' | 'ppt' | 'other';
type ViewMode = 'grid' | 'list';
type SidebarSection = 'quick' | 'drives' | 'categories';

interface FileItem {
  id: string;
  name: string;
  type: FileType;
  size: string;
  sizeBytes: number;
  modified: string;
  modifiedDate: Date;
  owner: string;
  shared: boolean;
  sharedWith: string[];
  starred: boolean;
  drive: 'my' | 'project' | 'company';
  parentId: string | null;
  version: number;
  description: string;
}

interface VersionEntry {
  version: number;
  date: string;
  user: string;
  size: string;
  change: string;
}

interface ActivityEntry {
  action: string;
  user: string;
  date: string;
  detail?: string;
}

// ─── Sample Data ─────────────────────────────────────────────────────────────

const STORAGE_TOTAL = 50 * 1024; // 50 GB in MB
const STORAGE_USED = 32.7 * 1024; // 32.7 GB in MB

const DRIVES = [
  {
    key: 'my' as const,
    label: 'My Drive',
    icon: FiHardDrive,
    color: 'text-sky-500',
    used: 12.4,
    total: 15,
    bgColor: 'bg-sky-50',
    barColor: 'bg-sky-500',
  },
  {
    key: 'project' as const,
    label: 'Project Drive',
    icon: FiUsers,
    color: 'text-teal-500',
    used: 8.2,
    total: 20,
    bgColor: 'bg-teal-50',
    barColor: 'bg-teal-500',
  },
  {
    key: 'company' as const,
    label: 'Company Drive',
    icon: FiGlobe,
    color: 'text-emerald-500',
    used: 12.1,
    total: 15,
    bgColor: 'bg-emerald-50',
    barColor: 'bg-emerald-500',
  },
];

const CATEGORIES = [
  { key: 'doc', label: 'Documents', icon: FiFileText, color: 'text-green-500', count: 8 },
  { key: 'xls', label: 'Spreadsheets', icon: FiHash, color: 'text-green-500', count: 6 },
  { key: 'ppt', label: 'Presentations', icon: FiFile, color: 'text-orange-500', count: 4 },
  { key: 'img', label: 'Images', icon: FiImage, color: 'text-teal-500', count: 5 },
  { key: 'pdf', label: 'PDFs', icon: FiFile, color: 'text-red-500', count: 9 },
];

const FILES: FileItem[] = [
  // ── Folders ──
  { id: 'f1', name: 'Employee Documents', type: 'folder', size: '—', sizeBytes: 0, modified: 'Feb 28, 2026', modifiedDate: new Date('2026-02-28'), owner: 'HR Admin', shared: true, sharedWith: ['HR Team', 'Managers'], starred: true, drive: 'company', parentId: null, version: 0, description: 'Core employee documentation' },
  { id: 'f2', name: 'Payroll Reports', type: 'folder', size: '—', sizeBytes: 0, modified: 'Mar 1, 2026', modifiedDate: new Date('2026-03-01'), owner: 'Finance Team', shared: true, sharedWith: ['Finance', 'HR'], starred: false, drive: 'company', parentId: null, version: 0, description: 'Monthly payroll reports and summaries' },
  { id: 'f3', name: 'Offer Letters', type: 'folder', size: '—', sizeBytes: 0, modified: 'Feb 25, 2026', modifiedDate: new Date('2026-02-25'), owner: 'Recruitment Team', shared: true, sharedWith: ['Recruiters', 'HR Heads'], starred: true, drive: 'project', parentId: null, version: 0, description: 'All offer letter templates and issued letters' },
  { id: 'f4', name: 'Onboarding Materials', type: 'folder', size: '—', sizeBytes: 0, modified: 'Mar 2, 2026', modifiedDate: new Date('2026-03-02'), owner: 'HR Admin', shared: true, sharedWith: ['HR Team', 'New Hires'], starred: false, drive: 'company', parentId: null, version: 0, description: 'Onboarding checklists, guides, and presentations' },
  { id: 'f5', name: 'Policy Documents', type: 'folder', size: '—', sizeBytes: 0, modified: 'Jan 15, 2026', modifiedDate: new Date('2026-01-15'), owner: 'Legal Team', shared: true, sharedWith: ['All Employees'], starred: false, drive: 'company', parentId: null, version: 0, description: 'Company policies and compliance documents' },
  { id: 'f6', name: 'Performance Reviews', type: 'folder', size: '—', sizeBytes: 0, modified: 'Feb 20, 2026', modifiedDate: new Date('2026-02-20'), owner: 'HR Admin', shared: true, sharedWith: ['HR Team', 'Managers'], starred: true, drive: 'project', parentId: null, version: 0, description: 'Quarterly and annual performance review documents' },
  { id: 'f7', name: 'Training Materials', type: 'folder', size: '—', sizeBytes: 0, modified: 'Mar 3, 2026', modifiedDate: new Date('2026-03-03'), owner: 'L&D Team', shared: true, sharedWith: ['All Employees'], starred: false, drive: 'company', parentId: null, version: 0, description: 'Training guides, videos, and certification materials' },
  { id: 'f8', name: 'Personal Notes', type: 'folder', size: '—', sizeBytes: 0, modified: 'Mar 4, 2026', modifiedDate: new Date('2026-03-04'), owner: 'Me', shared: false, sharedWith: [], starred: false, drive: 'my', parentId: null, version: 0, description: 'My personal workspace notes' },

  // ── PDFs ──
  { id: 'p1', name: 'Employee Handbook 2026.pdf', type: 'pdf', size: '4.2 MB', sizeBytes: 4404019, modified: 'Jan 10, 2026', modifiedDate: new Date('2026-01-10'), owner: 'Legal Team', shared: true, sharedWith: ['All Employees'], starred: true, drive: 'company', parentId: 'f5', version: 3, description: 'Updated company handbook with 2026 policy changes' },
  { id: 'p2', name: 'Q4 2025 Payroll Summary.pdf', type: 'pdf', size: '1.8 MB', sizeBytes: 1887436, modified: 'Feb 15, 2026', modifiedDate: new Date('2026-02-15'), owner: 'Finance Team', shared: true, sharedWith: ['Finance', 'HR Heads'], starred: false, drive: 'company', parentId: 'f2', version: 2, description: 'Quarterly payroll summary report' },
  { id: 'p3', name: 'Leave Policy 2026.pdf', type: 'pdf', size: '890 KB', sizeBytes: 911360, modified: 'Jan 20, 2026', modifiedDate: new Date('2026-01-20'), owner: 'HR Admin', shared: true, sharedWith: ['All Employees'], starred: false, drive: 'company', parentId: 'f5', version: 4, description: 'Updated leave and absence policy' },
  { id: 'p4', name: 'Anti-Harassment Policy.pdf', type: 'pdf', size: '560 KB', sizeBytes: 573440, modified: 'Dec 5, 2025', modifiedDate: new Date('2025-12-05'), owner: 'Legal Team', shared: true, sharedWith: ['All Employees'], starred: false, drive: 'company', parentId: 'f5', version: 2, description: 'POSH compliance document' },
  { id: 'p5', name: 'Benefits Guide 2026.pdf', type: 'pdf', size: '3.1 MB', sizeBytes: 3250585, modified: 'Feb 1, 2026', modifiedDate: new Date('2026-02-01'), owner: 'HR Admin', shared: true, sharedWith: ['All Employees'], starred: true, drive: 'company', parentId: 'f5', version: 3, description: 'Comprehensive employee benefits guide' },
  { id: 'p6', name: 'IT Security Policy.pdf', type: 'pdf', size: '1.2 MB', sizeBytes: 1258291, modified: 'Mar 1, 2026', modifiedDate: new Date('2026-03-01'), owner: 'IT Admin', shared: true, sharedWith: ['All Employees'], starred: false, drive: 'company', parentId: 'f5', version: 5, description: 'Information security and acceptable use policy' },
  { id: 'p7', name: 'Annual Compliance Report 2025.pdf', type: 'pdf', size: '5.6 MB', sizeBytes: 5872025, modified: 'Jan 31, 2026', modifiedDate: new Date('2026-01-31'), owner: 'Compliance Team', shared: true, sharedWith: ['Leadership', 'Legal'], starred: false, drive: 'company', parentId: 'f5', version: 1, description: 'Annual regulatory compliance report' },

  // ── Docs ──
  { id: 'd1', name: 'Offer Letter - Priya Sharma.docx', type: 'doc', size: '245 KB', sizeBytes: 250880, modified: 'Mar 2, 2026', modifiedDate: new Date('2026-03-02'), owner: 'Recruiter A', shared: true, sharedWith: ['HR Heads'], starred: true, drive: 'project', parentId: 'f3', version: 1, description: 'Offer letter for Senior Developer position' },
  { id: 'd2', name: 'Offer Letter - Rahul Verma.docx', type: 'doc', size: '238 KB', sizeBytes: 243712, modified: 'Feb 28, 2026', modifiedDate: new Date('2026-02-28'), owner: 'Recruiter B', shared: true, sharedWith: ['HR Heads'], starred: false, drive: 'project', parentId: 'f3', version: 2, description: 'Offer letter for Product Manager position' },
  { id: 'd3', name: 'Onboarding Checklist - Q1 2026.docx', type: 'doc', size: '180 KB', sizeBytes: 184320, modified: 'Mar 3, 2026', modifiedDate: new Date('2026-03-03'), owner: 'HR Admin', shared: true, sharedWith: ['HR Team'], starred: false, drive: 'company', parentId: 'f4', version: 4, description: 'Updated onboarding checklist for new hires' },
  { id: 'd4', name: 'Meeting Notes - HR Review.docx', type: 'doc', size: '95 KB', sizeBytes: 97280, modified: 'Mar 4, 2026', modifiedDate: new Date('2026-03-04'), owner: 'Me', shared: false, sharedWith: [], starred: false, drive: 'my', parentId: 'f8', version: 1, description: 'Notes from weekly HR review meeting' },
  { id: 'd5', name: 'Employee NDA Template.docx', type: 'doc', size: '320 KB', sizeBytes: 327680, modified: 'Jan 5, 2026', modifiedDate: new Date('2026-01-05'), owner: 'Legal Team', shared: true, sharedWith: ['HR Team', 'Legal'], starred: true, drive: 'company', parentId: 'f1', version: 6, description: 'Standard non-disclosure agreement template' },
  { id: 'd6', name: 'WFH Policy Guidelines.docx', type: 'doc', size: '410 KB', sizeBytes: 419840, modified: 'Feb 10, 2026', modifiedDate: new Date('2026-02-10'), owner: 'HR Admin', shared: true, sharedWith: ['All Employees'], starred: false, drive: 'company', parentId: 'f5', version: 3, description: 'Work from home policy and guidelines' },
  { id: 'd7', name: 'Travel Reimbursement Process.docx', type: 'doc', size: '155 KB', sizeBytes: 158720, modified: 'Jan 22, 2026', modifiedDate: new Date('2026-01-22'), owner: 'Finance Team', shared: true, sharedWith: ['All Employees'], starred: false, drive: 'company', parentId: 'f5', version: 2, description: 'Step-by-step travel reimbursement process' },

  // ── Spreadsheets ──
  { id: 'x1', name: 'Salary Register - Feb 2026.xlsx', type: 'xls', size: '2.4 MB', sizeBytes: 2516582, modified: 'Mar 1, 2026', modifiedDate: new Date('2026-03-01'), owner: 'Finance Team', shared: true, sharedWith: ['Finance', 'HR Heads'], starred: true, drive: 'company', parentId: 'f2', version: 1, description: 'Monthly salary register with all employee payments' },
  { id: 'x2', name: 'Headcount Report Q1 2026.xlsx', type: 'xls', size: '1.6 MB', sizeBytes: 1677721, modified: 'Feb 28, 2026', modifiedDate: new Date('2026-02-28'), owner: 'HR Analyst', shared: true, sharedWith: ['HR Team', 'Leadership'], starred: false, drive: 'company', parentId: null, version: 3, description: 'Quarterly headcount analysis and projections' },
  { id: 'x3', name: 'Leave Balance Tracker.xlsx', type: 'xls', size: '890 KB', sizeBytes: 911360, modified: 'Mar 3, 2026', modifiedDate: new Date('2026-03-03'), owner: 'HR Admin', shared: true, sharedWith: ['HR Team'], starred: false, drive: 'project', parentId: null, version: 12, description: 'Running leave balance tracker for all employees' },
  { id: 'x4', name: 'Training Budget 2026.xlsx', type: 'xls', size: '340 KB', sizeBytes: 348160, modified: 'Jan 15, 2026', modifiedDate: new Date('2026-01-15'), owner: 'L&D Team', shared: true, sharedWith: ['Finance', 'HR Heads'], starred: false, drive: 'project', parentId: null, version: 2, description: 'Annual training budget allocation and tracking' },
  { id: 'x5', name: 'Attendance Summary - Feb 2026.xlsx', type: 'xls', size: '1.1 MB', sizeBytes: 1153433, modified: 'Mar 2, 2026', modifiedDate: new Date('2026-03-02'), owner: 'HR Admin', shared: true, sharedWith: ['HR Team', 'Managers'], starred: false, drive: 'company', parentId: null, version: 1, description: 'Monthly attendance summary report' },
  { id: 'x6', name: 'Tax Deduction Sheet - FY2025-26.xlsx', type: 'xls', size: '780 KB', sizeBytes: 798720, modified: 'Feb 20, 2026', modifiedDate: new Date('2026-02-20'), owner: 'Finance Team', shared: true, sharedWith: ['Finance'], starred: true, drive: 'company', parentId: 'f2', version: 5, description: 'TDS calculation and deduction sheet for all employees' },

  // ── Presentations ──
  { id: 't1', name: 'Company Town Hall - Q1 2026.pptx', type: 'ppt', size: '8.5 MB', sizeBytes: 8912896, modified: 'Mar 1, 2026', modifiedDate: new Date('2026-03-01'), owner: 'CEO Office', shared: true, sharedWith: ['All Employees'], starred: false, drive: 'company', parentId: null, version: 1, description: 'Quarterly town hall presentation slides' },
  { id: 't2', name: 'HR Strategy Deck 2026.pptx', type: 'ppt', size: '5.2 MB', sizeBytes: 5452595, modified: 'Jan 8, 2026', modifiedDate: new Date('2026-01-08'), owner: 'CHRO', shared: true, sharedWith: ['Leadership', 'HR Team'], starred: true, drive: 'company', parentId: null, version: 4, description: 'Annual HR strategy and roadmap presentation' },
  { id: 't3', name: 'Onboarding Presentation - New Hires.pptx', type: 'ppt', size: '6.8 MB', sizeBytes: 7130316, modified: 'Feb 15, 2026', modifiedDate: new Date('2026-02-15'), owner: 'HR Admin', shared: true, sharedWith: ['HR Team', 'New Hires'], starred: false, drive: 'company', parentId: 'f4', version: 7, description: 'Welcome presentation for new employee orientation' },
  { id: 't4', name: 'Performance Review Training.pptx', type: 'ppt', size: '3.4 MB', sizeBytes: 3565158, modified: 'Feb 18, 2026', modifiedDate: new Date('2026-02-18'), owner: 'L&D Team', shared: true, sharedWith: ['Managers'], starred: false, drive: 'company', parentId: 'f7', version: 2, description: 'Manager training on conducting performance reviews' },

  // ── Images ──
  { id: 'i1', name: 'Company Logo - 2026.png', type: 'img', size: '2.1 MB', sizeBytes: 2202009, modified: 'Jan 2, 2026', modifiedDate: new Date('2026-01-02'), owner: 'Brand Team', shared: true, sharedWith: ['All Employees'], starred: true, drive: 'company', parentId: null, version: 2, description: 'Updated company logo files for 2026' },
  { id: 'i2', name: 'Team Photo - Annual Day.jpg', type: 'img', size: '4.8 MB', sizeBytes: 5033164, modified: 'Dec 20, 2025', modifiedDate: new Date('2025-12-20'), owner: 'Events Team', shared: true, sharedWith: ['All Employees'], starred: false, drive: 'company', parentId: null, version: 1, description: 'Annual day celebration team photo' },
  { id: 'i3', name: 'Org Chart - Engineering.png', type: 'img', size: '1.5 MB', sizeBytes: 1572864, modified: 'Feb 10, 2026', modifiedDate: new Date('2026-02-10'), owner: 'HR Admin', shared: true, sharedWith: ['Engineering', 'HR'], starred: false, drive: 'project', parentId: null, version: 6, description: 'Engineering department organizational chart' },
  { id: 'i4', name: 'Office Floor Plan.png', type: 'img', size: '3.2 MB', sizeBytes: 3355443, modified: 'Nov 15, 2025', modifiedDate: new Date('2025-11-15'), owner: 'Admin Team', shared: true, sharedWith: ['All Employees'], starred: false, drive: 'company', parentId: null, version: 1, description: 'Updated office floor plan and seating arrangement' },
  { id: 'i5', name: 'ID Card Template.png', type: 'img', size: '890 KB', sizeBytes: 911360, modified: 'Jan 12, 2026', modifiedDate: new Date('2026-01-12'), owner: 'Admin Team', shared: true, sharedWith: ['HR Team', 'Admin'], starred: false, drive: 'company', parentId: null, version: 3, description: 'Employee ID card design template' },
];

const VERSION_HISTORY: Record<string, VersionEntry[]> = {
  'p1': [
    { version: 3, date: 'Jan 10, 2026', user: 'Legal Team', size: '4.2 MB', change: 'Updated 2026 policy changes' },
    { version: 2, date: 'Jun 15, 2025', user: 'Legal Team', size: '3.8 MB', change: 'Added remote work policy section' },
    { version: 1, date: 'Jan 5, 2025', user: 'HR Admin', size: '3.5 MB', change: 'Initial upload' },
  ],
  'x1': [
    { version: 1, date: 'Mar 1, 2026', user: 'Finance Team', size: '2.4 MB', change: 'February salary data added' },
  ],
  'd5': [
    { version: 6, date: 'Jan 5, 2026', user: 'Legal Team', size: '320 KB', change: 'Updated jurisdiction clause' },
    { version: 5, date: 'Sep 10, 2025', user: 'Legal Team', size: '310 KB', change: 'Added non-compete section' },
    { version: 4, date: 'Mar 22, 2025', user: 'HR Admin', size: '290 KB', change: 'Updated confidentiality terms' },
    { version: 3, date: 'Jan 15, 2025', user: 'Legal Team', size: '280 KB', change: 'Revised dispute resolution' },
    { version: 2, date: 'Aug 1, 2024', user: 'Legal Team', size: '265 KB', change: 'Minor formatting updates' },
    { version: 1, date: 'Jan 10, 2024', user: 'HR Admin', size: '250 KB', change: 'Initial template' },
  ],
  't3': [
    { version: 7, date: 'Feb 15, 2026', user: 'HR Admin', size: '6.8 MB', change: 'Added new benefits slide' },
    { version: 6, date: 'Jan 8, 2026', user: 'HR Admin', size: '6.5 MB', change: 'Updated company stats' },
    { version: 5, date: 'Oct 5, 2025', user: 'L&D Team', size: '6.2 MB', change: 'Refreshed design template' },
    { version: 4, date: 'Jul 12, 2025', user: 'HR Admin', size: '5.8 MB', change: 'Added DEI section' },
  ],
};

const ACTIVITY_LOG: Record<string, ActivityEntry[]> = {
  'p1': [
    { action: 'viewed', user: 'Ankit Patel', date: 'Mar 4, 2026, 10:15 AM' },
    { action: 'shared', user: 'Legal Team', date: 'Jan 10, 2026, 2:30 PM', detail: 'Shared with All Employees' },
    { action: 'edited', user: 'Legal Team', date: 'Jan 10, 2026, 2:00 PM', detail: 'Updated to v3' },
    { action: 'viewed', user: 'Priya Sharma', date: 'Jan 10, 2026, 9:00 AM' },
    { action: 'uploaded', user: 'HR Admin', date: 'Jan 5, 2025, 11:00 AM' },
  ],
  'x1': [
    { action: 'viewed', user: 'Finance Team', date: 'Mar 1, 2026, 4:00 PM' },
    { action: 'uploaded', user: 'Finance Team', date: 'Mar 1, 2026, 3:30 PM', detail: 'New version uploaded' },
  ],
  'd5': [
    { action: 'downloaded', user: 'Recruiter A', date: 'Mar 3, 2026, 11:00 AM' },
    { action: 'viewed', user: 'HR Admin', date: 'Mar 2, 2026, 3:00 PM' },
    { action: 'edited', user: 'Legal Team', date: 'Jan 5, 2026, 10:00 AM', detail: 'Updated to v6' },
  ],
};

// ─── Icon & Color Mapping ────────────────────────────────────────────────────

const FILE_TYPE_ICONS: Record<FileType, typeof FiFolder> = {
  folder: FiFolder,
  pdf: FiFileText,
  doc: FiFileText,
  xls: FiHash,
  img: FiImage,
  ppt: FiFile,
  other: FiFile,
};

const FILE_TYPE_COLORS: Record<FileType, { icon: string; bg: string; border: string; text: string }> = {
  folder: { icon: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  pdf: { icon: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
  doc: { icon: 'text-green-500', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  xls: { icon: 'text-green-500', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  img: { icon: 'text-teal-500', bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
  ppt: { icon: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
  other: { icon: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' },
};

const FILE_TYPE_LABELS: Record<FileType, string> = {
  folder: 'Folder',
  pdf: 'PDF Document',
  doc: 'Word Document',
  xls: 'Spreadsheet',
  img: 'Image',
  ppt: 'Presentation',
  other: 'File',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function FileManagerPage() {
  // State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [activeDrive, setActiveDrive] = useState<'my' | 'project' | 'company'>('my');
  const [activeQuickAccess, setActiveQuickAccess] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<FileType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [starredFiles, setStarredFiles] = useState<Set<string>>(
    new Set(FILES.filter(f => f.starred).map(f => f.id))
  );
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [breadcrumb, setBreadcrumb] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: 'My Drive' },
  ]);

  // Derived
  const selectedFile = useMemo(
    () => (selectedFileId ? FILES.find(f => f.id === selectedFileId) ?? null : null),
    [selectedFileId]
  );

  const displayedFiles = useMemo(() => {
    let items = FILES;

    // Filter by drive
    if (activeQuickAccess === 'trash') return [];
    if (activeQuickAccess === 'recent') {
      items = [...items].sort((a, b) => b.modifiedDate.getTime() - a.modifiedDate.getTime()).slice(0, 15);
    } else if (activeQuickAccess === 'starred') {
      items = items.filter(f => starredFiles.has(f.id));
    } else if (activeQuickAccess === 'shared') {
      items = items.filter(f => f.shared && f.owner !== 'Me');
    } else if (activeCategory) {
      items = items.filter(f => f.type === activeCategory);
    } else {
      items = items.filter(f => f.drive === activeDrive);
    }

    // Filter by current folder (top-level only for now)
    const currentFolderId = breadcrumb[breadcrumb.length - 1]?.id;
    if (!activeQuickAccess && !activeCategory) {
      items = items.filter(f => f.parentId === currentFolderId);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(f => f.name.toLowerCase().includes(q));
    }

    // Sort: folders first, then by name
    items = [...items].sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  }, [activeDrive, activeQuickAccess, activeCategory, starredFiles, searchQuery, breadcrumb]);

  const storagePercent = Math.round((STORAGE_USED / STORAGE_TOTAL) * 100);

  // Handlers
  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredFiles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSidebarDriveClick = (drive: 'my' | 'project' | 'company') => {
    setActiveDrive(drive);
    setActiveQuickAccess(null);
    setActiveCategory(null);
    const driveLabel = DRIVES.find(d => d.key === drive)?.label ?? drive;
    setBreadcrumb([{ id: null, name: driveLabel }]);
    setSelectedFileId(null);
  };

  const handleQuickAccessClick = (key: string) => {
    setActiveQuickAccess(key);
    setActiveCategory(null);
    const labels: Record<string, string> = { recent: 'Recent', starred: 'Starred', shared: 'Shared with me', trash: 'Trash' };
    setBreadcrumb([{ id: null, name: labels[key] ?? key }]);
    setSelectedFileId(null);
  };

  const handleCategoryClick = (type: FileType) => {
    setActiveCategory(type);
    setActiveQuickAccess(null);
    const cat = CATEGORIES.find(c => c.key === type);
    setBreadcrumb([{ id: null, name: cat?.label ?? type }]);
    setSelectedFileId(null);
  };

  const handleFolderDoubleClick = (file: FileItem) => {
    if (file.type !== 'folder') return;
    setBreadcrumb(prev => [...prev, { id: file.id, name: file.name }]);
    setSelectedFileId(null);
  };

  const handleBreadcrumbClick = (index: number) => {
    setBreadcrumb(prev => prev.slice(0, index + 1));
    setSelectedFileId(null);
  };

  const handleFileClick = (file: FileItem) => {
    if (file.type === 'folder') return;
    setSelectedFileId(file.id === selectedFileId ? null : file.id);
    setShowVersionHistory(false);
  };

  const getVersions = (fileId: string): VersionEntry[] => VERSION_HISTORY[fileId] ?? [
    { version: 1, date: FILES.find(f => f.id === fileId)?.modified ?? '', user: FILES.find(f => f.id === fileId)?.owner ?? '', size: FILES.find(f => f.id === fileId)?.size ?? '', change: 'Initial upload' },
  ];

  const getActivities = (fileId: string): ActivityEntry[] => ACTIVITY_LOG[fileId] ?? [
    { action: 'uploaded', user: FILES.find(f => f.id === fileId)?.owner ?? '', date: FILES.find(f => f.id === fileId)?.modified ?? '' },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-0 h-[calc(100vh-120px)] min-h-[600px]">
      {/* ═══════ LEFT SIDEBAR ═══════ */}
      <aside className="w-64 shrink-0 border-r border-thb-border bg-white rounded-l-xl overflow-y-auto hidden lg:block">
        <div className="p-4 space-y-5">
          {/* Quick Access */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted mb-2">Quick Access</h3>
            <nav className="space-y-0.5">
              {[
                { key: 'recent', label: 'Recent', icon: FiClock, color: 'text-slate-500' },
                { key: 'starred', label: 'Starred', icon: FiStar, color: 'text-amber-500' },
                { key: 'shared', label: 'Shared with me', icon: FiUsers, color: 'text-sky-500' },
                { key: 'trash', label: 'Trash', icon: FiTrash, color: 'text-red-400' },
              ].map(item => {
                const Icon = item.icon;
                const isActive = activeQuickAccess === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => handleQuickAccessClick(item.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-thb-primary/10 text-thb-primary font-medium'
                        : 'text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-thb-primary' : item.color}`} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Drive Sections */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted mb-2">Drives</h3>
            <nav className="space-y-0.5">
              {DRIVES.map(drive => {
                const Icon = drive.icon;
                const isActive = !activeQuickAccess && !activeCategory && activeDrive === drive.key;
                const pct = Math.round((drive.used / drive.total) * 100);
                return (
                  <button
                    key={drive.key}
                    onClick={() => handleSidebarDriveClick(drive.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-thb-primary/10 text-thb-primary font-medium'
                        : 'text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-thb-primary' : drive.color}`} />
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="truncate">{drive.label}</span>
                        <span className="text-[10px] text-thb-text-muted ml-1">{drive.used}/{drive.total} GB</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${drive.barColor} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted mb-2">Categories</h3>
            <nav className="space-y-0.5">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const isActive = activeCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => handleCategoryClick(cat.key as FileType)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-thb-primary/10 text-thb-primary font-medium'
                        : 'text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-thb-primary' : cat.color}`} />
                    <span className="flex-1 text-left">{cat.label}</span>
                    <span className="text-[10px] bg-slate-100 text-thb-text-muted px-1.5 py-0.5 rounded-full">{cat.count}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Storage Stats */}
          <div className="border-t border-thb-border pt-4">
            <div className="flex items-center gap-2 mb-2">
              <FiHardDrive className="w-4 h-4 text-thb-text-muted" />
              <span className="text-xs font-medium text-thb-text-secondary">Storage</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden mb-1.5">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${storagePercent}%`,
                  background: `linear-gradient(90deg, var(--thb-primary) 0%, var(--thb-accent) 100%)`,
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-thb-text-muted">
              <span>{(STORAGE_USED / 1024).toFixed(1)} GB used</span>
              <span>{(STORAGE_TOTAL / 1024).toFixed(0)} GB total</span>
            </div>
            <p className="text-[10px] text-thb-text-muted mt-1">{storagePercent}% of storage used</p>
          </div>
        </div>
      </aside>

      {/* ═══════ MAIN CONTENT ═══════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 pt-2 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
                <FiFolder className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-thb-text-primary leading-tight">File Manager</h1>
                <p className="text-xs text-thb-text-muted mt-0.5">Organize, share, and manage all your HR documents in one place</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNewFolderModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors"
              >
                <FiPlus className="w-4 h-4" />
                <span className="hidden sm:inline">New Folder</span>
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-2 bg-thb-primary text-white rounded-lg text-sm font-medium hover:bg-thb-primary-dark transition-colors shadow-sm">
                <FiUpload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload</span>
              </button>
            </div>
          </div>

          {/* Breadcrumb + Search + View Toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-sm min-w-0 flex-1" aria-label="Breadcrumb">
              {breadcrumb.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <FiChevronRight className="w-3.5 h-3.5 text-thb-text-muted shrink-0" />}
                  <button
                    onClick={() => handleBreadcrumbClick(i)}
                    className={`truncate max-w-[160px] rounded px-1.5 py-0.5 transition-colors ${
                      i === breadcrumb.length - 1
                        ? 'text-thb-text-primary font-medium'
                        : 'text-thb-text-muted hover:text-thb-primary hover:bg-thb-primary/5'
                    }`}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </nav>

            {/* Search */}
            <div className="relative w-56">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search files..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-thb-border bg-white focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary placeholder:text-thb-text-muted"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-thb-text-muted hover:text-thb-text-primary"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* View Toggle */}
            <div className="flex items-center border border-thb-border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 transition-colors ${
                  viewMode === 'grid' ? 'bg-thb-primary/10 text-thb-primary' : 'text-thb-text-muted hover:bg-slate-50'
                }`}
                title="Grid view"
              >
                <FiGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 transition-colors ${
                  viewMode === 'list' ? 'bg-thb-primary/10 text-thb-primary' : 'text-thb-text-muted hover:bg-slate-50'
                }`}
                title="List view"
              >
                <FiList className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* File Area */}
        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {displayedFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
                  <FiFolder className="w-8 h-8 text-thb-text-muted" />
                </div>
                <p className="text-sm font-medium text-thb-text-secondary">
                  {searchQuery ? 'No files match your search' : 'This folder is empty'}
                </p>
                <p className="text-xs text-thb-text-muted mt-1">
                  {searchQuery ? 'Try a different search term' : 'Upload files or create a new folder to get started'}
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              /* ═══ GRID VIEW ═══ */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {displayedFiles.map(file => {
                  const colors = FILE_TYPE_COLORS[file.type];
                  const Icon = FILE_TYPE_ICONS[file.type];
                  const isStarred = starredFiles.has(file.id);
                  const isSelected = selectedFileId === file.id;
                  return (
                    <div
                      key={file.id}
                      onClick={() => handleFileClick(file)}
                      onDoubleClick={() => handleFolderDoubleClick(file)}
                      className={`thb-card thb-card-hover relative group cursor-pointer rounded-xl p-3 transition-all ${
                        isSelected ? 'ring-2 ring-thb-primary shadow-md' : ''
                      }`}
                    >
                      {/* Star */}
                      <button
                        onClick={(e) => toggleStar(file.id, e)}
                        className={`absolute top-2 right-2 p-1 rounded-full transition-all z-10 ${
                          isStarred
                            ? 'text-amber-400'
                            : 'text-transparent group-hover:text-slate-300 hover:!text-amber-400'
                        }`}
                      >
                        <FiStar className={`w-3.5 h-3.5 ${isStarred ? 'fill-current' : ''}`} />
                      </button>

                      {/* Icon */}
                      <div className={`w-14 h-14 rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center mb-3 mx-auto`}>
                        <Icon className={`w-7 h-7 ${colors.icon}`} />
                      </div>

                      {/* Name */}
                      <p className="text-xs font-medium text-thb-text-primary text-center leading-snug truncate" title={file.name}>
                        {file.name}
                      </p>

                      {/* Meta */}
                      <div className="mt-1.5 flex items-center justify-center gap-2 text-[10px] text-thb-text-muted">
                        <span>{file.size}</span>
                        {file.size !== '—' && <span>·</span>}
                        <span>{file.modified}</span>
                      </div>

                      {/* Quick actions on hover */}
                      {file.type !== 'folder' && (
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-lg border border-thb-border rounded-lg px-1 py-0.5">
                          <button className="p-1 text-thb-text-muted hover:text-thb-primary rounded" title="Download">
                            <FiDownload className="w-3 h-3" />
                          </button>
                          <button className="p-1 text-thb-text-muted hover:text-emerald-600 rounded" title="Share">
                            <FiShare2 className="w-3 h-3" />
                          </button>
                          <button className="p-1 text-thb-text-muted hover:text-red-500 rounded" title="Delete">
                            <FiTrash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ═══ LIST VIEW ═══ */
              <div className="thb-card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-thb-border">
                      <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted px-4 py-2.5">Name</th>
                      <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted px-4 py-2.5 w-24">Size</th>
                      <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted px-4 py-2.5 w-32">Modified</th>
                      <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted px-4 py-2.5 w-28">Owner</th>
                      <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted px-4 py-2.5 w-24">Shared</th>
                      <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted px-4 py-2.5 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-thb-border">
                    {displayedFiles.map(file => {
                      const colors = FILE_TYPE_COLORS[file.type];
                      const Icon = FILE_TYPE_ICONS[file.type];
                      const isStarred = starredFiles.has(file.id);
                      const isSelected = selectedFileId === file.id;
                      return (
                        <tr
                          key={file.id}
                          onClick={() => handleFileClick(file)}
                          onDoubleClick={() => handleFolderDoubleClick(file)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-thb-primary/5' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-8 h-8 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-4 h-4 ${colors.icon}`} />
                              </div>
                              <span className="text-sm font-medium text-thb-text-primary truncate" title={file.name}>
                                {file.name}
                              </span>
                              <button
                                onClick={(e) => toggleStar(file.id, e)}
                                className={`shrink-0 p-0.5 rounded transition-colors ${
                                  isStarred ? 'text-amber-400' : 'text-thb-text-muted hover:text-amber-400'
                                }`}
                              >
                                <FiStar className={`w-3.5 h-3.5 ${isStarred ? 'fill-current' : ''}`} />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-thb-text-secondary">{file.size}</td>
                          <td className="px-4 py-2.5 text-xs text-thb-text-secondary">{file.modified}</td>
                          <td className="px-4 py-2.5 text-xs text-thb-text-secondary truncate">{file.owner}</td>
                          <td className="px-4 py-2.5">
                            {file.shared ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                <FiUsers className="w-2.5 h-2.5" />
                                {file.sharedWith.length > 1 ? `${file.sharedWith.length} groups` : file.sharedWith[0]}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] text-thb-text-muted">
                                <FiLock className="w-2.5 h-2.5" />
                                Private
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-0.5">
                              {file.type !== 'folder' && (
                                <>
                                  <button className="p-1.5 text-thb-text-muted hover:text-thb-primary hover:bg-slate-100 rounded transition-colors" title="Download">
                                    <FiDownload className="w-3.5 h-3.5" />
                                  </button>
                                  <button className="p-1.5 text-thb-text-muted hover:text-emerald-600 hover:bg-slate-100 rounded transition-colors" title="Share">
                                    <FiShare2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button className="p-1.5 text-thb-text-muted hover:text-red-500 hover:bg-slate-100 rounded transition-colors" title="Delete">
                                    <FiTrash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ═══════ FILE DETAIL PANEL ═══════ */}
          {selectedFile && (
            <div className="w-80 shrink-0 border-l border-thb-border bg-white overflow-y-auto hidden xl:block animate-slide-in-right">
              <div className="p-5 space-y-5">
                {/* Close + Preview */}
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-semibold text-thb-text-primary leading-snug pr-4">{selectedFile.name}</h3>
                  <button
                    onClick={() => setSelectedFileId(null)}
                    className="p-1 text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 rounded transition-colors shrink-0"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                </div>

                {/* File Preview Placeholder */}
                <div
                  className={`w-full h-40 rounded-xl ${FILE_TYPE_COLORS[selectedFile.type].bg} border ${FILE_TYPE_COLORS[selectedFile.type].border} flex flex-col items-center justify-center gap-2`}
                >
                  {(() => {
                    const Icon = FILE_TYPE_ICONS[selectedFile.type];
                    return <Icon className={`w-12 h-12 ${FILE_TYPE_COLORS[selectedFile.type].icon}`} />;
                  })()}
                  <span className={`text-xs font-medium ${FILE_TYPE_COLORS[selectedFile.type].text}`}>
                    {FILE_TYPE_LABELS[selectedFile.type]}
                  </span>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-2">
                  <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-thb-primary text-white rounded-lg text-xs font-medium hover:bg-thb-primary-dark transition-colors">
                    <FiDownload className="w-3.5 h-3.5" />
                    Download
                  </button>
                  <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-thb-border rounded-lg text-xs font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                    <FiShare2 className="w-3.5 h-3.5" />
                    Share
                  </button>
                  <button className="p-2 border border-thb-border rounded-lg text-thb-text-muted hover:bg-slate-50 hover:text-thb-text-primary transition-colors">
                    <FiMoreVertical className="w-4 h-4" />
                  </button>
                </div>

                {/* File Info */}
                <div className="space-y-2.5">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted">File Information</h4>
                  {[
                    { label: 'Type', value: FILE_TYPE_LABELS[selectedFile.type], icon: FiFile },
                    { label: 'Size', value: selectedFile.size, icon: FiHardDrive },
                    { label: 'Owner', value: selectedFile.owner, icon: FiUser },
                    { label: 'Modified', value: selectedFile.modified, icon: FiCalendar },
                    { label: 'Version', value: `v${selectedFile.version}`, icon: FiRefreshCw },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs text-thb-text-muted">
                        <row.icon className="w-3.5 h-3.5" />
                        {row.label}
                      </span>
                      <span className="text-xs font-medium text-thb-text-primary">{row.value}</span>
                    </div>
                  ))}
                  {selectedFile.description && (
                    <div>
                      <span className="flex items-center gap-2 text-xs text-thb-text-muted mb-1">
                        <FiEdit3 className="w-3.5 h-3.5" />
                        Description
                      </span>
                      <p className="text-xs text-thb-text-secondary leading-relaxed pl-5">{selectedFile.description}</p>
                    </div>
                  )}
                </div>

                {/* Version History */}
                <div>
                  <button
                    onClick={() => setShowVersionHistory(!showVersionHistory)}
                    className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted hover:text-thb-text-primary transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <FiClock className="w-3.5 h-3.5" />
                      Version History ({getVersions(selectedFile.id).length})
                    </span>
                    {showVersionHistory ? <FiChevronDown className="w-3.5 h-3.5" /> : <FiChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  {showVersionHistory && (
                    <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                      {getVersions(selectedFile.id).map(v => (
                        <div
                          key={v.version}
                          className="flex items-start gap-2.5 p-2 rounded-lg border border-thb-border bg-slate-50/50"
                        >
                          <div className="w-6 h-6 rounded bg-white border border-thb-border flex items-center justify-center shrink-0">
                            <span className="text-[9px] font-bold text-thb-text-secondary">{v.version}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-thb-text-primary truncate">{v.change}</p>
                            <p className="text-[10px] text-thb-text-muted mt-0.5">
                              {v.date} · {v.user} · {v.size}
                            </p>
                          </div>
                          <button className="p-1 text-thb-text-muted hover:text-thb-primary rounded shrink-0" title="Download this version">
                            <FiDownload className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sharing Info */}
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted mb-2 flex items-center gap-1.5">
                    <FiShare2 className="w-3.5 h-3.5" />
                    Sharing
                  </h4>
                  {selectedFile.shared ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-thb-text-secondary">
                        <FiUsers className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Shared with {selectedFile.sharedWith.length} group{selectedFile.sharedWith.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 pl-5">
                        {selectedFile.sharedWith.map(s => (
                          <span
                            key={s}
                            className="inline-flex items-center text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-full"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-thb-text-muted pl-0.5">
                      <FiLock className="w-3.5 h-3.5" />
                      <span>Private — only you can access</span>
                    </div>
                  )}
                </div>

                {/* Activity Log */}
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted mb-2 flex items-center gap-1.5">
                    <FiActivity className="w-3.5 h-3.5" />
                    Activity
                  </h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {getActivities(selectedFile.id).map((act, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                          {act.action === 'viewed' && <FiEye className="w-2.5 h-2.5 text-slate-400" />}
                          {act.action === 'uploaded' && <FiArrowUp className="w-2.5 h-2.5 text-emerald-500" />}
                          {act.action === 'edited' && <FiEdit3 className="w-2.5 h-2.5 text-green-500" />}
                          {act.action === 'shared' && <FiShare2 className="w-2.5 h-2.5 text-teal-500" />}
                          {act.action === 'downloaded' && <FiDownload className="w-2.5 h-2.5 text-amber-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-thb-text-primary">
                            <span className="font-medium">{act.user}</span>{' '}
                            <span className="text-thb-text-muted">{act.action}</span>
                            {act.detail && <span className="text-thb-text-muted"> — {act.detail}</span>}
                          </p>
                          <p className="text-[10px] text-thb-text-muted">{act.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ NEW FOLDER MODAL ═══════ */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="thb-card p-6 w-full max-w-sm animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-thb-text-primary">Create New Folder</h3>
              <button
                onClick={() => { setShowNewFolderModal(false); setNewFolderName(''); }}
                className="text-thb-text-muted hover:text-thb-text-primary transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-thb-text-secondary">Folder Name</label>
              <input
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="e.g. Q2 Reports"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-thb-primary/20 focus:border-thb-primary placeholder:text-thb-text-muted"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && newFolderName.trim()) {
                    setShowNewFolderModal(false);
                    setNewFolderName('');
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => { setShowNewFolderModal(false); setNewFolderName(''); }}
                className="px-4 py-2 text-sm text-thb-text-secondary hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newFolderName.trim()) {
                    setShowNewFolderModal(false);
                    setNewFolderName('');
                  }
                }}
                className="px-4 py-2 text-sm bg-thb-primary text-white rounded-lg hover:bg-thb-primary-dark transition-colors font-medium"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
