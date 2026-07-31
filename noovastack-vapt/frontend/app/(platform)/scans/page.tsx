'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, CheckCircle2, Clock, FileText, Pause, Plus, Search, ShieldCheck, Siren, Smartphone } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/tables/data-table';
import { ConfirmationDialog } from '@/components/feedback/confirmation-dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { useScanActions, useScans } from '@/hooks/use-scans';
import { formatDate, titleCase } from '@/lib/utils';
import type { Scan } from '@/types';

const statusTabs = ['all', 'running', 'completed', 'draft', 'attention'] as const;
const scanTypes = ['all', 'vulnerability_scan', 'website', 'api_security', 'network', 'container'] as const;

export default function ScansPage() {
  const scans = useScans();
  const actions = useScanActions();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<(typeof statusTabs)[number]>('all');
  const [type, setType] = useState<(typeof scanTypes)[number]>('all');
  const data = scans.data ?? [];

  const stats = useMemo(() => buildStats(data), [data]);
  const filtered = useMemo(() => data.filter((scan) => {
    const text = `${scan.name} ${scan.scan_category} ${scan.scan_depth} ${scan.status}`.toLowerCase();
    const matchesQuery = text.includes(query.toLowerCase());
    const matchesStatus = status === 'all' || (status === 'attention' ? attentionStatuses.has(scan.status) : scan.status === status);
    const matchesType = type === 'all' || scan.scan_category === type;
    return matchesQuery && matchesStatus && matchesType;
  }), [data, query, status, type]);

  return <>
    <PageHeader
      title="Scans"
      description="A live scan workbench for launching, monitoring, and reviewing security assessments."
      actions={<Link href="/scans/new"><Button><Plus className="h-4 w-4" /> New Scan</Button></Link>}
    />
    <div className="space-y-6">
      <ScanHero stats={stats} />
      <ScanStats stats={stats} />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search scans by name, type, depth, or status" className="pl-9" />
          </div>
          <Link href="/scans/new"><Button variant="secondary"><ShieldCheck className="h-4 w-4" /> Start From Template</Button></Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {statusTabs.map((item) => <FilterChip key={item} active={status === item} onClick={() => setStatus(item)} label={item === 'attention' ? `Attention (${stats.attention})` : `${titleCase(item)} (${statusCount(item, stats)})`} />)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {scanTypes.map((item) => <FilterChip key={item} active={type === item} onClick={() => setType(item)} label={typeLabel(item)} />)}
        </div>
      </div>
      {filtered.length ? <>
        <div className="hidden md:block"><DataTable<Scan>
          data={filtered}
          columns={[
            { key: 'name', header: 'Scan', render: (scan) => <ScanName scan={scan} /> },
            { key: 'type', header: 'Template', render: (scan) => <div><p className="font-semibold text-[#0F172A]">{scanTypeName(scan.scan_category)}</p><p className="mt-1 text-xs text-[#64748B]">{accessLabel(scan.assessment_mode)}</p></div> },
            { key: 'depth', header: 'Intensity', render: (scan) => titleCase(scan.scan_depth) },
            { key: 'status', header: 'Status', render: (scan) => <StatusBadge value={scan.status} /> },
            { key: 'progress', header: 'Progress', render: (scan) => <div className="min-w-32"><ProgressBar value={scan.progress} /><p className="mt-1 text-xs text-[#64748B]">{scan.progress}% complete</p></div> },
            { key: 'started', header: 'Timeline', render: (scan) => <div className="text-xs text-[#64748B]"><p>Created: {formatDate(scan.created_at)}</p><p className="mt-1">Started: {formatDate(scan.started_at)}</p></div> },
            { key: 'actions', header: 'Actions', render: (scan) => <ScanActions scan={scan} actions={actions} /> },
          ]}
        /></div>
        <div className="grid gap-4 md:hidden">{filtered.map((scan) => <MobileScanCard key={scan.id} scan={scan} actions={actions} />)}</div>
      </> : <EmptyState icon={Siren} title={data.length ? 'No scans match your filters' : 'No scans yet'} description={data.length ? 'Try clearing the search or changing the status/type filters.' : 'Use the template-based scan flow to choose a target, keep safe defaults, and start checking in a few clicks.'} action="Start Scan" href="/scans/new" />}
    </div>
  </>;
}

const attentionStatuses = new Set(['failed', 'blocked', 'cancelled', 'killed', 'stopped_by_safety_control', 'pending_review']);

function buildStats(scans: Scan[]) {
  return {
    total: scans.length,
    running: scans.filter((scan) => scan.status === 'running').length,
    completed: scans.filter((scan) => scan.status === 'completed').length,
    draft: scans.filter((scan) => scan.status === 'draft').length,
    attention: scans.filter((scan) => attentionStatuses.has(scan.status)).length,
    averageProgress: scans.length ? Math.round(scans.reduce((sum, scan) => sum + (scan.progress || 0), 0) / scans.length) : 0,
  };
}

function statusCount(status: (typeof statusTabs)[number], stats: ReturnType<typeof buildStats>) {
  if (status === 'all') return stats.total;
  return stats[status];
}

function ScanHero({ stats }: { stats: ReturnType<typeof buildStats> }) {
  return <div className="overflow-hidden rounded-3xl bg-[#0B1F3A] p-5 text-white shadow-soft sm:p-6"><div className="grid gap-6 lg:grid-cols-[1fr_auto]"><div><div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-blue-100"><Smartphone className="h-3.5 w-3.5" /> Dynamic Web Interface</div><h2 className="mt-3 text-2xl font-bold">Monitor every assessment from one place</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100">Use filters to focus on active work, completed results, drafts, or scans needing attention. The layout adapts for desktop and phone screens.</p></div><div className="grid grid-cols-2 gap-3 text-sm lg:min-w-64"><HeroMetric label="Active" value={stats.running} /><HeroMetric label="Avg progress" value={`${stats.averageProgress}%`} /></div></div></div>;
}

function HeroMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-blue-100">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value}</p></div>;
}

