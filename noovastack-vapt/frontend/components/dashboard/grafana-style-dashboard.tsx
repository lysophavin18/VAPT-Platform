'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Bar, BarChart, Brush, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, ExternalLink, Maximize2, RefreshCw, Search, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DashboardMetric, DashboardTimeseriesResponse, TimeSeries } from '@/types';

const lightChart = {
  colors: ['#0B5E9E', '#16A34A', '#D97706', '#7C3AED', '#2563EB', '#EA580C', '#DC2626'],
  severity: { Critical: '#DC2626', High: '#EA580C', Medium: '#D97706', Low: '#2563EB', Informational: '#667085' } as Record<string, string>,
  grid: '#E4EAF0',
  axis: '#667085',
  brush: '#FAFBFC',
  threshold: '#D97706',
  line: '#0B5E9E',
};
const darkChart = {
  colors: ['#38A7E0', '#22C55E', '#F59E0B', '#A78BFA', '#3B82F6', '#F97316', '#EF4444'],
  severity: { Critical: '#EF4444', High: '#F97316', Medium: '#F59E0B', Low: '#3B82F6', Informational: '#3B82F6' } as Record<string, string>,
  grid: '#2B394C',
  axis: '#94A3B8',
  brush: '#172334',
  threshold: '#F59E0B',
  line: '#2D8AC4',
};

export type DashboardFilters = {
  project_id: string;
  environment: string;
  asset_id: string;
  scan_type: string;
  severity: string;
  status: string;
  range: string;
  refresh: string;
};

export function GrafanaStyleDashboard({ children }: { children: React.ReactNode }) {
  return <section className="dashboard-workspace rounded-3xl border border-[#DCE3EA] bg-[#F6F8FC] p-3 text-[#102033] shadow-soft dark:border-[#2A394D] dark:bg-[#0B111B] dark:text-[#F1F5F9] sm:p-4 lg:p-5">{children}</section>;
}

