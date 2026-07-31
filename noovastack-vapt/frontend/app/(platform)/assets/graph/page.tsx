'use client';

import { GitBranch } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { useAssetGraph } from '@/hooks/use-assets';
import { useProjects } from '@/hooks/use-projects';
import { useState } from 'react';

export default function AssetGraphPage() {
  const projects = useProjects();
  const [projectId, setProjectId] = useState('');
  const selectedProject = projectId || projects.data?.[0]?.id;
  const graph = useAssetGraph(selectedProject);
  return <><PageHeader title="Asset Relationship Graph" description="Visualize root domains, subdomains, IPs, web applications, API endpoints, and repositories." /><Card className="mb-5 p-4"><Select value={selectedProject ?? ''} onChange={(e) => setProjectId(e.target.value)}><option value="">Choose project</option>{projects.data?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Card>{graph.data?.nodes?.length ? <Card className="min-h-[520px] p-6"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{graph.data.nodes.slice(0, 60).map((node) => <div key={node.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="font-semibold text-[#0B1F3A]">{node.label}</p><p className="mt-1 text-sm text-slate-600">{node.type}</p><p className="mt-2 text-xs text-[#155EEF]">{node.scope_status ?? 'scope pending'}</p></div>)}</div><p className="mt-6 text-sm text-slate-500">Large graphs are grouped into readable cards until the graph rendering backend provides coordinates/clustering.</p></Card> : <EmptyState icon={GitBranch} title="No asset graph yet" description="Discover or add assets first. NoovaStack will connect related domains, IP addresses, web apps, APIs, and services." action="Start Asset Discovery" href="/assets/discovery" />}</>;
}
