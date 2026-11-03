'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Bot, Check, ExternalLink, Mail, Send } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { api, type EmailIntegration, type TelegramIntegration } from '@/lib/api-client';

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

const TELEGRAM_CATEGORIES = [
  ['projects', 'Projects'],
  ['scans', 'Scans & schedules'],
  ['findings', 'Findings & retests'],
  ['patches', 'Patch management'],
  ['approvals', 'Approvals'],
  ['reports', 'Reports'],
  ['assets', 'Assets & discovery'],
  ['system', 'System activity'],
] as const;

const FINDING_SEVERITIES = [
  ['critical', 'Critical'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
  ['informational', 'Informational'],
] as const;

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
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [saved, setSaved] = useState(false);
  const [emailDraft, setEmailDraft] = useState({ enabled: false, smtp_host: '', smtp_port: 587, smtp_username: '', smtp_password: '', use_tls: true, from_email: '', recipients: '', event_categories: TELEGRAM_CATEGORIES.map(([key]) => key) as string[] });
  const [telegramDraft, setTelegramDraft] = useState({ enabled: false, bot_token: '', chat_id: '', event_categories: TELEGRAM_CATEGORIES.map(([key]) => key) as string[], finding_severities: ['critical', 'high'] as string[] });
  const email = useQuery({ queryKey: ['email-integration'], queryFn: () => api.emailIntegration(token), enabled: Boolean(token && isAdmin) });
  const telegram = useQuery({ queryKey: ['telegram-integration'], queryFn: () => api.telegramIntegration(token), enabled: Boolean(token && isAdmin) });

  useEffect(() => {
    if (!email.data) return;
    setEmailDraft({ enabled: email.data.enabled, smtp_host: email.data.smtp_host, smtp_port: email.data.smtp_port, smtp_username: email.data.smtp_username, smtp_password: '', use_tls: email.data.use_tls, from_email: email.data.from_email, recipients: email.data.recipients.join(', '), event_categories: email.data.event_categories });
  }, [email.data]);

  useEffect(() => {
    if (!telegram.data) return;
    setTelegramDraft({ enabled: telegram.data.enabled, bot_token: '', chat_id: telegram.data.chat_id, event_categories: telegram.data.event_categories, finding_severities: telegram.data.finding_severities });
  }, [telegram.data]);

  const telegramSave = useMutation({
    mutationFn: () => api.updateTelegramIntegration(telegramDraft, token),
    onSuccess: async (result: TelegramIntegration) => {
      setTelegramDraft({ enabled: result.enabled, bot_token: '', chat_id: result.chat_id, event_categories: result.event_categories, finding_severities: result.finding_severities });
      await queryClient.invalidateQueries({ queryKey: ['telegram-integration'] });
      toast.success('Telegram notification channel saved');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save Telegram settings'),
  });
  const emailSave = useMutation({
    mutationFn: () => api.updateEmailIntegration({ ...emailDraft, recipients: emailDraft.recipients.split(',').map((item) => item.trim()).filter(Boolean) }, token),
    onSuccess: async (result: EmailIntegration) => {
      setEmailDraft({ enabled: result.enabled, smtp_host: result.smtp_host, smtp_port: result.smtp_port, smtp_username: result.smtp_username, smtp_password: '', use_tls: result.use_tls, from_email: result.from_email, recipients: result.recipients.join(', '), event_categories: result.event_categories });
      await queryClient.invalidateQueries({ queryKey: ['email-integration'] });
      toast.success('Email notification channel saved');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save email settings'),
  });
  const emailTest = useMutation({
    mutationFn: () => api.testEmailIntegration(token),
    onSuccess: (result) => toast.success(`Test email sent to ${result.recipient_count} recipient${result.recipient_count === 1 ? '' : 's'}`),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Email test failed'),
  });
  const telegramTest = useMutation({
    mutationFn: () => api.testTelegramIntegration(token),
    onSuccess: (result) => toast.success(`Test message sent${result.bot_username ? ` via @${result.bot_username}` : ''}`),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Telegram test failed'),
  });

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
      <PageHeader title="Notification Preferences" description="Choose activity alerts and configure email or Telegram delivery channels." actions={<Link href="/notifications"><Button variant="outline"><Bell className="h-4 w-4" /> Open Notifications</Button></Link>} />
      <div className="max-w-4xl space-y-6">

        <div className="grid gap-4 md:grid-cols-2">
          <Card className={email.data?.enabled ? 'border-[#155EEF]/30' : ''}>
            <CardContent className="flex items-start justify-between gap-4 p-5">
              <div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#155EEF] dark:bg-[#172638]"><Mail className="h-5 w-5" /></div><div><div className="flex items-center gap-2"><h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Email</h2><StatusBadge value={isAdmin ? (email.data?.enabled ? 'active' : email.data?.configured ? 'configured' : 'not configured') : 'admin managed'} /></div><p className="mt-1 text-xs text-[#667085] dark:text-[#94A3B8]">Organization-wide activity delivery through SMTP.</p></div></div>
            </CardContent>
          </Card>
          <Card className={telegram.data?.enabled ? 'border-[#229ED9]/40' : ''}>
            <CardContent className="flex items-start justify-between gap-4 p-5">
              <div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-[#229ED9] dark:bg-[#172638]"><Send className="h-5 w-5" /></div><div><div className="flex items-center gap-2"><h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Telegram</h2><StatusBadge value={isAdmin ? (telegram.data?.enabled ? 'active' : telegram.data?.configured ? 'configured' : 'not configured') : 'admin managed'} /></div><p className="mt-1 text-xs text-[#667085] dark:text-[#94A3B8]">Near-real-time platform activity through an organization bot.</p></div></div>
            </CardContent>
          </Card>
        </div>

        {isAdmin ? <Card>
          <CardHeader><div className="flex items-center gap-2"><Mail className="h-5 w-5 text-[#155EEF]" /><div><h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Email Server Configuration</h2><p className="mt-1 text-xs text-slate-500">Administrator-managed SMTP connection and recipients.</p></div></div></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-[#2A394D]"><div><p className="text-sm font-medium">Enable email activity alerts</p><p className="text-xs text-slate-500">Send selected audit activity every minute.</p></div><Toggle checked={emailDraft.enabled} onChange={(enabled) => setEmailDraft((current) => ({ ...current, enabled }))} /></div>
            <div className="grid gap-3 md:grid-cols-2"><Field label="SMTP host"><Input value={emailDraft.smtp_host} onChange={(event) => setEmailDraft((current) => ({ ...current, smtp_host: event.target.value }))} placeholder="smtp.example.com" /></Field><Field label="SMTP port"><Input type="number" min={1} max={65535} value={emailDraft.smtp_port} onChange={(event) => setEmailDraft((current) => ({ ...current, smtp_port: Number(event.target.value) }))} /></Field><Field label="SMTP username"><Input value={emailDraft.smtp_username} onChange={(event) => setEmailDraft((current) => ({ ...current, smtp_username: event.target.value }))} autoComplete="username" /></Field><Field label="SMTP password"><Input type="password" value={emailDraft.smtp_password} onChange={(event) => setEmailDraft((current) => ({ ...current, smtp_password: event.target.value }))} autoComplete="new-password" placeholder={email.data?.configured ? 'Password saved — enter only to replace' : 'SMTP password or app password'} /></Field><Field label="From address"><Input type="email" value={emailDraft.from_email} onChange={(event) => setEmailDraft((current) => ({ ...current, from_email: event.target.value }))} placeholder="security@example.com" /></Field><Field label="Recipients"><Input value={emailDraft.recipients} onChange={(event) => setEmailDraft((current) => ({ ...current, recipients: event.target.value }))} placeholder="soc@example.com, admin@example.com" /><p className="mt-1 text-xs text-slate-500">Separate multiple addresses with commas.</p></Field></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={emailDraft.use_tls} onChange={(event) => setEmailDraft((current) => ({ ...current, use_tls: event.target.checked }))} /> Use TLS/STARTTLS</label>
            <div><p className="mb-2 text-sm font-medium">Email activity categories</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{TELEGRAM_CATEGORIES.map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#2A394D]"><input type="checkbox" checked={emailDraft.event_categories.includes(key)} onChange={(event) => setEmailDraft((current) => ({ ...current, event_categories: event.target.checked ? [...current.event_categories, key] : current.event_categories.filter((item) => item !== key) }))} />{label}</label>)}</div></div>
            <div className="flex flex-wrap gap-2"><Button onClick={() => emailSave.mutate()} disabled={emailSave.isPending || !emailDraft.smtp_host.trim() || !emailDraft.from_email.trim() || !emailDraft.recipients.trim() || !emailDraft.event_categories.length}>{emailSave.isPending ? 'Saving...' : 'Save Email Channel'}</Button><Button variant="outline" onClick={() => emailTest.mutate()} disabled={emailTest.isPending || !email.data?.smtp_host || !email.data?.recipients.length}><Mail className="h-4 w-4" /> {emailTest.isPending ? 'Sending...' : 'Send Test Email'}</Button></div>
          </CardContent>
        </Card> : null}

        <Card className="hidden">
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

        {isAdmin ? <Card>
          <CardHeader><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Bot className="h-5 w-5 text-[#229ED9]" /><div><h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Telegram Bot Configuration</h2><p className="mt-1 text-xs text-[#667085] dark:text-[#94A3B8]">Administrator-managed delivery for organization activity.</p></div></div><Toggle checked={telegramDraft.enabled} onChange={(enabled) => setTelegramDraft((current) => ({ ...current, enabled }))} /></div></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Bot token"><Input type="password" autoComplete="new-password" value={telegramDraft.bot_token} onChange={(event) => setTelegramDraft((current) => ({ ...current, bot_token: event.target.value }))} placeholder={telegram.data?.configured ? 'Token saved — enter only to replace' : 'Token from @BotFather'} /><p className="mt-1 text-xs text-slate-500">Encrypted server-side and never displayed again.</p></Field>
              <Field label="Chat ID or @channel"><Input value={telegramDraft.chat_id} onChange={(event) => setTelegramDraft((current) => ({ ...current, chat_id: event.target.value }))} placeholder="-1001234567890 or @security_alerts" /><p className="mt-1 text-xs text-slate-500">The bot must be a member of the destination chat.</p></Field>
            </div>
            <div><p className="mb-2 text-sm font-medium text-[#102033] dark:text-[#F1F5F9]">Telegram activity categories</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{TELEGRAM_CATEGORIES.map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#2A394D]"><input type="checkbox" checked={telegramDraft.event_categories.includes(key)} onChange={(event) => setTelegramDraft((current) => ({ ...current, event_categories: event.target.checked ? [...current.event_categories, key] : current.event_categories.filter((item) => item !== key) }))} />{label}</label>)}</div></div>
            <div><p className="mb-2 text-sm font-medium text-[#102033] dark:text-[#F1F5F9]">Finding severities for triage alerts</p><div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{FINDING_SEVERITIES.map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#2A394D]"><input type="checkbox" checked={telegramDraft.finding_severities.includes(key)} onChange={(event) => setTelegramDraft((current) => ({ ...current, finding_severities: event.target.checked ? [...current.finding_severities, key] : current.finding_severities.filter((item) => item !== key) }))} />{label}</label>)}</div><p className="mt-1 text-xs text-slate-500">Only new finding events at the selected severities are sent. Workflow updates without a severity are still delivered.</p></div>
            <div className="flex flex-wrap gap-2"><Button onClick={() => telegramSave.mutate()} disabled={telegramSave.isPending || !telegramDraft.chat_id.trim() || !telegramDraft.event_categories.length || !telegramDraft.finding_severities.length}>{telegramSave.isPending ? 'Saving...' : 'Save Telegram Channel'}</Button><Button variant="outline" onClick={() => telegramTest.mutate()} disabled={telegramTest.isPending || !telegram.data?.configured || !telegram.data?.chat_id}><Send className="h-4 w-4" /> {telegramTest.isPending ? 'Sending...' : 'Send Test'}</Button><a href="https://core.telegram.org/bots/tutorial" target="_blank" rel="noreferrer"><Button variant="outline">Bot setup guide <ExternalLink className="h-4 w-4" /></Button></a></div>
          </CardContent>
        </Card> : <Card><CardContent className="flex gap-3 p-5"><Bot className="mt-0.5 h-5 w-5 text-[#229ED9]" /><div><p className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Telegram is administrator-managed</p><p className="mt-1 text-sm text-slate-500">Ask a system administrator to configure the organization bot and choose which platform activity is delivered.</p></div></CardContent></Card>}

        {GROUPS.map((group) => (
          <Card key={group.label} className={!prefs.email_enabled ? 'opacity-50' : ''}>
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
