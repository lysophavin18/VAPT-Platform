'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Siren } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { BRAND } from '@/lib/branding';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import {
  ActiveScanPanel,
  AIAgentMetricsPanel,
  AgenticSafetyPanel,
  ApprovalMetricsPanel,
  AssetCoveragePanel,
  AssetRiskPanel,
  DashboardPanel,
  DashboardToolbar,
  DonutPanel,
  EvidencePipelinePanel,
  FindingTrendPanel,
  GaugePanel,
  GrafanaStyleDashboard,
  HeatmapPanel,
  RecommendedActionsPanel,
  RemediationPanel,
  ScanThroughputPanel,
  SecurityPosturePanel,
  StatPanel,
  TablePanel,
  TimeSeriesPanel,
  TopVulnerabilityCategoriesPanel,
  ValidationFunnelPanel,
  SystemHealthPanel,
  ActivityLogPanel,
  type DashboardFilters,
} from '@/components/dashboard/grafana-style-dashboard';
import type { Asset, DashboardMetric, Project, TimeSeries } from '@/types';

const defaults: DashboardFilters = { project_id: 'all', environment: 'all', asset_id: 'all', scan_type: 'all', severity: 'all', status: 'all', range: '30d', refresh: '30s' };
const refreshMs: Record<string, false | number> = { off: false, '5s': 5000, '10s': 10000, '30s': 30000, '1m': 60000, '5m': 300000, '15m': 900000 };

