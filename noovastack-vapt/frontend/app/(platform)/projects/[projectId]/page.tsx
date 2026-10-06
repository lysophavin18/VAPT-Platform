'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle, Edit3, FileText, Network, Plus, Save, X, XCircle } from 'lucide-react';
import { LoadingSkeleton } from '@/components/feedback/loading-skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { ConfirmationDialog } from '@/components/feedback/confirmation-dialog';
import { useAssets } from '@/hooks/use-assets';
import { useDeleteProject, useProject, useUpdateProject } from '@/hooks/use-projects';
import { useScans } from '@/hooks/use-scans';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { formatDate, titleCase } from '@/lib/utils';
import type { Asset, Scan } from '@/types';

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const project = useProject(projectId);
  const updateProject = useUpdateProject(projectId);
  const deleteProject = useDeleteProject();
  const assets = useAssets(projectId);
  const scans = useScans(`?project_id=${projectId}`);
  const isManager = user?.role && ['admin', 'manager', 'security_team'].includes(user.role);

  const approveAsset = useMutation({
    mutationFn: (assetId: string) => api.approveAsset(assetId, token),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['assets', projectId] }); toast.success('Asset approved'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const rejectAsset = useMutation({
    mutationFn: (assetId: string) => api.rejectAsset(assetId, token),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['assets', projectId] }); toast.success('Asset rejected'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const completedScans = (scans.data ?? []).filter((scan) => scan.status === 'completed');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', environment: 'testing', status: 'active' });

  useEffect(() => {
    if (!project.data) return;
    setForm({
      name: project.data.name,
      description: project.data.description ?? '',
      environment: project.data.environment ?? 'testing',
      status: project.data.status ?? 'active',
    });
  }, [project.data]);

  async function saveProject(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error('Project name is required');
      return;
    }
    await updateProject.mutateAsync({
      name: form.name.trim(),
      description: form.description.trim() || null,
      environment: form.environment,
      status: form.status,
    });
    toast.success('Project updated');
    setEditing(false);
  }

  async function removeProject() {
    if (!project.data) return;
    await deleteProject.mutateAsync(projectId);
    toast.success('Project deleted');
    router.push('/projects');
  }

  if (project.isLoading) return <LoadingSkeleton rows={8} />;

  return (
    <>
      <PageHeader
        title={project.data?.name ?? 'Project'}
        description={project.data?.description ?? 'Project assessment workspace'}
        breadcrumbs={[{ href: '/projects', label: 'Projects' }, { label: project.data?.name ?? 'Project' }]}
        actions={(
          <>
            <Button variant="outline" onClick={() => setEditing((value) => !value)}><Edit3 className="h-4 w-4" /> {editing ? 'Close Edit' : 'Edit'}</Button>
            <ConfirmationDialog title="Delete project?" description={`This permanently deletes ${project.data?.name ?? 'this project'} and its related engagements, assets, scans, and findings. The action will be recorded in audit logs with your user account.`} confirmLabel={deleteProject.isPending ? 'Deleting...' : 'Delete Project'} requireText="DELETE" danger onConfirm={removeProject} />
            <Link href={`/assets/discovery?project=${projectId}`}><Button variant="outline"><Network className="h-4 w-4" /> Discover Assets</Button></Link>
            <Link href={`/scans/new?project=${projectId}`}><Button><Plus className="h-4 w-4" /> New Scan</Button></Link>
            <Link href="/reports"><Button variant="outline"><FileText className="h-4 w-4" /> Reports</Button></Link>
          </>
        )}
      />

      {editing ? (
        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">Edit Project</h2></CardHeader>
          <CardContent>
            <form onSubmit={saveProject} className="grid gap-4 md:grid-cols-2">
              <Field label="Project name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label="Environment"><Select value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value })}><option value="development">Development</option><option value="testing">Testing</option><option value="staging">Staging</option><option value="production">Production</option></Select></Field>
              <Field label="Assessment status"><Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="planning">Planning</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></Select></Field>
              <Field label="Description"><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} /></Field>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button type="submit" disabled={updateProject.isPending}><Save className="h-4 w-4" /> Save Changes</Button>
                <Button type="button" variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4" /> Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><h2 className="font-semibold">Authorization</h2></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Environment: <strong>{project.data?.environment}</strong></p>
            <p>Status: <StatusBadge value={project.data?.status} /></p>
            <p className="rounded-xl bg-[#EAF2FF] p-3 text-[#0B1F3A]">NoovaStack only tests in-scope assets inside the authorization window.</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><h2 className="font-semibold">Scope Summary</h2></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Metric label="Assets" value={assets.data?.length ?? 0} />
            <Metric label="Scans" value={scans.data?.length ?? 0} />
            <Metric label="Generated Reports" value={completedScans.length} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><h2 className="font-semibold">Assets</h2></CardHeader>
          <CardContent>
            <DataTable<Asset>
              data={assets.data ?? []}
              columns={[
                { key: 'asset', header: 'Asset', render: (asset) => <Link href={`/assets/${asset.id}`} className="font-semibold text-[#155EEF]">{asset.name ?? asset.value}</Link> },
                { key: 'type', header: 'Type', render: (asset) => asset.asset_type },
                { key: 'scope', header: 'Scope', render: (asset) => <StatusBadge value={asset.scope_status} /> },
                { key: 'review', header: 'Review Status', render: (asset) => <StatusBadge value={asset.approval_status} /> },
                ...(isManager ? [{
                  key: 'actions' as keyof Asset,
                  header: 'Actions',
                  render: (asset: Asset) => asset.approval_status === 'pending' ? (
                    <div className="flex gap-1.5">
                      <button type="button" disabled={approveAsset.isPending || rejectAsset.isPending} onClick={() => approveAsset.mutate(asset.id)} className="flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"><CheckCircle className="h-3 w-3" /> Approve</button>
                      <button type="button" disabled={approveAsset.isPending || rejectAsset.isPending} onClick={() => rejectAsset.mutate(asset.id)} className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"><XCircle className="h-3 w-3" /> Reject</button>
                    </div>
                  ) : null,
                }] : []),
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold">Scans And Reports</h2></CardHeader>
          <CardContent>
            <DataTable<Scan>
              data={scans.data ?? []}
              columns={[
                { key: 'name', header: 'Scan', render: (scan) => <Link href={`/scans/${scan.id}`} className="font-semibold text-[#155EEF]">{scan.name}</Link> },
                { key: 'type', header: 'Type', render: (scan) => titleCase(scan.scan_category) },
                { key: 'status', header: 'Status', render: (scan) => <StatusBadge value={scan.status} /> },
                { key: 'completed', header: 'Completed', render: (scan) => formatDate(scan.completed_at) },
                { key: 'report', header: 'Report', render: (scan) => scan.status === 'completed' ? <Link href={`/reports/${scan.id}`}><Button variant="secondary"><FileText className="h-4 w-4" /> Generate Report</Button></Link> : <span className="text-sm text-slate-500">Available after scan completes</span> },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-600">{label}</p><p className="text-2xl font-bold">{value}</p></div>;
}
