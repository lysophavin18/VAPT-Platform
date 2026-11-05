'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, FileText, Pencil, Plus, Radar, Search, Siren, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmationDialog } from '@/components/feedback/confirmation-dialog';
import { EmptyState } from '@/components/feedback/empty-state';
import { LoadingSkeleton } from '@/components/feedback/loading-skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { useDeleteProject, useProjects } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api-client';
import { normalizeRole } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import type { Project } from '@/types';

export default function ProjectsPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useProjects();
  const deleteProject = useDeleteProject();
  const [search, setSearch] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updated_desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const role = normalizeRole(user?.role);
  const canCreate = ['admin', 'manager', 'security_team', 'analyst'].includes(role);
  const canManage = ['admin', 'manager', 'security_team'].includes(role);
  const displayedProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = data.filter((project) => (
      (environmentFilter === 'all' || project.environment === environmentFilter)
      && (statusFilter === 'all' || project.status === statusFilter)
      && (!query || [project.name, project.description, project.environment, project.status, project.owner]
        .some((value) => value?.toLowerCase().includes(query)))
    ));
    return filtered.sort((left, right) => {
      if (sortBy === 'name_asc') return left.name.localeCompare(right.name);
      if (sortBy === 'name_desc') return right.name.localeCompare(left.name);
      if (sortBy === 'created_desc') return Date.parse(right.created_at ?? '') - Date.parse(left.created_at ?? '');
      return Date.parse(right.updated_at ?? '') - Date.parse(left.updated_at ?? '');
    });
  }, [data, environmentFilter, search, sortBy, statusFilter]);
  const selectedProjects = data.filter((project) => selectedIds.has(project.id));
  const allDisplayedSelected = displayedProjects.length > 0 && displayedProjects.every((project) => selectedIds.has(project.id));

  function toggleProject(projectId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function toggleAllDisplayed() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allDisplayedSelected) displayedProjects.forEach((project) => next.delete(project.id));
      else displayedProjects.forEach((project) => next.add(project.id));
      return next;
    });
  }

  function clearFilters() {
    setSearch('');
    setEnvironmentFilter('all');
    setStatusFilter('all');
    setSortBy('updated_desc');
  }

  async function removeProject(project: Project) {
    try {
      await deleteProject.mutateAsync(project.id);
      toast.success(`${project.name} deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete project');
    }
  }

  async function archiveSelected() {
    if (!selectedProjects.length) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(
      selectedProjects.map((project) => api.updateProject(project.id, { status: 'archived' }, token)),
    );
    const succeeded = results.filter((result) => result.status === 'fulfilled').length;
    setBulkBusy(false);
    setSelectedIds(new Set());
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
    if (succeeded) toast.success(`${succeeded} project${succeeded === 1 ? '' : 's'} archived`);
    if (succeeded !== results.length) toast.error(`${results.length - succeeded} project${results.length - succeeded === 1 ? '' : 's'} could not be archived`);
  }

  async function deleteSelected() {
    if (!selectedProjects.length) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(
      selectedProjects.map((project) => api.deleteProject(project.id, token)),
    );
    const deletedIds = new Set(
      selectedProjects.filter((_, index) => results[index].status === 'fulfilled').map((project) => project.id),
    );
    setBulkBusy(false);
    setSelectedIds((current) => new Set([...current].filter((id) => !deletedIds.has(id))));
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
    if (deletedIds.size) toast.success(`${deletedIds.size} project${deletedIds.size === 1 ? '' : 's'} deleted`);
    if (deletedIds.size !== results.length) toast.error(`${results.length - deletedIds.size} project${results.length - deletedIds.size === 1 ? '' : 's'} could not be deleted`);
  }

  if (isLoading) return <LoadingSkeleton rows={8} />;

  return (
    <>
      <PageHeader
        title="Projects"
        description="Manage applications, owners, authorization, assets, scans, reports, and retests."
        actions={canCreate ? <Link href="/projects/new"><Button><Plus className="h-4 w-4" /> New Project</Button></Link> : undefined}
      />
      <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2A394D] dark:bg-[#131E2D]">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_180px_190px_auto]">
          <label className="relative">
            <span className="sr-only">Search projects</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, description, owner..." />
          </label>
          <Select aria-label="Filter by environment" value={environmentFilter} onChange={(event) => setEnvironmentFilter(event.target.value)}>
            <option value="all">All</option>
            <option value="development">Development</option>
            <option value="testing">Testing</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </Select>
          <Select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="planning">Planning</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </Select>
          <Select aria-label="Sort projects" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="updated_desc">Recently updated</option>
            <option value="created_desc">Newest created</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
          </Select>
          <Button variant="outline" onClick={clearFilters}><X className="h-4 w-4" /> Reset</Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-[#2A394D]">
          <p className="text-sm text-slate-600 dark:text-slate-300">Showing <strong>{displayedProjects.length}</strong> of {data.length} projects{selectedProjects.length ? ` · ${selectedProjects.length} selected` : ''}</p>
          {canManage ? <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={toggleAllDisplayed} disabled={!displayedProjects.length}>{allDisplayedSelected ? 'Clear visible' : 'Select visible'}</Button>
            <Button variant="secondary" onClick={archiveSelected} disabled={!selectedProjects.length || bulkBusy}><Archive className="h-4 w-4" /> {bulkBusy ? 'Working...' : 'Archive selected'}</Button>
            {selectedProjects.length ? <ConfirmationDialog title="Delete selected projects?" description={`This permanently deletes ${selectedProjects.length} selected project${selectedProjects.length === 1 ? '' : 's'} and all related assessment data. Each deletion is audit-logged.`} confirmLabel={bulkBusy ? 'Deleting...' : 'Delete selected'} requireText={`DELETE ${selectedProjects.length}`} danger onConfirm={deleteSelected} /> : <Button variant="danger" disabled><Trash2 className="h-4 w-4" /> Delete selected</Button>}
          </div> : null}
        </div>
      </div>
      <DataTable<Project>
        data={displayedProjects}
        empty={<EmptyState icon={Archive} title={environmentFilter === 'all' ? 'No projects yet' : `No ${environmentFilter} projects`} description={environmentFilter === 'all' ? 'Create a project to group assets, engagements, scans, findings, and reports.' : 'Choose another environment to see its projects.'} action={environmentFilter === 'all' && canCreate ? 'Create Project' : undefined} href={environmentFilter === 'all' && canCreate ? '/projects/new' : undefined} />}
        columns={[
          ...(canManage ? [{ key: 'select', header: 'Select', render: (project: Project) => <input type="checkbox" aria-label={`Select ${project.name}`} checked={selectedIds.has(project.id)} onChange={() => toggleProject(project.id)} className="h-4 w-4 rounded border-slate-300" /> }] : []),
          { key: 'name', header: 'Project name', render: (project) => <Link href={`/projects/${project.id}`} className="font-semibold text-[#155EEF]">{project.name}</Link> },
          { key: 'owner', header: 'Owner', render: (project) => project.owner ?? 'Current user' },
          { key: 'env', header: 'Environment', render: (project) => project.environment },
          { key: 'status', header: 'Assessment Status', render: (project) => <StatusBadge value={project.status} /> },
          { key: 'assets', header: 'Assets', render: (project) => project.asset_count ?? 'View' },
          { key: 'findings', header: 'Open Findings', render: (project) => project.open_findings ?? 0 },
          { key: 'last', header: 'Last Scan', render: (project) => formatDate(project.last_scan) },
          { key: 'updated', header: 'Updated', render: (project) => formatDate(project.updated_at) },
          {
            key: 'actions',
            header: 'Actions',
            render: (project) => (
              <div className="flex flex-wrap gap-2">
                <Link href={`/scans/new?project=${project.id}`}><Button variant="secondary"><Siren className="h-4 w-4" /> Scan</Button></Link>
                <Link href={`/assets/discovery?project=${project.id}`}><Button variant="outline"><Radar className="h-4 w-4" /> Discover</Button></Link>
                <Link href="/reports"><Button variant="outline"><FileText className="h-4 w-4" /> Reports</Button></Link>
                {canManage ? <Link href={`/projects/${project.id}`}><Button variant="outline"><Pencil className="h-4 w-4" /> Edit</Button></Link> : null}
                {canManage ? <ConfirmationDialog title="Delete project?" description={`This permanently deletes ${project.name} and its related engagements, assets, scans, findings, and reports. This action is audit-logged.`} confirmLabel={deleteProject.isPending ? 'Deleting...' : 'Delete'} requireText="DELETE" danger onConfirm={() => removeProject(project)} /> : null}
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
