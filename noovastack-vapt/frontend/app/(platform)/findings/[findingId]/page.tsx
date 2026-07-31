'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { useFinding } from '@/hooks/use-findings';
import { formatDate } from '@/lib/utils';

export default function FindingDetailPage() {
  const params = useParams<{ findingId: string }>();
  const finding = useFinding(params.findingId);
  const item = finding.data;
  return <><PageHeader title={item?.title ?? 'Finding Details'} description="Plain-language explanation, evidence, impact, remediation guidance, technical details, AI draft, review history, and retest." breadcrumbs={[{ href: '/findings', label: 'Findings' }, { label: item?.title ?? params.findingId }]} /><div className="grid gap-6 xl:grid-cols-[1fr_360px]"><Card><CardHeader><h2 className="font-semibold">What is the problem?</h2></CardHeader><CardContent className="space-y-6"><section><p className="text-slate-700">{item?.description ?? 'No description available.'}</p></section><section><h3 className="font-semibold">Why does it matter?</h3><p className="mt-2 text-sm text-slate-600">{item?.business_impact ?? 'An attacker may be able to use this weakness to access data, interrupt service, or bypass intended controls.'}</p></section><section><h3 className="font-semibold">How should it be fixed?</h3><p className="mt-2 text-sm text-slate-600">{item?.remediation ?? 'Apply the recommended secure configuration or code fix, then run a retest to confirm the issue is fixed.'}</p></section><section className="rounded-2xl border border-blue-200 bg-[#EAF2FF] p-4"><p className="font-semibold text-[#0B1F3A]">AI-generated draft. Human review required.</p><p className="mt-2 text-sm text-slate-700">{item?.ai_explanation ?? 'No AI explanation is available from the backend yet.'}</p></section></CardContent></Card><div className="space-y-6"><Card><CardHeader><h2 className="font-semibold">Overview</h2></CardHeader><CardContent className="space-y-3 text-sm"><p>Severity: <SeverityBadge value={item?.severity} /></p><p>Status: <StatusBadge value={item?.status} /></p><p>Affected asset: <strong>{item?.asset_id ?? 'Unknown'}</strong></p><p>First discovered: <strong>{formatDate(item?.first_seen)}</strong></p><p>Last confirmed: <strong>{formatDate(item?.last_seen)}</strong></p><p>OWASP: <strong>{item?.owasp_category ?? 'Not mapped'}</strong></p><p>CWE: <strong>{item?.cwe_id ?? 'Not mapped'}</strong></p><p>CVSS: <strong>{item?.cvss_score ?? 'Not scored'}</strong></p></CardContent></Card><Card><CardHeader><h2 className="font-semibold">Evidence</h2></CardHeader><CardContent className="text-sm text-slate-600">Sensitive values are redacted by default. Evidence hashes and capture dates appear here when backend evidence storage is enabled.</CardContent></Card></div></div></>;
}
