'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ApprovalQueue, EvidencePipeline, FindingsQueue, NextActionsPanel, ScanContextHeader, ScanProcessOverview, SeverityDonut } from '@/components/scans/scan-management';
import { useScan, useScanProcess, useScanResults } from '@/hooks/use-scans';

export default function ScanProcessPage() {
  const params = useParams<{ scanId: string }>();
  const scan = useScan(params.scanId);
  const process = useScanProcess(params.scanId);
  const results = useScanResults(params.scanId);
  return <><PageHeader title="Scan Process and Results" description="Review scan workflow, evidence processing, findings, approvals, and next actions." breadcrumbs={[{ href: '/scans', label: 'Scans' }, { href: `/scans/${params.scanId}`, label: scan.data?.name ?? params.scanId }, { label: 'Process' }]} actions={<Link href={`/scans/${params.scanId}/results`}><Button>Final Results</Button></Link>} />
    <div className="space-y-6"><ScanContextHeader scan={scan.data} /><ScanProcessOverview process={process.data} /><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"><div className="space-y-6"><EvidencePipeline process={process.data} /><FindingsQueue results={results.data} /></div><aside className="space-y-6"><SeverityDonut counts={results.data?.severity_counts ?? {}} /><ApprovalQueue scanId={params.scanId} approvals={process.data?.approvals} /><NextActionsPanel actions={process.data?.next_actions} /></aside></div><div className="flex flex-wrap gap-2"><Link href={`/findings?scan_id=${params.scanId}`}><Button variant="outline">View Findings</Button></Link><Link href={`/reports/generate?scan=${params.scanId}`}><Button>Generate Report Draft</Button></Link><Link href="/retests"><Button variant="outline">Start Retest</Button></Link><Button variant="outline">Download Evidence Manifest</Button><Button variant="outline" disabled={scan.data?.status !== 'completed'}>Archive Scan</Button></div></div>
  </>;
}
