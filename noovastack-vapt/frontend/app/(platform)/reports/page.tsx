'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Bot, FileText, Search, SlidersHorizontal, X } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { useProjects } from '@/hooks/use-projects';
import { useScans } from '@/hooks/use-scans';
import { formatDate, titleCase } from '@/lib/utils';
import type { Scan } from '@/types';

const reportTypes = ['Vulnerability Assessment', 'Technical Findings', 'Service Discovery', 'Remediation Summary'];
const priorityOrder = ['critical', 'high', 'medium', 'low', 'informational', 'unrated'] as const;

function reportPriority(scan: Scan) {
  const summary = scan.results_summary ?? {};
  const counts = (summary.findings_by_severity ?? summary.severity_counts ?? {}) as Record<string, unknown>;
  return priorityOrder.find((priority) => priority !== 'unrated' && Number(counts[priority] ?? 0) > 0) ?? 'unrated';
}

export default function ReportsPage() {
  const scans = useScans('?status=completed');
  const projects = useProjects();
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState('all');
  const [priority, setPriority] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const completedScans = scans.data ?? [];
  const projectNames = useMemo(() => new Map((projects.data ?? []).map((project) => [project.id, project.name])), [projects.data]);
  const filteredReports = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return completedScans
      .filter((scan) => {
        const projectName = projectNames.get(scan.project_id) ?? 'Unknown project';
        const matchesSearch = !needle || [scan.name, scan.id, projectName, scan.scan_category, scan.scan_depth]
          .some((value) => String(value ?? '').toLowerCase().includes(needle));
        return matchesSearch
          && (projectId === 'all' || scan.project_id === projectId)
          && (priority === 'all' || reportPriority(scan) === priority);
      })
      .sort((a, b) => {
        if (sortBy === 'priority') return priorityOrder.indexOf(reportPriority(a)) - priorityOrder.indexOf(reportPriority(b));
        if (sortBy === 'project') return (projectNames.get(a.project_id) ?? '').localeCompare(projectNames.get(b.project_id) ?? '');
        return new Date(b.completed_at ?? b.created_at ?? 0).getTime() - new Date(a.completed_at ?? a.created_at ?? 0).getTime();
      });
  }, [completedScans, priority, projectId, projectNames, query, sortBy]);
  const hasFilters = Boolean(query || projectId !== 'all' || priority !== 'all' || sortBy !== 'newest');
  const clearFilters = () => { setQuery(''); setProjectId('all'); setPriority('all'); setSortBy('newest'); };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Reports are automatically available after scans complete, similar to Greenbone, ZAP, and other VA platforms."
        actions={<Link href="/reports/generate"><Button><Bot className="h-4 w-4" /> Report Generator</Button></Link>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {reportTypes.map((type) => <Card key={type} className="p-5"><FileText className="h-5 w-5 text-[#155EEF]" /><h3 className="mt-3 font-semibold text-[#0B1F3A]">{type}</h3><p className="mt-3 text-sm text-slate-600">Included automatically from completed scan evidence and findings.</p><div className="mt-4"><StatusBadge value="active" /></div></Card>)}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <h2 className="font-semibold text-[#0B1F3A]">Available Scan Reports</h2>
          <p className="mt-1 text-sm text-slate-600">Every completed scan has a report. No separate report-building step is required.</p>
        </CardHeader>
        <CardContent>
          {completedScans.length ? <>
            <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-[#2A394D] dark:bg-[#101927]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] dark:text-slate-100"><SlidersHorizontal className="h-4 w-4" /> Filter reports</div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Showing {filteredReports.length} of {completedScans.length}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_1fr_1fr_1fr_auto]">
                <label className="relative block">
                  <span className="sr-only">Search reports</span>
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search report, ID, project, assessment..." />
                </label>
                <Select aria-label="Filter by project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="all">All projects</option>
                  {(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </Select>
                <Select aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
                  <option value="all">All priorities</option>
                  {priorityOrder.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
                </Select>
                <Select aria-label="Sort reports" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="newest">Newest first</option>
                  <option value="priority">Highest priority</option>
                  <option value="project">Project name</option>
                </Select>
                <Button variant="outline" onClick={clearFilters} disabled={!hasFilters} aria-label="Clear report filters"><X className="h-4 w-4" /> Clear</Button>
              </div>
            </div>
            {filteredReports.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-slate-500"><tr><th className="py-2">Report</th><th>Project</th><th>Assessment</th><th>Priority</th><th>Completed</th><th>Actions</th></tr></thead><tbody>{filteredReports.map((scan) => <tr key={scan.id} className="border-t border-slate-100 dark:border-[#253348]"><td className="py-3 pr-4"><p className="font-semibold text-[#0B1F3A] dark:text-slate-100">{scan.name}</p><p className="max-w-56 truncate text-xs text-slate-500" title={scan.id}>Report ID: {scan.id}</p></td><td className="pr-4"><Link className="font-medium text-[#155EEF] hover:underline dark:text-[#49A6DF]" href={`/projects/${scan.project_id}`}>{projectNames.get(scan.project_id) ?? 'Unknown project'}</Link></td><td className="pr-4">{titleCase(scan.scan_category)} / {titleCase(scan.scan_depth)}</td><td className="pr-4"><StatusBadge value={reportPriority(scan)} /></td><td className="whitespace-nowrap pr-4">{formatDate(scan.completed_at)}</td><td><div className="flex flex-wrap gap-2"><Link href={`/reports/generate?scan=${scan.id}`}><Button variant="secondary"><Bot className="h-4 w-4" /> Improve</Button></Link><Link href={`/reports/${scan.id}`}><Button variant="outline">Open</Button></Link></div></td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-[#35445A]"><Search className="mx-auto h-8 w-8 text-slate-400" /><h3 className="mt-3 font-semibold text-[#0B1F3A] dark:text-slate-100">No reports match these filters</h3><p className="mt-1 text-sm text-slate-500">Try another project, priority, or search term.</p><Button className="mt-4" variant="outline" onClick={clearFilters}>Clear filters</Button></div>}
          </> : <EmptyState icon={FileText} title="No reports available" description="Run a scan first. Then use Generate Report from the completed scan." action="Run Scan" href="/scans/new" />}
        </CardContent>
      </Card>
    </>
  );
}
