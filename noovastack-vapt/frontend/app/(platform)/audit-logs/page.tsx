'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, CalendarDays, ChevronLeft, ChevronRight, Download, RefreshCw, Search, X } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { api, type AuditLogQuery, type AuditLogRow } from '@/lib/api-client';
import { formatDate, friendlyError, titleCase } from '@/lib/utils';

type DatePreset = 'all' | 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'last_month' | 'last_year' | 'custom';

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'all', label: 'All time' }, { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 days' }, { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_month', label: 'Last month' }, { value: 'last_year', label: 'Last 12 months' }, { value: 'custom', label: 'Custom range' },
];

function startOfDay(value: Date) { return new Date(value.getFullYear(), value.getMonth(), value.getDate()); }
function addDays(value: Date, days: number) { const next = new Date(value); next.setDate(next.getDate() + days); return next; }
function dateValue(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }

function auditDateRange(preset: DatePreset, customFrom: string, customTo: string) {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  if (preset === 'today') return { date_from: today.toISOString(), date_to: tomorrow.toISOString() };
  if (preset === 'yesterday') return { date_from: addDays(today, -1).toISOString(), date_to: today.toISOString() };
  if (preset === 'last_7_days') return { date_from: addDays(today, -6).toISOString(), date_to: tomorrow.toISOString() };
  if (preset === 'last_30_days') return { date_from: addDays(today, -29).toISOString(), date_to: tomorrow.toISOString() };
  if (preset === 'last_month') return { date_from: new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString(), date_to: new Date(today.getFullYear(), today.getMonth(), 1).toISOString() };
  if (preset === 'last_year') { const from = new Date(today); from.setFullYear(from.getFullYear() - 1); return { date_from: from.toISOString(), date_to: tomorrow.toISOString() }; }
  if (preset === 'custom') return { date_from: customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : undefined, date_to: customTo ? addDays(new Date(`${customTo}T00:00:00`), 1).toISOString() : undefined };
  return {};
}

function csvCell(value: unknown) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }

