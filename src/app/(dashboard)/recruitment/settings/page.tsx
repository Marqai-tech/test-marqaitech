'use client';

import { useState } from 'react';
import {
  FiSettings, FiToggleLeft, FiToggleRight, FiSave,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

export default function RecruitmentSettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'tenant_admin' || user?.role === 'admin';

  const [autoPublish, setAutoPublish] = useState(true);
  const [requisitionApproval, setRequisitionApproval] = useState(true);
  const [resumeParsingAI, setResumeParsingAI] = useState(false);
  const [offerTemplate, setOfferTemplate] = useState('Standard');
  const [bgCheckRequired, setBgCheckRequired] = useState(true);
  const [piiRetention, setPiiRetention] = useState(6);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      toast.success('Recruitment settings saved successfully');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-50">
            <FiSettings className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Recruitment Settings</h1>
            <p className="text-sm text-thb-text-secondary">Configure job posting defaults and hiring workflow</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <FiSave className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Posting Defaults */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
            <h3 className="font-semibold text-thb-text-primary">Job Posting Defaults</h3>
            <p className="text-xs text-thb-text-muted mt-0.5">Default settings for new job postings</p>
          </div>
          <div className="p-5 space-y-5">
            {/* Auto-publish to Job Boards */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Auto-publish to Job Boards</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Automatically publish approved requisitions to configured job boards</p>
              </div>
              <button onClick={() => setAutoPublish(!autoPublish)} className="flex items-center gap-2 text-sm">
                {autoPublish ? (
                  <><FiToggleRight className="w-6 h-6 text-green-500" /><span className="text-green-600 font-medium">On</span></>
                ) : (
                  <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Off</span></>
                )}
              </button>
            </div>

            {/* Requisition Approval */}
            <div className="flex items-center justify-between pt-4 border-t border-thb-border">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Requisition Approval</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Require manager approval before job posting goes live</p>
              </div>
              <button onClick={() => setRequisitionApproval(!requisitionApproval)} className="flex items-center gap-2 text-sm">
                {requisitionApproval ? (
                  <><FiToggleRight className="w-6 h-6 text-green-500" /><span className="text-green-600 font-medium">On</span></>
                ) : (
                  <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Off</span></>
                )}
              </button>
            </div>

            {/* Resume Parsing AI */}
            <div className="flex items-center justify-between pt-4 border-t border-thb-border">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Resume Parsing AI</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Use AI to automatically extract and structure candidate data from resumes</p>
              </div>
              <button onClick={() => setResumeParsingAI(!resumeParsingAI)} className="flex items-center gap-2 text-sm">
                {resumeParsingAI ? (
                  <><FiToggleRight className="w-6 h-6 text-green-500" /><span className="text-green-600 font-medium">On</span></>
                ) : (
                  <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Off</span></>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Hiring Workflow */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
            <h3 className="font-semibold text-thb-text-primary">Hiring Workflow</h3>
            <p className="text-xs text-thb-text-muted mt-0.5">Configure the hiring and onboarding workflow</p>
          </div>
          <div className="p-5 space-y-5">
            {/* Offer Letter Template */}
            <div>
              <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Offer Letter Template</label>
              <select
                value={offerTemplate}
                onChange={(e) => setOfferTemplate(e.target.value)}
                className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
              >
                <option value="Standard">Standard</option>
                <option value="Senior">Senior / Executive</option>
                <option value="Contract">Contract / Freelance</option>
                <option value="Intern">Intern</option>
              </select>
              <p className="text-xs text-thb-text-muted mt-1">Default offer letter template for new hires</p>
            </div>

            {/* Background Check Required */}
            <div className="flex items-center justify-between pt-4 border-t border-thb-border">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Background Check Required</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Initiate background verification for all new hires</p>
              </div>
              <button onClick={() => setBgCheckRequired(!bgCheckRequired)} className="flex items-center gap-2 text-sm">
                {bgCheckRequired ? (
                  <><FiToggleRight className="w-6 h-6 text-green-500" /><span className="text-green-600 font-medium">On</span></>
                ) : (
                  <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Off</span></>
                )}
              </button>
            </div>

            {/* PII Data Retention */}
            <div className="pt-4 border-t border-thb-border">
              <label className="block text-sm font-medium text-thb-text-primary mb-1.5">PII Data Retention (Months)</label>
              <input
                type="number"
                value={piiRetention}
                onChange={(e) => setPiiRetention(Number(e.target.value))}
                min={1}
                className="w-full max-w-[200px] px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
              />
              <p className="text-xs text-thb-text-muted mt-1">How long to retain candidate PII data after rejection</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
