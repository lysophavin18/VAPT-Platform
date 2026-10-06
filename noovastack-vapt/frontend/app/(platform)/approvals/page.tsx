'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { useApprovalDecision, useApprovals } from '@/hooks/use-approvals';
import { formatDate, titleCase } from '@/lib/utils';
import type { Approval } from '@/types';

export default function ApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>('pending');
  const approvals = useApprovals(statusFilter);
  const decision = useApprovalDecision();
  const items = approvals.data ?? [];
  const pendingCount = items.filter((item) => item.status === 'pending').length;

  async function decide(approval: Approval, value: 'approved' | 'rejected') {
    const reason = value === 'approved'
      ? 'Approved by Security Team.'
      : 'Rejected by Security Team.';
    try {
      await decision.mutateAsync({ id: approval.id, decision: value, reason });
      toast.success(value === 'approved' ? 'Approved' : 'Rejected');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save decision');
    }
  }

  return <>
    <PageHeader
      title="Approvals"
      description="Security Team review queue. Every scan and schedule requires an approval decision before it can run."
    />
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="p-4"><p className="text-sm text-slate-600">Showing</p><p className="mt-2 text-3xl font-bold text-[#0B1F3A]">{items.length}</p></Card>
      <Card className="p-4"><p className="text-sm text-slate-600">Pending Decision</p><p className="mt-2 text-3xl font-bold text-[#D97706]">{pendingCount}</p></Card>
      <Card className="p-4">
        <p className="text-sm text-slate-600">Filter</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[['pending', 'Pending'], [undefined, 'All'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${statusFilter === value ? 'border-[#155EEF] bg-blue-50 text-[#155EEF]' : 'border-slate-200 text-slate-600 hover:border-[#155EEF]/50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>
    </div>
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Review Queue</h2>
          <p className="mt-1 text-sm text-slate-600">Approve to let the requester launch, or reject to send it back.</p>
        </div>
        <Button variant="outline" onClick={() => approvals.refetch()} disabled={approvals.isFetching}>
          {approvals.isFetching ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>
      <div className="mt-5 space-y-3">
        {items.map((approval) => (
          <div key={approval.id} className={`rounded-2xl border p-4 ${approval.status === 'pending' ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[#0B1F3A]">{titleCase(approval.action)}</p>
                  <StatusBadge value={approval.risk_level} />
                  <StatusBadge value={approval.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">{approval.reason ?? 'No reason provided.'}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>Requested {formatDate(approval.created_at)}</span>
                  <span>By: <span className="font-mono text-slate-700">{approval.requested_by?.slice(0, 8)}…</span></span>
                  {approval.expires_at ? <span>Expires: {formatDate(approval.expires_at)}</span> : null}
                  {approval.scan_id ? <Link href={`/scans/${approval.scan_id}`} className="font-semibold text-[#2563EB]">View scan →</Link> : null}
                  {approval.schedule_id ? <Link href="/schedules" className="font-semibold text-[#2563EB]">View schedule →</Link> : null}
                </div>
                {approval.status !== 'pending' && approval.decided_at ? (
                  <p className="mt-1 text-xs text-slate-400">Decided {formatDate(approval.decided_at)}{approval.approved_by ? ` · by ${approval.approved_by.slice(0, 8)}…` : ''}</p>
                ) : null}
              </div>
              {approval.status === 'pending' ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => decide(approval, 'approved')} disabled={decision.isPending}>
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                  <Button variant="outline" onClick={() => decide(approval, 'rejected')} disabled={decision.isPending}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {!approvals.isLoading && !items.length ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 font-semibold text-[#0F172A]">Nothing to review</p>
          <p className="mt-1 text-sm text-slate-600">No approvals match this filter.</p>
        </div>
      ) : null}
    </Card>
  </>;
}
