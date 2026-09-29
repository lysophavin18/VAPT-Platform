'use client';

import type { ReactNode } from 'react';
import { Camera, Download, FileSearch, ShieldCheck } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { NstLogo } from '@/components/branding/nst-logo';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SeverityBadge } from '@/components/ui/badge';
import { useScanReportData } from '@/hooks/use-reports';
import { api } from '@/lib/api-client';
import { BRAND } from '@/lib/branding';
import { formatDate } from '@/lib/utils';

const severityOrder = ['critical', 'high', 'medium', 'low', 'informational'];
const severityColors: Record<string, string> = {
  critical: '#7F1D1D',
  high: '#EA580C',
  medium: '#F79009',
  low: '#0B5E9E',
  informational: '#667085',
};

export default function ReportPreviewPage({ params }: { params: { reportId: string } }) {
  const report = useScanReportData(params.reportId);
  const data = report.data;

  if (report.isLoading || report.isFetching) {
    return <Card className="p-8 text-sm text-slate-600">Loading Vulnerability Assessment report...</Card>;
  }

  if (report.isError || !data) {
    const message = report.error instanceof Error ? report.error.message : 'Unknown error';
    return <Card className="p-8 text-sm text-red-700">Unable to load report data for scan ID {params.reportId}. {message}</Card>;
  }

  return (
    <>
      <PageHeader
        title="Vulnerability Assessment Report"
        description="Executive summary, scope, security findings, and remediation plan."
        breadcrumbs={[{ href: '/reports', label: 'Reports' }, { label: data.scan.name }]}
        actions={<ExportActions scanId={params.reportId} />}
      />

      <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="relative overflow-hidden bg-[#0B1F33] p-8 text-white">
            <div className="absolute right-[-80px] top-[-90px] h-72 w-72 rounded-full bg-[#0B5E9E]/30 blur-2xl" />
            <div className="absolute bottom-[-120px] left-[-80px] h-72 w-72 rounded-full bg-[#083F6B]/30 blur-2xl" />
            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-4xl">
                <NstLogo variant="white" className="mb-6 h-16 max-w-xs" />
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">{BRAND.companyName} | {BRAND.confidentiality}</p>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100"><ShieldCheck className="h-4 w-4" /> {data.classification}</div>
                <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">{data.report_name}</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-blue-50">{data.sections.executive_summary.overview}</p>
              </div>
              <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-blue-100">Overall Risk</p>
                <p className="mt-2 text-3xl font-bold">{data.summary.risk_rating}</p>
                <p className="mt-2 text-sm text-blue-100">Generated {formatDate(data.generated_at)}</p>
              </div>
            </div>
          </div>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <Metric label="Overall Risk" value={data.summary.risk_rating} />
            <Metric label="Findings" value={String(data.summary.total_findings)} />
            <Metric label="Verified" value={String(data.summary.verified_findings)} />
            <Metric label="Assets" value={String(data.assets.length)} />
          </CardContent>
          <div className="border-t border-slate-200 px-5 pb-5 text-sm text-slate-600">
            Produced automatically by <strong className="text-[#102033]">{data.generated_by?.name ?? BRAND.productName}</strong> on <strong className="text-[#102033]">{formatDate(data.generated_at)}</strong>
            {data.viewed_by?.name ? <span>. Viewed by <strong className="text-[#102033]">{data.viewed_by.name}</strong></span> : null}. {BRAND.distributionNotice}.
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Section title="Executive Summary">
              <p className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-[#102033]">{data.sections.executive_summary.overview}</p>
              <ul className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                {data.sections.executive_summary.key_observations.map((item) => <li key={item} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#0B5E9E]">Key Observation</span>{item}</li>)}
              </ul>
            </Section>

            <Section title="Assessment Scope">
              <div className="grid gap-3 md:grid-cols-2">
                <Info label="Project" value={data.project.name ?? 'Not assigned'} />
                <Info label="Environment" value={data.sections.assessment_scope.environment ?? 'Not specified'} />
                <Info label="Assessment Type" value={data.sections.assessment_scope.assessment_type} />
                <Info label="Scan Depth" value={data.scan.scan_depth} />
              </div>
              <p className="mt-4 rounded-xl bg-[#EAF4FB] p-3 text-sm text-[#102033]">{data.sections.assessment_scope.authorization_note}</p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-500"><tr><th className="py-2">Asset</th><th>Type</th><th>Scope</th><th>Review Status</th></tr></thead>
                  <tbody>{data.assets.map((asset) => <tr key={asset.id} className="border-t border-slate-100"><td className="py-3 font-medium">{asset.value}</td><td>{asset.type}</td><td>{asset.scope_status}</td><td>{asset.approval_status}</td></tr>)}</tbody>
                </table>
              </div>
            </Section>

            <Section title="Assessment Methodology">
              <div className="grid gap-4 md:grid-cols-3">
                <ListBlock title="Steps" items={data.sections.methodology.steps} />
                <ListBlock title="Standards" items={data.sections.methodology.standards} />
                <ListBlock title="Limitations" items={data.sections.methodology.limitations} />
              </div>
            </Section>

            <Section title="Discovered Services">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-500"><tr><th className="py-2">Host</th><th>Port</th><th>Service</th><th>Status</th><th>Technology</th></tr></thead>
                  <tbody>{data.sections.service_discovery.services.map((service) => <tr key={`${service.host}:${service.port}`} className="border-t border-slate-100"><td className="py-3">{service.host}</td><td>{service.port}</td><td>{service.service}</td><td>{service.status_code ?? 'n/a'}</td><td>{[service.server, service.product, service.version].filter(Boolean).join(' ') || 'n/a'}</td></tr>)}</tbody>
                </table>
              </div>
            </Section>

            <Section title="Security Findings">
              <div className="space-y-4">
                {data.findings.map((finding) => <FindingCard key={finding.id} finding={finding} />)}
              </div>
            </Section>

            <Section title="Evidence Gallery">
              <p className="mb-4 text-sm leading-6 text-slate-600">{data.sections.evidence_gallery?.description ?? 'Evidence is redacted to preserve sensitive values while keeping enough context for remediation and retesting.'}</p>
              <div className="grid gap-4 lg:grid-cols-2">
                {(data.sections.evidence_gallery?.items ?? []).map((item) => <EvidenceCard key={item.id} item={item} />)}
              </div>
            </Section>

            <Section title="Remediation Plan">
              <div className="space-y-4">
                {data.sections.remediation_plan.priorities.map((group) => <div key={group.priority} className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold text-[#0B1F3A]">{group.priority}</h3><ul className="mt-3 space-y-2 text-sm text-slate-700">{group.actions.map((action) => <li key={action}>{action}</li>)}</ul></div>)}
              </div>
            </Section>

            <Section title="Conclusion">
              <p className="text-sm leading-6 text-slate-700">{data.sections.conclusion.statement}</p>
            </Section>
          </div>

          <aside className="space-y-6">
            <Card>
              <CardHeader><h2 className="font-semibold">Security Findings Cycle</h2></CardHeader>
              <CardContent><FindingCycle counts={data.summary.severity_counts} total={data.summary.total_findings} /></CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}

function ExportActions({ scanId }: { scanId: string }) {
  function download(format: 'pdf' | 'html' | 'json') {
    void api.downloadScanReport(scanId, format);
  }

  return <>
    <Button variant="outline" onClick={() => download('json')}><Download className="h-4 w-4" /> JSON</Button>
    <Button variant="outline" onClick={() => download('html')}><Download className="h-4 w-4" /> HTML</Button>
    <Button onClick={() => download('pdf')}><Download className="h-4 w-4" /> PDF</Button>
  </>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Card className="overflow-hidden border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-100 bg-slate-50/70"><h2 className="font-semibold text-[#0B1F3A]">{title}</h2></CardHeader><CardContent>{children}</CardContent></Card>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-[#0B1F3A]">{value}</p></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-800">{value}</p></div>;
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return <div><h3 className="font-semibold text-[#0B1F3A]">{title}</h3><ul className="mt-3 space-y-2 text-sm text-slate-700">{items.map((item) => <li key={item} className="rounded-xl bg-slate-50 p-3">{item}</li>)}</ul></div>;
}

function FindingCycle({ counts, total }: { counts: Record<string, number>; total: number }) {
  const data = severityOrder.map((severity) => ({ name: severity, value: counts[severity] ?? 0 })).filter((item) => item.value > 0);

  if (!data.length) {
    return <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-blue-50 p-6 text-center"><div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border-[18px] border-emerald-200 bg-white shadow-inner"><div><p className="text-4xl font-bold text-emerald-700">0</p><p className="text-xs uppercase tracking-wide text-slate-500">Findings</p></div></div><p className="mt-4 text-sm text-slate-600">No verified security findings were recorded.</p></div>;
  }

  return <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-[#0B1F33] to-[#0B5E9E] p-4 text-white shadow-sm">
    <div className="relative h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip formatter={(value, name) => [value, String(name).replace(/^./, (char) => char.toUpperCase())]} contentStyle={{ borderRadius: 12, border: '0', boxShadow: '0 12px 28px rgba(15,23,42,0.18)' }} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="86%" paddingAngle={4} stroke="rgba(255,255,255,0.9)" strokeWidth={3}>
            {data.map((entry) => <Cell key={entry.name} fill={severityColors[entry.name]} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center"><div><p className="text-5xl font-bold">{total}</p><p className="text-xs uppercase tracking-[0.25em] text-blue-100">Findings</p></div></div>
    </div>
    <div className="mt-2 grid gap-2">
      {severityOrder.map((severity) => <div key={severity} className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2 text-sm backdrop-blur"><span className="flex items-center gap-2 capitalize"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: severityColors[severity] }} />{severity}</span><strong>{counts[severity] ?? 0}</strong></div>)}
    </div>
  </div>;
}

function FindingCard({ finding }: { finding: { title: string; severity: string; description?: string; owasp_category?: string; cwe_id?: string; cvss_score?: number; remediation?: string } }) {
  return <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4"><div><h3 className="font-semibold text-[#0B1F3A]">{finding.title}</h3><p className="mt-1 text-xs text-slate-500">{finding.owasp_category} · {finding.cwe_id} · CVSS {finding.cvss_score ?? 'n/a'}</p></div><SeverityBadge value={finding.severity} /></div><div className="p-4"><p className="text-sm leading-6 text-slate-700">{finding.description}</p><div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-[#0B1F3A]"><strong>Recommended Remediation:</strong> {finding.remediation}</div></div></div>;
}

function EvidenceCard({ item }: { item: { finding_title: string; severity: string; affected_asset?: string | null; evidence_type: string; summary?: string | null; details?: string | null; hash_value?: string | null; created_at?: string | null } }) {
  return <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 p-4 text-[#0B1F3A]">
      <div className="flex items-start justify-between gap-3"><div><p className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#0B5E9E]"><Camera className="h-3.5 w-3.5" /> {item.evidence_type}</p><h3 className="mt-3 font-semibold leading-6 text-[#102033]">{item.finding_title}</h3></div><SeverityBadge value={item.severity} /></div>
    </div>
    <div className="space-y-4 p-4">
      <div className="grid gap-3 text-sm sm:grid-cols-2"><Info label="Affected Asset" value={item.affected_asset ?? 'Not Provided'} /><Info label="Captured" value={formatDate(item.created_at)} /></div>
      <p className="text-sm leading-6 text-slate-700">{item.summary ?? 'Redacted evidence is available for this finding.'}</p>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-800 shadow-inner"><div className="mb-2 flex items-center gap-2 font-semibold text-[#0B5E9E]"><FileSearch className="h-4 w-4" /> Redacted Evidence</div><pre className="whitespace-pre-wrap font-mono text-slate-800">{item.details ?? 'No additional details captured.'}</pre></div>
      <p className="break-all rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Integrity: {item.hash_value ?? 'Not Provided'}</p>
    </div>
  </article>;
}
