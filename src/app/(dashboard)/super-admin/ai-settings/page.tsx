'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FiSettings, FiCpu, FiSave, FiRefreshCw, FiCheck, FiX,
  FiToggleLeft, FiToggleRight, FiSliders, FiDatabase,
  FiShield, FiGlobe, FiZap, FiEye, FiEdit2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ─── Types ───
interface AIModelConfig {
  modelType: string;
  maxTokens: number;
  predictionAccuracy: number;
  responseLanguage: string;
  enableNLP: boolean;
  enableComputerVision: boolean;
  enableContentGeneration: boolean;
  enablePredictiveAnalytics: boolean;
  enableRecommendationEngine: boolean;
}

interface DataTrainingConfig {
  autoRetraining: boolean;
  retrainFrequency: string;
  dataRetentionPeriod: string;
  predictionAccuracy: number;
}

interface AIPermission {
  role: string;
  modelSettings: boolean;
  dataTraining: boolean;
  apiAccess: boolean;
}

const DEFAULT_MODEL_CONFIG: AIModelConfig = {
  modelType: 'ai-attendance-insights',
  maxTokens: 1024,
  predictionAccuracy: 75,
  responseLanguage: 'English',
  enableNLP: true,
  enableComputerVision: false,
  enableContentGeneration: true,
  enablePredictiveAnalytics: true,
  enableRecommendationEngine: false,
};

const DEFAULT_TRAINING_CONFIG: DataTrainingConfig = {
  autoRetraining: false,
  retrainFrequency: 'daily',
  dataRetentionPeriod: '90',
  predictionAccuracy: 75,
};

const DEFAULT_PERMISSIONS: AIPermission[] = [
  { role: 'super_admin', modelSettings: true, dataTraining: true, apiAccess: true },
  { role: 'tenant_admin', modelSettings: false, dataTraining: false, apiAccess: true },
  { role: 'hr_manager', modelSettings: false, dataTraining: false, apiAccess: true },
  { role: 'recruitment_manager', modelSettings: false, dataTraining: false, apiAccess: false },
  { role: 'payroll_manager', modelSettings: false, dataTraining: false, apiAccess: false },
  { role: 'employee', modelSettings: false, dataTraining: false, apiAccess: false },
];

type ActiveTab = 'model' | 'training' | 'permissions';

