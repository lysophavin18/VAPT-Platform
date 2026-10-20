'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { useFinding } from '@/hooks/use-findings';
import { useAuth } from '@/hooks/use-auth';
import { formatDate } from '@/lib/utils';
import { api } from '@/lib/api-client';
import type { FindingComment } from '@/types';

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  remediation: { label: 'Remediation', color: 'bg-green-100 text-green-800' },
  question: { label: 'Question', color: 'bg-yellow-100 text-yellow-800' },
  comment: { label: 'Comment', color: 'bg-slate-100 text-slate-700' },
};

function CommentThread({ findingId }: { findingId: string }) {
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [type, setType] = useState<'comment' | 'remediation' | 'question'>('comment');

  const { data: comments = [], isLoading } = useQuery<FindingComment[]>({
    queryKey: ['finding-comments', findingId],
    queryFn: () => api.findingComments(findingId, token),
    enabled: !!findingId && !!token,
    refetchInterval: 15000,
  });

  const addMutation = useMutation({
    mutationFn: () => api.addFindingComment(findingId, body.trim(), type, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finding-comments', findingId] });
      setBody('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => api.deleteFindingComment(findingId, commentId, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finding-comments', findingId] }),
  });

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Discussion &amp; Remediation Notes</h2>
        <p className="text-xs text-slate-500">Analysts can leave remediation guidance, questions, or general comments for the team.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-slate-500">Loading comments…</p>}
        {!isLoading && comments.length === 0 && (
          <p className="text-sm text-slate-400 italic">No comments yet. Be the first to add remediation notes.</p>
        )}
        <div className="space-y-3">
          {comments.map((c) => {
            const meta = TYPE_LABELS[c.comment_type] ?? TYPE_LABELS.comment;
            const isOwn = user?.id === c.author_id;
            return (
              <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>{meta.label}</span>
                    <span className="font-medium text-slate-700">{c.author_name ?? 'Unknown'}</span>
                    <span className="text-slate-400">{formatDate(c.created_at)}</span>
                  </div>
                  {(isOwn || user?.role === 'admin' || user?.role === 'manager') && (
                    <button
                      onClick={() => deleteMutation.mutate(c.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p className="text-slate-700 whitespace-pre-wrap">{c.body}</p>
              </div>
            );
          })}
        </div>

        <div className="border-t pt-4 space-y-2">
          <div className="flex gap-2">
            {(['comment', 'remediation', 'question'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  type === t ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]' : 'text-slate-600 border-slate-300 hover:border-slate-400'
                }`}
              >
                {TYPE_LABELS[t].label}
              </button>
            ))}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              type === 'remediation'
                ? 'Describe the fix steps for the developer…'
                : type === 'question'
                ? 'Ask a clarifying question…'
                : 'Add a comment…'
            }
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A] resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={() => addMutation.mutate()}
              disabled={!body.trim() || addMutation.isPending}
              className="rounded-lg bg-[#0B1F3A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a3a6b] disabled:opacity-50 transition-colors"
            >
              {addMutation.isPending ? 'Posting…' : 'Post'}
            </button>
          </div>
          {addMutation.isError && (
            <p className="text-xs text-red-500">Failed to post. Please try again.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FindingDetailPage() {
  const params = useParams<{ findingId: string }>();
  const finding = useFinding(params.findingId);
  const item = finding.data;

  return (
    <>
      <PageHeader
        title={item?.title ?? 'Finding Details'}
        description="Plain-language explanation, evidence, impact, remediation guidance, technical details, AI draft, review history, and retest."
        breadcrumbs={[{ href: '/findings', label: 'Findings' }, { label: item?.title ?? params.findingId }]}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><h2 className="font-semibold">What is the problem?</h2></CardHeader>
            <CardContent className="space-y-6">
              <section>
                <p className="text-slate-700">{item?.description ?? 'No description available.'}</p>
              </section>
              <section>
                <h3 className="font-semibold">Why does it matter?</h3>
                <p className="mt-2 text-sm text-slate-600">{item?.business_impact ?? 'An attacker may be able to use this weakness to access data, interrupt service, or bypass intended controls.'}</p>
              </section>
              <section>
                <h3 className="font-semibold">How should it be fixed?</h3>
                <p className="mt-2 text-sm text-slate-600">{item?.remediation ?? 'Apply the recommended secure configuration or code fix, then run a retest to confirm the issue is fixed.'}</p>
              </section>
              <section className="rounded-2xl border border-blue-200 bg-[#EAF2FF] p-4">
                <p className="font-semibold text-[#0B1F3A]">AI-generated draft. Human review required.</p>
                <p className="mt-2 text-sm text-slate-700">{item?.ai_explanation ?? 'No AI explanation is available from the backend yet.'}</p>
              </section>
            </CardContent>
          </Card>

          {params.findingId && <CommentThread findingId={params.findingId} />}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><h2 className="font-semibold">Overview</h2></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Severity: <SeverityBadge value={item?.severity} /></p>
              <p>Status: <StatusBadge value={item?.status} /></p>
              <p>Affected asset: <strong>{item?.asset_id ?? 'Unknown'}</strong></p>
              <p>First discovered: <strong>{formatDate(item?.first_seen)}</strong></p>
              <p>Last confirmed: <strong>{formatDate(item?.last_seen)}</strong></p>
              <p>OWASP: <strong>{item?.owasp_category ?? 'Not mapped'}</strong></p>
              <p>CWE: <strong>{item?.cwe_id ?? 'Not mapped'}</strong></p>
              <p>CVSS: <strong>{item?.cvss_score ?? 'Not scored'}</strong></p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><h2 className="font-semibold">Evidence</h2></CardHeader>
            <CardContent className="text-sm text-slate-600">
              Sensitive values are redacted by default. Evidence hashes and capture dates appear here when backend evidence storage is enabled.
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
