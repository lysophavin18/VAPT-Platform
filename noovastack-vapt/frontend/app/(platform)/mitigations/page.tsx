'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock3, Download, Plus, RefreshCw, Search, ShieldCheck, Wrench, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { useMitigationMetrics, useMitigations } from '@/hooks/use-mitigations';
import { useProjects } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api-client';

const statuses = ['draft','pending_approval','approved','scheduled','in_progress','implemented','pending_verification','verification_failed','verified','closed','rejected','cancelled','risk_accepted'];
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : 'Not set';

export default function MitigationsPage() {
  const { token, user } = useAuth(); const projects = useProjects();
  const [search, setSearch] = useState(''); const [project, setProject] = useState(''); const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState(''); const [type, setType] = useState(''); const [sla, setSla] = useState(''); const [page, setPage] = useState(1);
  const query = useMemo(() => { const q = new URLSearchParams({ page: String(page), page_size: '25' }); if (search) q.set('search', search); if (project) q.set('project_id', project); if (severity) q.set('severity', severity); if (status) q.set('status', status); if (type) q.set('mitigation_type', type); if (sla) q.set('sla_state', sla); return `?${q}`; }, [page, project, search, severity, sla, status, type]);
  const plans = useMitigations(query); const metrics = useMitigationMetrics(); const canCreate = user?.role !== 'viewer';
  const clear = () => { setSearch(''); setProject(''); setSeverity(''); setStatus(''); setType(''); setSla(''); setPage(1); };
  const m = metrics.data;
  return <>
    <PageHeader title="Mitigation Management" description="Plan, approve, implement, monitor, and verify security risk mitigation across all VAPT projects." actions={<><Button variant="outline" onClick={() => api.exportMitigations(token)}><Download className="h-4 w-4" /> Export CSV</Button>{canCreate ? <Link href="/mitigations/new"><Button><Plus className="h-4 w-4" /> New Mitigation Plan</Button></Link> : null}</>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <Metric label="Open Mitigations" value={m?.open} icon={<ShieldCheck />} />
      <Metric label="Awaiting Approval" value={m?.awaiting_approval} icon={<Clock3 />} />
      <Metric label="In Implementation" value={m?.in_implementation} icon={<Wrench />} />
      <Metric label="Awaiting Verification" value={m?.awaiting_verification} icon={<Search />} />
      <Metric label="Overdue" value={m?.overdue} icon={<AlertTriangle />} tone="danger" />
      <Metric label="Verified / Completed" value={m?.completed} icon={<CheckCircle2 />} tone="success" />
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <Stat label="Critical without mitigation" value={m?.critical_without_mitigation} />
      <Stat label="Avg. implementation" value={`${m?.average_implementation_hours ?? 0}h`} />
      <Stat label="High-risk effective" value={`${m?.effective_high_risk_percent ?? 0}%`} />
      <Stat label="SLA compliance" value={`${m?.sla_compliance_percent ?? 0}%`} />
      <Stat label="Expiring temporary" value={m?.expiring_temporary} />
      <Stat label="Failed verification" value={m?.failed_verification} />
      <Stat label="Accepted risks" value={m?.accepted_risks} />
    </div>

    <Card className="mt-6">
      <CardHeader><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Mitigation Queue</h2><p className="mt-1 text-sm text-slate-500">{plans.data?.total ?? 0} plans across authorized projects</p></div><Button variant="outline" onClick={() => { plans.refetch(); metrics.refetch(); }}><RefreshCw className={`h-4 w-4 ${plans.isFetching ? 'animate-spin' : ''}`} /> Refresh</Button></div></CardHeader>
      <CardContent>
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-2 xl:grid-cols-7 dark:border-[#2A394D] dark:bg-[#101927]">
          <label className="relative xl:col-span-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" placeholder="Mitigation ID or finding title" /></label>
          <Select value={project} onChange={e => { setProject(e.target.value); setPage(1); }}><option value="">All projects</option>{(projects.data ?? []).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
          <Select value={severity} onChange={e => setSeverity(e.target.value)}><option value="">All severities</option>{['critical','high','medium','low'].map(x => <option key={x}>{x}</option>)}</Select>
          <Select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map(x => <option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</Select>
          <Select value={type} onChange={e => setType(e.target.value)}><option value="">All types</option>{['temporary','permanent','compensating'].map(x => <option key={x}>{x}</option>)}</Select>
          <div className="flex gap-2"><Select value={sla} onChange={e => setSla(e.target.value)}><option value="">All SLA states</option><option value="on_track">On track</option><option value="due_soon">Due soon</option><option value="overdue">Overdue</option></Select><Button variant="outline" onClick={clear}><X className="h-4 w-4" /></Button></div>
        </div>
        {plans.isError ? <State title="Unable to load mitigations" text={plans.error instanceof Error ? plans.error.message : 'Try refreshing the page.'} /> : plans.isLoading ? <State title="Loading mitigation queue" text="Retrieving current workflow and SLA data…" /> : !plans.data?.items.length ? <State title="No mitigation plans found" text="Create a plan from a confirmed finding or adjust the filters." /> : <div className="mt-5 overflow-x-auto"><table className="min-w-[1450px] text-left text-sm"><thead className="text-slate-500"><tr><th className="py-2">Mitigation ID</th><th>Finding</th><th>Project</th><th>Asset</th><th>Severity</th><th>Type / Strategy</th><th>Owner</th><th>Status</th><th>SLA Deadline</th><th>Verification</th><th>Actions</th></tr></thead><tbody>{plans.data.items.map(row => <tr key={row.id} className="border-t border-slate-100 align-top dark:border-[#253348]"><td className="py-3 pr-4"><Link href={`/mitigations/${row.id}`} className="font-semibold text-[#155EEF] hover:underline">{row.mitigation_id}</Link><p className="mt-1 max-w-52 text-xs text-slate-500">{row.title}</p></td><td className="max-w-64 pr-4">{row.finding_id ? <Link className="font-medium hover:underline" href={`/findings/${row.finding_id}`}>{row.finding_title}</Link> : 'Not linked'}</td><td className="pr-4">{row.project_name}</td><td className="max-w-52 pr-4">{row.assets.map(x => x.name).join(', ') || 'Project-wide'}</td><td className="pr-4"><SeverityBadge value={row.severity} /></td><td className="pr-4 capitalize">{row.mitigation_type}<p className="text-xs text-slate-500">{row.strategy.replaceAll('_',' ')}</p></td><td className="pr-4">{row.owner?.name || 'Unassigned'}</td><td className="pr-4"><StatusBadge value={row.status} />{row.blocked ? <p className="mt-1 text-xs text-amber-600">Blocked</p> : null}</td><td className="pr-4"><span className={row.overdue ? 'font-semibold text-red-600' : ''}>{formatDate(row.sla_deadline)}</span><p className="text-xs capitalize text-slate-500">{row.sla_state.replaceAll('_',' ')}</p></td><td className="pr-4"><StatusBadge value={row.verification_outcome || 'not requested'} /></td><td><Link href={`/mitigations/${row.id}`}><Button variant="outline">View Details</Button></Link></td></tr>)}</tbody></table></div>}
        {(plans.data?.total_pages ?? 0) > 1 ? <div className="mt-5 flex items-center justify-end gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(x => x - 1)}>Previous</Button><span className="text-sm">Page {page} of {plans.data?.total_pages}</span><Button variant="outline" disabled={page >= (plans.data?.total_pages ?? 1)} onClick={() => setPage(x => x + 1)}>Next</Button></div> : null}
      </CardContent>
    </Card>
  </>;
}
function Metric({ label, value, icon, tone }: { label: string; value?: number; icon: React.ReactElement; tone?: string }) { return <Card className="p-4"><div className={`flex items-center gap-2 text-sm ${tone === 'danger' ? 'text-red-600' : tone === 'success' ? 'text-emerald-600' : 'text-slate-500'}`}>{<span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>}{label}</div><p className="mt-2 text-3xl font-bold text-[#0B1F3A] dark:text-white">{value ?? '—'}</p></Card>; }
function Stat({ label, value }: { label: string; value?: string | number }) { return <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2A394D] dark:bg-[#101927]"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold">{value ?? '—'}</p></div>; }
function State({ title, text }: { title: string; text: string }) { return <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-10 text-center"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-slate-500">{text}</p></div>; }
