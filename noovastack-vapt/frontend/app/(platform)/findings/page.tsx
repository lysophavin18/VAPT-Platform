'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ChevronDown, ChevronRight, ExternalLink,
  FileSearch, Filter, RefreshCw, Search, Shield, ShieldAlert,
  ShieldCheck, ShieldX,
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { SeverityBadge, StatusBadge, IntegrityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFindings, useFindingActions } from '@/hooks/use-findings';
import { useProjects } from '@/hooks/use-projects';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { formatDate } from '@/lib/utils';
import type { Finding } from '@/types';

// ── severity meta ────────────────────────────────────────────────────────────
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'informational', 'info'];
const SEV_COLOR: Record<string, string> = {
  critical:      'bg-red-500',
  high:          'bg-orange-500',
  medium:        'bg-amber-400',
  low:           'bg-blue-400',
  informational: 'bg-slate-400',
  info:          'bg-slate-400',
};
const SEV_TEXT: Record<string, string> = {
  critical:      'text-red-700 bg-red-50 border-red-200',
  high:          'text-orange-700 bg-orange-50 border-orange-200',
  medium:        'text-amber-700 bg-amber-50 border-amber-200',
  low:           'text-blue-700 bg-blue-50 border-blue-200',
  informational: 'text-slate-600 bg-slate-50 border-slate-200',
  info:          'text-slate-600 bg-slate-50 border-slate-200',
};

function sevOrder(s: string) { return SEV_ORDER.indexOf(s.toLowerCase()) ?? 99; }

// ── stat tile ────────────────────────────────────────────────────────────────
function StatTile({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Shield; color: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 ${color}`}>
      <Icon className="h-5 w-5 opacity-70 shrink-0" />
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="mt-0.5 text-xs opacity-70">{label}</p>
      </div>
    </div>
  );
}

// ── mini severity bar ────────────────────────────────────────────────────────
function SeverityBar({ findings }: { findings: Finding[] }) {
  const counts = SEV_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = findings.filter(f => f.severity.toLowerCase() === s).length;
    return acc;
  }, {});
  const total = findings.length || 1;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full gap-px">
      {SEV_ORDER.map(s => counts[s] > 0 && (
        <div key={s} className={`${SEV_COLOR[s]} rounded-sm`} style={{ width: `${(counts[s] / total) * 100}%` }} title={`${s}: ${counts[s]}`} />
      ))}
    </div>
  );
}

// ── severity pill counts ─────────────────────────────────────────────────────
function SeverityPills({ findings }: { findings: Finding[] }) {
  const counts = SEV_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = findings.filter(f => f.severity.toLowerCase() === s).length;
    return acc;
  }, {});
  return (
    <div className="flex flex-wrap gap-1.5">
      {['critical', 'high', 'medium', 'low', 'informational'].map(s =>
        counts[s] > 0 ? (
          <span key={s} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${SEV_TEXT[s]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${SEV_COLOR[s]}`} />
            {counts[s]} {s}
          </span>
        ) : null
      )}
    </div>
  );
}

