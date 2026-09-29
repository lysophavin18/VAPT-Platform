'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, Bell, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Globe2, Info, Pause, Play, Plus, RefreshCw, Shield, Trash2, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { ProjectPicker } from '@/components/shared/project-picker';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import { formatDate } from '@/lib/utils';
import type { DomainMonitor, DomainMonitorEvent } from '@/types';

// ─── helpers ────────────────────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
  new_subdomain:       { label: 'New Subdomain',       icon: Plus,          color: 'text-amber-600 bg-amber-50' },
  removed_subdomain:   { label: 'Subdomain Gone',      icon: XCircle,       color: 'text-slate-500 bg-slate-50' },
  ip_changed:          { label: 'IP Changed',           icon: AlertTriangle, color: 'text-orange-600 bg-orange-50' },
  port_added:          { label: 'Port Opened',          icon: Shield,        color: 'text-amber-600 bg-amber-50' },
  port_removed:        { label: 'Port Closed',          icon: Shield,        color: 'text-slate-500 bg-slate-50' },
  tech_changed:        { label: 'Tech Stack Changed',   icon: Activity,      color: 'text-blue-600 bg-blue-50' },
  status_code_changed: { label: 'HTTP Status Changed',  icon: Info,          color: 'text-blue-500 bg-blue-50' },
  new_asset:           { label: 'New Asset',            icon: Globe2,        color: 'text-emerald-600 bg-emerald-50' },
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning:  'bg-amber-100 text-amber-700 border-amber-200',
  info:     'bg-blue-100 text-blue-700 border-blue-200',
};

const INTERVAL_OPTIONS = [
  { value: 6,   label: 'Every 6 hours' },
  { value: 12,  label: 'Every 12 hours' },
  { value: 24,  label: 'Daily' },
  { value: 48,  label: 'Every 2 days' },
  { value: 168, label: 'Weekly' },
];

const DISCOVERY_MODULE_LABELS: Record<string, string> = {
  subdomain_enum: 'Subdomain Enum',
  dns_enum: 'DNS Records',
  host_probe: 'Port Scan',
  tech_fingerprint: 'Tech Fingerprint',
};

