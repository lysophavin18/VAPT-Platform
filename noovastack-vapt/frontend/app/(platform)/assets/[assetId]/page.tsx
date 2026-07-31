'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { useAsset } from '@/hooks/use-assets';
import { formatDate } from '@/lib/utils';

export default function AssetDetailPage() {
  const params = useParams<{ assetId: string }>();
  const asset = useAsset(params.assetId);
  const tabs = ['Overview', 'Relationships', 'Services', 'Technologies', 'TLS', 'Scan History', 'Findings', 'Evidence', 'Notes'];

  return (
    <>
      <PageHeader title={asset.data?.name ?? 'Asset Details'} description="Detailed asset context, technologies, services, evidence, notes, and scan history." breadcrumbs={[{ href: '/assets', label: 'Assets' }, { label: asset.data?.value ?? params.assetId }]} />
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
          </CardContent>
        </Card>
        <Card><CardHeader><h2 className="font-semibold">Sensitive Evidence</h2></CardHeader><CardContent className="text-sm text-slate-600">Service banners, tokens, request samples, and screenshots are redacted by default. Authorized security users can review evidence when backend evidence retrieval is enabled.</CardContent></Card>
      </div>
    </>
  );
}