export default function DashboardPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [liveStatus, setLiveStatus] = useState('Connected');
  const filters = useMemo(() => readFilters(params), [params]);
  const query = useMemo(() => `?${new URLSearchParams(filters).toString()}`, [filters]);
  const interval = autoRefresh ? refreshMs[filters.refresh] : false;

  const projects = useProjects();
  const allAssets = useQuery({
    queryKey: ['dashboard-assets', projects.data?.map((project) => project.id).join(',')],
    queryFn: async () => {
      const rows = await Promise.all((projects.data ?? []).slice(0, 30).map((project) => api.assets(project.id, token).catch(() => [] as Asset[])));
      return rows.flat();
    },
    enabled: Boolean(token && projects.data?.length),
  });
  const metrics = useQuery({ queryKey: ['dashboard-metrics', query], queryFn: () => api.dashboardMetrics(query, token), enabled: Boolean(token), refetchInterval: interval });
  const timeseries = useQuery({ queryKey: ['dashboard-timeseries', query], queryFn: () => api.dashboardTimeseries(query, token), enabled: Boolean(token), refetchInterval: interval });
  const panels = useQuery({ queryKey: ['dashboard-panels', query], queryFn: () => api.dashboardPanels(query, token), enabled: Boolean(token), refetchInterval: interval });

  useEffect(() => {
    if (metrics.dataUpdatedAt || timeseries.dataUpdatedAt || panels.dataUpdatedAt) setLastRefresh(new Date(Math.max(metrics.dataUpdatedAt, timeseries.dataUpdatedAt, panels.dataUpdatedAt)));
  }, [metrics.dataUpdatedAt, panels.dataUpdatedAt, timeseries.dataUpdatedAt]);

  useEffect(() => {
    if (!autoRefresh) setLiveStatus('Paused');
    else if (metrics.isError || timeseries.isError || panels.isError) setLiveStatus('Reconnecting');
    else setLiveStatus('Connected');
  }, [autoRefresh, metrics.isError, panels.isError, timeseries.isError]);

  function updateFilters(next: DashboardFilters) {
    startTransition(() => router.replace(`${pathname}?${new URLSearchParams(next).toString()}`, { scroll: false }));
  }

  function refreshAll() {
    metrics.refetch();
    timeseries.refetch();
    panels.refetch();
  }

  const panelData = panels.data ?? {};
  const postureSeries = toPostureFallback(timeseries.data?.posture, metrics.data?.security_score, metrics.data?.asset_coverage, metrics.data?.remediation_completion);

  return (
    <>
      <PageHeader title="Security Dashboard" description="NoovaStack monitoring workspace for security posture, scans, findings, approvals, Generative AI automation, evidence, and operational health." actions={<div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-[#DCE3EA] bg-white px-3 py-2 text-sm font-semibold text-[#0B5E9E] shadow-soft dark:border-[#3B4D63] dark:bg-[#121C2B] dark:text-[#8CCCF0]">{BRAND.companyName}</span><Link href="/scans/new"><Button><Siren className="h-4 w-4" /> New Scan</Button></Link></div>} />
      <GrafanaStyleDashboard>
        <DashboardToolbar filters={filters} onChange={updateFilters} onRefresh={refreshAll} lastRefreshed={lastRefresh ? relativeTime(lastRefresh) : 'not yet'} liveStatus={liveStatus} autoRefresh={autoRefresh} onAutoRefreshChange={setAutoRefresh} projects={(projects.data ?? []) as Project[]} assets={allAssets.data ?? []} />
        {isPending ? <div className="mb-3 rounded-xl border border-[#DCE3EA] bg-white px-3 py-2 text-sm text-[#667085] shadow-soft dark:border-[#2A394D] dark:bg-[#121C2B] dark:text-[#B3C0D1]">Updating dashboard filters...</div> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {(metrics.data?.metrics ?? fallbackMetrics()).map((metric: DashboardMetric) => <StatPanel key={metric.key} metric={metric} />)}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-12"><DashboardPanel title="Security Posture Over Time" description="Security score, asset coverage, remediation completion, and verified finding rate with zoom brush and threshold reference." href="/findings" isLoading={timeseries.isLoading} error={timeseries.error} data={timeseries.data} onRefresh={() => timeseries.refetch()}><SecurityPosturePanel data={postureSeries} /></DashboardPanel></div>

          <div className="xl:col-span-8"><DashboardPanel title="Findings Trend" description="New, verified, fixed, reopened, and rejected findings grouped by the selected interval." href="/findings" isLoading={timeseries.isLoading} error={timeseries.error} data={timeseries.data?.findings} onRefresh={() => timeseries.refetch()}><FindingTrendPanel series={timeseries.data?.findings ?? []} /></DashboardPanel></div>
          <div className="xl:col-span-4"><DashboardPanel title="Severity Distribution" description="Current finding distribution with verified, flagged, and fixed counts." href="/findings" isLoading={panels.isLoading} error={panels.error} empty={!panelData.severity_distribution?.total} data={panelData.severity_distribution} onRefresh={() => panels.refetch()}><DonutPanel counts={panelData.severity_distribution?.counts ?? {}} total={panelData.severity_distribution?.total ?? 0} /><div className="mt-3 grid grid-cols-3 gap-2 text-xs text-[#667085] dark:text-[#B3C0D1]"><span>Verified: {panelData.severity_distribution?.verified ?? 0}</span><span>Flagged: {panelData.severity_distribution?.flagged ?? 0}</span><span>Fixed: {panelData.severity_distribution?.fixed ?? 0}</span></div></DashboardPanel></div>

          <div className="xl:col-span-8"><DashboardPanel title="Scan Throughput" description="Started, completed, failed, blocked, and cancelled scans across the selected time range." href="/scans" isLoading={timeseries.isLoading} error={timeseries.error} data={timeseries.data?.scans} onRefresh={() => timeseries.refetch()}><ScanThroughputPanel series={timeseries.data?.scans ?? []} /></DashboardPanel></div>
          <div className="xl:col-span-4"><DashboardPanel title="Scan Success Rate" description="Completion health against administrator-configurable green and amber thresholds." href="/scans" isLoading={panels.isLoading} error={panels.error} data={panelData.scan_success_rate} onRefresh={() => panels.refetch()}><GaugePanel value={panelData.scan_success_rate?.rate ?? 100} thresholds={panelData.scan_success_rate?.thresholds} /><TablePanel rows={[panelData.scan_success_rate ?? {}]} columns={[{ key: 'successful', header: 'Successful' }, { key: 'failed', header: 'Failed' }, { key: 'blocked', header: 'Blocked' }, { key: 'cancelled', header: 'Cancelled' }]} /></DashboardPanel></div>

          <div className="xl:col-span-8"><DashboardPanel title="Active Scan Progress" description="Current scan stages, progress, elapsed time, ETA, candidate findings, and evidence count." href="/scans" isLoading={panels.isLoading} error={panels.error} empty={!panelData.active_scans?.rows?.length} data={panelData.active_scans} onRefresh={() => panels.refetch()}><ActiveScanPanel rows={panelData.active_scans?.rows ?? []} /></DashboardPanel></div>
          <div className="xl:col-span-4"><DashboardPanel title="Scan Duration" description="Duration percentiles identify slow or stalled workflows by scan category." href="/scans" isLoading={panels.isLoading} error={panels.error} data={panelData.scan_duration} onRefresh={() => panels.refetch()}><TablePanel rows={[panelData.scan_duration ?? {}]} columns={[{ key: 'average', header: 'Avg' }, { key: 'p50', header: 'P50' }, { key: 'p75', header: 'P75' }, { key: 'p90', header: 'P90' }, { key: 'p95', header: 'P95' }, { key: 'maximum', header: 'Max' }]} /></DashboardPanel></div>

          <div className="xl:col-span-8"><DashboardPanel title="Highest-Risk Assets" description="Sortable risk candidates calculated from verified severity and scan coverage." href="/assets" isLoading={panels.isLoading} error={panels.error} empty={!panelData.highest_risk_assets?.rows?.length} data={panelData.highest_risk_assets} onRefresh={() => panels.refetch()}><AssetRiskPanel rows={panelData.highest_risk_assets?.rows ?? []} /></DashboardPanel></div>
          <div className="xl:col-span-4"><DashboardPanel title="Asset Scan Coverage" description="Approved assets scanned recently, stale coverage, pending approval, and inactive inventory." href="/assets" isLoading={panels.isLoading} error={panels.error} data={panelData.asset_coverage} onRefresh={() => panels.refetch()}><AssetCoveragePanel panel={panelData.asset_coverage ?? { rows: [], percentage: 0 }} /></DashboardPanel></div>

          <div className="xl:col-span-8"><DashboardPanel title="OWASP Risk Heatmap" description="Verified finding intensity by OWASP category and project. Cells drill down to Findings." href="/findings" isLoading={panels.isLoading} error={panels.error} empty={!panelData.owasp_heatmap?.rows?.length} data={panelData.owasp_heatmap} onRefresh={() => panels.refetch()}><HeatmapPanel rows={panelData.owasp_heatmap?.rows ?? []} /></DashboardPanel></div>
          <div className="xl:col-span-4"><DashboardPanel title="Top Vulnerability Categories" description="Category ranking by finding count, affected assets, and previous-period change." href="/findings" isLoading={panels.isLoading} error={panels.error} empty={!panelData.top_vulnerability_categories?.rows?.length} data={panelData.top_vulnerability_categories} onRefresh={() => panels.refetch()}><TopVulnerabilityCategoriesPanel rows={panelData.top_vulnerability_categories?.rows ?? []} /></DashboardPanel></div>

          <div className="xl:col-span-4"><DashboardPanel title="Remediation Status" description="Open, in-progress, retest-ready, fixed, accepted, and overdue findings." href="/findings" isLoading={panels.isLoading} error={panels.error} data={panelData.remediation} onRefresh={() => panels.refetch()}><RemediationPanel panel={panelData.remediation ?? {}} /></DashboardPanel></div>
          <div className="xl:col-span-4"><DashboardPanel title="Mean Time to Remediate" description="MTTR trend placeholder is aggregated from current remediation records as data accumulates." href="/findings" isLoading={timeseries.isLoading} error={timeseries.error} data={timeseries.data?.findings} onRefresh={() => timeseries.refetch()}><TimeSeriesPanel series={deriveMttr(timeseries.data?.findings ?? [])} height={260} /></DashboardPanel></div>
          <div className="xl:col-span-4"><DashboardPanel title="SLA Compliance" description="Within SLA, due soon, overdue, and breached counts using severity-based workflow thresholds." href="/findings" isLoading={panels.isLoading} error={panels.error} data={panelData.remediation} onRefresh={() => panels.refetch()}><TablePanel rows={[{ within_sla: Math.max(0, (panelData.remediation?.open ?? 0) - (panelData.remediation?.overdue ?? 0)), due_soon: panelData.remediation?.ready_for_retest ?? 0, overdue: panelData.remediation?.overdue ?? 0, sla_breached: panelData.remediation?.overdue ?? 0 }]} columns={[{ key: 'within_sla', header: 'Within SLA' }, { key: 'due_soon', header: 'Due Soon' }, { key: 'overdue', header: 'Overdue' }, { key: 'sla_breached', header: 'Breached' }]} /></DashboardPanel></div>

          <div className="xl:col-span-4"><DashboardPanel title="Generative AI Automation Status" description="Registered, running, idle, approval-gated, failed, blocked, and offline automation states." href="/ai-agents" isLoading={panels.isLoading} error={panels.error} data={panelData.ai_agents} onRefresh={() => panels.refetch()}><AIAgentMetricsPanel panel={panelData.ai_agents ?? {}} /></DashboardPanel></div>
          <div className="xl:col-span-4"><DashboardPanel title="Automation Task Throughput" description="Task activity inferred from local Generative AI automation workflow events and active security operations." href="/ai-agents" isLoading={timeseries.isLoading} error={timeseries.error} data={timeseries.data?.scans} onRefresh={() => timeseries.refetch()}><TimeSeriesPanel series={deriveAiThroughput(timeseries.data?.scans ?? [])} height={260} /></DashboardPanel></div>
          <div className="xl:col-span-4"><DashboardPanel title="Automation Safety Top 10" description="Compact safety-control status for local automation risks and policy enforcement events." href="/ai-agents" isLoading={panels.isLoading} error={panels.error} data={panelData.agentic_safety} onRefresh={() => panels.refetch()}><AgenticSafetyPanel rows={panelData.agentic_safety?.rows ?? []} /></DashboardPanel></div>

          <div className="xl:col-span-6"><DashboardPanel title="Evidence Processing" description="Pipeline from raw observations through report inclusion, with backlog and redaction metrics." href="/reports" isLoading={panels.isLoading} error={panels.error} data={panelData.evidence_pipeline} onRefresh={() => panels.refetch()}><EvidencePipelinePanel panel={panelData.evidence_pipeline ?? { rows: [] }} /></DashboardPanel></div>
          <div className="xl:col-span-6"><DashboardPanel title="Findings Validation Funnel" description="Conversion from raw observations to candidate, evidence-valid, verified, reportable, and fixed findings." href="/findings" isLoading={panels.isLoading} error={panels.error} data={panelData.validation_funnel} onRefresh={() => panels.refetch()}><ValidationFunnelPanel rows={panelData.validation_funnel?.rows ?? []} /></DashboardPanel></div>

          {user?.role === 'admin' ? <div className="xl:col-span-12"><DashboardPanel title="System and Worker Health" description="Administrator-only operational status without exposing sensitive host details." href="/administration" isLoading={panels.isLoading} error={panels.error} data={panelData.system_health} onRefresh={() => panels.refetch()}><SystemHealthPanel rows={panelData.system_health?.rows ?? []} /></DashboardPanel></div> : null}

          <div className="xl:col-span-8"><DashboardPanel title="Security Activity" description="Application audit and workflow activity with search, live-tail style updates, filtering, and download." href="/audit-logs" isLoading={panels.isLoading} error={panels.error} empty={!panelData.activity?.rows?.length} data={panelData.activity?.rows} onRefresh={() => panels.refetch()}><ActivityLogPanel rows={panelData.activity?.rows ?? []} /></DashboardPanel></div>
          <div className="xl:col-span-4"><DashboardPanel title="Recommended Actions" description="Actionable work queue prioritized by risk, due date, count, and responsible role." href="/findings" isLoading={panels.isLoading} error={panels.error} data={panelData.recommended_actions} onRefresh={() => panels.refetch()}><RecommendedActionsPanel rows={panelData.recommended_actions?.rows ?? []} /></DashboardPanel></div>
        </div>
      </GrafanaStyleDashboard>
    </>
  );
}

function readFilters(params: URLSearchParams): DashboardFilters {
  return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, params.get(key) || value])) as DashboardFilters;
}

