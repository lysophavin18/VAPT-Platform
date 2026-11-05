'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, PackageCheck, Plus, RotateCcw, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { useAssets } from '@/hooks/use-assets';
import { useAuth } from '@/hooks/use-auth';
import { usePatchActions, usePatches } from '@/hooks/use-patches';
import { useProjects } from '@/hooks/use-projects';
import { formatDate } from '@/lib/utils';
import type { PatchRecord } from '@/types';

const statuses = ['draft', 'review', 'approved', 'scheduled', 'deploying', 'verification', 'completed', 'blocked', 'failed', 'rollback_required', 'rolled_back', 'rejected'];
const priorities = ['critical', 'high', 'medium', 'low'];
const priorityRank = new Map(priorities.map((value, index) => [value, index]));
const transitions: Record<string, Array<[string, string]>> = {
  draft: [['review', 'Submit for review']], review: [['approved', 'Approve'], ['rejected', 'Reject']],
  approved: [['scheduled', 'Schedule'], ['blocked', 'Block']], scheduled: [['deploying', 'Start deployment'], ['blocked', 'Block']],
  deploying: [['verification', 'Send to verification'], ['failed', 'Mark failed'], ['rollback_required', 'Require rollback']],
  verification: [['completed', 'Verify complete'], ['failed', 'Verification failed'], ['rollback_required', 'Require rollback']],
  failed: [['scheduled', 'Reschedule'], ['rollback_required', 'Require rollback']], blocked: [['approved', 'Unblock']],
  rollback_required: [['rolled_back', 'Confirm rollback']], rolled_back: [['scheduled', 'Reschedule']], rejected: [['draft', 'Return to draft']],
};

const emptyForm = { project_id: '', asset_id: '', cve_id: '', title: '', package_name: '', installed_version: '', fixed_version: '', priority: 'medium', due_at: '', remediation: '', rollback_plan: '' };

