'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2, ChevronDown, ChevronRight, Container,
  FileCode2, Globe2, Network, Radar, RefreshCw, Server, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { ProgressBar } from '@/components/ui/progress';
import { StatusBadge } from '@/components/ui/badge';
import { ProjectPicker } from '@/components/shared/project-picker';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import { useAssets } from '@/hooks/use-assets';
import { formatDate } from '@/lib/utils';
import type { Asset, AssetTechnology, DiscoveryJobStatus } from '@/types';

// ─── constants ──────────────────────────────────────────────────────────────

const TARGET_TYPES = [
  { id: 'root_domain', label: 'Root Domain', icon: Globe2, placeholder: 'example.com' },
  { id: 'website_url', label: 'Website URL', icon: Radar, placeholder: 'https://example.com' },
  { id: 'public_ip', label: 'Public IP', icon: Server, placeholder: '203.0.113.10' },
  { id: 'cidr', label: 'CIDR Range', icon: Network, placeholder: '203.0.113.0/24' },
  { id: 'openapi', label: 'OpenAPI', icon: FileCode2, placeholder: 'https://api.example.com/openapi.json' },
  { id: 'container', label: 'Container', icon: Container, placeholder: 'docker.io/example/app:latest' },
];

const DISCOVERY_OPTIONS = [
  {
    id: 'subdomain_enum',
    label: 'Subdomain Enumeration',
    description: 'subfinder + amass passive → DNS-confirmed subdomains',
    legacy: 'passive',
  },
  {
    id: 'dns_enum',
    label: 'DNS Record Collection',
    description: 'A, AAAA, CNAME, MX, TXT, NS records via dnsx',
    legacy: 'passive',
  },
  {
    id: 'host_probe',
    label: 'Port Discovery',
    description: 'Top-100 ports via naabu (rate-limited, non-intrusive)',
    legacy: 'safe_active',
  },
  {
    id: 'tech_fingerprint',
    label: 'Technology Fingerprint',
    description: 'httpx tech-detect + whatweb → server / CMS / framework / CDN / WAF',
    legacy: 'technology_detection',
  },
];

const PIPELINE_STAGES = [
  'Validating scope & engagement',
  'Enumerating subdomains',
  'Collecting DNS records',
  'Discovering open ports',
  'Fingerprinting technologies',
  'Persisting assets',
  'Awaiting review',
];

// ─── helpers ────────────────────────────────────────────────────────────────

function techBadge(label: string, color: string) {
  return (
    <span
      key={label}
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {label}
    </span>
  );
}

function TechPills({ tech }: { tech: AssetTechnology }) {
  const pills: JSX.Element[] = [];
  if (tech.server)   pills.push(techBadge(tech.server, 'bg-slate-100 text-slate-700'));
  if (tech.cms)      pills.push(techBadge(tech.cms, 'bg-violet-100 text-violet-700'));
  if (tech.cdn)      pills.push(techBadge(tech.cdn, 'bg-sky-100 text-sky-700'));
  if (tech.waf)      pills.push(techBadge(tech.waf, 'bg-amber-100 text-amber-700'));
  if (tech.language) pills.push(techBadge(tech.language, 'bg-emerald-100 text-emerald-700'));
  (tech.frameworks ?? []).forEach(f => pills.push(techBadge(f, 'bg-indigo-100 text-indigo-700')));
  if (!pills.length && tech.tech_stack) {
    tech.tech_stack.split(',').slice(0, 4).forEach(t => {
      const s = t.trim();
      if (s) pills.push(techBadge(s, 'bg-slate-100 text-slate-600'));
    });
  }
  if (!pills.length) return <span className="text-slate-400 text-xs">—</span>;
  return <div className="flex flex-wrap gap-1">{pills}</div>;
}