export function DashboardToolbar({ filters, onChange, onRefresh, lastRefreshed, liveStatus, autoRefresh, onAutoRefreshChange, projects = [], assets = [] }: { filters: DashboardFilters; onChange: (next: DashboardFilters) => void; onRefresh: () => void; lastRefreshed: string; liveStatus: string; autoRefresh: boolean; onAutoRefreshChange: (value: boolean) => void; projects?: Array<{ id: string; name: string; environment?: string }>; assets?: Array<{ id: string; name?: string | null; value: string }> }) {
  const set = (key: keyof DashboardFilters, value: string) => onChange({ ...filters, [key]: value });
  return <div className="sticky top-16 z-20 mb-4 rounded-2xl border border-[#DCE3EA] bg-white/95 p-3 shadow-soft backdrop-blur dark:border-[#2A394D] dark:bg-[#121C2B]">
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6 2xl:grid-cols-10">
      <Select aria-label="Project selector" value={filters.project_id} onChange={(event) => set('project_id', event.target.value)}><option value="all">All Projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select>
      <Select aria-label="Environment selector" value={filters.environment} onChange={(event) => set('environment', event.target.value)}><option value="all">All Environments</option><option value="production">Production</option><option value="staging">Staging</option><option value="testing">Testing</option><option value="development">Development</option></Select>
      <Select aria-label="Asset selector" value={filters.asset_id} onChange={(event) => set('asset_id', event.target.value)}><option value="all">All Assets</option>{assets.slice(0, 100).map((asset) => <option key={asset.id} value={asset.id}>{asset.name || asset.value}</option>)}</Select>
      <Select aria-label="Scan type selector" value={filters.scan_type} onChange={(event) => set('scan_type', event.target.value)}><option value="all">All Scan Types</option><option value="vulnerability_scan">Vulnerability</option><option value="website">Website</option><option value="api_security">API</option><option value="network">Network</option><option value="container">Container</option></Select>
      <Select aria-label="Severity selector" value={filters.severity} onChange={(event) => set('severity', event.target.value)}><option value="all">All Severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="informational">Informational</option></Select>
      <Select aria-label="Finding status selector" value={filters.status} onChange={(event) => set('status', event.target.value)}><option value="all">All Statuses</option><option value="open">Open</option><option value="in_progress">In Progress</option><option value="ready_for_retest">Ready for Retest</option><option value="fixed">Fixed</option><option value="risk_accepted">Risk Accepted</option></Select>
      <DashboardTimeRangePicker value={filters.range} onChange={(value) => set('range', value)} />
      <DashboardRefreshControl value={filters.refresh} onChange={(value) => set('refresh', value)} />
      <button type="button" onClick={onRefresh} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#DCE3EA] bg-white px-3 py-2 text-sm font-semibold text-[#102033] hover:border-[#0B5E9E] hover:bg-[#EAF4FB] dark:border-[#3B4D63] dark:bg-transparent dark:text-[#D7E1ED] dark:hover:bg-[#172638]"><RefreshCw className="h-4 w-4" /> Refresh</button>
      <div className="flex items-center gap-2 rounded-lg border border-[#DCE3EA] bg-white px-3 py-2 text-sm text-[#102033] dark:border-[#3B4D63] dark:bg-[#101927] dark:text-[#DCE5EF]"><label className="flex items-center gap-2"><input type="checkbox" checked={autoRefresh} onChange={(event) => onAutoRefreshChange(event.target.checked)} /> Auto</label><Settings className="ml-auto h-4 w-4 text-[#667085] dark:text-[#94A3B8]" /></div>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#667085] dark:text-[#B3C0D1]"><span>Last refreshed: {lastRefreshed}</span><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#16A34A] dark:bg-[#22C55E]" /> Live updates: {liveStatus}</span><button className="rounded border border-[#DCE3EA] bg-white px-2 py-1 hover:border-[#0B5E9E] hover:bg-[#EAF4FB] dark:border-[#3B4D63] dark:bg-transparent dark:text-[#D7E1ED] dark:hover:bg-[#172638]">Export</button><button className="rounded border border-[#DCE3EA] bg-white px-2 py-1 hover:border-[#0B5E9E] hover:bg-[#EAF4FB] dark:border-[#3B4D63] dark:bg-transparent dark:text-[#D7E1ED] dark:hover:bg-[#172638]">Fullscreen mode</button></div>
  </div>;
}

export function DashboardTimeRangePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Select aria-label="Time range" value={value} onChange={(event) => onChange(event.target.value)}><option value="15m">Last 15 minutes</option><option value="1h">Last 1 hour</option><option value="6h">Last 6 hours</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="custom">Custom range</option></Select>;
}

export function DashboardRefreshControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Select aria-label="Refresh interval" value={value} onChange={(event) => onChange(event.target.value)}><option value="off">Off</option><option value="5s">5 seconds</option><option value="10s">10 seconds</option><option value="30s">30 seconds</option><option value="1m">1 minute</option><option value="5m">5 minutes</option><option value="15m">15 minutes</option></Select>;
}

export function DashboardPanel({ title, description, dataSource = 'NoovaStack aggregated API', children, isLoading, error, empty, href, onRefresh, data }: { title: string; description?: string; dataSource?: string; children: React.ReactNode; isLoading?: boolean; error?: unknown; empty?: boolean; href?: string; onRefresh?: () => void; data?: unknown }) {
  const [fullscreen, setFullscreen] = useState(false);
  const content = <PanelFrame title={title} description={description} dataSource={dataSource} onRefresh={onRefresh} onFullscreen={() => setFullscreen(true)} href={href} data={data}>{isLoading ? <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> : error ? <PanelErrorState message={error instanceof Error ? error.message : 'Panel failed to load.'} /> : empty ? <PanelEmptyState /> : children}</PanelFrame>;
  return <>{content}<PanelFullscreenDialog open={fullscreen} title={title} onClose={() => setFullscreen(false)}>{content}</PanelFullscreenDialog></>;
}

