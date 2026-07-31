'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Container, FileCode2, Globe2, Network, Radar, Server } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { ProgressBar } from '@/components/ui/progress';
import { StatusBadge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import { useAssets } from '@/hooks/use-assets';
import { formatDate } from '@/lib/utils';

const targetTypes = [
  { id: 'root_domain', label: 'Root domain', icon: Globe2 },
  { id: 'website_url', label: 'Website URL', icon: Radar },
  { id: 'public_ip', label: 'Public IP', icon: Server },
  { id: 'cidr', label: 'CIDR range', icon: Network },
  { id: 'openapi', label: 'OpenAPI file', icon: FileCode2 },
  { id: 'container', label: 'Container image', icon: Container },
];

const stages = ['Validating scope', 'Finding related assets', 'Resolving target shape', 'Checking live services', 'Detecting technologies', 'Saving assets', 'Waiting for review'];
const discoveryOptions = [
  { id: 'passive', label: 'Passive Discovery', description: 'Normalize domain, URL, IP, or CIDR into reviewable assets.' },
  { id: 'safe_active', label: 'Safe Active Discovery', description: 'Lightweight HTTP reachability checks only.' },
  { id: 'technology_detection', label: 'Technology Detection', description: 'Collects response metadata such as server and content type.' },
];

export default function AssetDiscoveryPage() {
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const projects = useProjects();
  const { token } = useAuth();
  const [projectId, setProjectId] = useState(search.get('project') ?? '');
  const [targetType, setTargetType] = useState('root_domain');
  const [target, setTarget] = useState('');
  const [selectedOptions, setSelectedOptions] = useState(['passive', 'safe_active', 'technology_detection']);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const assets = useAssets(projectId);
  const discoveredAssets = assets.data ?? [];
  const technologyDetected = useMemo(() => discoveredAssets.filter((asset) => asset.technology && Object.values(asset.technology).some(Boolean)).length, [discoveredAssets]);
  const liveServices = useMemo(() => discoveredAssets.filter((asset) => asset.ports_services && Object.keys(asset.ports_services).length > 0).length, [discoveredAssets]);

  useEffect(() => {
    if (!projectId && projects.data?.[0]?.id) {
      setProjectId(projects.data[0].id);
    }
  }, [projectId, projects.data]);

  async function start() {
    if (!projectId || !target.trim()) {
      toast.error('Choose a project and target');
      return;
    }
    if (!selectedOptions.length) {
      toast.error('Choose at least one discovery option');
      return;
    }

    setRunning(true);
    setProgress(18);
    const beforeCount = discoveredAssets.length;
    try {
      const response = await api.discoverAssets(projectId, { target: target.trim(), target_type: targetType, discovery_types: selectedOptions }, token);
      setJobId(response.job_id);
      setProgress(35);
      toast.success(response.message ?? 'Asset discovery started');

      for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const result = await assets.refetch();
        setProgress(Math.min(95, 35 + ((attempt + 1) * 5)));
        const currentAssets = result.data ?? [];
        const hasTarget = currentAssets.some((asset) => asset.value.includes(target.trim()) || target.trim().includes(asset.value));
        if (currentAssets.length > beforeCount || hasTarget) break;
      }

      await queryClient.invalidateQueries({ queryKey: ['assets', projectId] });
      await assets.refetch();
      setProgress(100);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Asset discovery failed';
      toast.error(message);
      setProgress(0);
    } finally {
      setRunning(false);
    }
  }

  function toggleOption(option: string) {
    setSelectedOptions((current) => current.includes(option) ? current.filter((item) => item !== option) : [...current, option]);
  }

  return <>
    <PageHeader title="Asset Discovery" description="Start from a domain, website, IP range, API, repository, or container. Safe defaults avoid intrusive checks." breadcrumbs={[{ href: '/assets', label: 'Assets' }, { label: 'Discovery' }]} />
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <Card className="p-6">
        <h2 className="text-lg font-semibold">What asset should we start from?</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {targetTypes.map((type) => { const Icon = type.icon; return <button key={type.id} onClick={() => setTargetType(type.id)} className={`rounded-2xl border p-4 text-left transition ${targetType === type.id ? 'border-[#155EEF] bg-[#EAF2FF]' : 'border-slate-200 hover:bg-slate-50'}`}><Icon className="h-5 w-5 text-[#155EEF]" /><p className="mt-3 font-semibold">{type.label}</p></button>; })}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Project"><Select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Choose project</option>{projects.data?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field>
          <Field label="Target"><Input placeholder="example.com or http://192.168.220.209:3000/" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        </div>
        <div className="mt-6 rounded-2xl bg-slate-50 p-4">
          <h3 className="font-semibold">Discovery Options</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {discoveryOptions.map((option) => <label key={option.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><span className="flex gap-2 font-medium"><input type="checkbox" checked={selectedOptions.includes(option.id)} onChange={() => toggleOption(option.id)} />{option.label}</span><span className="mt-2 block text-xs text-slate-500">{option.description}</span></label>)}
          </div>
        </div>
        <Button className="mt-6" onClick={start} disabled={running}>{running ? 'Discovery Running...' : 'Start Discovery'}</Button>
      </Card>
      <Card className="p-6">
        <h2 className="font-semibold">Discovery Progress</h2>
        <div className="mt-4"><ProgressBar value={progress} label={running ? 'Running discovery' : progress === 100 ? 'Discovery completed' : 'Ready'} /></div>
        {jobId ? <p className="mt-3 break-all rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Job ID: {jobId}</p> : null}
        <div className="mt-5 space-y-3">
          {stages.map((stage, index) => <div key={stage} className="flex items-center gap-3 text-sm"><CheckCircle2 className={`h-4 w-4 ${progress >= ((index + 1) / stages.length) * 100 ? 'text-emerald-600' : 'text-slate-300'}`} /><span>{stage}</span></div>)}
        </div>
      </Card>
    </div>
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Discovered Assets</h2><p className="mt-1 text-sm text-slate-600">New and updated assets appear here after discovery completes.</p></div><Button variant="outline" onClick={() => assets.refetch()} disabled={!projectId || assets.isFetching}>{assets.isFetching ? 'Refreshing...' : 'Refresh'}</Button></div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryCard label="Assets In Project" value={String(discoveredAssets.length)} />
        <SummaryCard label="Technology Detected" value={String(technologyDetected)} />
        <SummaryCard label="Live Services" value={String(liveServices)} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="py-2">Asset</th><th>Type</th><th>Discovery</th><th>Status</th><th>Technology</th><th>Observed</th></tr></thead>
          <tbody>{discoveredAssets.map((asset) => <tr key={asset.id} className="border-t border-slate-100"><td className="py-3 font-medium text-[#0B1F3A]">{asset.value}</td><td>{asset.asset_type}</td><td>{asset.discovery_method ?? 'manual'}</td><td><StatusBadge value={asset.scope_status} /></td><td>{[asset.technology?.server, asset.technology?.x_powered_by, asset.technology?.content_type].filter(Boolean).join(' / ') || 'n/a'}</td><td>{formatDate(asset.last_observed_at)}</td></tr>)}</tbody>
        </table>
      </div>
      {!projectId ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Choose a project to view discovered assets.</p> : null}
      {projectId && assets.isLoading ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Loading assets for the selected project...</p> : null}
      {projectId && !assets.isLoading && !discoveredAssets.length ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No assets found yet. Start discovery for this project.</p> : null}
    </Card>
  </>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-[#0B1F3A]">{value}</p></div>;
}
