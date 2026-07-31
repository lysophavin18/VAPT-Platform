'use client';

import { Archive } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/tables/data-table';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

interface AuditRow { id: string; created_at?: string; actor_id?: string; event_type?: string; action?: string; details?: Record<string, unknown> }

export default function AuditLogsPage() {
  const { token } = useAuth();
  const logs = useQuery({ queryKey: ['audit-logs'], queryFn: () => api.auditLogs(token) as Promise<AuditRow[]>, enabled: Boolean(token) });
  return <><PageHeader title="Audit Logs" description="Internal accountability log for platform events, actor, action, timestamp, and recorded details." /><DataTable<AuditRow> data={logs.data ?? []} empty={<EmptyState icon={Archive} title="No audit records yet" description="Audit records appear after platform actions such as discovery, engagement updates, and retest status changes." />} columns={[{ key: 'time', header: 'Timestamp', render: (row) => formatDate(row.created_at) }, { key: 'user', header: 'Actor', render: (row) => row.actor_id ?? 'System' }, { key: 'event', header: 'Event Type', render: (row) => row.event_type ?? 'Unknown' }, { key: 'action', header: 'Action', render: (row) => row.action ?? 'Unknown' }, { key: 'details', header: 'Details', render: (row) => <pre className="max-w-xl whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(row.details ?? {}, null, 2)}</pre> }]} /></>;
}