function DnsRecords({ records }: { records: NonNullable<AssetTechnology['dns_records']> }) {
  const rows = [
    { type: 'A', values: records.a ?? [] },
    { type: 'AAAA', values: records.aaaa ?? [] },
    { type: 'CNAME', values: records.cname ?? [] },
    { type: 'MX', values: records.mx ?? [] },
    { type: 'NS', values: records.ns ?? [] },
    { type: 'TXT', values: records.txt ?? [] },
  ].filter(r => r.values.length > 0);

  if (!rows.length) return <span className="text-slate-400 text-xs">no records</span>;

  return (
    <div className="space-y-0.5">
      {rows.map(row => (
        <div key={row.type} className="flex gap-2 text-xs">
          <span className="w-10 shrink-0 font-mono font-semibold text-slate-500">{row.type}</span>
          <span className="text-slate-700 break-all">{row.values.slice(0, 3).join(', ')}{row.values.length > 3 ? ` +${row.values.length - 3}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

// ─── tabs ───────────────────────────────────────────────────────────────────

type Tab = 'all' | 'subdomains' | 'hosts' | 'technology';

function SubdomainsTab({ assets }: { assets: Asset[] }) {
  const domains = assets.filter(a => a.asset_type === 'domain');
  const subs = assets.filter(a => a.asset_type === 'subdomain');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (v: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });

  const grouped = useMemo(() => {
    const map: Record<string, Asset[]> = {};
    domains.forEach(d => { map[d.value] = []; });
    subs.forEach(s => {
      const parent = domains.find(d => s.value.endsWith(`.${d.value}`));
      const key = parent?.value ?? '_ungrouped';
      map[key] = map[key] ?? [];
      map[key].push(s);
    });
    return map;
  }, [domains, subs]);

  if (!domains.length && !subs.length)
    return <p className="mt-4 text-sm text-slate-500">No subdomains discovered yet.</p>;

  return (
    <div className="mt-4 space-y-2">
      {Object.entries(grouped).map(([domain, children]) => (
        <div key={domain} className="rounded-xl border border-slate-200">
          <button
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50"
            onClick={() => toggle(domain)}
          >
            {expanded.has(domain) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Globe2 className="h-4 w-4 text-[#155EEF]" />
            {domain}
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {children.length} sub{children.length !== 1 ? 's' : ''}
            </span>
          </button>
          {expanded.has(domain) && children.length > 0 && (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {children.map(sub => (
                <div key={sub.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-6 py-2 text-sm">
                  <span className="font-mono text-slate-700">{sub.value}</span>
                  <span className="text-xs text-slate-500">
                    {sub.technology?.dns_records?.a?.[0] ?? '—'}
                  </span>
                  <StatusBadge value={sub.scope_status} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function HostsTab({ assets, onReprobe }: { assets: Asset[]; onReprobe: (id: string) => Promise<void> }) {
  const hosts = assets.filter(a =>
    ['domain', 'subdomain', 'ip_address', 'service'].includes(a.asset_type) &&
    a.ports_services && Object.keys(a.ports_services).length > 0
  );

  if (!hosts.length)
    return <p className="mt-4 text-sm text-slate-500">No live hosts with open ports found yet. Enable Port Discovery and re-run.</p>;

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 text-left">Host</th>
            <th className="text-left">Type</th>
            <th className="text-left">Open Ports</th>
            <th className="text-left">DNS (A)</th>
            <th className="text-left">Status</th>
            <th className="text-left"></th>
          </tr>
        </thead>
        <tbody>
          {hosts.map(asset => {
            const ports = Object.entries(asset.ports_services ?? {});
            const aRecords = asset.technology?.dns_records?.a ?? [];
            return (
              <tr key={asset.id} className="border-t border-slate-100">
                <td className="py-3 font-medium text-[#0B1F3A]">{asset.value}</td>
                <td className="text-slate-500">{asset.asset_type}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {ports.map(([port, svc]) => (
                      <span key={port} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                        {port}/{(svc as any).service ?? '?'}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="text-xs text-slate-600">{aRecords.slice(0, 2).join(', ') || '—'}</td>
                <td><StatusBadge value={asset.scope_status} /></td>
                <td>
                  <button
                    onClick={() => onReprobe(asset.id)}
                    className="rounded p-1 text-slate-400 hover:text-[#155EEF]"
                    title="Re-probe technology"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TechnologyTab({ assets }: { assets: Asset[] }) {
  // Group by primary technology categories
  const withTech = assets.filter(a => a.technology && Object.values(a.technology).some(Boolean));

  const grouped = useMemo(() => {
    const cms: Asset[] = [], cdn: Asset[] = [], waf: Asset[] = [],
          framework: Asset[] = [], server: Asset[] = [], other: Asset[] = [];
    withTech.forEach(a => {
      const t = a.technology!;
      if (t.cms) cms.push(a);
      else if (t.cdn) cdn.push(a);
      else if (t.waf) waf.push(a);
      else if ((t.frameworks ?? []).length) framework.push(a);
      else if (t.server) server.push(a);
      else other.push(a);
    });
    return [
      { label: 'CMS', color: 'bg-violet-50 border-violet-200', items: cms },
      { label: 'CDN', color: 'bg-sky-50 border-sky-200', items: cdn },
      { label: 'WAF', color: 'bg-amber-50 border-amber-200', items: waf },
      { label: 'Framework', color: 'bg-indigo-50 border-indigo-200', items: framework },
      { label: 'Server', color: 'bg-slate-50 border-slate-200', items: server },
      { label: 'Other', color: 'bg-slate-50 border-slate-200', items: other },
    ].filter(g => g.items.length > 0);
  }, [withTech]);

  if (!withTech.length)
    return <p className="mt-4 text-sm text-slate-500">No technology fingerprints yet. Enable Technology Fingerprint and re-run.</p>;

  return (
    <div className="mt-4 space-y-6">
      {grouped.map(group => (
        <div key={group.label}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{group.label}</h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Host</th>
                  <th className="px-4 py-2 text-left">Technology</th>
                  <th className="px-4 py-2 text-left">DNS</th>
                  <th className="px-4 py-2 text-left">Status Code</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map(asset => (
                  <tr key={asset.id} className={`border-t border-slate-100 ${group.color}`}>
                    <td className="px-4 py-2 font-medium text-[#0B1F3A]">{asset.value}</td>
                    <td className="px-4 py-2">
                      <TechPills tech={asset.technology!} />
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {asset.technology?.dns_records
                        ? <DnsRecords records={asset.technology.dns_records} />
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-slate-600">
                      {asset.technology?.status_code ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function AllAssetsTab({ assets, onReprobe }: { assets: Asset[]; onReprobe: (id: string) => Promise<void> }) {
  if (!assets.length)
    return <p className="mt-4 text-sm text-slate-500">No assets in this project yet. Start discovery above.</p>;

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 text-left">Asset</th>
            <th className="text-left">Type</th>
            <th className="text-left">Method</th>
            <th className="text-left">Technology</th>
            <th className="text-left">Ports</th>
            <th className="text-left">Status</th>
            <th className="text-left">Observed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {assets.map(asset => (
            <tr key={asset.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="py-2.5 font-medium text-[#0B1F3A] max-w-[240px] truncate">{asset.value}</td>
              <td className="text-slate-500">{asset.asset_type}</td>
              <td className="text-slate-500">{asset.discovery_method ?? 'manual'}</td>
              <td>
                {asset.technology
                  ? <TechPills tech={asset.technology} />
                  : <span className="text-slate-400 text-xs">—</span>}
              </td>
              <td className="text-xs font-mono text-slate-500">
                {asset.ports_services && Object.keys(asset.ports_services).length > 0
                  ? Object.keys(asset.ports_services).join(', ')
                  : '—'}
              </td>
              <td><StatusBadge value={asset.scope_status} /></td>
              <td className="text-xs text-slate-500">{formatDate(asset.last_observed_at)}</td>
              <td>
                <button
                  onClick={() => onReprobe(asset.id)}
                  className="rounded p-1 text-slate-400 hover:text-[#155EEF]"
                  title="Re-probe"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── main page ──────────────────────────────────────────────────────────────

export default function AssetDiscoveryPage() {
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const projects = useProjects();
  const { token } = useAuth();

  const [projectId, setProjectId] = useState(search.get('project') ?? '');
  const [targetType, setTargetType] = useState('root_domain');
  const [target, setTarget] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>(
    ['subdomain_enum', 'dns_enum', 'host_probe', 'tech_fingerprint']
  );
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<DiscoveryJobStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const assets = useAssets(projectId);
  const allAssets = assets.data ?? [];

  // Derived counts
  const subdomainCount = useMemo(() => allAssets.filter(a => a.asset_type === 'subdomain').length, [allAssets]);
  const liveHostCount = useMemo(() => allAssets.filter(a => a.ports_services && Object.keys(a.ports_services).length > 0).length, [allAssets]);
  const techCount = useMemo(() => allAssets.filter(a => a.technology && Object.values(a.technology).some(Boolean)).length, [allAssets]);

  useEffect(() => {
    if (!projectId && projects.data?.[0]?.id) {
      setProjectId(projects.data[0].id);
    }
  }, [projectId, projects.data]);

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback((jid: string, pid: string) => {
    stopPolling();
    let attempt = 0;
    pollRef.current = setInterval(async () => {
      attempt += 1;
      try {
        const status = await api.discoveryJobStatus(pid, jid, token);
        setJobStatus(status);
        // Advance progress indicator through pipeline stages
        const stageProgress = Math.min(90, 20 + attempt * 8);
        setProgress(stageProgress);

        if (status.state === 'SUCCESS' || status.state === 'FAILURE') {
          stopPolling();
          setRunning(false);
          setProgress(100);
          await queryClient.invalidateQueries({ queryKey: ['assets', pid] });
          await assets.refetch();
          if (status.state === 'SUCCESS') {
            toast.success(`Discovery complete — ${status.assets_found} asset${status.assets_found !== 1 ? 's' : ''} found`);
          } else {
            toast.error(`Discovery failed: ${status.error ?? 'unknown error'}`);
          }
        }
        // Safety cap: stop polling after 5 min (60 × 5s ticks)
        if (attempt >= 60) { stopPolling(); setRunning(false); }
      } catch {
        // transient network error — keep polling
      }
    }, 5000);
  }, [token, queryClient, assets, stopPolling]);

  async function startDiscovery() {
    if (!projectId || !target.trim()) { toast.error('Choose a project and enter a target'); return; }
    if (!selectedOptions.length) { toast.error('Choose at least one discovery option'); return; }

    setRunning(true);
    setProgress(10);
    setJobStatus(null);

    try {
      const response = await api.discoverAssets(
        projectId,
        { target: target.trim(), target_type: targetType, discovery_types: selectedOptions },
        token,
      );
      setJobId(response.job_id);
      setProgress(18);
      toast.success(response.message ?? 'Discovery started');
      startPolling(response.job_id, projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start discovery';
      toast.error(message);
      setRunning(false);
      setProgress(0);
    }
  }

  async function handleReprobe(assetId: string) {
    try {
      await api.reprobe(assetId, token);
      toast.success('Re-probe complete');
      await assets.refetch();
    } catch {
      toast.error('Re-probe failed');
    }
  }

  function toggleOption(opt: string) {
    setSelectedOptions(cur => cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt]);
  }

  const placeholder = TARGET_TYPES.find(t => t.id === targetType)?.placeholder ?? 'Enter target';

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'all', label: 'All Assets', count: allAssets.length },
    { id: 'subdomains', label: 'Subdomains', count: subdomainCount },
    { id: 'hosts', label: 'Live Hosts', count: liveHostCount },
    { id: 'technology', label: 'Technology', count: techCount },
  ];

  const stageIndex = Math.floor((progress / 100) * PIPELINE_STAGES.length);

  return <>
    <PageHeader
      title="Asset Discovery"
      description="ProjectDiscovery-style pipeline: subdomain enum → DNS records → port scan → technology fingerprint."
      breadcrumbs={[{ href: '/assets', label: 'Assets' }, { label: 'Discovery' }]}
    />

    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      {/* ── Left: config ── */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[#0B1F3A]">Target</h2>

        {/* Target type tiles */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {TARGET_TYPES.map(type => {
            const Icon = type.icon;
            return (
              <button
                key={type.id}
                onClick={() => setTargetType(type.id)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm text-left transition ${
                  targetType === type.id
                    ? 'border-[#155EEF] bg-[#EAF2FF] font-semibold text-[#155EEF]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {type.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          <ProjectPicker projects={projects.data ?? []} value={projectId} onChange={setProjectId} />
        </div>

        <div className="mt-3">
          <Field label="Target">
            <Input
              placeholder={placeholder}
              value={target}
              onChange={e => setTarget(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !running && startDiscovery()}
            />
          </Field>
        </div>

        {/* Discovery options */}
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#0B1F3A]">Pipeline Modules</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {DISCOVERY_OPTIONS.map(opt => (
              <label
                key={opt.id}
                className={`cursor-pointer rounded-xl border bg-white p-3 text-sm transition ${
                  selectedOptions.includes(opt.id)
                    ? 'border-[#155EEF] ring-1 ring-[#155EEF]'
                    : 'border-slate-200'
                }`}
              >
                <span className="flex items-center gap-2 font-medium text-[#0B1F3A]">
                  <input
                    type="checkbox"
                    className="accent-[#155EEF]"
                    checked={selectedOptions.includes(opt.id)}
                    onChange={() => toggleOption(opt.id)}
                  />
                  {opt.label}
                </span>
                <span className="mt-1 block text-xs text-slate-500">{opt.description}</span>
              </label>
            ))}
          </div>
        </div>

        <Button className="mt-5 w-full sm:w-auto" onClick={startDiscovery} disabled={running}>
          {running ? 'Discovery Running…' : 'Run Discovery'}
        </Button>
      </Card>

      {/* ── Right: pipeline progress ── */}
      <Card className="p-6">
        <h2 className="mb-4 font-semibold text-[#0B1F3A]">Pipeline Status</h2>
        <ProgressBar
          value={progress}
          label={
            running
              ? PIPELINE_STAGES[Math.min(stageIndex, PIPELINE_STAGES.length - 1)]
              : progress === 100
              ? `Done — ${jobStatus?.assets_found ?? 0} assets`
              : 'Ready'
          }
        />

        {jobId && (
          <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
            job {jobId}
          </p>
        )}

        <div className="mt-5 space-y-2">
          {PIPELINE_STAGES.map((stage, i) => {
            const done = progress >= ((i + 1) / PIPELINE_STAGES.length) * 100;
            const failed = jobStatus?.state === 'FAILURE' && !done && i === stageIndex;
            return (
              <div key={stage} className="flex items-center gap-3 text-sm">
                {failed
                  ? <XCircle className="h-4 w-4 text-red-400" />
                  : <CheckCircle2 className={`h-4 w-4 ${done ? 'text-emerald-500' : 'text-slate-200'}`} />}
                <span className={done ? 'text-[#0B1F3A]' : 'text-slate-400'}>{stage}</span>
              </div>
            );
          })}
        </div>

        {jobStatus?.error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {jobStatus.error}
          </div>
        )}
      </Card>
    </div>

    {/* ── Summary tiles ── */}
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <SummaryCard label="Total Assets" value={allAssets.length} accent />
      <SummaryCard label="Subdomains" value={subdomainCount} />
      <SummaryCard label="Live Hosts" value={liveHostCount} />
      <SummaryCard label="Fingerprinted" value={techCount} />
    </div>

    {/* ── Results tabs ── */}
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-[#155EEF] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${activeTab === tab.id ? 'bg-white/20' : 'bg-slate-200'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          onClick={() => assets.refetch()}
          disabled={!projectId || assets.isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${assets.isFetching ? 'animate-spin' : ''}`} />
          {assets.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {!projectId && (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Select a project to see discovered assets.
        </p>
      )}

      {projectId && assets.isLoading && (
        <p className="mt-4 text-sm text-slate-500">Loading assets…</p>
      )}

      {projectId && !assets.isLoading && (
        <>
          {activeTab === 'all' && <AllAssetsTab assets={allAssets} onReprobe={handleReprobe} />}
          {activeTab === 'subdomains' && <SubdomainsTab assets={allAssets} />}
          {activeTab === 'hosts' && <HostsTab assets={allAssets} onReprobe={handleReprobe} />}
          {activeTab === 'technology' && <TechnologyTab assets={allAssets} />}
        </>
      )}
    </Card>
  </>;
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'border-[#155EEF] bg-[#EAF2FF]' : 'border-slate-200 bg-slate-50'}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent ? 'text-[#155EEF]' : 'text-[#0B1F3A]'}`}>{value}</p>
    </div>
  );
}