function PanelFrame({ title, description, dataSource, children, onRefresh, onFullscreen, href, data }: { title: string; description?: string; dataSource: string; children: React.ReactNode; onRefresh?: () => void; onFullscreen: () => void; href?: string; data?: unknown }) {
  return <article className="overflow-hidden rounded-2xl border border-[#DCE3EA] bg-white shadow-soft dark:border-[#2A394D] dark:bg-[#121C2B]"><PanelHeader title={title} description={description} dataSource={dataSource} /><PanelToolbar onRefresh={onRefresh} onFullscreen={onFullscreen} href={href} data={data} /><div className="p-4">{children}</div></article>;
}

export function PanelHeader({ title, description, dataSource }: { title: string; description?: string; dataSource?: string }) {
  return <header className="border-b border-[#DCE3EA] bg-[#FAFBFC] px-4 py-3 dark:border-[#2A394D] dark:bg-[#151F2E]"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-[#102033] dark:text-[#F1F5F9]">{title}</h2>{description ? <p className="mt-1 text-xs leading-5 text-[#667085] dark:text-[#94A3B8]">{description}</p> : null}</div><span className="rounded-full border border-[#DCE3EA] bg-white px-2 py-1 text-[10px] uppercase tracking-wide text-[#667085] dark:border-[#3B4D63] dark:bg-[#162233] dark:text-[#AAB8C9]">{dataSource}</span></div></header>;
}

export function PanelToolbar({ onRefresh, onFullscreen, href, data }: { onRefresh?: () => void; onFullscreen: () => void; href?: string; data?: unknown }) {
  return <div className="flex items-center justify-end gap-1 border-b border-[#DCE3EA] bg-white px-3 py-2 dark:border-[#2A394D] dark:bg-[#121C2B]"><IconButton label="Refresh panel" onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5" /></IconButton><IconButton label="Inspect data" onClick={() => downloadJson('panel-data.json', data ?? {})}><Search className="h-3.5 w-3.5" /></IconButton><IconButton label="Export CSV" onClick={() => downloadCsv('panel-data.csv', data)}><Download className="h-3.5 w-3.5" /></IconButton><IconButton label="Fullscreen" onClick={onFullscreen}><Maximize2 className="h-3.5 w-3.5" /></IconButton>{href ? <Link aria-label="Open related page" href={href} className="rounded-md p-1.5 text-[#667085] hover:bg-[#EAF4FB] hover:text-[#0B5E9E] dark:text-[#8FA0B5] dark:hover:bg-[#1A293C] dark:hover:text-[#DCE5EF]"><ExternalLink className="h-3.5 w-3.5" /></Link> : null}</div>;
}

function IconButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} onClick={onClick} className="rounded-md p-1.5 text-[#667085] hover:bg-[#EAF4FB] hover:text-[#0B5E9E] dark:text-[#8FA0B5] dark:hover:bg-[#1A293C] dark:hover:text-[#DCE5EF]">{children}</button>;
}

export function PanelLegend({ items, hidden = [], onToggle }: { items: Array<{ name: string; color: string }>; hidden?: string[]; onToggle?: (name: string) => void }) {
  return <div className="flex gap-2 overflow-x-auto pb-1 text-xs">{items.map((item) => <button key={item.name} onClick={() => onToggle?.(item.name)} className={cn('inline-flex shrink-0 items-center gap-2 rounded-full border border-[#DCE3EA] bg-white px-2 py-1 text-[#667085] hover:border-[#0B5E9E] hover:text-[#0B5E9E] dark:border-[#2A394D] dark:bg-[#172131] dark:text-[#AAB8C9] dark:hover:border-[#49A6DF] dark:hover:text-[#F1F5F9]', hidden.includes(item.name) && 'opacity-40')}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</button>)}</div>;
}

export function PanelTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-[#DCE3EA] bg-white p-3 text-xs shadow-lg dark:border-[#3A4B60] dark:bg-[#182435]"><p className="mb-2 font-semibold text-[#102033] dark:text-[#F1F5F9]">{formatTick(label)}</p>{payload.map((entry: any) => <p key={entry.name} className="text-[#667085] dark:text-[#B3C0D1]"><span style={{ color: entry.color }}>●</span> {entry.name}: <strong className="text-[#102033] dark:text-[#F1F5F9]">{entry.value}</strong></p>)}</div>;
}

