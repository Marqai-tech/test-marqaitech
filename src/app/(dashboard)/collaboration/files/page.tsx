'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FiFileText, FiFolder, FiUpload, FiHardDrive, FiUsers, FiGlobe,
  FiClock, FiLock, FiAlertTriangle, FiMoreVertical, FiDownload,
  FiShare2, FiEye, FiShield, FiX,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useAutoSeedDemo } from '@/hooks/useAutoSeedDemo';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface FileNode {
  id: string;
  name: string;
  driveType: string;
  nodeType: string;
  mimeType: string | null;
  sizeBytes: number;
  currentVersion: number;
  dlpScanStatus: string;
  watermarkEnabled: boolean;
  isUnderLegalHold: boolean;
  description: string | null;
  uploadedBy: { id: string; firstName: string; lastName: string; avatar: string | null };
  _count: { versions: number; shareLinks: number };
  createdAt: string;
}

const DRIVE_TYPES = [
  { key: 'personal', label: 'Personal Drive', icon: FiHardDrive, color: 'text-blue-500', desc: 'Visible only to you and your manager' },
  { key: 'project', label: 'Project Drive', icon: FiUsers, color: 'text-violet-500', desc: 'Visible to all members of a specific project' },
  { key: 'company', label: 'Company Drive', icon: FiGlobe, color: 'text-emerald-500', desc: 'Visible to all employees of a sub-company' },
];

