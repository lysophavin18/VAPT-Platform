'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CheckCircle2, PlayCircle, Search, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { useFindingActions, useFindings } from '@/hooks/use-findings';
import { useProjects } from '@/hooks/use-projects';
import { useScans } from '@/hooks/use-scans';
import { formatDate } from '@/lib/utils';

const retestStatuses = ['ready_for_retest', 'retesting', 'fixed', 'partially_fixed', 'not_fixed', 'cannot_verify'];
const priorityOrder = ['critical', 'high', 'medium', 'low', 'informational', 'info'];

export default function RetestsPage() {
  const findings = useFindings();
  const projects = useProjects();
  const scans = useScans();
  const actions = useFindingActions();
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState('all');
  const [priority, setPriority] = useState('all');
  const [status, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const all = findings.data ?? [];
  const candidates = all.filter((finding) => finding.status === 'confirmed' || retestStatuses.includes(finding.status));
  const counts = Object.fromEntries(retestStatuses.map((status) => [status, all.filter((finding) => finding.status === status).length]));
  const projectNames = useMemo(() => new Map((projects.data ?? []).map((project) => [project.id, project.name])), [projects.data]);
  const scanProjects = useMemo(() => new Map((scans.data ?? []).map((scan) => [scan.id, scan.project_id])), [scans.data]);
  const filteredCandidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((finding) => {
      const findingProjectId = scanProjects.get(finding.scan_id);
      const projectName = findingProjectId ? projectNames.get(findingProjectId) : '';
      const matchesSearch = !needle || [finding.title, finding.description, finding.id, projectName, finding.cwe_id, finding.owasp_category]
        .some((value) => String(value ?? '').toLowerCase().includes(needle));
      return matchesSearch
        && (projectId === 'all' || findingProjectId === projectId)
        && (priority === 'all' || finding.severity === priority)
        && (status === 'all' || finding.status === status);
    }).sort((a, b) => {
      if (sortBy === 'priority') {
        const aRank = priorityOrder.indexOf(a.severity);
        const bRank = priorityOrder.indexOf(b.severity);
        return (aRank < 0 ? priorityOrder.length : aRank) - (bRank < 0 ? priorityOrder.length : bRank);
      }
      if (sortBy === 'project') {
        const aName = projectNames.get(scanProjects.get(a.scan_id) ?? '') ?? '';
        const bName = projectNames.get(scanProjects.get(b.scan_id) ?? '') ?? '';
        return aName.localeCompare(bName);
      }
      return new Date(b.last_seen ?? b.created_at ?? 0).getTime() - new Date(a.last_seen ?? a.created_at ?? 0).getTime();
    });
  }, [candidates, priority, projectId, projectNames, query, scanProjects, sortBy, status]);
  const hasFilters = Boolean(query || projectId !== 'all' || priority !== 'all' || status !== 'all' || sortBy !== 'priority');
  const clearFilters = () => { setQuery(''); setProjectId('all'); setPriority('all'); setStatusFilter('all'); setSortBy('priority'); };

  async function setStatus(id: string, status: string) {
    await actions.mutateAsync({ id, action: 'status', status });
    toast.success('Retest status updated');
  }

  return <>
    <PageHeader title="Retesting" description="Track findings through ready, retesting, fixed, partially fixed, not fixed, and cannot verify states." />
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
      {[['ready_for_retest', 'Ready'], ['retesting', 'Running'], ['fixed', 'Fixed'], ['partially_fixed', 'Partial'], ['not_fixed', 'Not Fixed'], ['cannot_verify', 'Cannot Verify']].map(([status, label]) => <Card key={status} className="p-4"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-bold text-[#0B1F3A]">{counts[status] ?? 0}</p></Card>)}
    </div>
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Retest Queue</h2><p className="mt-1 text-sm text-slate-600">Confirmed findings can be queued and updated after remediation validation.</p></div><Button variant="outline" onClick={() => findings.refetch()} disabled={findings.isFetching}>{findings.isFetching ? 'Refreshing...' : 'Refresh'}</Button></div>
      {candidates.length ? <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-[#2A394D] dark:bg-[#101927]">
        <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] dark:text-slate-100"><SlidersHorizontal className="h-4 w-4" /> Manage retest queue</div><span className="text-xs text-slate-500">Showing {filteredCandidates.length} of {candidates.length}</span></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_1fr_1fr_1fr_1fr_auto]">
          <label className="relative block"><span className="sr-only">Search retests</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search finding, ID, project, CWE..." /></label>
          <Select aria-label="Filter retests by project" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="all">All projects</option>{(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select>
          <Select aria-label="Filter retests by priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">All priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="informational">Informational</option></Select>
          <Select aria-label="Filter retests by status" value={status} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="confirmed">Confirmed</option>{retestStatuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</Select>
          <Select aria-label="Sort retests" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="priority">Highest priority</option><option value="newest">Recently seen</option><option value="project">Project name</option></Select>
          <Button variant="outline" onClick={clearFilters} disabled={!hasFilters}><X className="h-4 w-4" /> Clear</Button>
        </div>
      </div> : null}
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="py-2">Finding</th><th>Project</th><th>Priority</th><th>Status</th><th>Last Seen</th><th>Actions</th></tr></thead>
          <tbody>{filteredCandidates.map((finding) => { const findingProjectId = scanProjects.get(finding.scan_id); return <tr key={finding.id} className="border-t border-slate-100 dark:border-[#253348]"><td className="py-3 pr-4"><Link href={`/findings/${finding.id}`} className="font-semibold text-[#0B1F3A] hover:text-[#155EEF] hover:underline dark:text-slate-100">{finding.title}</Link><p className="mt-1 max-w-xl text-xs text-slate-500">{finding.description}</p></td><td className="pr-4">{findingProjectId ? <Link href={`/projects/${findingProjectId}`} className="font-medium text-[#155EEF] hover:underline dark:text-[#49A6DF]">{projectNames.get(findingProjectId) ?? 'Unknown project'}</Link> : <span className="text-slate-500">Unknown</span>}</td><td className="pr-4"><SeverityBadge value={finding.severity} /></td><td className="pr-4"><StatusBadge value={finding.status} /></td><td className="whitespace-nowrap pr-4">{formatDate(finding.last_seen ?? finding.created_at)}</td><td><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setStatus(finding.id, 'ready_for_retest')} disabled={actions.isPending || finding.status === 'ready_for_retest'}><CheckCircle2 className="h-4 w-4" /> Queue</Button><Button variant="outline" onClick={() => setStatus(finding.id, 'retesting')} disabled={actions.isPending || finding.status === 'retesting'}><PlayCircle className="h-4 w-4" /> Start</Button><Button variant="outline" onClick={() => setStatus(finding.id, 'fixed')} disabled={actions.isPending}>Fixed</Button><Button variant="outline" onClick={() => setStatus(finding.id, 'partially_fixed')} disabled={actions.isPending}>Partial</Button><Button variant="outline" onClick={() => setStatus(finding.id, 'not_fixed')} disabled={actions.isPending}>Not Fixed</Button><Button variant="ghost" onClick={() => setStatus(finding.id, 'cannot_verify')} disabled={actions.isPending}>Cannot Verify</Button></div></td></tr>; })}</tbody>
        </table>
      </div>
      {!findings.isLoading && !candidates.length ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No confirmed findings are available for retest. Run a scan or verify findings first.</p> : null}
      {candidates.length > 0 && !filteredCandidates.length ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-[#35445A]"><Search className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-2 font-semibold text-[#0B1F3A] dark:text-slate-100">No retests match these filters</p><Button className="mt-3" variant="outline" onClick={clearFilters}>Clear filters</Button></div> : null}
    </Card>
  </>;
}
