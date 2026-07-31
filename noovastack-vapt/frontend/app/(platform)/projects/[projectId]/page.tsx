'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FileText, Network, Plus } from 'lucide-react';
import { LoadingSkeleton } from '@/components/feedback/loading-skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { useAssets } from '@/hooks/use-assets';
import { useProject } from '@/hooks/use-projects';
import { useScans } from '@/hooks/use-scans';
import { formatDate, titleCase } from '@/lib/utils';
import type { Asset, Scan } from '@/types';

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const project = useProject(projectId);
  const assets = useAssets(projectId);
  const scans = useScans(`?project_id=${projectId}`);
  const completedScans = (scans.data ?? []).filter((scan) => scan.status === 'completed');

  if (project.isLoading) return <LoadingSkeleton rows={8} />;

  return (
    <>
      <PageHeader
        title={project.data?.name ?? 'Project'}
        description={project.data?.description ?? 'Project assessment workspace'}
        breadcrumbs={[{ href: '/projects', label: 'Projects' }, { label: project.data?.name ?? 'Project' }]}
        actions={(
          <>
            <Link href={`/assets/discovery?project=${projectId}`}><Button variant="outline"><Network className="h-4 w-4" /> Discover Assets</Button></Link>
            <Link href={`/scans/new?project=${projectId}`}><Button><Plus className="h-4 w-4" /> New Scan</Button></Link>
            <Link href="/reports"><Button variant="outline"><FileText className="h-4 w-4" /> Reports</Button></Link>
          </>
        )}
      />

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
