'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Activity, FileText, GitBranch, PlayCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { ScanContextHeader } from '@/components/scans/scan-management';
import { useScan } from '@/hooks/use-scans';
import { formatDate, titleCase } from '@/lib/utils';

export default function ScanHubPage() {
  const params = useParams<{ scanId: string }>();
  const scan = useScan(params.scanId);
  return <><PageHeader title={scan.data?.name ?? 'Scan'} description="Open live progress, process review, final results, findings, reports, and retest actions for this scan." breadcrumbs={[{ href: '/scans', label: 'Scans' }, { label: scan.data?.name ?? params.scanId }]} actions={<Link href={`/scans/${params.scanId}/progress`}><Button><PlayCircle className="h-4 w-4" /> Live Progress</Button></Link>} />
    <div className="space-y-6"><ScanContextHeader scan={scan.data} /><div className="grid gap-4 md:grid-cols-3"><NavCard href={`/scans/${params.scanId}/progress`} icon={<Activity className="h-5 w-5" />} title="Live Scan Progress" text="Monitor module execution, events, candidates, evidence, and safety controls." /><NavCard href={`/scans/${params.scanId}/process`} icon={<GitBranch className="h-5 w-5" />} title="Scan Process and Results" text="Review workflow stages, evidence pipeline, approvals, and next actions." /><NavCard href={`/scans/${params.scanId}/results`} icon={<FileText className="h-5 w-5" />} title="Final Results" text="Open final findings, evidence, report draft, and retest actions." /></div><Card><CardHeader><h2 className="font-semibold">Scan Summary</h2></CardHeader><CardContent className="grid gap-3 text-sm md:grid-cols-3"><Info label="Status" value={scan.data?.status} /><Info label="Type" value={titleCase(scan.data?.scan_category)} /><Info label="Mode" value={titleCase(scan.data?.assessment_mode)} /><Info label="Depth" value={titleCase(scan.data?.scan_depth)} /><Info label="Started" value={formatDate(scan.data?.started_at)} /><Info label="Completed" value={formatDate(scan.data?.completed_at)} /></CardContent></Card></div>
  </>;
}

function NavCard({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) { return <Link href={href} className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm transition hover:border-[#E51C2A]"><div className="text-[#E51C2A]">{icon}</div><h2 className="mt-4 font-semibold text-[#0F172A]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#64748B]">{text}</p></Link>; }
function Info({ label, value }: { label: string; value?: string | null }) { return <div><p className="text-[#64748B]">{label}</p><div className="mt-1">{label === 'Status' ? <StatusBadge value={value ?? 'unknown'} /> : <strong className="text-[#0F172A]">{value ?? 'n/a'}</strong>}</div></div>; }
