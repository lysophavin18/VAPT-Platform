'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAsset } from '@/hooks/use-assets';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

export default function AssetDetailPage() {
  const params = useParams<{ assetId: string }>();
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const asset = useAsset(params.assetId);
  const tabs = ['Overview', 'Relationships', 'Services', 'Technologies', 'TLS', 'Scan History', 'Findings', 'Evidence', 'Notes'];
  const isManager = user?.role && ['admin', 'manager', 'security_team'].includes(user.role);

  const approveAsset = useMutation({
    mutationFn: () => api.approveAsset(params.assetId, token),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['assets', 'detail', params.assetId] }); toast.success('Asset approved and marked in-scope'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Approval failed'),
  });

  const rejectAsset = useMutation({
    mutationFn: () => api.rejectAsset(params.assetId, token),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['assets', 'detail', params.assetId] }); toast.success('Asset rejected and marked out-of-scope'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Rejection failed'),
  });

  const isPending = asset.data?.approval_status === 'pending';

  return (
    <>
      <PageHeader
        title={asset.data?.name ?? 'Asset Details'}
        description="Detailed asset context, technologies, services, evidence, notes, and scan history."
        breadcrumbs={[{ href: '/assets', label: 'Assets' }, { label: asset.data?.value ?? params.assetId }]}
        actions={isPending && isManager ? (
          <>
            <Button onClick={() => approveAsset.mutate()} disabled={approveAsset.isPending || rejectAsset.isPending}>
              <CheckCircle className="h-4 w-4" /> Approve Asset
            </Button>
            <Button variant="outline" onClick={() => rejectAsset.mutate()} disabled={approveAsset.isPending || rejectAsset.isPending}>
              <XCircle className="h-4 w-4" /> Reject
            </Button>
          </>
        ) : undefined}
      />
      <Card className="p-6"><div className="flex flex-wrap gap-2">{tabs.map((tab) => <span key={tab} className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600">{tab}</span>)}</div></Card>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><h2 className="font-semibold">Overview</h2></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Asset: <strong>{asset.data?.value ?? 'Loading...'}</strong></p>
            <p>Type: <strong>{asset.data?.asset_type ?? 'Unknown'}</strong></p>
            <p>Environment: <strong>{asset.data?.environment ?? 'Not set'}</strong></p>
            <p>Scope: <StatusBadge value={asset.data?.scope_status} /></p>
            <p>Review Status: <StatusBadge value={asset.data?.approval_status} /></p>
            <p>First discovered: <strong>{formatDate(asset.data?.first_discovered_at)}</strong></p>
            <p>Last observed: <strong>{formatDate(asset.data?.last_observed_at)}</strong></p>
            {isPending && isManager ? (
              <div className="flex gap-2 pt-2">
                <Button onClick={() => approveAsset.mutate()} disabled={approveAsset.isPending || rejectAsset.isPending}>
                  <CheckCircle className="h-4 w-4" /> Approve Asset
                </Button>
                <Button variant="outline" onClick={() => rejectAsset.mutate()} disabled={approveAsset.isPending || rejectAsset.isPending}>
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card><CardHeader><h2 className="font-semibold">Sensitive Evidence</h2></CardHeader><CardContent className="text-sm text-slate-600">Service banners, tokens, request samples, and screenshots are redacted by default. Authorized security users can review evidence when backend evidence retrieval is enabled.</CardContent></Card>
      </div>
    </>
  );
}
