'use client';

import Link from 'next/link';
import { Archive, FileText, Plus, Radar, Siren } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { LoadingSkeleton } from '@/components/feedback/loading-skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { useProjects } from '@/hooks/use-projects';
import { formatDate } from '@/lib/utils';
import type { Project } from '@/types';

export default function ProjectsPage() {
  const { data = [], isLoading } = useProjects();
  if (isLoading) return <LoadingSkeleton rows={8} />;

  return (
    <>
      <PageHeader
        title="Projects"
        description="Manage applications, owners, authorization, assets, scans, reports, and retests."
        actions={<Link href="/projects/new"><Button><Plus className="h-4 w-4" /> New Project</Button></Link>}
      />
      <DataTable<Project>
        data={data}
        empty={<EmptyState icon={Archive} title="No projects yet" description="Create a project to group assets, engagements, scans, findings, and reports." action="Create Project" href="/projects/new" />}
        columns={[
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
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
