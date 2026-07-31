'use client';

import { CheckCircle2, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { useFindingActions, useFindings } from '@/hooks/use-findings';
import { formatDate } from '@/lib/utils';

const retestStatuses = ['ready_for_retest', 'retesting', 'fixed', 'partially_fixed', 'not_fixed', 'cannot_verify'];

export default function RetestsPage() {
  const findings = useFindings();
  const actions = useFindingActions();
  const all = findings.data ?? [];
  const candidates = all.filter((finding) => finding.status === 'confirmed' || retestStatuses.includes(finding.status));
  const counts = Object.fromEntries(retestStatuses.map((status) => [status, all.filter((finding) => finding.status === status).length]));

  async function setStatus(id: string, status: string) {
    await actions.mutateAsync({ id, action: 'status', status });
    toast.success('Retest status updated');
  }

  return <>
    <PageHeader title="Retesting" description="Track findings through ready, retesting, fixed, partially fixed, not fixed, and cannot verify states." />
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
      {[['ready_for_retest', 'Ready'], ['retesting', 'Running'], ['fixed', 'Fixed'], ['partially_fixed', 'Partial'], ['not_fixed', 'Not Fixed'], ['cannot_verify', 'Cannot Verify']].map(([status, label]) => <Card key={status} className="p-4"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-bold text-[#0B1F3A]">{counts[status] ?? 0}</p></Card>)}
    </div>
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Retest Queue</h2><p className="mt-1 text-sm text-slate-600">Confirmed findings can be queued and updated after remediation validation.</p></div><Button variant="outline" onClick={() => findings.refetch()} disabled={findings.isFetching}>{findings.isFetching ? 'Refreshing...' : 'Refresh'}</Button></div>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-500"><tr><th className="py-2">Finding</th><th>Severity</th><th>Status</th><th>Last Seen</th><th>Actions</th></tr></thead>
          <tbody>{candidates.map((finding) => <tr key={finding.id} className="border-t border-slate-100"><td className="py-3"><p className="font-semibold text-[#0B1F3A]">{finding.title}</p><p className="mt-1 max-w-xl text-xs text-slate-500">{finding.description}</p></td><td><SeverityBadge value={finding.severity} /></td><td><StatusBadge value={finding.status} /></td><td>{formatDate(finding.last_seen ?? finding.created_at)}</td><td><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setStatus(finding.id, 'ready_for_retest')} disabled={actions.isPending || finding.status === 'ready_for_retest'}><CheckCircle2 className="h-4 w-4" /> Queue</Button><Button variant="outline" onClick={() => setStatus(finding.id, 'retesting')} disabled={actions.isPending || finding.status === 'retesting'}><PlayCircle className="h-4 w-4" /> Start</Button><Button variant="outline" onClick={() => setStatus(finding.id, 'fixed')} disabled={actions.isPending}>Fixed</Button><Button variant="outline" onClick={() => setStatus(finding.id, 'partially_fixed')} disabled={actions.isPending}>Partial</Button><Button variant="outline" onClick={() => setStatus(finding.id, 'not_fixed')} disabled={actions.isPending}>Not Fixed</Button><Button variant="ghost" onClick={() => setStatus(finding.id, 'cannot_verify')} disabled={actions.isPending}>Cannot Verify</Button></div></td></tr>)}</tbody>
        </table>
      </div>
      {!findings.isLoading && !candidates.length ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No confirmed findings are available for retest. Run a scan or verify findings first.</p> : null}
    </Card>
  </>;
}
