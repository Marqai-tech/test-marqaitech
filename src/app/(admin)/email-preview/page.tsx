'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  FiRefreshCw, FiSearch, FiExternalLink, FiGrid, FiMail, FiX, FiSmartphone, FiMonitor,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface EventItem {
  eventKey: string;
  name: string;
  description: string;
  actionable: boolean;
  recipients: string;
  status: string;
}
interface ModuleGroup {
  module: string;
  label: string;
  color: string;
  events: EventItem[];
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  approved: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Approved' },
  rejected: { bg: 'bg-red-50 text-red-700 border-red-200', label: 'Rejected' },
  pending: { bg: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Pending' },
  info: { bg: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Info' },
  welcome: { bg: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Welcome' },
};

const BRANDINGS = [
  { key: 'default', label: 'Marqai (Blue)', color: '#2563eb' },
  { key: 'teal', label: 'Acme (Teal)', color: '#0d9488' },
  { key: 'purple', label: 'Zenith (Purple)', color: '#7c3aed' },
];

export default function EmailPreviewGalleryPage() {
  const { user } = useAuthStore();
  const [modules, setModules] = useState<ModuleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branding, setBranding] = useState('default');
  const [selectedEvent, setSelectedEvent] = useState<{ module: string; eventKey: string; name: string } | null>(null);
  const [mobileView, setMobileView] = useState(false);

  useEffect(() => {
    fetchCatalog();
  }, []);

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/email-preview?list=1', { headers: getAuthHeaders() });
      const data = await res.json();
      setModules(data.modules || []);
    } catch (e) {
      toast.error('Failed to load email catalog');
    } finally {
      setLoading(false);
    }
  };

  const filteredModules = useMemo(() => {
    if (!search) return modules;
    const q = search.toLowerCase();
    return modules.map(m => ({
      ...m,
      events: m.events.filter(e =>
        e.eventKey.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
      ),
    })).filter(m => m.events.length > 0);
  }, [modules, search]);

  const totalEvents = useMemo(() => modules.reduce((n, m) => n + m.events.length, 0), [modules]);

  const previewUrl = (event: { module: string; eventKey: string }) =>
    `/api/email-preview?eventKey=${encodeURIComponent(event.eventKey)}&module=${encodeURIComponent(event.module)}&branding=${branding}`;

  const openInNewTab = (event: { module: string; eventKey: string }) => {
    window.open(previewUrl(event), '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <FiMail className="w-3.5 h-3.5" />
                <span>Admin</span>
                <span>/</span>
                <span className="text-gray-900 font-medium">Email Template Gallery</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Email Template Gallery</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Preview every email type with sample data and tenant branding. {totalEvents} templates across {modules.length} modules.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchCatalog} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
                <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Controls */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates by name, key, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Branding:</span>
            {BRANDINGS.map(b => (
              <button
                key={b.key}
                onClick={() => setBranding(b.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  branding === b.key
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color }} />
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Module sections */}
        {loading ? (
          <div className="text-center py-20 text-sm text-gray-400">Loading email templates...</div>
        ) : filteredModules.length === 0 ? (
          <div className="text-center py-20 text-sm text-gray-400">No templates match your search.</div>
        ) : (
          <div className="space-y-6">
            {filteredModules.map(mod => (
              <div key={mod.module} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2" style={{ background: mod.color + '0d' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: mod.color }} />
                  <h2 className="text-sm font-semibold text-gray-900">{mod.label}</h2>
                  <span className="text-xs text-gray-500">· {mod.events.length} template{mod.events.length === 1 ? '' : 's'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                  {mod.events.map(event => {
                    const statusInfo = STATUS_COLORS[event.status] || STATUS_COLORS.info;
                    return (
                      <div key={event.eventKey} className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:shadow-sm transition-all group">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <h3 className="text-sm font-medium text-gray-900 leading-snug">{event.name}</h3>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusInfo.bg} flex-shrink-0`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-2 line-clamp-2">{event.description}</p>
                        <code className="text-[10px] text-gray-400 font-mono block mb-2">{event.eventKey}</code>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedEvent({ module: mod.module, eventKey: event.eventKey, name: event.name })}
                            className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-gray-900 hover:bg-gray-700 rounded transition-colors"
                          >
                            <FiMail className="w-3 h-3" /> Preview
                          </button>
                          <button
                            onClick={() => openInNewTab({ module: mod.module, eventKey: event.eventKey })}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Open in new tab"
                          >
                            <FiExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {selectedEvent && (
        <PreviewModal
          event={selectedEvent}
          branding={branding}
          mobileView={mobileView}
          onToggleView={() => setMobileView(!mobileView)}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

function PreviewModal({ event, branding, mobileView, onToggleView, onClose }: {
  event: { module: string; eventKey: string; name: string };
  branding: string;
  mobileView: boolean;
  onToggleView: () => void;
  onClose: () => void;
}) {
  const url = `/api/email-preview?eventKey=${encodeURIComponent(event.eventKey)}&module=${encodeURIComponent(event.module)}&branding=${branding}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{event.name}</h3>
            <code className="text-[10px] text-gray-400 font-mono">{event.eventKey}</code>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleView}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              {mobileView ? <><FiMonitor className="w-3.5 h-3.5" /> Desktop</> : <><FiSmartphone className="w-3.5 h-3.5" /> Mobile</>}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              <FiExternalLink className="w-3.5 h-3.5" /> Open
            </a>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
              <FiX className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-gray-100 p-4 flex justify-center">
          <div
            className="bg-white shadow-lg transition-all duration-300"
            style={{
              width: mobileView ? '375px' : '100%',
              maxWidth: mobileView ? '375px' : '640px',
              borderRadius: mobileView ? '24px' : '8px',
              overflow: 'hidden',
              border: mobileView ? '8px solid #1f2937' : 'none',
              height: mobileView ? '700px' : 'auto',
            }}
          >
            <iframe
              src={url}
              title={event.name}
              className="w-full h-full border-0"
              style={{ minHeight: '600px' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