export function PanelEmptyState({ message = 'No data for the selected filters and time range.' }: { message?: string }) {
  return <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-[#DCE3EA] bg-[#FAFBFC] text-center text-sm text-[#667085] dark:border-[#2A394D] dark:bg-[#151F2E] dark:text-[#B3C0D1]">{message}</div>;
}

export function PanelErrorState({ message }: { message: string }) {
  return <div className="rounded-xl border border-[#DC2626]/30 bg-red-50 p-4 text-sm text-[#B91C1C] dark:bg-[rgba(239,68,68,0.14)] dark:text-[#F87171]">{message}</div>;
}

export function PanelFullscreenDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 bg-[#102033]/45 p-4 dark:bg-black/55"><div className="mx-auto h-full max-w-7xl overflow-y-auto rounded-3xl border border-[#DCE3EA] bg-[#F6F8FC] p-4 shadow-2xl dark:border-[#2A394D] dark:bg-[#0B111B]"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold text-[#102033] dark:text-[#F1F5F9]">{title}</h2><button onClick={onClose} className="rounded-lg p-2 text-[#667085] hover:bg-[#EAF4FB] hover:text-[#0B5E9E] dark:text-[#94A3B8] dark:hover:bg-[#1A293C] dark:hover:text-[#DCE5EF]"><X className="h-5 w-5" /></button></div>{children}</div></div>;
}

export function StatPanel({ metric }: { metric: DashboardMetric }) {
  const theme = getDashboardTheme();
  const chart = theme === 'dark' ? darkChart : lightChart;
  const points = Array.from({ length: 14 }, (_, index) => ({ name: index, value: Math.max(0, Math.round(metric.value * (0.75 + index / 40) + (metric.change / 10))) }));
  const status = normalizeMetricStatus(metric);
  const tone = status === 'critical' ? (theme === 'dark' ? '#F87171' : '#DC2626') : status === 'warning' ? (theme === 'dark' ? '#FBBF24' : '#D97706') : theme === 'dark' ? '#4ADE80' : '#16A34A';
  return <Link href={metric.href} className="block rounded-2xl border border-[#DCE3EA] bg-white p-3 shadow-soft transition hover:border-[#0B5E9E] hover:shadow-md dark:border-[#2A394D] dark:bg-[#121C2B] dark:hover:border-[#3D526B]"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-[#667085] dark:text-[#94A3B8]">{metric.title}</p><p className="mt-2 text-2xl font-bold text-[#102033] dark:text-[#F8FAFC]">{metric.value}{metric.unit}</p></div><span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase" style={{ backgroundColor: `${tone}24`, color: tone }}>{status}</span></div><div className="mt-2 h-10"><ResponsiveContainer width="100%" height="100%"><LineChart data={points}><Line dataKey="value" stroke={chart.line} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div><p className="mt-2 text-xs text-[#667085] dark:text-[#7F8DA3]">{metric.change >= 0 ? '↑' : '↓'} {Math.abs(metric.change)}% vs previous. Previous: {metric.previous}</p></Link>;
}

export function TimeSeriesPanel({ series, height = 300, dashedPrevious = false }: { series: TimeSeries[]; height?: number; dashedPrevious?: boolean }) {
  const theme = getDashboardTheme();
  const chart = theme === 'dark' ? darkChart : lightChart;
  const [hidden, setHidden] = useState<string[]>([]);
  const data = useMemo(() => mergeSeries(series), [series]);
  return <div><PanelLegend items={series.map((item, index) => ({ name: item.name, color: chart.colors[index % chart.colors.length] }))} hidden={hidden} onToggle={(name) => setHidden((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])} /><div className="mt-3 rounded-xl dark:bg-[#111A28]" style={{ height }}><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid stroke={chart.grid} /><XAxis dataKey="timestamp" stroke={chart.axis} tickFormatter={formatTick} minTickGap={24} /><YAxis stroke={chart.axis} /><Tooltip content={<PanelTooltip />} /><Brush dataKey="timestamp" height={24} stroke={chart.line} fill={chart.brush} tickFormatter={formatTick} /><Line type="monotone" dataKey="threshold" name="Threshold" stroke={chart.threshold} strokeDasharray="4 4" dot={false} isAnimationActive={false} />{series.map((item, index) => hidden.includes(item.name) ? null : <Line key={item.name} type="monotone" dataKey={item.name} stroke={chart.colors[index % chart.colors.length]} strokeWidth={2} dot={false} strokeDasharray={dashedPrevious && index > 2 ? '5 5' : undefined} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></div></div>;
}

export function DonutPanel({ counts, total, centerLabel = 'Findings' }: { counts: Record<string, number>; total: number; centerLabel?: string }) {
  const theme = getDashboardTheme();
  const chart = theme === 'dark' ? darkChart : lightChart;
  const data = Object.entries(counts).map(([name, value]) => ({ name: name.replace(/^./, (c) => c.toUpperCase()), value })).filter((item) => item.value > 0);
  return <div className="grid gap-4 md:grid-cols-[1fr_160px]"><div className="relative h-64 rounded-xl dark:bg-[#111A28]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3}>{data.map((entry) => <Cell key={entry.name} fill={chart.severity[entry.name] ?? '#2563EB'} />)}</Pie><Tooltip content={<PanelTooltip />} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-4xl font-bold text-[#102033] dark:text-[#F8FAFC]">{total}</p><p className="text-xs uppercase tracking-widest text-[#667085] dark:text-[#94A3B8]">{centerLabel}</p></div></div></div><PanelLegend items={data.map((item) => ({ name: `${item.name} ${Math.round((item.value / Math.max(total, 1)) * 100)}%`, color: chart.severity[item.name] ?? '#2563EB' }))} /></div>;
}

export function BarGaugePanel({ rows, valueKey = 'value', labelKey = 'label' }: { rows: any[]; valueKey?: string; labelKey?: string }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] ?? 0)), 1);
  return <div className="space-y-3">{rows.map((row) => <div key={row[labelKey]}><div className="mb-1 flex justify-between text-xs text-[#667085] dark:text-[#B3C0D1]"><span>{row[labelKey]}</span><strong className="text-[#102033] dark:text-[#F8FAFC]">{row[valueKey]}</strong></div><div className="h-3 rounded-full bg-[#EAF4FB] dark:bg-[#172334]"><div className="h-3 rounded-full bg-[#0B5E9E] dark:bg-[#2D8AC4]" style={{ width: `${(Number(row[valueKey] ?? 0) / max) * 100}%` }} /></div></div>)}</div>;
}

