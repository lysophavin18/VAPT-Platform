'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Globe, Moon, Palette, Save, Shield, Sun, Monitor } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api-client';

const TIMEZONE_OPTIONS = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
  'Asia/Singapore', 'Asia/Bangkok', 'Australia/Sydney',
];

const DATE_FORMAT_OPTIONS = [
  { value: 'MMM D, YYYY', label: 'Jan 1, 2024' },
  { value: 'DD/MM/YYYY', label: '01/01/2024' },
  { value: 'MM/DD/YYYY', label: '01/01/2024 (US)' },
  { value: 'YYYY-MM-DD', label: '2024-01-01 (ISO)' },
];

export default function AccountSettingsPage() {
  const { user, token } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();

  const [timezone, setTimezone] = useState('UTC');
  const [dateFormat, setDateFormat] = useState('MMM D, YYYY');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyScanComplete, setNotifyScanComplete] = useState(true);
  const [notifyApprovals, setNotifyApprovals] = useState(true);
  const [notifyFindings, setNotifyFindings] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveMsg('Preferences saved.');
    setTimeout(() => setSaveMsg(''), 3000);
  }

  return (
    <>
      <PageHeader
        title="Account Settings"
        description="Manage your appearance, timezone, and notification preferences."
      />

      <div className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-[#0B5E9E]" />
              <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Appearance</h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#102033] dark:text-[#F1F5F9]">Theme</p>
                <p className="text-xs text-[#667085] dark:text-[#94A3B8]">Choose how the platform looks to you.</p>
              </div>
              <div className="flex gap-2">
                {(['light', 'system', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { if (theme !== t) toggleTheme(); }}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      theme === t
                        ? 'border-[#155EEF] bg-[#EAF2FF] text-[#155EEF] dark:border-[#49A6DF] dark:bg-[#143A5A] dark:text-[#8CCCF0]'
                        : 'border-[#DCE3EA] text-[#475467] hover:border-[#aac1e4] dark:border-[#2A394D] dark:text-[#94A3B8]'
                    }`}
                  >
                    {t === 'light' && <Sun className="h-3.5 w-3.5" />}
                    {t === 'dark' && <Moon className="h-3.5 w-3.5" />}
                    {t === 'system' && <Monitor className="h-3.5 w-3.5" />}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <form onSubmit={handleSave} className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-[#0B5E9E]" />
                <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Regional Settings</h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">Timezone</label>
                <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">Date Format</label>
                <Select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
                  {DATE_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-[#0B5E9E]" />
                <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Notification Preferences</h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { id: 'email', label: 'Email Notifications', desc: 'Receive important updates via email', value: notifyEmail, set: setNotifyEmail },
                { id: 'scan', label: 'Scan Completed', desc: 'Notify when a scan finishes', value: notifyScanComplete, set: setNotifyScanComplete },
                { id: 'approvals', label: 'Approval Decisions', desc: 'Notify when your scan requests are approved or rejected', value: notifyApprovals, set: setNotifyApprovals },
                { id: 'findings', label: 'New Findings', desc: 'Notify when critical findings are discovered', value: notifyFindings, set: setNotifyFindings },
              ].map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#102033] dark:text-[#F1F5F9]">{item.label}</p>
                    <p className="text-xs text-[#667085] dark:text-[#94A3B8]">{item.desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.value}
                    onClick={() => item.set(!item.value)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5E9E] ${
                      item.value ? 'bg-[#155EEF]' : 'bg-[#D0D5DD] dark:bg-[#344054]'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${item.value ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#0B5E9E]" />
                <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Account Information</h2>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-[#F2F4F7] pb-2 dark:border-[#1E2D3D]">
                  <dt className="text-[#667085] dark:text-[#94A3B8]">Username</dt>
                  <dd className="font-medium text-[#102033] dark:text-[#F1F5F9]">{user?.username}</dd>
                </div>
                <div className="flex justify-between border-b border-[#F2F4F7] pb-2 dark:border-[#1E2D3D]">
                  <dt className="text-[#667085] dark:text-[#94A3B8]">Role</dt>
                  <dd className="font-medium text-[#102033] dark:text-[#F1F5F9]">{user?.role?.replace('_', ' ')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#667085] dark:text-[#94A3B8]">Account Status</dt>
                  <dd className={`font-medium ${user?.is_active ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {user?.is_active ? 'Active' : 'Inactive'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {saveMsg && (
            <p className="text-sm text-green-600 dark:text-green-400">{saveMsg}</p>
          )}
          <Button type="submit">
            <Save className="h-4 w-4" />
            Save Preferences
          </Button>
        </form>
      </div>
    </>
  );
}