export default function FilesPage() {
  const { user } = useAuthStore();
  const [driveType, setDriveType] = useState<'personal' | 'project' | 'company'>('personal');
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<Array<{ id: string; versionNumber: number; sizeBytes: number; changeLog: string | null; createdAt: string; uploadedBy: { firstName: string; lastName: string } }>>([]);

  // Upload form
  const [newFileName, setNewFileName] = useState('');
  const [newFileDescription, setNewFileDescription] = useState('');
  const [newFileMime, setNewFileMime] = useState('application/octet-stream');
  const [newFileSize, setNewFileSize] = useState(0);
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/collaboration/files?driveType=${driveType}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      } else {
        setFiles([]);
      }
    } catch (err) {
      console.error('Failed to load files:', err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [driveType]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Auto-seed collaboration demo data on first load, then re-fetch files
  const { seeded: filesSeeded } = useAutoSeedDemo('collaboration', () => { fetchFiles(); });
  useEffect(() => {
    if (filesSeeded) fetchFiles();
  }, [filesSeeded, fetchFiles]);

  const handleUpload = async () => {
    if (!newFileName) {
      toast.error('File name is required');
      return;
    }
    try {
      const res = await fetch('/api/collaboration/files', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: newFileName,
          driveType,
          nodeType: 'file',
          mimeType: newFileMime,
          sizeBytes: newFileSize,
          storagePath: `/uploads/${Date.now()}-${newFileName}`,
          description: newFileDescription,
          watermarkEnabled,
        }),
      });
      if (res.ok) {
        toast.success('File uploaded');
        setShowUploadModal(false);
        setNewFileName('');
        setNewFileDescription('');
        fetchFiles();
      } else if (res.status === 422) {
        const err = await res.json();
        toast.error(`Blocked by DLP: ${err.reason || 'PII detected'}`);
      } else {
        toast.error('Upload failed');
      }
    } catch (err) {
      console.error(err);
      toast.error('Upload failed');
    }
  };

  const handleFetchVersions = async (fileId: string) => {
    try {
      const res = await fetch(`/api/collaboration/files/${fileId}/versions`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
        setShowVersions(true);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load versions');
    }
  };

  const handleShare = async (fileId: string) => {
    try {
      const res = await fetch(`/api/collaboration/files/${fileId}/share`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ watermarkEnabled: true }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Share link created: ${data.shareLink.shareUrl}`);
      } else {
        toast.error('Share failed');
      }
    } catch (err) {
      console.error(err);
      toast.error('Share failed');
    }
  };

  const handleWatermarkAccess = async (fileId: string) => {
    try {
      const res = await fetch('/api/collaboration/watermark', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ fileId, accessType: 'view' }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Watermark applied: ${data.watermarkText.substring(0, 50)}...`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiFileText className="w-6 h-6 text-emerald-500" />
            File Hub
          </h1>
          <p className="text-sm text-nexus-text-secondary mt-1">
            Personal, Project, and Company drives with version control, watermarking, and DLP scanning
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          <FiUpload className="w-4 h-4" />
          Upload
        </button>
      </div>

      {/* Drive type tabs */}
      <div className="nexus-card p-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {DRIVE_TYPES.map((dt) => {
            const Icon = dt.icon;
            const isActive = driveType === dt.key;
            return (
              <button
                key={dt.key}
                onClick={() => setDriveType(dt.key as 'personal' | 'project' | 'company')}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  isActive
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-nexus-border hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${dt.color}`} />
                  <span className="text-sm font-medium text-nexus-text-primary">{dt.label}</span>
                </div>
                <p className="text-[10px] text-nexus-text-muted leading-relaxed">{dt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Files list */}
      <div className="nexus-card overflow-hidden">
        <div className="p-3 border-b border-nexus-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-nexus-text-primary">
            {DRIVE_TYPES.find((d) => d.key === driveType)?.label}
          </h2>
          <span className="text-xs text-nexus-text-muted">{files.length} item{files.length !== 1 ? 's' : ''}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-nexus-text-muted">Loading...</div>
        ) : files.length === 0 ? (
          <div className="p-8 text-center">
            <FiFileText className="w-10 h-10 text-nexus-text-muted mx-auto mb-2" />
            <p className="text-sm text-nexus-text-muted">No files in this drive yet</p>
            <button
              onClick={() => setShowUploadModal(true)}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              Upload your first file
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs text-nexus-text-muted uppercase tracking-wider">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">Uploaded By</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nexus-border">
              {files.map((file) => (
                <tr key={file.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {file.nodeType === 'folder' ? (
                        <FiFolder className="w-4 h-4 text-amber-500" />
                      ) : (
                        <FiFileText className="w-4 h-4 text-blue-500" />
                      )}
                      <span className="text-sm font-medium text-nexus-text-primary">{file.name}</span>
                      {file.isUnderLegalHold && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-red-100 text-red-700 rounded">Legal Hold</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-nexus-text-secondary">{formatBytes(file.sizeBytes)}</td>
                  <td className="px-4 py-3 text-xs text-nexus-text-secondary">v{file.currentVersion}</td>
                  <td className="px-4 py-3 text-xs text-nexus-text-secondary">
                    {file.uploadedBy.firstName} {file.uploadedBy.lastName}
                  </td>
                  <td className="px-4 py-3 text-xs text-nexus-text-muted">{formatDate(file.createdAt)}</td>
                  <td className="px-4 py-3">
                    {file.dlpScanStatus === 'flagged' ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-700 border border-amber-200">
                        <FiAlertTriangle className="w-2.5 h-2.5" />
                        DLP Flagged
                      </span>
                    ) : file.dlpScanStatus === 'clean' ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <FiShield className="w-2.5 h-2.5" />
                        Clean
                      </span>
                    ) : (
                      <span className="text-[10px] text-nexus-text-muted">{file.dlpScanStatus}</span>
                    )}
                    {file.watermarkEnabled && (
                      <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-50 text-blue-700 border border-blue-200">
                        <FiLock className="w-2.5 h-2.5" />
                        WM
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleWatermarkAccess(file.id)}
                        className="p-1.5 text-nexus-text-muted hover:bg-slate-100 hover:text-blue-600 rounded"
                        title="View (with watermark)"
                      >
                        <FiEye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleFetchVersions(file.id)}
                        className="p-1.5 text-nexus-text-muted hover:bg-slate-100 hover:text-violet-600 rounded"
                        title="Version history"
                      >
                        <FiClock className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleShare(file.id)}
                        className="p-1.5 text-nexus-text-muted hover:bg-slate-100 hover:text-emerald-600 rounded"
                        title="Share"
                      >
                        <FiShare2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="nexus-card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-nexus-text-primary">Upload File</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-nexus-text-muted hover:text-nexus-text-primary">
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-nexus-text-secondary">File Name</label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="e.g. Q2-Payslip.pdf"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-nexus-text-secondary">Description (optional)</label>
                <textarea
                  value={newFileDescription}
                  onChange={(e) => setNewFileDescription(e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-nexus-text-secondary">Size (bytes)</label>
                  <input
                    type="number"
                    value={newFileSize}
                    onChange={(e) => setNewFileSize(parseInt(e.target.value || '0', 10))}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-nexus-text-secondary">MIME Type</label>
                  <input
                    type="text"
                    value={newFileMime}
                    onChange={(e) => setNewFileMime(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-nexus-text-secondary">
                <input
                  type="checkbox"
                  checked={watermarkEnabled}
                  onChange={(e) => setWatermarkEnabled(e.target.checked)}
                  className="rounded"
                />
                Enable watermarking (viewer&apos;s email + timestamp overlay)
              </label>
              <div className="p-2 rounded bg-amber-50 border border-amber-100 text-[10px] text-amber-700">
                <FiAlertTriangle className="inline w-3 h-3 mr-1" />
                Files are scanned by DLP. Uploads containing credit cards, SSNs, or Aadhaar numbers will be blocked.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-3 py-1.5 text-sm text-nexus-text-secondary hover:bg-slate-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Versions Modal */}
      {showVersions && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="nexus-card p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-nexus-text-primary">Version History</h3>
              <button onClick={() => setShowVersions(false)} className="text-nexus-text-muted hover:text-nexus-text-primary">
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {versions.length === 0 ? (
                <p className="text-sm text-nexus-text-muted text-center py-4">No versions found</p>
              ) : (
                versions.map((v) => (
                  <div key={v.id} className="p-3 rounded-lg border border-nexus-border flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-nexus-text-primary">Version {v.versionNumber}</span>
                        <span className="text-[10px] text-nexus-text-muted">{formatBytes(v.sizeBytes)}</span>
                      </div>
                      <p className="text-xs text-nexus-text-muted mt-0.5">{v.changeLog}</p>
                      <p className="text-[10px] text-nexus-text-muted mt-0.5">
                        {formatDate(v.createdAt)} · by {v.uploadedBy.firstName} {v.uploadedBy.lastName}
                      </p>
                    </div>
                    <button className="p-1.5 text-nexus-text-muted hover:bg-slate-100 hover:text-blue-600 rounded">
                      <FiDownload className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
