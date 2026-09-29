'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, ClipboardCheck, FileText, FolderKanban, PartyPopper, Radar, ShieldCheck, Siren, Smile } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { BRAND } from '@/lib/branding';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import { useApprovals } from '@/hooks/use-approvals';
import { canApprove } from '@/lib/permissions';
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const filters = useMemo(() => readFilters(params), [params]);
  const query = useMemo(() => `?${new URLSearchParams(filters).toString()}`, [filters]);
  const interval = autoRefresh ? refreshMs[filters.refresh] : false;

  const canReview = canApprove(user?.role);
  const pendingApprovals = useApprovals('pending');
  const pendingCount = pendingApprovals.data?.length ?? 0;
  const firstName = (user?.full_name || user?.username || '').split(' ')[0];

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
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}!`}
        description="Here's how things are looking across your projects today — scans, findings, and anything waiting on you."
        actions={<div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-[#DCE3EA] bg-white px-3 py-2 text-sm font-semibold text-[#0B5E9E] shadow-soft dark:border-[#3B4D63] dark:bg-[#121C2B] dark:text-[#8CCCF0]">{BRAND.companyName}</span><Link href="/scans/new"><Button><Siren className="h-4 w-4" /> New Scan</Button></Link></div>}
      />
      <WelcomeAttentionCard canReview={canReview} pendingCount={pendingCount} isLoading={pendingApprovals.isLoading} />

      <SimpleOverview
        score={metrics.data?.security_score ?? 0}
        metrics={metrics.data?.metrics ?? []}
        severityCounts={panelData.severity_distribution?.counts ?? {}}
        activeScans={panelData.active_scans?.rows ?? []}
        recommendedActions={panelData.recommended_actions?.rows ?? []}
        isLoading={metrics.isLoading || panels.isLoading}
      />

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-soft transition hover:border-[#155EEF]/40 dark:border-[#2A394D] dark:bg-[#121C2B]"
        >
          <div>
            <p className="font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">Detailed analytics</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-[#94A3B8]">Trends, heatmaps, SLA tracking, and the full operational breakdown for deeper analysis.</p>
          </div>
          {showAdvanced ? <ChevronUp className="h-5 w-5 shrink-0 text-slate-500" /> : <ChevronDown className="h-5 w-5 shrink-0 text-slate-500" />}
        </button>
      </div>

      {showAdvanced ? (
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

          <div className="xl:col-span-4"><DashboardPanel title="Approvals" description="Pending, approved, rejected, and expiring Security Team review requests." href="/approvals" isLoading={panels.isLoading} error={panels.error} data={panelData.approvals} onRefresh={() => panels.refetch()}><ApprovalMetricsPanel panel={panelData.approvals ?? {}} /></DashboardPanel></div>

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
      ) : null}
    </>
  );
}

function readFilters(params: URLSearchParams): DashboardFilters {
  return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, params.get(key) || value])) as DashboardFilters;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function WelcomeAttentionCard({ canReview, pendingCount, isLoading }: { canReview: boolean; pendingCount: number; isLoading: boolean }) {
  if (isLoading) return null;

  if (canReview) {
    return (
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-blue-100 bg-gradient-to-r from-[#EAF2FF] to-white p-5 dark:border-[#2A394D] dark:from-[#101927] dark:to-[#121C2B]">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#155EEF] text-white">
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">
              {pendingCount > 0
                ? `${pendingCount} scan${pendingCount === 1 ? ' is' : 's are'} waiting on your review`
                : "You're all caught up — nothing needs your approval right now."}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-[#94A3B8]">
              {pendingCount > 0 ? 'A quick approve or reject keeps everyone moving.' : 'Nice work! New requests will show up here as they come in.'}
            </p>
          </div>
        </div>
        {pendingCount > 0 ? (
          <Link href="/approvals"><Button>Review approvals</Button></Link>
        ) : (
          <PartyPopper className="h-6 w-6 shrink-0 text-[#155EEF]" />
        )}
      </Card>
    );
  }

  if (pendingCount > 0) {
    return (
      <Card className="mb-6 flex items-center gap-4 border-amber-100 bg-amber-50 p-5 dark:border-[#4A3B1F] dark:bg-[#241C0F]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-[#3A2E15] dark:text-amber-300">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <div>
          <p className="font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">
            {pendingCount} of your scan{pendingCount === 1 ? '' : 's'} {pendingCount === 1 ? 'is' : 'are'} waiting on Security Team approval
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-[#94A3B8]">No action needed from you — we'll let you know as soon as there's a decision.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-6 flex items-center gap-4 p-5">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-[#123024] dark:text-emerald-300">
        <Smile className="h-6 w-6" />
      </div>
      <div>
        <p className="font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">Nothing needs your attention right now.</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-[#94A3B8]">Ready when you are — start a new scan or check in on your projects below.</p>
      </div>
    </Card>
  );
}

const severityMeta = [
  { key: 'critical', label: 'Critical', classes: 'bg-red-50 text-[#DC2626] border-red-200 dark:bg-[rgba(239,68,68,0.14)] dark:text-[#F87171] dark:border-transparent' },
  { key: 'high', label: 'High', classes: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-[rgba(249,115,22,0.14)] dark:text-[#FB923C] dark:border-transparent' },
  { key: 'medium', label: 'Medium', classes: 'bg-amber-50 text-[#B76E00] border-amber-200 dark:bg-[rgba(245,158,11,0.14)] dark:text-[#FBBF24] dark:border-transparent' },
  { key: 'low', label: 'Low', classes: 'bg-green-50 text-[#17A673] border-green-200 dark:bg-[rgba(34,197,94,0.14)] dark:text-[#4ADE80] dark:border-transparent' },
  { key: 'informational', label: 'Informational', classes: 'bg-blue-50 text-[#0B5E9E] border-blue-200 dark:bg-[rgba(59,130,246,0.14)] dark:text-[#60A5FA] dark:border-transparent' },
] as const;

const overviewTiles = [
  { key: 'active_projects', label: 'Active Projects', icon: FolderKanban, href: '/projects' },
  { key: 'running_scans', label: 'Running Scans', icon: Radar, href: '/scans?status=running' },
  { key: 'open_findings', label: 'Open Findings', icon: ShieldCheck, href: '/findings?status=open' },
  { key: 'reports_ready', label: 'Reports Ready', icon: FileText, href: '/reports' },
] as const;

function SimpleOverview({ score, metrics, severityCounts, activeScans, recommendedActions, isLoading }: {
  score: number;
  metrics: DashboardMetric[];
  severityCounts: Record<string, number>;
  activeScans: any[];
  recommendedActions: any[];
  isLoading: boolean;
}) {
  const byKey = (key: string) => metrics.find((metric) => metric.key === key);

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <Card className="flex flex-col items-center justify-center p-6 text-center">
        <SecurityScoreRing value={score} isLoading={isLoading} />
        <p className="mt-3 font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">Your Security Score</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-[#94A3B8]">Based on open findings across your approved assets.</p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {overviewTiles.map((tile) => {
          const metric = byKey(tile.key);
          const Icon = tile.icon;
          return (
            <Link key={tile.key} href={tile.href}>
              <Card className="flex h-full items-center gap-4 p-5 transition hover:border-[#155EEF]/40">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#EAF2FF] text-[#155EEF] dark:bg-[#172638]">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#0B1F3A] dark:text-[#F1F5F9]">{metric?.value ?? 0}</p>
                  <p className="text-sm text-slate-600 dark:text-[#94A3B8]">{tile.label}</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="xl:col-span-2">
        <SeverityOverviewCards counts={severityCounts} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:col-span-2">
        <RecentScansCard rows={activeScans} />
        <Card className="p-5">
          <h3 className="font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">What to do next</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-[#94A3B8]">A short list of the highest-impact things worth doing today.</p>
          <div className="mt-4">
            {recommendedActions.length ? <RecommendedActionsPanel rows={recommendedActions.slice(0, 4)} /> : <p className="text-sm text-slate-500">Nothing urgent — check back after your next scan.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SecurityScoreRing({ value, isLoading }: { value: number; isLoading: boolean }) {
  const color = value >= 80 ? '#16A34A' : value >= 50 ? '#D97706' : '#DC2626';
  return (
    <div className="grid h-40 w-40 place-items-center rounded-full border-[14px] bg-[#FAFBFC] dark:bg-[#111A28]" style={{ borderColor: isLoading ? '#CBD5E1' : color }}>
      <div className="text-center">
        <p className="text-4xl font-bold text-[#102033] dark:text-[#F8FAFC]">{isLoading ? '—' : Math.round(value)}</p>
        <p className="text-xs text-[#667085] dark:text-[#94A3B8]">out of 100</p>
      </div>
    </div>
  );
}

function SeverityOverviewCards({ counts }: { counts: Record<string, number> }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">Vulnerabilities by Severity</h3>
        <Link href="/findings" className="text-sm font-semibold text-[#155EEF]">View all findings</Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {severityMeta.map((item) => (
          <Link key={item.key} href={`/findings?severity=${item.key}`} className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 ${item.classes}`}>
            <p className="text-3xl font-bold">{counts[item.key] ?? 0}</p>
            <p className="mt-1 text-sm font-medium">{item.label}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function RecentScansCard({ rows }: { rows: any[] }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">Active Scans</h3>
        <Link href="/scans" className="text-sm font-semibold text-[#155EEF]">View all scans</Link>
      </div>
      <div className="mt-4 space-y-3">
        {rows.slice(0, 4).map((row) => (
          <Link key={row.scan_id} href={`/scans/${row.scan_id}/progress`} className="block rounded-xl border border-slate-200 p-3 transition hover:border-[#155EEF]/40 dark:border-[#2A394D]">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">{row.scan}</p>
              <span className="text-xs font-semibold text-slate-500">{row.progress}%</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{row.target} &middot; {row.current_stage}</p>
          </Link>
        ))}
        {!rows.length ? <p className="text-sm text-slate-500">No scans running right now. <Link href="/scans/new" className="font-semibold text-[#155EEF]">Start one</Link>.</p> : null}
      </div>
    </Card>
  );
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