function EventRow({ event, onAck }: { event: DomainMonitorEvent; onAck: () => void }) {
  const meta = EVENT_META[event.event_type] ?? { label: event.event_type, icon: Info, color: 'text-slate-500 bg-slate-50' };
  const Icon = meta.icon;
  const isAcked = Boolean(event.acknowledged_at);

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 transition ${isAcked ? 'opacity-50' : ''} ${SEVERITY_COLOR[event.severity] ?? 'bg-slate-50 border-slate-200'}`}>
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{meta.label}</span>
          {event.asset_value && (
            <code className="rounded bg-white/60 px-1.5 py-0.5 font-mono text-xs">{event.asset_value}</code>
          )}
          <span className="ml-auto text-xs opacity-70">{formatDate(event.detected_at)}</span>
        </div>
        <p className="mt-0.5 text-xs">{event.summary}</p>
        {event.details && Object.keys(event.details).length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs opacity-60">Details</summary>
            <pre className="mt-1 overflow-x-auto rounded bg-white/40 p-2 text-xs">
              {JSON.stringify(event.details, null, 2)}
            </pre>
          </details>
        )}
      </div>
      {!isAcked && (
        <button
          onClick={onAck}
          className="shrink-0 rounded p-1 opacity-60 hover:opacity-100"
          title="Acknowledge"
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function MonitorCard({
  monitor,
  onCheckNow,
  onToggle,
  onDelete,
  onAckEvent,
}: {
  monitor: DomainMonitor;
  onCheckNow: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onAckEvent: (eventId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const unacked = monitor.events.filter(e => !e.acknowledged_at);
  const warnings = unacked.filter(e => e.severity !== 'info');

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <button onClick={() => setExpanded(x => !x)} className="flex items-center gap-2 text-left">
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          <Globe2 className="h-5 w-5 text-[#155EEF]" />
          <div>
            <p className="font-semibold text-[#0B1F3A]">{monitor.domain}</p>
            {monitor.label && <p className="text-xs text-slate-500">{monitor.label}</p>}
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {/* Unacked warning badge */}
          {warnings.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Bell className="h-3 w-3" />
              {warnings.length} alert{warnings.length !== 1 ? 's' : ''}
            </span>
          )}
          {unacked.length > 0 && warnings.length === 0 && (
            <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              <Info className="h-3 w-3" />
              {unacked.length} new
            </span>
          )}

          {/* Status */}
          <StatusBadge value={monitor.status} />

          {/* Last checked */}
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="h-3 w-3" />
            {monitor.last_checked_at ? formatDate(monitor.last_checked_at) : 'Never checked'}
          </span>

          {/* Actions */}
          <button
            onClick={onCheckNow}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            title="Check now"
          >
            <RefreshCw className="h-3 w-3 inline mr-1" />
            Check now
          </button>
          <button
            onClick={onToggle}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            title={monitor.status === 'active' ? 'Pause' : 'Resume'}
          >
            {monitor.status === 'active'
              ? <Pause className="h-3 w-3 inline" />
              : <Play className="h-3 w-3 inline" />}
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
            title="Stop & delete"
          >
            <Trash2 className="h-3 w-3 inline" />
          </button>
        </div>
      </div>

      {/* Expanded: modules + events */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5">
          <div className="mt-4 flex flex-wrap gap-2">
            {monitor.discovery_types.map(t => (
              <span key={t} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {DISCOVERY_MODULE_LABELS[t] ?? t}
              </span>
            ))}
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
              every {monitor.check_interval_hours}h
            </span>
            {monitor.next_check_at && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
                next: {formatDate(monitor.next_check_at)}
              </span>
            )}
          </div>

          <h4 className="mt-5 mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Change Events ({monitor.events.length})
          </h4>

          {monitor.events.length === 0 ? (
            <p className="text-sm text-slate-400">No changes detected yet — first check will run soon.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {monitor.events.slice(0, 50).map(ev => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  onAck={() => onAckEvent(ev.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Monitor Form ────────────────────────────────────────────────────────

function AddMonitorForm({
  projectId,
  token,
  onAdded,
}: {
  projectId: string;
  token: string | null | undefined;
  onAdded: () => void;
}) {
  const [domain, setDomain] = useState('');
  const [label, setLabel] = useState('');
  const [interval, setInterval] = useState(24);
  const [modules, setModules] = useState(['subdomain_enum', 'dns_enum', 'tech_fingerprint']);
  const [loading, setLoading] = useState(false);

  function toggleModule(m: string) {
    setModules(cur => cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) { toast.error('Enter a domain to monitor'); return; }
    setLoading(true);
    try {
      await api.createDomainMonitor(projectId, {
        domain: domain.trim().toLowerCase(),
        label: label.trim() || undefined,
        check_interval_hours: interval,
        discovery_types: modules,
      }, token);
      toast.success(`Now monitoring ${domain.trim()}`);
      setDomain('');
      setLabel('');
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add monitor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Domain">
          <Input
            placeholder="bill24.io"
            value={domain}
            onChange={e => setDomain(e.target.value)}
          />
        </Field>
        <Field label="Label (optional)">
          <Input
            placeholder="Production, Staging…"
            value={label}
            onChange={e => setLabel(e.target.value)}
          />
        </Field>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Check Interval</label>
        <div className="flex flex-wrap gap-2">
          {INTERVAL_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setInterval(opt.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                interval === opt.value
                  ? 'border-[#155EEF] bg-[#EAF2FF] font-medium text-[#155EEF]'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Discovery Modules</label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(DISCOVERY_MODULE_LABELS).map(([id, label]) => (
            <label
              key={id}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${
                modules.includes(id)
                  ? 'border-[#155EEF] bg-[#EAF2FF] text-[#155EEF]'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <input
                type="checkbox"
                className="accent-[#155EEF]"
                checked={modules.includes(id)}
                onChange={() => toggleModule(id)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={loading || !projectId}>
        {loading ? 'Adding…' : 'Start Monitoring'}
      </Button>
    </form>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function DomainMonitoringPage() {
  const { token } = useAuth();
  const projects = useProjects();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const monitors = useQuery({
    queryKey: ['domain-monitors', projectId],
    queryFn: () => api.domainMonitors(projectId, token),
    enabled: Boolean(projectId && token),
    refetchInterval: 30_000,
  });

  const list: DomainMonitor[] = monitors.data ?? [];
  const totalAlerts = list.reduce((n, m) => n + m.events.filter(e => !e.acknowledged_at && e.severity !== 'info').length, 0);
  const activeCount = list.filter(m => m.status === 'active').length;

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ['domain-monitors', projectId] });
  }

  async function handleCheckNow(id: string) {
    try {
      const res = await api.triggerDomainMonitorCheck(id, token);
      toast.success(res.message);
    } catch { toast.error('Failed to trigger check'); }
  }

  async function handleToggle(monitor: DomainMonitor) {
    const next = monitor.status === 'active' ? 'paused' : 'active';
    try {
      await api.updateDomainMonitor(monitor.id, { status: next }, token);
      toast.success(`Monitor ${next}`);
      refetch();
    } catch { toast.error('Update failed'); }
  }

  async function handleDelete(monitor: DomainMonitor) {
    if (!confirm(`Stop monitoring ${monitor.domain}? This will delete all change history.`)) return;
    try {
      await api.deleteDomainMonitor(monitor.id, token);
      toast.success(`Stopped monitoring ${monitor.domain}`);
      refetch();
    } catch { toast.error('Delete failed'); }
  }

  async function handleAckEvent(monitorId: string, eventId: string) {
    try {
      await api.ackDomainMonitorEvent(monitorId, eventId, token);
      refetch();
    } catch { toast.error('Acknowledge failed'); }
  }

  return <>
    <PageHeader
      title="Domain Monitoring"
      description="Continuously watch domains for new subdomains, IP changes, technology updates, and open ports."
      breadcrumbs={[{ href: '/assets', label: 'Assets' }, { label: 'Monitoring' }]}
      actions={
        <Button onClick={() => setShowAdd(v => !v)} disabled={!projectId}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Domain
        </Button>
      }
    />

    {/* Summary */}
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
      <SummaryTile label="Monitored Domains" value={list.length} icon={Globe2} />
      <SummaryTile label="Active" value={activeCount} icon={Activity} accent />
      <SummaryTile label="Unacked Alerts" value={totalAlerts} icon={AlertTriangle} warn={totalAlerts > 0} />
      <SummaryTile label="Total Events" value={list.reduce((n, m) => n + m.events.length, 0)} icon={Bell} />
    </div>

    {/* Project picker + Add form */}
    <Card className="mb-6 p-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <ProjectPicker projects={projects.data ?? []} value={projectId} onChange={setProjectId} />
        </div>
        <Button
          variant="outline"
          onClick={() => monitors.refetch()}
          disabled={!projectId || monitors.isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${monitors.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {showAdd && projectId && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <h3 className="mb-4 font-semibold text-[#0B1F3A]">Add Domain to Monitor</h3>
          <AddMonitorForm
            projectId={projectId}
            token={token}
            onAdded={() => { setShowAdd(false); refetch(); }}
          />
        </div>
      )}
    </Card>

    {/* Monitor list */}
    {!projectId && (
      <Card className="p-8 text-center text-slate-500">
        Select a project to view and manage domain monitors.
      </Card>
    )}

    {projectId && monitors.isLoading && (
      <p className="text-sm text-slate-500">Loading monitors…</p>
    )}

    {projectId && !monitors.isLoading && list.length === 0 && (
      <Card className="p-8 text-center">
        <Globe2 className="mx-auto h-10 w-10 text-slate-300 mb-3" />
        <p className="font-semibold text-[#0B1F3A]">No domains monitored yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Click <strong>Add Domain</strong> above and enter a domain like <code>bill24.io</code>.
        </p>
      </Card>
    )}

    {list.length > 0 && (
      <div className="space-y-4">
        {list.map(monitor => (
          <MonitorCard
            key={monitor.id}
            monitor={monitor}
            onCheckNow={() => handleCheckNow(monitor.id)}
            onToggle={() => handleToggle(monitor)}
            onDelete={() => handleDelete(monitor)}
            onAckEvent={eventId => handleAckEvent(monitor.id, eventId)}
          />
        ))}
      </div>
    )}
  </>;
}

function SummaryTile({
  label, value, icon: Icon, accent, warn,
}: {
  label: string; value: number; icon: typeof Globe2; accent?: boolean; warn?: boolean;
}) {
  const color = warn ? 'border-amber-200 bg-amber-50' : accent ? 'border-[#155EEF] bg-[#EAF2FF]' : 'border-slate-200 bg-slate-50';
  const textColor = warn ? 'text-amber-600' : accent ? 'text-[#155EEF]' : 'text-[#0B1F3A]';
  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${textColor}`} />
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <p className={`mt-2 text-3xl font-bold ${textColor}`}>{value}</p>
    </div>
  );
}
