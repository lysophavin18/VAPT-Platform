'use client';

import Link from 'next/link';
import { Network, Plus, Search } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { useAssets } from '@/hooks/use-assets';
import { useProjects } from '@/hooks/use-projects';
import { formatDate } from '@/lib/utils';
import type { Asset } from '@/types';
import { useState } from 'react';

export default function AssetsPage() {
  const projects = useProjects();
  const [projectId, setProjectId] = useState('');
  const selectedProject = projectId || projects.data?.[0]?.id;
  const assets = useAssets(selectedProject);

  return (
    <>
      <PageHeader
        title="Asset Inventory"
        description="Inventory of domains, URLs, IPs, APIs, repositories, services, and technologies."
        actions={<><Link href="/assets/discovery"><Button><Search className="h-4 w-4" /> Start Asset Discovery</Button></Link><Link href="/assets/graph"><Button variant="outline"><Network className="h-4 w-4" /> Asset Graph</Button></Link></>}
      />
      <Card className="mb-5"><CardContent className="flex flex-col gap-3 sm:flex-row"><Select value={selectedProject ?? ''} onChange={(e) => setProjectId(e.target.value)} aria-label="Project filter"><option value="">Choose project</option>{projects.data?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select><Link href={`/assets/discovery${selectedProject ? `?project=${selectedProject}` : ''}`}><Button variant="outline"><Plus className="h-4 w-4" /> Add Asset</Button></Link></CardContent></Card>
      <DataTable<Asset>
        data={assets.data ?? []}
        empty={<EmptyState icon={Network} title="No assets discovered yet" description="Start with a domain, website, API, IP range, repository, or container image." action="Start Asset Discovery" href="/assets/discovery" />}
        columns={[
          { key: 'asset', header: 'Asset', render: (asset) => <Link href={`/assets/${asset.id}`} className="font-semibold text-[#155EEF]">{asset.name ?? asset.value}</Link> },
          { key: 'type', header: 'Type', render: (asset) => asset.asset_type },
          { key: 'parent', header: 'Parent', render: (asset) => asset.parent_asset_id ?? 'Root' },
          { key: 'env', header: 'Environment', render: (asset) => asset.environment ?? 'Not set' },
          { key: 'scope', header: 'Scope Status', render: (asset) => <StatusBadge value={asset.scope_status} /> },
          { key: 'review', header: 'Review Status', render: (asset) => <StatusBadge value={asset.approval_status} /> },
          { key: 'tech', header: 'Technology', render: (asset) => Object.keys(asset.technology ?? {}).join(', ') || 'Unknown' },
          { key: 'last', header: 'Last Observed', render: (asset) => formatDate(asset.last_observed_at) },
        ]}
      />
    </>
  );
}
