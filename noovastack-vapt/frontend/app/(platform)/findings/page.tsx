'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import { IntegrityBadge, SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { useFindingActions, useFindings } from '@/hooks/use-findings';
import { formatDate } from '@/lib/utils';
import type { Finding } from '@/types';
import { useState } from 'react';

export default function FindingsPage() {
  const [severity, setSeverity] = useState('');
  const query = severity ? `?severity=${severity}` : '';
  const findings = useFindings(query);
  const actions = useFindingActions();
  return <><PageHeader title="Findings" description="Plain-language issue summaries with technical classification, evidence, remediation, review, and retest workflow." /><div className="mb-5 flex flex-wrap gap-3"><Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="max-w-xs"><option value="">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="informational">Informational</option></Select></div><DataTable<Finding> data={findings.data ?? []} empty={<EmptyState icon={AlertTriangle} title="No findings available" description="Run a security scan to check your in-scope assets." action="Create Scan" href="/scans/new" />} columns={[{ key: 'finding', header: 'Finding', render: (finding) => <div><Link href={`/findings/${finding.id}`} className="font-semibold text-[#155EEF]">{finding.title}</Link><p className="mt-1 max-w-md text-xs text-slate-500">{finding.description}</p></div> }, { key: 'severity', header: 'Severity', render: (finding) => <SeverityBadge value={finding.severity} /> }, { key: 'asset', header: 'Affected Asset', render: (finding) => finding.asset_id ?? 'Unknown' }, { key: 'owasp', header: 'OWASP Category', render: (finding) => finding.owasp_category ?? 'Not mapped' }, { key: 'cwe', header: 'CWE', render: (finding) => finding.cwe_id ?? 'Not mapped' }, { key: 'integrity', header: 'Integrity', render: (finding) => <IntegrityBadge value={finding.integrity_status} /> }, { key: 'status', header: 'Workflow Status', render: (finding) => <StatusBadge value={finding.status} /> }, { key: 'last', header: 'Last Seen', render: (finding) => formatDate(finding.last_seen) }, { key: 'actions', header: 'Actions', render: (finding) => <div className="flex gap-2"><Button variant="secondary" onClick={() => actions.mutate({ id: finding.id, action: 'verify' })}>Verify</Button><Button variant="outline" onClick={() => actions.mutate({ id: finding.id, action: 'false-positive' })}>False Positive</Button></div> }]} /></>;
}
