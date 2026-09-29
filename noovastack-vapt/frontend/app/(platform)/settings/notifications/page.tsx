'use client';

import { useState } from 'react';
import { Bell, Check, Mail } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const PREFS_KEY = 'noovastack.notification.prefs';

interface Prefs {
  email_enabled: boolean;
  scan_completed: boolean;
  scan_failed: boolean;
  approval_decision: boolean;
  new_finding_critical: boolean;
  new_finding_high: boolean;
  engagement_expiry: boolean;
  domain_monitor_alert: boolean;
  weekly_digest: boolean;
}

const DEFAULT_PREFS: Prefs = {
  email_enabled: true,
  scan_completed: true,
  scan_failed: true,
  approval_decision: true,
  new_finding_critical: true,
  new_finding_high: false,
  engagement_expiry: true,
  domain_monitor_alert: true,
  weekly_digest: false,
};

function loadPrefs(): Prefs {
  try {
    const v = localStorage.getItem(PREFS_KEY);
    return v ? { ...DEFAULT_PREFS, ...JSON.parse(v) } : DEFAULT_PREFS;
  } catch { return DEFAULT_PREFS; }
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5E9E] ${checked ? 'bg-[#155EEF]' : 'bg-[#D0D5DD] dark:bg-[#344054]'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

const GROUPS = [
  {
    label: 'Scans',
    items: [
      { key: 'scan_completed' as keyof Prefs, label: 'Scan Completed', desc: 'Notify when any scan finishes successfully' },
      { key: 'scan_failed' as keyof Prefs, label: 'Scan Failed or Blocked', desc: 'Notify when a scan fails or is blocked by safety checks' },
    ],
  },
  {
    label: 'Findings',
    items: [
      { key: 'new_finding_critical' as keyof Prefs, label: 'Critical Findings', desc: 'Immediate alert for critical severity findings' },
      { key: 'new_finding_high' as keyof Prefs, label: 'High Findings', desc: 'Alert for high severity findings' },
    ],
  },
  {
    label: 'Approvals & Engagements',
    items: [
      { key: 'approval_decision' as keyof Prefs, label: 'Approval Decisions', desc: 'When your scan requests are approved or rejected' },
      { key: 'engagement_expiry' as keyof Prefs, label: 'Engagement Expiry', desc: 'Warning 48 hours before an engagement expires' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { key: 'domain_monitor_alert' as keyof Prefs, label: 'Domain Monitor Alerts', desc: 'New subdomains, IP changes, or tech stack changes detected' },
    ],
  },
  {
    label: 'Digest',
    items: [
      { key: 'weekly_digest' as keyof Prefs, label: 'Weekly Summary', desc: 'Weekly email digest of platform activity' },
    ],
  },
];

export default function NotificationPrefsPage() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [saved, setSaved] = useState(false);

  function set(key: keyof Prefs, value: boolean) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  function save() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <PageHeader title="Notification Preferences" description="Choose which events trigger notifications for you." />
      <div className="max-w-2xl space-y-6">

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#0B5E9E]" />
              <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Email Notifications</h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#102033] dark:text-[#F1F5F9]">Enable Email Notifications</p>
                <p className="text-xs text-[#667085] dark:text-[#94A3B8]">Receive notifications via your registered email address</p>
              </div>
              <Toggle checked={prefs.email_enabled} onChange={(v) => set('email_enabled', v)} />
            </div>
          </CardContent>
        </Card>

        {GROUPS.map((group) => (
          <Card key={group.label} className={!prefs.email_enabled ? 'opacity-50 pointer-events-none' : ''}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-[#0B5E9E]" />
                <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">{group.label}</h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {group.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#102033] dark:text-[#F1F5F9]">{item.label}</p>
                    <p className="text-xs text-[#667085] dark:text-[#94A3B8]">{item.desc}</p>
                  </div>
                  <Toggle checked={prefs[item.key] as boolean} onChange={(v) => set(item.key, v)} />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        <Button onClick={save}>
          {saved ? <><Check className="h-4 w-4" /> Saved</> : 'Save Preferences'}
        </Button>
      </div>
    </>
  );
}
