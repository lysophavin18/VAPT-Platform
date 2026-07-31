'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FileText } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { CandidateFindingsSummary, EvidenceSummary, HighLevelScanSteps, LiveEventsFeed, ModuleTimeline, OverallProgress, ScanContextHeader, ScanControls, ScanSafetyPanel, ScanSummaryPanel } from '@/components/scans/scan-management';
import { useAuth } from '@/hooks/use-auth';
import { useScan, useScanEvents, useScanEvidence, useScanModules, useScanResults, useScanSafety } from '@/hooks/use-scans';
import { useScanProgress } from '@/hooks/use-scan-progress';
import { api } from '@/lib/api-client';

export default function LiveScanProgressPage() {
  const params = useParams<{ scanId: string }>();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const scan = useScan(params.scanId);
  const progress = useScanProgress(params.scanId);
  const modules = useScanModules(params.scanId);
  const events = useScanEvents(params.scanId);
  const safety = useScanSafety(params.scanId);
  const evidence = useScanEvidence(params.scanId);
  const results = useScanResults(params.scanId);
  const mutation = useMutation({ mutationFn: ({ action, confirmation }: { action: string; confirmation?: string }) => action === 'pause' ? api.pauseScan(params.scanId, token) : action === 'resume' ? api.resumeScan(params.scanId, token) : action === 'cancel' ? api.cancelScan(params.scanId, token) : api.emergencyStopScan(params.scanId, confirmation ?? '', token), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scan', params.scanId] }) });
  const pct = progress.data?.progress ?? scan.data?.progress ?? 0;
  return <><PageHeader title="Live Scan Progress" description="Monitor scan execution, evidence processing, findings, and safety controls." breadcrumbs={[{ href: '/scans', label: 'Scans' }, { href: `/scans/${params.scanId}`, label: scan.data?.name ?? params.scanId }, { label: 'Progress' }]} actions={<><Link href={`/scans/${params.scanId}/process`}><Button variant="outline">Process</Button></Link>{scan.data?.status === 'completed' ? <Link href={`/reports/${params.scanId}`}><Button><FileText className="h-4 w-4" /> Report</Button></Link> : null}</>} />
    <div className="space-y-6"><ScanContextHeader scan={scan.data} /><OverallProgress progress={pct} status={progress.data?.status ?? scan.data?.status} /><HighLevelScanSteps progress={pct} status={scan.data?.status} /><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"><div className="space-y-6"><ModuleTimeline modules={modules.data ?? progress.data?.modules ?? []} /><LiveEventsFeed events={events.data ?? []} /></div><aside className="space-y-6"><ScanControls status={scan.data?.status} onPause={() => mutation.mutate({ action: 'pause' })} onResume={() => mutation.mutate({ action: 'resume' })} onCancel={() => mutation.mutate({ action: 'cancel' })} onEmergencyStop={(confirmation) => mutation.mutate({ action: 'emergency', confirmation })} /><ScanSummaryPanel scanType={scan.data?.scan_category ?? 'website'} mode={scan.data?.assessment_mode ?? 'black_box'} depth={scan.data?.scan_depth ?? 'standard'} assets={results.data?.evidence.items.length ?? 0} schedule="Run or schedule state" project={scan.data?.project_id} engagement={scan.data?.engagement_id ?? undefined} authorization="Authorized scope required" /><ScanSafetyPanel safety={safety.data} /><CandidateFindingsSummary counts={results.data?.severity_counts ?? {}} /><EvidenceSummary evidence={evidence.data} /></aside></div></div>
  </>;
}