export function GaugePanel({ value, thresholds = { green: 95, amber: 80 } }: { value: number; thresholds?: { green: number; amber: number } }) {
  const color = value >= thresholds.green ? '#16A34A' : value >= thresholds.amber ? '#D97706' : '#DC2626';
  return <div className="grid place-items-center py-6"><div className="grid h-44 w-44 place-items-center rounded-full border-[18px] bg-[#FAFBFC] dark:bg-[#111A28]" style={{ borderColor: color }}><div className="text-center"><p className="text-4xl font-bold text-[#102033] dark:text-[#F8FAFC]">{value}%</p><p className="text-xs text-[#667085] dark:text-[#94A3B8]">Success rate</p></div></div></div>;
}

export function HeatmapPanel({ rows }: { rows: Array<{ row: string; cells: Array<{ column: string; value: number; href?: string }> }> }) {
  return <div className="overflow-x-auto"><table className="min-w-full text-xs"><tbody>{rows.map((row) => <tr key={row.row}><th className="sticky left-0 bg-white py-2 pr-3 text-left text-[#667085] dark:bg-[#121C2B] dark:text-[#B3C0D1]">{row.row}</th>{row.cells.map((cell) => <td key={`${row.row}-${cell.column}`} className="p-1"><Link href={cell.href ?? '/findings'} title={`${row.row} / ${cell.column}: ${cell.value}`} className="grid h-10 min-w-24 place-items-center rounded-md border border-[#DCE3EA] font-bold text-white dark:border-[#2A394D]" style={{ backgroundColor: heatColor(cell.value) }}>{cell.value}</Link></td>)}</tr>)}</tbody></table></div>;
}