function ScanStats({ stats }: { stats: ReturnType<typeof buildStats> }) {
  const cards = [
    { label: 'Total scans', value: stats.total, icon: Activity, tone: 'blue' },
    { label: 'Running', value: stats.running, icon: Clock, tone: 'amber' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle2, tone: 'green' },
    { label: 'Needs attention', value: stats.attention, icon: AlertTriangle, tone: 'red' },
  ];
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map((card) => { const Icon = card.icon; return <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-[#64748B]">{card.label}</p><span className={statIconClass(card.tone)}><Icon className="h-5 w-5" /></span></div><p className="mt-4 text-3xl font-bold text-[#0F172A]">{card.value}</p></div>; })}</div>;
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${active ? 'border-[#155EEF] bg-blue-50 text-[#155EEF]' : 'border-slate-200 bg-white text-[#64748B] hover:border-[#155EEF]/50'}`}>{label}</button>;
}

function ScanName({ scan }: { scan: Scan }) {
  const isActive = ['running', 'pending', 'queued', 'preparing'].includes(scan.status);
  return <div><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-green-500' : attentionStatuses.has(scan.status) ? 'bg-red-500' : 'bg-slate-300'}`} /><Link href={`/scans/${scan.id}`} className="font-semibold text-[#155EEF]">{scan.name}</Link></div><div className="mt-2 flex flex-wrap gap-2 text-xs"><Link href={`/scans/${scan.id}/progress`} className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Progress</Link><Link href={`/scans/${scan.id}/process`} className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Process</Link><Link href={`/scans/${scan.id}/results`} className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Results</Link></div></div>;
}

function MobileScanCard({ scan, actions }: { scan: Scan; actions: ReturnType<typeof useScanActions> }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="truncate font-semibold text-[#155EEF]"><Link href={`/scans/${scan.id}`}>{scan.name}</Link></p><p className="mt-1 text-xs text-[#64748B]">{scanTypeName(scan.scan_category)} · {titleCase(scan.scan_depth)} · {accessLabel(scan.assessment_mode)}</p></div>
      <StatusBadge value={scan.status} />
    </div>
    <div className="mt-4"><ProgressBar value={scan.progress} /><p className="mt-1 text-xs text-[#64748B]">{scan.progress}% complete</p></div>
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-xs text-[#64748B]"><div><p className="font-semibold text-[#0F172A]">Created</p><p className="mt-1">{formatDate(scan.created_at)}</p></div><div><p className="font-semibold text-[#0F172A]">Started</p><p className="mt-1">{formatDate(scan.started_at)}</p></div></div>
    <div className="mt-4 flex flex-wrap gap-2 text-xs"><Link href={`/scans/${scan.id}/progress`} className="rounded-full bg-blue-50 px-3 py-2 font-semibold text-[#155EEF]">Progress</Link><Link href={`/scans/${scan.id}/process`} className="rounded-full bg-blue-50 px-3 py-2 font-semibold text-[#155EEF]">Process</Link><Link href={`/scans/${scan.id}/results`} className="rounded-full bg-blue-50 px-3 py-2 font-semibold text-[#155EEF]">Results</Link></div>
    <div className="mt-4"><ScanActions scan={scan} actions={actions} /></div>
  </article>;
}

function ScanActions({ scan, actions }: { scan: Scan; actions: ReturnType<typeof useScanActions> }) {
  return <div className="flex flex-wrap gap-2">
    {scan.status === 'completed' ? <Link href={`/scans/${scan.id}/results`}><Button variant="secondary"><FileText className="h-4 w-4" /> Results</Button></Link> : null}
    {scan.status === 'draft' ? <Button variant="secondary" onClick={() => actions.mutate({ id: scan.id, action: 'start' })}>Start</Button> : null}
    {scan.status === 'running' ? <Button variant="outline" onClick={() => actions.mutate({ id: scan.id, action: 'pause' })}><Pause className="h-4 w-4" /> Pause</Button> : null}
    {scan.status !== 'completed' && scan.status !== 'cancelled' && scan.status !== 'failed' ? <ConfirmationDialog title="Emergency Stop" description="This immediately stops the scan task. Use it only if a scan may affect availability, scope, or production data." confirmLabel="Emergency Stop" requireText="STOP" danger onConfirm={() => actions.mutate({ id: scan.id, action: 'kill' })} /> : null}
  </div>;
}

function scanTypeName(value: string) {
  const labels: Record<string, string> = { vulnerability_scan: 'Vulnerability Scan', website: 'Web Application', api_security: 'API', api: 'API', network: 'Network', container: 'Container' };
  return labels[value] ?? titleCase(value);
}

function accessLabel(value: string) {
  if (value === 'black_box') return 'Unauthenticated';
  if (value === 'gray_box') return 'Authenticated';
  if (value === 'white_box') return 'Internal Review';
  return titleCase(value);
}

function typeLabel(value: (typeof scanTypes)[number]) {
  return value === 'all' ? 'All templates' : scanTypeName(value);
}

function statIconClass(tone: string) {
  const tones: Record<string, string> = { blue: 'rounded-xl bg-blue-50 p-2 text-[#155EEF]', amber: 'rounded-xl bg-amber-50 p-2 text-amber-600', green: 'rounded-xl bg-green-50 p-2 text-green-600', red: 'rounded-xl bg-red-50 p-2 text-red-600' };
  return tones[tone] ?? tones.blue;
}