export default function AISettingsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ActiveTab>('model');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  // Model Configuration
  const [modelConfig, setModelConfig] = useState<AIModelConfig>(DEFAULT_MODEL_CONFIG);

  // Data Training Configuration
  const [trainingConfig, setTrainingConfig] = useState<DataTrainingConfig>(DEFAULT_TRAINING_CONFIG);

  // AI Permissions
  const [permissions, setPermissions] = useState<AIPermission[]>(DEFAULT_PERMISSIONS);

  // Load settings from API
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch('/api/super-admin/ai-settings', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.modelConfig) setModelConfig(data.modelConfig);
        if (data.trainingConfig) setTrainingConfig(data.trainingConfig);
        if (data.permissions) setPermissions(data.permissions);
      }
    } catch (err) {
      console.error('Failed to fetch AI settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch('/api/super-admin/ai-settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ modelConfig, trainingConfig, permissions }),
      });
      if (res.ok) {
        toast.success('AI settings saved successfully');
        setHasChanges(false);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save AI settings');
      }
    } catch (err) {
      toast.error('Failed to save AI settings');
    } finally {
      setSaving(false);
    }
  };

  const markChanged = () => setHasChanges(true);

  const tabs: { key: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { key: 'model', label: 'Model Configuration', icon: <FiCpu className="w-4 h-4" /> },
    { key: 'training', label: 'Data Training Settings', icon: <FiDatabase className="w-4 h-4" /> },
    { key: 'permissions', label: 'AI Permissions', icon: <FiShield className="w-4 h-4" /> },
  ];

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-slate-100 rounded animate-pulse mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
            <FiCpu className="w-6 h-6 text-indigo-500" />
            AI Settings
          </h1>
          <p className="text-sm text-thb-text-secondary mt-1">
            Configure AI models, training parameters, and role-based permissions for AI features across all tenants.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchSettings}
            className="p-2 rounded-lg text-thb-text-secondary hover:bg-slate-100 transition-colors"
            title="Refresh"
          >
            <FiRefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-thb-border">
        <nav className="flex gap-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-thb-text-secondary hover:text-thb-text-primary'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'model' && (
        <div className="space-y-6">
          {/* Model Configuration Card */}
          <div className="bg-white rounded-xl border border-thb-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-thb-border bg-slate-50">
              <h2 className="text-lg font-semibold text-thb-text-primary flex items-center gap-2">
                <FiSliders className="w-5 h-5 text-indigo-500" />
                Model Configuration
              </h2>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Model Type */}
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-2">Model Type</label>
                  <select
                    value={modelConfig.modelType}
                    onChange={e => { setModelConfig({ ...modelConfig, modelType: e.target.value }); markChanged(); }}
                    className="w-full px-3 py-2.5 border border-thb-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="ai-attendance-insights">AI Attendance Insights</option>
                    <option value="ai-payroll-forecast">AI Payroll Forecast</option>
                    <option value="ai-hiring-forecast">AI Hiring Forecast</option>
                    <option value="ai-team-performance">AI Team Performance Insights</option>
                  </select>
                  <p className="text-xs text-thb-text-secondary mt-1">Select the AI model to use for processing requests</p>
                </div>

                {/* Max Tokens */}
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-2">Maximum Tokens</label>
                  <select
                    value={modelConfig.maxTokens}
                    onChange={e => { setModelConfig({ ...modelConfig, maxTokens: parseInt(e.target.value) }); markChanged(); }}
                    className="w-full px-3 py-2.5 border border-thb-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value={256}>256 Tokens</option>
                    <option value={512}>512 Tokens</option>
                    <option value={1024}>1024 Tokens</option>
                    <option value={2048}>2048 Tokens</option>
                    <option value={3072}>3072 Tokens</option>
                    <option value={4096}>4096 Tokens</option>
                  </select>
                  <p className="text-xs text-thb-text-secondary mt-1">Maximum number of tokens to generate (1-4096)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Parameters Card */}
          <div className="bg-white rounded-xl border border-thb-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-thb-border bg-slate-50">
              <h2 className="text-lg font-semibold text-thb-text-primary flex items-center gap-2">
                <FiZap className="w-5 h-5 text-amber-500" />
                Advanced Parameters
              </h2>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Prediction Accuracy */}
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-2">Prediction Accuracy Level</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={25}
                      max={100}
                      step={5}
                      value={modelConfig.predictionAccuracy}
                      onChange={e => { setModelConfig({ ...modelConfig, predictionAccuracy: parseInt(e.target.value) }); markChanged(); }}
                      className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <span className="text-sm font-semibold text-indigo-600 min-w-[40px] text-right">{modelConfig.predictionAccuracy}%</span>
                  </div>
                  <p className="text-xs text-thb-text-secondary mt-1">Higher accuracy uses more computational resources</p>
                </div>

                {/* Response Language */}
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-2">Response Language</label>
                  <select
                    value={modelConfig.responseLanguage}
                    onChange={e => { setModelConfig({ ...modelConfig, responseLanguage: e.target.value }); markChanged(); }}
                    className="w-full px-3 py-2.5 border border-thb-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* AI Capabilities Toggle Card */}
          <div className="bg-white rounded-xl border border-thb-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-thb-border bg-slate-50">
              <h2 className="text-lg font-semibold text-thb-text-primary flex items-center gap-2">
                <FiToggleRight className="w-5 h-5 text-green-500" />
                AI Capabilities
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {[
                { key: 'enableNLP' as const, label: 'Natural Language Processing', desc: 'Enable AI-powered text analysis and understanding', icon: <FiEye className="w-5 h-5 text-indigo-500" /> },
                { key: 'enableComputerVision' as const, label: 'Computer Vision', desc: 'Image recognition and visual content analysis', icon: <FiEye className="w-5 h-5 text-purple-500" /> },
                { key: 'enableContentGeneration' as const, label: 'Content Generation', desc: 'Automated content creation and text generation', icon: <FiEdit2 className="w-5 h-5 text-blue-500" /> },
                { key: 'enablePredictiveAnalytics' as const, label: 'Predictive Analytics', desc: 'Data forecasting and trend prediction', icon: <FiZap className="w-5 h-5 text-amber-500" /> },
                { key: 'enableRecommendationEngine' as const, label: 'Recommendation Engine', desc: 'Personalized content and product recommendations', icon: <FiGlobe className="w-5 h-5 text-green-500" /> },
              ].map(cap => (
                <div key={cap.key} className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">{cap.icon}</div>
                    <div>
                      <p className="text-sm font-medium text-thb-text-primary">{cap.label}</p>
                      <p className="text-xs text-thb-text-secondary">{cap.desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setModelConfig({ ...modelConfig, [cap.key]: !modelConfig[cap.key] }); markChanged(); }}
                    className={`relative w-12 h-6 rounded-full transition-colors ${modelConfig[cap.key] ? 'bg-indigo-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${modelConfig[cap.key] ? 'left-6' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'training' && (
        <div className="space-y-6">
          {/* Training Configuration Card */}
          <div className="bg-white rounded-xl border border-thb-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-thb-border bg-slate-50">
              <h2 className="text-lg font-semibold text-thb-text-primary flex items-center gap-2">
                <FiDatabase className="w-5 h-5 text-blue-500" />
                Training Configuration
              </h2>
              <p className="text-sm text-thb-text-secondary mt-1">Configure automatic retraining and data quality settings</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Auto Retraining Toggle */}
              <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <FiRefreshCw className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-thb-text-primary">Automatic Retraining</p>
                    <p className="text-xs text-thb-text-secondary">Automatically retrain models with new data</p>
                  </div>
                </div>
                <button
                  onClick={() => { setTrainingConfig({ ...trainingConfig, autoRetraining: !trainingConfig.autoRetraining }); markChanged(); }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${trainingConfig.autoRetraining ? 'bg-indigo-500' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${trainingConfig.autoRetraining ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Retrain Frequency */}
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-2">Retrain Frequency</label>
                  <select
                    value={trainingConfig.retrainFrequency}
                    onChange={e => { setTrainingConfig({ ...trainingConfig, retrainFrequency: e.target.value }); markChanged(); }}
                    className="w-full px-3 py-2.5 border border-thb-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="every-6-hours">Every 6 Hours</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="manual-only">Manual Only</option>
                  </select>
                </div>

                {/* Data Retention Period */}
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-2">Data Retention Period</label>
                  <select
                    value={trainingConfig.dataRetentionPeriod}
                    onChange={e => { setTrainingConfig({ ...trainingConfig, dataRetentionPeriod: e.target.value }); markChanged(); }}
                    className="w-full px-3 py-2.5 border border-thb-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="30">30 Days</option>
                    <option value="60">60 Days</option>
                    <option value="90">90 Days</option>
                    <option value="180">180 Days</option>
                    <option value="365">365 Days</option>
                    <option value="unlimited">Unlimited</option>
                  </select>
                </div>
              </div>

              {/* Prediction Accuracy */}
              <div>
                <label className="block text-sm font-medium text-thb-text-primary mb-2">Prediction Accuracy Level</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={25}
                    max={100}
                    step={5}
                    value={trainingConfig.predictionAccuracy}
                    onChange={e => { setTrainingConfig({ ...trainingConfig, predictionAccuracy: parseInt(e.target.value) }); markChanged(); }}
                    className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <span className="text-sm font-semibold text-indigo-600 min-w-[40px] text-right">{trainingConfig.predictionAccuracy}%</span>
                </div>
                <p className="text-xs text-thb-text-secondary mt-1">Higher accuracy uses more computational resources</p>
              </div>
            </div>
          </div>

          {/* Training Datasets Card */}
          <div className="bg-white rounded-xl border border-thb-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-thb-border bg-slate-50">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-thb-text-primary flex items-center gap-2">
                  <FiDatabase className="w-5 h-5 text-emerald-500" />
                  Training Datasets
                </h2>
                <p className="text-xs text-thb-text-secondary">Manage datasets used for model training</p>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {[
                  { name: 'Employee Attendance Dataset', size: '1.8 GB', records: '12,450 records', updated: 'Updated 1 hour ago' },
                  { name: 'Payroll History Dataset', size: '2.4 GB', records: '8,320 records', updated: 'Updated 3 hours ago' },
                  { name: 'Recruitment Data Dataset', size: '960 MB', records: '5,125 records', updated: 'Updated 6 hours ago' },
                  { name: 'Performance Reviews Dataset', size: '1.2 GB', records: '3,890 records', updated: 'Updated 12 hours ago' },
                ].map((dataset, i) => (
                  <div key={i} className="flex items-center justify-between py-3 px-4 rounded-lg border border-thb-border/50 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <FiDatabase className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-thb-text-primary">{dataset.name}</p>
                        <div className="flex items-center gap-2 text-xs text-thb-text-secondary">
                          <span>{dataset.size}</span>
                          <span>·</span>
                          <span>{dataset.records}</span>
                          <span>·</span>
                          <span>{dataset.updated}</span>
                        </div>
                      </div>
                    </div>
                    <button className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                      Update
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'permissions' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-thb-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-thb-border bg-slate-50">
              <h2 className="text-lg font-semibold text-thb-text-primary flex items-center gap-2">
                <FiShield className="w-5 h-5 text-indigo-500" />
                AI Role-Based Access Control
              </h2>
              <p className="text-sm text-thb-text-secondary mt-1">Control which roles can access AI features and configurations.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-thb-border bg-slate-50/50">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Role</th>
                    <th className="text-center px-6 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Model Settings</th>
                    <th className="text-center px-6 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Data Training</th>
                    <th className="text-center px-6 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">API Access</th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((perm, idx) => (
                    <tr key={perm.role} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-thb-text-primary capitalize">{perm.role.replace(/_/g, ' ')}</span>
                      </td>
                      {(['modelSettings', 'dataTraining', 'apiAccess'] as const).map(field => (
                        <td key={field} className="text-center px-6 py-4">
                          <button
                            onClick={() => {
                              const newPerms = [...permissions];
                              newPerms[idx] = { ...newPerms[idx], [field]: !newPerms[idx][field] };
                              setPermissions(newPerms);
                              markChanged();
                            }}
                            className={`relative w-10 h-5 rounded-full transition-colors inline-block ${perm[field] ? 'bg-indigo-500' : 'bg-slate-300'}`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${perm[field] ? 'left-5' : 'left-0.5'}`} />
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Permission Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'Model Settings', desc: 'View and modify AI model configuration, including model type, token limits, and accuracy parameters.', icon: <FiSliders className="w-5 h-5 text-indigo-500" /> },
              { title: 'Data Training', desc: 'Access training datasets, configure retraining schedules, and manage data retention policies.', icon: <FiDatabase className="w-5 h-5 text-blue-500" /> },
              { title: 'API Access', desc: 'Use AI features via API endpoints for attendance insights, payroll forecasting, and hiring predictions.', icon: <FiZap className="w-5 h-5 text-amber-500" /> },
            ].map(card => (
              <div key={card.title} className="bg-white rounded-xl border border-thb-border p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  {card.icon}
                  <h3 className="text-sm font-semibold text-thb-text-primary">{card.title}</h3>
                </div>
                <p className="text-xs text-thb-text-secondary leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