// ── single finding row ───────────────────────────────────────────────────────
function FindingRow({
  finding, assetLabel, onVerify, onFp,
}: {
  finding: Finding;
  assetLabel: string;
  onVerify: () => void;
  onFp: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <div
        className="grid items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
        style={{ gridTemplateColumns: '1fr auto auto auto auto' }}
        onClick={() => setExpanded(x => !x)}
      >
        {/* Title + asset */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${SEV_COLOR[finding.severity.toLowerCase()] ?? 'bg-slate-400'}`} />
            <Link
              href={`/findings/${finding.id}`}
              className="truncate font-medium text-[#0B1F3A] hover:text-[#155EEF] text-sm"
              onClick={e => e.stopPropagation()}
            >
              {finding.title}
            </Link>
          </div>
          <p className="ml-4 mt-0.5 truncate text-xs text-slate-500">{assetLabel}</p>
        </div>

        <SeverityBadge value={finding.severity} />
        <StatusBadge value={finding.status} />
        <IntegrityBadge value={finding.integrity_status} />

        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={onVerify}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            Verify
          </button>
          <button
            onClick={onFp}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 transition-colors"
          >
            FP
          </button>
          <Link href={`/findings/${finding.id}`} onClick={e => e.stopPropagation()}>
            <ExternalLink className="h-3.5 w-3.5 text-slate-400 hover:text-[#155EEF]" />
          </Link>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mx-4 mb-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
          {finding.description && (
            <div><span className="font-semibold text-slate-700">Description: </span>{finding.description}</div>
          )}
          <div className="flex flex-wrap gap-4">
            {finding.owasp_category && <span><span className="font-semibold">OWASP: </span>{finding.owasp_category}</span>}
            {finding.cwe_id && <span><span className="font-semibold">CWE: </span>{finding.cwe_id}</span>}
            {finding.cvss_score != null && <span><span className="font-semibold">CVSS: </span>{finding.cvss_score}</span>}
            {finding.found_by_tool && <span><span className="font-semibold">Tool: </span>{finding.found_by_tool}</span>}
            {finding.last_seen && <span><span className="font-semibold">Last seen: </span>{formatDate(finding.last_seen)}</span>}
          </div>
          {finding.remediation && (
            <div><span className="font-semibold text-slate-700">Remediation: </span>{finding.remediation}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── project section ──────────────────────────────────────────────────────────
function ProjectSection({
  projectName, findings, assetMap, actions,
}: {
  projectName: string;
  findings: Finding[];
  assetMap: Map<string, string>;
  actions: ReturnType<typeof useFindingActions>;
}) {
  const [open, setOpen] = useState(true);
  const sorted = [...findings].sort((a, b) => sevOrder(a.severity) - sevOrder(b.severity));

  function doAction(id: string, action: 'verify' | 'false-positive') {
    actions.mutate({ id, action }, {
      onSuccess: () => toast.success(action === 'verify' ? 'Finding verified' : 'Marked as false positive'),
      onError: () => toast.error('Action failed'),
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* Project header */}
      <button
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(x => !x)}
      >
        {open ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-semibold text-[#0B1F3A]">{projectName}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 font-medium">
              {findings.length} finding{findings.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="mt-2 max-w-sm">
            <SeverityBar findings={findings} />
          </div>
        </div>
        <div className="ml-4 hidden sm:block">
          <SeverityPills findings={findings} />
        </div>
      </button>

      {/* Findings list */}
      {open && (
        <div className="border-t border-slate-100">
          {/* Column headers */}
          <div
            className="grid items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
            style={{ gridTemplateColumns: '1fr auto auto auto auto' }}
          >
            <span>Finding / Asset</span>
            <span>Severity</span>
            <span>Status</span>
            <span>Integrity</span>
            <span>Actions</span>
          </div>
          {sorted.map(f => (
            <FindingRow
              key={f.id}
              finding={f}
              assetLabel={assetMap.get(f.asset_id ?? '') ?? f.asset_id ?? 'Unknown asset'}
              onVerify={() => doAction(f.id, 'verify')}
              onFp={() => doAction(f.id, 'false-positive')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────
export default function FindingsPage() {
  const { token } = useAuth();
  const [severity, setSeverity] = useState('');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const query = severity ? `?severity=${severity}` : '';
  const findings = useFindings(query);
  const actions = useFindingActions();
  const projects = useProjects();

  // Load all scans to build scan→project mapping
  const scans = useQuery({
    queryKey: ['scans-all'],
    queryFn: () => api.scans(token),
    enabled: Boolean(token),
  });

  // Load all assets (flat, across all projects) to build asset_id→value mapping
  // We do this by fetching assets per project that has findings
  const scanProjectMap = useMemo(() => {
    const m = new Map<string, string>(); // scan_id → project_id
    (scans.data ?? []).forEach(s => m.set(s.id, s.project_id));
    return m;
  }, [scans.data]);

  const projectNameMap = useMemo(() => {
    const m = new Map<string, string>(); // project_id → name
    (projects.data ?? []).forEach(p => m.set(p.id, p.name));
    return m;
  }, [projects.data]);

  // Enrich findings with project_id
  const enriched = useMemo(() => (findings.data ?? []).map(f => ({
    ...f,
    _projectId: scanProjectMap.get(f.scan_id) ?? 'unknown',
  })), [findings.data, scanProjectMap]);

  // Filter
  const filtered = useMemo(() => enriched.filter(f => {
    if (projectFilter && f._projectId !== projectFilter) return false;
    if (statusFilter && f.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return f.title.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q) ||
        f.owasp_category?.toLowerCase().includes(q) ||
        f.cwe_id?.toLowerCase().includes(q);
    }
    return true;
  }), [enriched, projectFilter, statusFilter, search]);

  // Group by project
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach(f => {
      if (!map.has(f._projectId)) map.set(f._projectId, []);
      map.get(f._projectId)!.push(f);
    });
    // Sort groups: most findings first
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  // Asset label map: asset_id → value string
  // Use asset_id as label for now; can be enriched if assets are loaded
  const assetMap = useMemo(() => new Map<string, string>(), []);

  // Summary counts
  const total = enriched.length;
  const critical = enriched.filter(f => f.severity.toLowerCase() === 'critical').length;
  const high = enriched.filter(f => f.severity.toLowerCase() === 'high').length;
  const open = enriched.filter(f => f.status === 'open').length;

  // Projects that actually have findings (for filter dropdown)
  const projectsWithFindings = useMemo(() => {
    const ids = new Set(enriched.map(f => f._projectId));
    return (projects.data ?? []).filter(p => ids.has(p.id));
  }, [enriched, projects.data]);

  const loading = findings.isLoading || scans.isLoading;

  return <>
    <PageHeader
      title="Findings"
      description="Security findings grouped by project — filter by severity, status, or search across all results."
      actions={
        <button onClick={() => { findings.refetch(); scans.refetch(); }}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    />

    {/* Summary stats */}
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatTile label="Total Findings" value={total} icon={FileSearch}  color="border-slate-200 bg-slate-50 text-slate-700" />
      <StatTile label="Critical"       value={critical} icon={ShieldX}  color="border-red-200 bg-red-50 text-red-700" />
      <StatTile label="High"           value={high}     icon={ShieldAlert} color="border-orange-200 bg-orange-50 text-orange-700" />
      <StatTile label="Open"           value={open}     icon={Shield}   color="border-blue-200 bg-blue-50 text-blue-700" />
    </div>

    {/* Filters */}
    <div className="mb-5 flex flex-wrap gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:border-[#155EEF] focus:outline-none focus:ring-1 focus:ring-[#155EEF]"
          placeholder="Search findings…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Project filter */}
      <select
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#155EEF] focus:outline-none"
        value={projectFilter}
        onChange={e => setProjectFilter(e.target.value)}
      >
        <option value="">All projects</option>
        {projectsWithFindings.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {/* Severity filter */}
      <select
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#155EEF] focus:outline-none"
        value={severity}
        onChange={e => setSeverity(e.target.value)}
      >
        <option value="">All severities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="informational">Informational</option>
      </select>

      {/* Status filter */}
      <select
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#155EEF] focus:outline-none"
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value)}
      >
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="verified">Verified</option>
        <option value="false_positive">False Positive</option>
        <option value="resolved">Resolved</option>
        <option value="accepted_risk">Accepted Risk</option>
      </select>

      {(search || projectFilter || severity || statusFilter) && (
        <button
          onClick={() => { setSearch(''); setProjectFilter(''); setSeverity(''); setStatusFilter(''); }}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
        >
          <Filter className="h-3.5 w-3.5" /> Clear
        </button>
      )}
    </div>

    {/* Loading */}
    {loading && (
      <div className="space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    )}

    {/* Empty */}
    {!loading && filtered.length === 0 && (
      <EmptyState
        icon={AlertTriangle}
        title={search || projectFilter || severity || statusFilter ? 'No findings match your filters' : 'No findings yet'}
        description={search || projectFilter || severity || statusFilter
          ? 'Try adjusting your filters to see more results.'
          : 'Run a security scan to check your in-scope assets.'}
        action="Create Scan"
        href="/scans/new"
      />
    )}

    {/* Grouped findings */}
    {!loading && filtered.length > 0 && (
      <div className="space-y-4">
        {grouped.map(([projectId, pFindings]) => (
          <ProjectSection
            key={projectId}
            projectName={projectNameMap.get(projectId) ?? projectId}
            findings={pFindings}
            assetMap={assetMap}
            actions={actions}
          />
        ))}
      </div>
    )}
  </>;
}
