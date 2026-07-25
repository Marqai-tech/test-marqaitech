'use client';

import { useState } from 'react';
import {
  FiSettings, FiSave, FiToggleLeft, FiToggleRight,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="flex items-center gap-2 text-sm">
      {enabled ? (
        <><FiToggleRight className="w-6 h-6 text-green-500" /><span className="text-green-600 font-medium">On</span></>
      ) : (
        <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Off</span></>
      )}
    </button>
  );
}

export default function ProjectSettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'tenant_admin' || user?.role === 'admin';

  const [sprintDuration, setSprintDuration] = useState('2weeks');
  const [autoAssign, setAutoAssign] = useState(false);
  const [timeTrackingMandatory, setTimeTrackingMandatory] = useState(true);
  const [sprintDeadlineAlerts, setSprintDeadlineAlerts] = useState(true);
  const [dailyStandupReminders, setDailyStandupReminders] = useState(true);
  const [overdueTaskEscalation, setOverdueTaskEscalation] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      toast.success('Project settings saved successfully');
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
            <h1 className="text-xl font-bold text-thb-text-primary">Project Settings</h1>
            <p className="text-sm text-thb-text-secondary">Configure project defaults and notification preferences</p>
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
        {/* Project Defaults */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
            <h3 className="font-semibold text-thb-text-primary">Project Defaults</h3>
            <p className="text-xs text-thb-text-muted mt-0.5">Default settings for new projects</p>
          </div>
          <div className="p-5 space-y-5">
            {/* Sprint Duration */}
            <div>
              <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Sprint Duration</label>
              <select
                value={sprintDuration}
                onChange={(e) => setSprintDuration(e.target.value)}
                className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
              >
                <option value="1week">1 Week</option>
                <option value="2weeks">2 Weeks</option>
                <option value="3weeks">3 Weeks</option>
                <option value="4weeks">4 Weeks</option>
              </select>
              <p className="text-xs text-thb-text-muted mt-1">Default sprint length for new projects</p>
            </div>

            {/* Auto-assign Tasks */}
            <div className="flex items-center justify-between pt-4 border-t border-thb-border">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Auto-assign Tasks</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Automatically assign tasks based on team capacity and skills</p>
              </div>
              <Toggle enabled={autoAssign} onToggle={() => setAutoAssign(!autoAssign)} />
            </div>

            {/* Time Tracking Mandatory */}
            <div className="flex items-center justify-between pt-4 border-t border-thb-border">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Time Tracking Mandatory</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Require team members to log time on all tasks</p>
              </div>
              <Toggle enabled={timeTrackingMandatory} onToggle={() => setTimeTrackingMandatory(!timeTrackingMandatory)} />
            </div>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
            <h3 className="font-semibold text-thb-text-primary">Notification Preferences</h3>
            <p className="text-xs text-thb-text-muted mt-0.5">Configure project-related notifications</p>
          </div>
          <div className="p-5 space-y-5">
            {/* Sprint Deadline Alerts */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Sprint Deadline Alerts</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Notify team when sprint deadlines are approaching</p>
              </div>
              <Toggle enabled={sprintDeadlineAlerts} onToggle={() => setSprintDeadlineAlerts(!sprintDeadlineAlerts)} />
            </div>

            {/* Daily Standup Reminders */}
            <div className="flex items-center justify-between pt-4 border-t border-thb-border">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Daily Standup Reminders</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Send reminders for daily standup meetings</p>
              </div>
              <Toggle enabled={dailyStandupReminders} onToggle={() => setDailyStandupReminders(!dailyStandupReminders)} />
            </div>

            {/* Overdue Task Escalation */}
            <div className="flex items-center justify-between pt-4 border-t border-thb-border">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Overdue Task Escalation</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Escalate overdue tasks to project manager automatically</p>
              </div>
              <Toggle enabled={overdueTaskEscalation} onToggle={() => setOverdueTaskEscalation(!overdueTaskEscalation)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
