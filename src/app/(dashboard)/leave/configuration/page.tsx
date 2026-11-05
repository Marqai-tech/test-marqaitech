'use client';

import { useState, useEffect } from 'react';
import { FiLayers, FiClipboard, FiLink2, FiArrowLeft } from 'react-icons/fi';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import LeaveTypesTab from './LeaveTypesTab';
import LeavePoliciesTab from './LeavePoliciesTab';
import LeaveTypePolicyMappingTab from './LeaveTypePolicyMappingTab';

type TabId = 'types' | 'policies' | 'mapping';

const TABS: { id: TabId; label: string; icon: any; desc: string }[] = [
  { id: 'types', label: 'Leave Types', icon: FiLayers, desc: 'Create and manage leave type definitions' },
  { id: 'policies', label: 'Leave Policies', icon: FiClipboard, desc: 'Define policies with quota, accrual, restrictions, year-end & encashment' },
  { id: 'mapping', label: 'Type–Policy Mapping', icon: FiLink2, desc: 'Map leave types to policies with priority & conflict resolution' },
];

export default function LeaveConfigurationPage() {
  const [activeTab, setActiveTab] = useState<TabId>('types');
  const { user } = useAuthStore();
  const { effectiveCompanyId } = useCompanyContextStore();

  // Read tab from URL hash on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'policies' || hash === 'mapping' || hash === 'types') {
        setActiveTab(hash as TabId);
      }
    }
  }, []);

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.location.hash = tab;
    }
  };

  const isAdmin = user && ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(user.role);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <FiClipboard className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h2>
          <p className="text-sm text-gray-500 mb-4">Leave Configuration is only available to HR/Admin roles.</p>
          <Link href="/leave" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
            <FiArrowLeft /> Back to Leave Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Link href="/leave" className="hover:text-gray-700">Leave</Link>
                <span>/</span>
                <span className="text-gray-900 font-medium">Configuration</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Leave Configuration</h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage leave types, policies, and their mappings in one place.
              </p>
            </div>
            {effectiveCompanyId && (
              <div className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full font-medium border border-blue-100">
                Company context active
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-4">
          <p className="text-sm text-gray-500">{TABS.find(t => t.id === activeTab)?.desc}</p>
        </div>
        {activeTab === 'types' && <LeaveTypesTab />}
        {activeTab === 'policies' && <LeavePoliciesTab />}
        {activeTab === 'mapping' && <LeaveTypePolicyMappingTab />}
      </div>
    </div>
  );
}