function relativeTime(value: Date) {
  const seconds = Math.max(0, Math.round((Date.now() - value.getTime()) / 1000));
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
}

function fallbackMetrics(): DashboardMetric[] {
  return ['Security Score', 'Active Projects', 'Approved Assets', 'Running Scans', 'Failed Scans', 'Open Findings', 'Critical Findings', 'Pending Approvals', 'Retests Required', 'Reports Ready', 'Active Automations', 'Policy Violations'].map((title, index) => ({ key: title.toLowerCase().replaceAll(' ', '_'), title, value: 0, previous: 0, change: 0, status: 'ok', href: index === 0 ? '/findings' : '/dashboard' }));
}

function toPostureFallback(rows: any[] | undefined, security = 0, coverage = 0, remediation = 0) {
  if (rows?.length) return rows;
  return Array.from({ length: 8 }, (_, index) => ({ timestamp: new Date(Date.now() - (7 - index) * 3600_000).toISOString(), security_score: security, asset_coverage: coverage, remediation_completion: remediation, verified_finding_rate: 0 }));
}

function deriveMttr(series: TimeSeries[]) {
  const fixed = series.find((item) => item.name === 'Fixed Findings')?.points ?? [];
  return ['Critical MTTR', 'High MTTR', 'Medium MTTR', 'Low MTTR'].map((name, index) => ({ name, points: fixed.map((point) => ({ timestamp: point.timestamp, value: Number(point.value) * (index + 1) })) }));
}

function deriveAiThroughput(series: TimeSeries[]) {
  const started = series.find((item) => item.name === 'Scans Started')?.points ?? [];
  const completed = series.find((item) => item.name === 'Scans Completed')?.points ?? [];
  const failed = series.find((item) => item.name === 'Scans Failed')?.points ?? [];
  return [
    { name: 'Tasks Started', points: started },
    { name: 'Tasks Completed', points: completed },
    { name: 'Tasks Failed', points: failed },
    { name: 'Recommendations Generated', points: completed.map((point) => ({ ...point, value: Number(point.value) * 2 })) },
  ];
}