export function TablePanel({ rows, columns }: { rows: any[]; columns: Array<{ key: string; header: string; render?: (row: any) => React.ReactNode }> }) {
  return <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-[#667085] dark:text-[#AAB8C9]"><tr>{columns.map((column) => <th key={column.key} className="border-b border-[#DCE3EA] bg-[#FAFBFC] px-3 py-2 font-semibold dark:border-[#2A394D] dark:bg-[#162233]">{column.header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? row.asset_id ?? row.scan_id ?? index} className="border-b border-[#DCE3EA] hover:bg-[#FAFBFC] dark:border-[#2A394D] dark:hover:bg-[#172638]">{columns.map((column) => <td key={column.key} className="px-3 py-2 text-[#102033] dark:text-[#DCE5EF]">{column.render ? column.render(row) : String(row[column.key] ?? '')}</td>)}</tr>)}</tbody></table></div>;
}

export function LogPanel({ rows }: { rows: any[] }) {
  const [query, setQuery] = useState('');
  const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
  return <div><div className="mb-3 flex gap-2"><Input aria-label="Search activity logs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity" /><Button variant="secondary" onClick={() => downloadCsv('security-activity.csv', filtered)}>Download</Button></div><div className="max-h-[420px] space-y-2 overflow-y-auto">{filtered.map((row, index) => <Link key={`${row.timestamp}-${index}`} href={row.href ?? '/audit-logs'} className="grid gap-2 rounded-xl border border-[#DCE3EA] bg-white p-3 text-xs text-[#102033] hover:border-[#0B5E9E] hover:bg-[#FAFBFC] dark:border-[#2A394D] dark:bg-[#121C2B] dark:text-[#DCE5EF] dark:hover:border-[#49A6DF] dark:hover:bg-[#172638] md:grid-cols-[150px_90px_1fr_80px_120px]"><span className="text-[#667085] dark:text-[#8796AA]">{formatTick(row.timestamp)}</span><span>{row.source}</span><span>{row.event}</span><span className="capitalize" style={{ color: severityColor(row.severity) }}>{row.severity}</span><span className="text-[#667085] dark:text-[#8796AA]">{row.result}</span></Link>)}</div></div>;
}

export function SecurityPosturePanel({ data }: { data: DashboardTimeseriesResponse['posture'] }) {
  const series = ['security_score', 'asset_coverage', 'remediation_completion', 'verified_finding_rate'].map((key) => ({ name: key.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()), points: data.map((item) => ({ timestamp: item.timestamp, value: Number((item as any)[key] ?? 0) })) }));
  return <TimeSeriesPanel series={series} height={360} />;
}

