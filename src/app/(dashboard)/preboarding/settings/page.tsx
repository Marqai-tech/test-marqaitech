'use client';

import { useState } from 'react';
import {
  FiSettings, FiMail, FiFileText, FiGift, FiCheckCircle, FiCircle,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';

/* ── Communication items ── */
const communicationItems = [
  { label: 'Offer Letter Email', description: 'Automatically send offer letter and welcome email to new hires', enabled: true, icon: FiMail },
  { label: 'Document Collection Portal', description: 'Provide a secure portal for pre-joiners to upload required documents', enabled: true, icon: FiFileText },
  { label: 'Welcome Kit', description: 'Send a digital welcome kit with company info and first-day instructions', enabled: false, icon: FiGift },
];

/* ── Document checklist ── */
const documentChecklist = [
  { label: 'ID Proof', requirement: 'Required', icon: FiCheckCircle },
  { label: 'Address Proof', requirement: 'Required', icon: FiCheckCircle },
  { label: 'Education Certificates', requirement: 'Optional', icon: FiCircle },
];

export default function PreboardingSettingsPage() {
  useAuthStore();
  const [commItems, setCommItems] = useState(communicationItems);

  const toggleComm = (idx: number) => {
    setCommItems(prev => prev.map((item, i) => i === idx ? { ...item, enabled: !item.enabled } : item));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-50">
          <FiSettings className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">Preboarding Settings</h1>
          <p className="text-sm text-thb-text-secondary">Configure pre-joining communication and document requirements</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pre-joining Communication */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
            <h3 className="font-semibold text-thb-text-primary">Pre-joining Communication</h3>
            <p className="text-xs text-thb-text-muted mt-0.5">Configure automated touchpoints with new hires</p>
          </div>
          <div className="divide-y divide-thb-border">
            {commItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-4 px-5 py-4">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${item.enabled ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-thb-text-primary">{item.label}</p>
                    <p className="text-xs text-thb-text-muted mt-0.5">{item.description}</p>
                  </div>
                  <button
                    onClick={() => toggleComm(idx)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${item.enabled ? 'bg-green-500' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${item.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Document Checklist */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
            <h3 className="font-semibold text-thb-text-primary">Document Checklist</h3>
            <p className="text-xs text-thb-text-muted mt-0.5">Required documents from pre-joiners before day one</p>
          </div>
          <div className="divide-y divide-thb-border">
            {documentChecklist.map((doc) => {
              const Icon = doc.icon;
              const isRequired = doc.requirement === 'Required';
              return (
                <div key={doc.label} className="flex items-center gap-4 px-5 py-4">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isRequired ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-thb-text-primary">{doc.label}</p>
                  </div>
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${isRequired ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {doc.requirement}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
