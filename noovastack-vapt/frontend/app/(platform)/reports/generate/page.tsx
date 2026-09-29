'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot, CheckCircle2, Download, FileSearch, FileText, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { useReportAIImprovements, useScanReportData } from '@/hooks/use-reports';
import { useScans } from '@/hooks/use-scans';
import { api } from '@/lib/api-client';
import { formatDate, titleCase } from '@/lib/utils';

export default function ReportGeneratorPage() {
  const search = useSearchParams();
  const scans = useScans('?status=completed');
  const completedScans = scans.data ?? [];
  const initialScanId = search.get('scan') ?? completedScans[0]?.id ?? '';
  const [selectedScanId, setSelectedScanId] = useState(initialScanId);
  const scanId = selectedScanId || completedScans[0]?.id || '';
  const selectedScan = useMemo(() => completedScans.find((scan) => scan.id === scanId), [completedScans, scanId]);
  const report = useScanReportData(scanId);
  const improvements = useReportAIImprovements(scanId);
  const ai = improvements.data;
  const reportData = report.data;

  function download(format: 'pdf' | 'html' | 'json') {
    if (scanId) void api.downloadScanReport(scanId, format);
  }

  return <>
    <PageHeader title="Report Generator" description="Use the AI Report Agent to identify report gaps, improve evidence quality, and generate professional exports." breadcrumbs={[{ href: '/reports', label: 'Reports' }, { label: 'Report Generator' }]} />

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-6">
        <Card>
          <CardHeader><h2 className="font-semibold text-[#0B1F3A]">Select Completed Scan</h2><p className="mt-1 text-sm text-slate-600">The generator builds from verified scan findings, scope, services, and evidence.</p></CardHeader>
          <CardContent>
            {completedScans.length ? <div className="grid gap-3 md:grid-cols-2">{completedScans.map((scan) => <button key={scan.id} onClick={() => setSelectedScanId(scan.id)} className={`rounded-2xl border p-4 text-left transition ${scanId === scan.id ? 'border-[#155EEF] bg-[#EAF2FF]' : 'border-slate-200 bg-white hover:border-[#155EEF]/50'}`}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-[#0B1F3A]">{scan.name}</h3><p className="mt-1 text-xs text-slate-500">{scan.id}</p></div><StatusBadge value="ready" /></div><p className="mt-3 text-sm text-slate-600">{titleCase(scan.scan_category)} / {titleCase(scan.scan_depth)}</p><p className="mt-1 text-xs text-slate-500">Completed {formatDate(scan.completed_at)}</p></button>)}</div> : <div className="rounded-2xl border border-slate-200 p-8 text-center"><FileText className="mx-auto h-8 w-8 text-slate-400" /><h3 className="mt-3 font-semibold text-[#0B1F3A]">No completed scans</h3><p className="mt-2 text-sm text-slate-600">Run a scan first, then return here to generate an AI-assisted report.</p><Link href="/scans/new" className="mt-4 inline-flex"><Button>Run Scan</Button></Link></div>}
          </CardContent>
        </Card>

        {scanId ? <Card className="overflow-hidden">
          <div className="bg-[#07152B] p-6 text-white"><div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-100"><FileSearch className="h-4 w-4" /> Generator Preview</div><h2 className="mt-4 text-2xl font-bold">{reportData?.report_name ?? selectedScan?.name ?? 'Report Preview'}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">{reportData?.sections.executive_summary.overview ?? 'Loading report preview from completed scan evidence.'}</p></div><div className="rounded-2xl border border-white/15 bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-blue-100">AI Readiness</p><p className="mt-1 text-3xl font-bold">{ai ? `${ai.score}%` : '...'}</p></div></div></div>
          <CardContent className="grid gap-4 md:grid-cols-4"><Metric label="Risk" value={reportData?.summary.risk_rating ?? 'Loading'} /><Metric label="Findings" value={String(reportData?.summary.total_findings ?? 0)} /><Metric label="Verified" value={String(reportData?.summary.verified_findings ?? 0)} /><Metric label="Assets" value={String(reportData?.assets.length ?? 0)} /></CardContent>
        </Card> : null}

        {ai ? <Card>
          <CardHeader><h2 className="flex items-center gap-2 font-semibold text-[#0B1F3A]"><Sparkles className="h-5 w-5 text-[#155EEF]" /> AI Suggested Report Improvements</h2><p className="mt-1 text-sm text-slate-600">These recommendations improve readability, remediation quality, and export readiness without exposing scanner names.</p></CardHeader>
          <CardContent><div className="grid gap-3">{ai.suggested_sections.map((item) => <div key={item} className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-[#0B1F3A]">{item}</div>)}</div></CardContent>
        </Card> : null}
      </div>

      <aside className="space-y-6">
        <Card>
          <CardHeader><h2 className="flex items-center gap-2 font-semibold text-[#0B1F3A]"><Bot className="h-5 w-5 text-[#155EEF]" /> AI Report Agent</h2><p className="mt-1 text-sm text-slate-600">Identifies issues that can weaken a final client-ready report.</p></CardHeader>
          <CardContent>
            {improvements.isLoading || improvements.isFetching ? <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">Analyzing report quality...</div> : null}
            {ai ? <div className="space-y-3"><div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><p className="font-semibold text-[#0B1F3A]">{ai.agent.name}</p><p className="text-xs text-slate-500">{ai.agent.role} / {ai.agent.model}</p></div><StatusBadge value={ai.export_ready ? 'ready' : 'reviewing'} /></div><p className="mt-3 text-sm leading-6 text-slate-600">{ai.summary}</p></div>{ai.checks.map((check) => <div key={check.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2"><CheckIcon status={check.status} /><h3 className="font-semibold text-[#0B1F3A]">{check.title}</h3></div><p className="mt-2 text-sm text-slate-600">{check.detail}</p><p className="mt-2 text-sm font-medium text-[#0B1F3A]">{check.recommendation}</p></div>)}</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold text-[#0B1F3A]">Generate</h2><p className="mt-1 text-sm text-slate-600">Open the report or export directly after reviewing AI guidance.</p></CardHeader>
          <CardContent><div className="grid gap-2"><Link href={scanId ? `/reports/${scanId}` : '/reports'}><Button disabled={!scanId} className="w-full"><FileText className="h-4 w-4" /> Open Report</Button></Link><Button disabled={!scanId} variant="outline" onClick={() => download('pdf')}><Download className="h-4 w-4" /> Export PDF</Button><Button disabled={!scanId} variant="outline" onClick={() => download('html')}><Download className="h-4 w-4" /> Export HTML</Button><Button disabled={!scanId} variant="outline" onClick={() => download('json')}><Download className="h-4 w-4" /> Export JSON</Button></div></CardContent>
        </Card>
      </aside>
    </div>
  </>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-[#0B1F3A]">{value}</p></div>; }
function CheckIcon({ status }: { status: string }) { return status === 'pass' ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : status === 'warning' ? <TriangleAlert className="h-5 w-5 text-amber-600" /> : <ShieldCheck className="h-5 w-5 text-red-600" />; }