export const FindingTrendPanel = ({ series }: { series: TimeSeries[] }) => <TimeSeriesPanel series={series} dashedPrevious />;
export const ScanThroughputPanel = ({ series }: { series: TimeSeries[] }) => <TimeSeriesPanel series={series} />;
export const ActiveScanPanel = ({ rows }: { rows: any[] }) => <TablePanel rows={rows} columns={[{ key: 'scan', header: 'Scan', render: (row) => <Link className="text-[#0B5E9E] dark:text-[#49A6DF]" href={`/scans/${row.scan_id}/progress`}>{row.scan}</Link> }, { key: 'project', header: 'Project' }, { key: 'target', header: 'Target' }, { key: 'current_stage', header: 'Current Stage' }, { key: 'progress', header: 'Progress', render: (row) => <div className="min-w-32"><div className="h-2 rounded-full bg-[#EAF4FB] dark:bg-[#172334]"><div className="h-2 rounded-full bg-[#0B5E9E] dark:bg-[#2D8AC4]" style={{ width: `${row.progress}%` }} /></div><span className="text-[#667085] dark:text-[#8796AA]">{row.progress}%</span></div> }, { key: 'elapsed_minutes', header: 'Elapsed' }, { key: 'eta_minutes', header: 'ETA' }, { key: 'candidate_findings', header: 'Candidate Findings' }, { key: 'evidence_items', header: 'Evidence' }, { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> }]} />;
export const AssetRiskPanel = ({ rows }: { rows: any[] }) => <TablePanel rows={rows} columns={[{ key: 'asset', header: 'Asset', render: (row) => <Link className="text-[#0B5E9E] dark:text-[#49A6DF]" href={`/assets/${row.asset_id}`}>{row.asset}</Link> }, { key: 'project', header: 'Project' }, { key: 'type', header: 'Type' }, { key: 'environment', header: 'Environment' }, { key: 'critical', header: 'Critical' }, { key: 'high', header: 'High' }, { key: 'medium', header: 'Medium' }, { key: 'risk_score', header: 'Risk Score', render: (row) => <span className="rounded px-2 py-1 text-white" style={{ backgroundColor: heatColor(row.risk_score / 20) }}>{row.risk_score}</span> }, { key: 'coverage', header: 'Coverage' }, { key: 'status', header: 'Status' }]} />;
export const AssetCoveragePanel = ({ panel }: { panel: any }) => <div><p className="mb-4 text-sm text-[#667085] dark:text-[#B3C0D1]"><strong className="text-[#102033] dark:text-[#F8FAFC]">{panel.percentage}%</strong> of approved assets scanned in the last 30 days</p><BarGaugePanel rows={panel.rows ?? []} /></div>;
export const OWASPHeatmapPanel = ({ panel }: { panel: any }) => <HeatmapPanel rows={panel.rows ?? []} />;
export const RemediationPanel = ({ panel }: { panel: any }) => <BarGaugePanel rows={Object.entries(panel ?? {}).map(([label, value]) => ({ label: label.replaceAll('_', ' '), value }))} />;
export const ApprovalMetricsPanel = ({ panel }: { panel: any }) => <BarGaugePanel rows={Object.entries(panel ?? {}).filter(([key]) => key !== 'average_hours').map(([label, value]) => ({ label: label.replaceAll('_', ' '), value }))} />;
export const AIAgentMetricsPanel = ({ panel }: { panel: any }) => <BarGaugePanel rows={Object.entries(panel ?? {}).map(([label, value]) => ({ label: label.replaceAll('_', ' '), value }))} />;
export const AgenticSafetyPanel = ({ rows }: { rows: any[] }) => <div className="grid gap-2 sm:grid-cols-2">{rows.map((row) => <Link key={row.control} href="/ai-agents" className="rounded-xl border border-[#DCE3EA] bg-white p-3 text-[#102033] hover:border-[#0B5E9E] hover:bg-[#FAFBFC] dark:border-[#2A394D] dark:bg-[#121C2B] dark:text-[#DCE5EF] dark:hover:border-[#49A6DF] dark:hover:bg-[#172638]"><p className="text-sm font-semibold">{row.control}</p><p className="mt-2 text-xs capitalize" style={{ color: severityColor(row.status) }}>{row.status}</p></Link>)}</div>;
export const EvidencePipelinePanel = ({ panel }: { panel: any }) => <BarGaugePanel rows={panel.rows ?? []} valueKey="value" labelKey="stage" />;
export const ValidationFunnelPanel = ({ rows }: { rows: any[] }) => <div className="space-y-3">{rows.map((row) => <div key={row.stage}><div className="mb-1 flex justify-between text-xs text-[#667085] dark:text-[#B3C0D1]"><span>{row.stage}</span><span>{row.value} · {row.conversion}%</span></div><div className="h-4 rounded bg-[#EAF4FB] dark:bg-[#172334]"><div className="h-4 rounded bg-[#0B5E9E] dark:bg-[#2D8AC4]" style={{ width: `${Math.min(100, row.conversion)}%` }} /></div></div>)}</div>;
export const SystemHealthPanel = ({ rows }: { rows: any[] }) => <TablePanel rows={rows} columns={[{ key: 'component', header: 'Component' }, { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> }, { key: 'latency_ms', header: 'Latency' }, { key: 'active_jobs', header: 'Active Jobs' }]} />;
export const ActivityLogPanel = ({ rows }: { rows: any[] }) => <LogPanel rows={rows} />;
export const RecommendedActionsPanel = ({ rows }: { rows: any[] }) => <div className="space-y-3">{rows.map((row) => <Link key={row.action} href={row.href} className="block rounded-xl border border-[#DCE3EA] bg-white p-3 hover:border-[#0B5E9E] hover:bg-[#FAFBFC] dark:border-[#2A394D] dark:bg-[#121C2B] dark:hover:border-[#49A6DF] dark:hover:bg-[#172638]"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#102033] dark:text-[#F1F5F9]">{row.action}</p><p className="mt-1 text-xs leading-5 text-[#667085] dark:text-[#B3C0D1]">{row.reason}</p></div><span className="rounded-full bg-[#EAF4FB] px-2 py-1 text-xs font-bold text-[#0B5E9E] dark:bg-[#143A5A] dark:text-[#8CCCF0]">{row.count}</span></div><p className="mt-2 text-xs text-[#667085] dark:text-[#8796AA]">{row.priority} · Due {row.due_date} · {row.role}</p></Link>)}</div>;

export const SeverityDistributionPanel = DonutPanel;
export const GaugePanelComponent = GaugePanel;
export const TopVulnerabilityCategoriesPanel = ({ rows }: { rows: any[] }) => <BarGaugePanel rows={rows.map((row) => ({ label: row.category, value: row.count }))} />;

function mergeSeries(series: TimeSeries[]) {
  const rows = new Map<string, any>();
  series.forEach((item) => item.points.forEach((point) => {
    const row = rows.get(point.timestamp) ?? { timestamp: point.timestamp, threshold: 80 };
    row[item.name] = point.value;
    rows.set(point.timestamp, row);
  }));
  return Array.from(rows.values()).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(filename, blob);
}

function downloadCsv(filename: string, data: unknown) {
  const rows: Array<Record<string, unknown>> = Array.isArray(data) ? data as Array<Record<string, unknown>> : Array.isArray((data as any)?.rows) ? (data as any).rows as Array<Record<string, unknown>> : [];
  const keys = Array.from(new Set(rows.flatMap((row: Record<string, unknown>) => Object.keys(row))));
  const csv = [keys.join(','), ...rows.map((row: Record<string, unknown>) => keys.map((key) => JSON.stringify(row[key] ?? '')).join(','))].join('\n');
  downloadBlob(filename, new Blob([csv], { type: 'text/csv' }));
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatTick(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function heatColor(value: number) {
  if (value >= 10) return '#EF4444';
  if (value >= 5) return '#F97316';
  if (value >= 2) return '#F59E0B';
  if (value >= 1) return '#0B5E9E';
  return '#98A2B3';
}

function normalizeMetricStatus(metric: DashboardMetric) {
  if (metric.key === 'security_score') {
    const value = Number(metric.value ?? 0);
    if (value >= 80) return 'healthy';
    if (value >= 60) return 'warning';
    return 'critical';
  }
  return metric.status === 'ok' ? 'healthy' : metric.status;
}

function getDashboardTheme() {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function severityColor(value?: string) {
  const normalized = String(value ?? '').toLowerCase();
  if (['critical', 'violation', 'failed'].includes(normalized)) return '#DC2626';
  if (['high', 'warning', 'blocked'].includes(normalized)) return '#D97706';
  if (['healthy', 'ok', 'info'].includes(normalized)) return '#16A34A';
  return '#667085';
}