export default function PatchManagementPage() {
  const { user } = useAuth();
  const patches = usePatches();
  const projects = useProjects();
  const actions = usePatchActions();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const assets = useAssets(form.project_id || undefined);
  const [selected, setSelected] = useState<PatchRecord | null>(null);
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState('all');
  const [priority, setPriority] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('priority');
  const rows = patches.data ?? [];
  const canManage = ['admin', 'manager', 'security_team'].includes(user?.role ?? '');
  const metrics = useMemo(() => ({
    critical: rows.filter((row) => row.priority === 'critical' && row.status !== 'completed').length,
    approval: rows.filter((row) => row.status === 'review').length,
    scheduled: rows.filter((row) => row.status === 'scheduled').length,
    verification: rows.filter((row) => row.status === 'verification').length,
    failed: rows.filter((row) => ['failed', 'rollback_required'].includes(row.status)).length,
    completed: rows.filter((row) => row.status === 'completed').length,
  }), [rows]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => (!needle || [row.title, row.project_name, row.asset_value, row.cve_id, row.package_name, row.finding_title, row.finding_status].some((value) => String(value ?? '').toLowerCase().includes(needle)))
      && (projectId === 'all' || row.project_id === projectId)
      && (priority === 'all' || row.priority === priority)
      && (status === 'all' || row.status === status))
      .sort((a, b) => sort === 'priority' ? (priorityRank.get(a.priority) ?? 9) - (priorityRank.get(b.priority) ?? 9) : sort === 'project' ? a.project_name.localeCompare(b.project_name) : sort === 'deadline' ? new Date(a.due_at ?? '9999-12-31').getTime() - new Date(b.due_at ?? '9999-12-31').getTime() : new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime());
  }, [priority, projectId, query, rows, sort, status]);
  const hasFilters = Boolean(query || projectId !== 'all' || priority !== 'all' || status !== 'all' || sort !== 'priority');

  async function createPatch() {
    if (!form.project_id || !form.title.trim()) return toast.error('Project and patch title are required');
    try {
      await actions.create.mutateAsync({ ...form, asset_id: form.asset_id || null, cve_id: form.cve_id || null, due_at: form.due_at || null });
      setForm(emptyForm); setShowCreate(false); toast.success('Patch plan created');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to create patch'); }
  }

  async function transition(row: PatchRecord, target: string) {
    const payload: Record<string, unknown> = {};
    if (target === 'verification') {
      const evidence = window.prompt('Deployment evidence or change-ticket reference');
      if (!evidence?.trim()) return;
      payload.deployment_evidence = { summary: evidence.trim(), recorded_by: user?.email };
    }
    if (['rejected', 'blocked', 'failed', 'rollback_required'].includes(target)) {
      const reason = window.prompt(`Reason for ${target.replaceAll('_', ' ')}`);
      if (!reason?.trim()) return;
      payload.reason = reason.trim();
    }
    try { const saved = await actions.transition.mutateAsync({ id: row.id, status: target, payload }); setSelected(saved); toast.success(`Patch moved to ${target.replaceAll('_', ' ')}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Patch transition failed'); }
  }

  return <>
    <PageHeader title="Patch Management" description="Plan, approve, schedule, evidence, and verify remediation without permitting arbitrary remote commands." actions={<><Button variant="outline" disabled={actions.syncFindings.isPending} onClick={async () => { try { const result = await actions.syncFindings.mutateAsync(); toast.success(`${result.created} patch plan${result.created === 1 ? '' : 's'} created; ${result.skipped_existing} already linked`); } catch (error) { toast.error(error instanceof Error ? error.message : 'Finding synchronization failed'); } }}><RotateCcw className={`h-4 w-4 ${actions.syncFindings.isPending ? 'animate-spin' : ''}`} /> {actions.syncFindings.isPending ? 'Syncing...' : 'Sync Findings'}</Button><Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New Patch Plan</Button></>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <Metric label="Critical Open" value={metrics.critical} tone="critical" icon={<AlertTriangle className="h-4 w-4" />} />
      <Metric label="Awaiting Approval" value={metrics.approval} icon={<ShieldCheck className="h-4 w-4" />} />
      <Metric label="Scheduled" value={metrics.scheduled} icon={<CalendarClock className="h-4 w-4" />} />
      <Metric label="Verification" value={metrics.verification} icon={<Search className="h-4 w-4" />} />
      <Metric label="Failed / Rollback" value={metrics.failed} tone="critical" icon={<RotateCcw className="h-4 w-4" />} />
      <Metric label="Completed" value={metrics.completed} tone="success" icon={<CheckCircle2 className="h-4 w-4" />} />
    </div>

    <Card className="mt-6">
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Patch Queue</h2><p className="mt-1 text-sm text-slate-500">{filtered.length} of {rows.length} patch plans</p></div><Button variant="outline" onClick={() => patches.refetch()} disabled={patches.isFetching}>{patches.isFetching ? 'Refreshing...' : 'Refresh'}</Button></div></CardHeader>
      <CardContent>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-[#2A394D] dark:bg-[#101927]"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4" /> Manage patches</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto]"><label className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patch, project, asset, CVE..." /></label><Select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="all">All projects</option>{(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select><Select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">All priorities</option>{priorities.map((value) => <option key={value} value={value}>{value}</option>)}</Select><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</Select><Select value={sort} onChange={(event) => setSort(event.target.value)}><option value="priority">Highest priority</option><option value="deadline">Nearest deadline</option><option value="project">Project name</option><option value="recent">Recent activity</option></Select><Button variant="outline" disabled={!hasFilters} onClick={() => { setQuery(''); setProjectId('all'); setPriority('all'); setStatus('all'); setSort('priority'); }}><X className="h-4 w-4" /> Clear</Button></div></div>
        <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-slate-500"><tr><th className="py-2">Patch</th><th>Finding</th><th>Project / Asset</th><th>Priority</th><th>Patch Status</th><th>Owner</th><th>Deadline</th><th>Actions</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id} className="border-t border-slate-100 align-top dark:border-[#253348]"><td className="py-3 pr-4"><button className="text-left font-semibold text-[#155EEF] hover:underline dark:text-[#49A6DF]" onClick={() => setSelected(row)}>{row.title}</button><p className="mt-1 text-xs text-slate-500">{row.cve_id || 'No CVE'}{row.package_name ? ` · ${row.package_name}` : ''}</p>{row.installed_version || row.fixed_version ? <p className="text-xs text-slate-500">{row.installed_version || '?'} → {row.fixed_version || '?'}</p> : null}</td><td className="min-w-52 pr-4">{row.finding_id ? <><Link href={`/findings/${row.finding_id}`} className="line-clamp-2 font-medium text-[#155EEF] hover:underline dark:text-[#49A6DF]">{row.finding_title || row.finding_id}</Link><div className="mt-1"><StatusBadge value={row.finding_status || 'linked'} /></div></> : <><p className="text-slate-500">Not linked</p><p className="text-xs text-slate-400">Manual patch plan</p></>}</td><td className="pr-4"><Link href={`/projects/${row.project_id}`} className="font-medium hover:underline">{row.project_name}</Link><p className="text-xs text-slate-500">{row.asset_value || 'Project-wide'}</p></td><td className="pr-4"><SeverityBadge value={row.priority} /></td><td className="pr-4"><StatusBadge value={row.status} /></td><td className="pr-4">{row.owner_name || 'Unassigned'}</td><td className="whitespace-nowrap pr-4">{row.due_at ? formatDate(row.due_at) : 'Not set'}</td><td><div className="flex max-w-72 flex-wrap gap-2">{(transitions[row.status] ?? []).map(([target, label]) => <Button key={target} variant={target === 'approved' || target === 'completed' ? 'secondary' : 'outline'} disabled={actions.transition.isPending || (!canManage && target !== 'review' && target !== 'draft')} onClick={() => transition(row, target)}>{label}</Button>)}<Button variant="ghost" onClick={() => setSelected(row)}>Details</Button></div></td></tr>)}</tbody></table></div>
        {!patches.isLoading && !filtered.length ? <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center"><PackageCheck className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-2 font-semibold">No patch plans match</p><p className="mt-1 text-sm text-slate-500">Create a patch plan or clear the current filters.</p></div> : null}
      </CardContent>
    </Card>

    {showCreate ? <Modal title="Create Patch Plan" onClose={() => setShowCreate(false)}><div className="grid gap-3 md:grid-cols-2"><Field label="Project"><Select value={form.project_id} onChange={(event) => setForm((current) => ({ ...current, project_id: event.target.value, asset_id: '' }))}><option value="">Choose project</option>{(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field><Field label="Asset"><Select value={form.asset_id} onChange={(event) => setForm((current) => ({ ...current, asset_id: event.target.value }))} disabled={!form.project_id}><option value="">Project-wide patch</option>{(assets.data ?? []).map((asset) => <option key={asset.id} value={asset.id}>{asset.name || asset.value}</option>)}</Select></Field><div className="md:col-span-2"><Field label="Patch title"><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Upgrade OpenSSL to fixed release" /></Field></div><Field label="CVE ID"><Input value={form.cve_id} onChange={(event) => setForm((current) => ({ ...current, cve_id: event.target.value.toUpperCase() }))} placeholder="CVE-2026-12345" /></Field><Field label="Priority"><Select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>{priorities.map((value) => <option key={value}>{value}</option>)}</Select></Field><Field label="Package"><Input value={form.package_name} onChange={(event) => setForm((current) => ({ ...current, package_name: event.target.value }))} placeholder="openssl" /></Field><Field label="Due date"><Input type="datetime-local" value={form.due_at} onChange={(event) => setForm((current) => ({ ...current, due_at: event.target.value }))} /></Field><Field label="Installed version"><Input value={form.installed_version} onChange={(event) => setForm((current) => ({ ...current, installed_version: event.target.value }))} /></Field><Field label="Fixed version"><Input value={form.fixed_version} onChange={(event) => setForm((current) => ({ ...current, fixed_version: event.target.value }))} /></Field><div className="md:col-span-2"><Field label="Remediation plan"><Textarea value={form.remediation} onChange={(event) => setForm((current) => ({ ...current, remediation: event.target.value }))} /></Field></div><div className="md:col-span-2"><Field label="Rollback plan"><Textarea value={form.rollback_plan} onChange={(event) => setForm((current) => ({ ...current, rollback_plan: event.target.value }))} /></Field></div></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button><Button onClick={createPatch} disabled={actions.create.isPending}>{actions.create.isPending ? 'Creating...' : 'Create Patch'}</Button></div></Modal> : null}
    {selected ? <PatchDetails row={selected} onClose={() => setSelected(null)} onSave={async (payload) => { try { const saved = await actions.update.mutateAsync({ id: selected.id, payload }); setSelected(saved); toast.success('Patch details saved'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save patch'); } }} /> : null}
  </>;
}

function Metric({ label, value, icon, tone = 'default' }: { label: string; value: number; icon: React.ReactNode; tone?: string }) { return <Card className="p-4"><div className={`flex items-center gap-2 text-sm ${tone === 'critical' ? 'text-red-600' : tone === 'success' ? 'text-emerald-600' : 'text-slate-500'}`}>{icon}{label}</div><p className="mt-2 text-3xl font-bold text-[#0B1F3A] dark:text-slate-100">{value}</p></Card>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"><div className="my-8 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl dark:bg-[#101927]"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><Button variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button></div>{children}</div></div>; }
function PatchDetails({ row, onClose, onSave }: { row: PatchRecord; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const [draft, setDraft] = useState({ maintenance_start: row.maintenance_start?.slice(0, 16) ?? '', maintenance_end: row.maintenance_end?.slice(0, 16) ?? '', remediation: row.remediation ?? '', rollback_plan: row.rollback_plan ?? '', verification_notes: row.verification_notes ?? '' });
  return <Modal title="Patch Plan Details" onClose={onClose}><div className="grid gap-4 md:grid-cols-2"><Info label="Project" value={row.project_name} /><Info label="Asset" value={row.asset_value || 'Project-wide'} /><Info label="CVE" value={row.cve_id || 'Not linked'} /><Info label="Package" value={`${row.package_name || 'Not specified'} · ${row.installed_version || '?'} → ${row.fixed_version || '?'}`} /><Field label="Maintenance start"><Input type="datetime-local" value={draft.maintenance_start} onChange={(event) => setDraft((current) => ({ ...current, maintenance_start: event.target.value }))} /></Field><Field label="Maintenance end"><Input type="datetime-local" value={draft.maintenance_end} onChange={(event) => setDraft((current) => ({ ...current, maintenance_end: event.target.value }))} /></Field><div className="md:col-span-2"><Field label="Remediation plan"><Textarea value={draft.remediation} onChange={(event) => setDraft((current) => ({ ...current, remediation: event.target.value }))} /></Field></div><div className="md:col-span-2"><Field label="Rollback plan"><Textarea value={draft.rollback_plan} onChange={(event) => setDraft((current) => ({ ...current, rollback_plan: event.target.value }))} /></Field></div><div className="md:col-span-2"><Field label="Verification notes"><Textarea value={draft.verification_notes} onChange={(event) => setDraft((current) => ({ ...current, verification_notes: event.target.value }))} /></Field></div>{Object.keys(row.deployment_evidence ?? {}).length ? <div className="md:col-span-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-[#172334]"><p className="font-semibold">Deployment evidence</p><pre className="mt-2 whitespace-pre-wrap text-xs">{JSON.stringify(row.deployment_evidence, null, 2)}</pre></div> : null}</div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => onSave({ ...draft, maintenance_start: draft.maintenance_start || null, maintenance_end: draft.maintenance_end || null })}>Save Details</Button></div></Modal>;
}
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 p-3 dark:border-[#2A394D]"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