export default function AuditLogsPage() {
  const { token } = useAuth();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [eventType, setEventType] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('last_30_days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sort, setSort] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => { const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const dateRange = useMemo(() => auditDateRange(datePreset, customFrom, customTo), [datePreset, customFrom, customTo]);
  const query = useMemo<AuditLogQuery>(() => ({ search: debouncedSearch || undefined, event_type: eventType || undefined, ...dateRange, sort, page, page_size: pageSize }), [dateRange, debouncedSearch, eventType, page, pageSize, sort]);
  const logs = useQuery({ queryKey: ['audit-logs-search', query], queryFn: () => api.searchAuditLogs(query, token), enabled: Boolean(token), placeholderData: (previous) => previous });
  const data = logs.data;
  const items = data?.items ?? [];
  const hasFilters = Boolean(search || eventType || datePreset !== 'last_30_days' || customFrom || customTo || sort !== 'desc' || pageSize !== 25);
  const firstResult = data?.total ? (data.page - 1) * data.page_size + 1 : 0;
  const lastResult = data?.total ? Math.min(data.page * data.page_size, data.total) : 0;

  function resetFilters() { setSearch(''); setDebouncedSearch(''); setEventType(''); setDatePreset('last_30_days'); setCustomFrom(''); setCustomTo(''); setSort('desc'); setPageSize(25); setPage(1); }
  function exportPage() {
    if (!items.length) return;
    const header = ['Timestamp', 'Actor', 'Actor email', 'Event type', 'Action', 'Project ID', 'Scan ID', 'Details'];
    const rows = items.map(row => [row.created_at, row.actor_name, row.actor_email, row.event_type, row.action, row.project_id, row.scan_id, JSON.stringify(row.details)]);
    const blob = new Blob([[header, ...rows].map(row => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `audit-logs-${dateValue(new Date())}-page-${page}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  return <>
    <PageHeader title="Audit Logs" description="Search and investigate platform activity by date, actor, event, action, project, scan, or recorded details." actions={<div className="flex gap-2"><Button variant="outline" onClick={() => void logs.refetch()} disabled={logs.isFetching}><RefreshCw className={`h-4 w-4 ${logs.isFetching ? 'animate-spin' : ''}`} /> Refresh</Button><Button variant="outline" onClick={exportPage} disabled={!items.length}><Download className="h-4 w-4" /> Export page</Button></div>} />
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><Metric label="Matching records" value={data?.total ?? 0} /><Metric label="Showing" value={data?.total ? `${firstResult}–${lastResult}` : '0'} /><Metric label="Event categories" value={data?.event_types.length ?? 0} /></div>
    <Card className="mb-5"><CardContent className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,2fr)_1fr_1fr_1fr_auto]">
        <label className="relative block"><span className="sr-only">Search audit logs</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search actor, action, event, IDs, or details…" /></label>
        <Select aria-label="Filter event type" value={eventType} onChange={(event) => { setEventType(event.target.value); setPage(1); }}><option value="">All event types</option>{(data?.event_types ?? []).map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</Select>
        <Select aria-label="Filter date range" value={datePreset} onChange={(event) => { setDatePreset(event.target.value as DatePreset); setPage(1); }}>{DATE_PRESETS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</Select>
        <Select aria-label="Sort audit logs" value={sort} onChange={(event) => { setSort(event.target.value as 'asc' | 'desc'); setPage(1); }}><option value="desc">Newest first</option><option value="asc">Oldest first</option></Select>
        <Button variant="outline" onClick={resetFilters} disabled={!hasFilters}><X className="h-4 w-4" /> Clear</Button>
      </div>
      {datePreset === 'custom' ? <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 sm:grid-cols-2 dark:border-[#2A394D] dark:bg-[#101927]">
        <label className="text-sm font-medium text-[#102033] dark:text-slate-200"><span className="mb-1.5 flex items-center gap-2"><CalendarDays className="h-4 w-4" /> From</span><Input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => { setCustomFrom(event.target.value); setPage(1); }} /></label>
        <label className="text-sm font-medium text-[#102033] dark:text-slate-200"><span className="mb-1.5 flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Through</span><Input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => { setCustomTo(event.target.value); setPage(1); }} /></label>
      </div> : null}
    </CardContent></Card>
    {logs.isError ? <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load audit logs: {friendlyError(logs.error)}</div> : null}
    {logs.isLoading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading audit history…</div> : items.length ? <AuditTable rows={items} /> : <EmptyState icon={Archive} title="No audit records match" description="Try a wider date range, another event type, or clear the search filters." />}
    {data && data.total > 0 ? <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#2A394D] dark:bg-[#101927]"><p className="text-sm text-slate-600 dark:text-slate-300">Showing {firstResult}–{lastResult} of {data.total} records</p><div className="flex items-center gap-2"><Select aria-label="Rows per page" className="w-auto" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={25}>25 rows</option><option value={50}>50 rows</option><option value={100}>100 rows</option></Select><Button variant="outline" aria-label="Previous page" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-24 text-center text-sm font-medium">Page {data.page} of {Math.max(data.total_pages, 1)}</span><Button variant="outline" aria-label="Next page" onClick={() => setPage(current => current + 1)} disabled={page >= data.total_pages}><ChevronRight className="h-4 w-4" /></Button></div></div> : null}
  </>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-[#2A394D] dark:bg-[#101927]"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-[#102033] dark:text-slate-100">{value}</p></div>; }

function AuditTable({ rows }: { rows: AuditLogRow[] }) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-[#2A394D] dark:bg-[#101927]"><table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-[#2A394D]"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-[#172638] dark:text-slate-300"><tr><th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Related records</th><th className="px-4 py-3">Details</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-[#253348]">{rows.map(row => <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-[#172638]">
    <td className="whitespace-nowrap px-4 py-4 align-top text-slate-700 dark:text-slate-200"><time dateTime={row.created_at ?? undefined} title={row.created_at ?? undefined}>{formatDate(row.created_at)}</time></td>
    <td className="px-4 py-4 align-top"><p className="font-medium text-[#102033] dark:text-slate-100">{row.actor_name || 'System'}</p>{row.actor_email ? <p className="mt-1 text-xs text-slate-500">{row.actor_email}</p> : null}</td>
    <td className="px-4 py-4 align-top"><span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#0B5E9E] dark:bg-blue-500/10 dark:text-blue-300">{titleCase(row.event_type)}</span></td>
    <td className="px-4 py-4 align-top font-medium text-slate-700 dark:text-slate-200">{titleCase(row.action)}</td>
    <td className="px-4 py-4 align-top text-xs text-slate-500"><RelatedId label="Project" value={row.project_id} /><RelatedId label="Scan" value={row.scan_id} /><RelatedId label="Engagement" value={row.engagement_id} /></td>
    <td className="px-4 py-4 align-top"><details className="group min-w-44"><summary className="cursor-pointer text-sm font-semibold text-[#0B5E9E] hover:underline">View details</summary><pre className="mt-2 max-h-72 max-w-xl overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(row.details ?? {}, null, 2)}</pre></details></td>
  </tr>)}</tbody></table></div>;
}

function RelatedId({ label, value }: { label: string; value?: string | null }) { if (!value) return null; return <p className="mb-1 max-w-36 truncate" title={value}><span className="font-semibold">{label}:</span> {value}</p>; }
