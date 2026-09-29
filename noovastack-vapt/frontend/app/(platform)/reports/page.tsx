'use client';

import Link from 'next/link';
import { Bot, FileText } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { useScans } from '@/hooks/use-scans';
import { formatDate, titleCase } from '@/lib/utils';

const reportTypes = ['Vulnerability Assessment', 'Technical Findings', 'Service Discovery', 'Remediation Summary'];

export default function ReportsPage() {
  const scans = useScans('?status=completed');
  const completedScans = scans.data ?? [];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Reports are automatically available after scans complete, similar to Greenbone, ZAP, and other VA platforms."
        actions={<Link href="/reports/generate"><Button><Bot className="h-4 w-4" /> Report Generator</Button></Link>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {reportTypes.map((type) => <Card key={type} className="p-5"><FileText className="h-5 w-5 text-[#155EEF]" /><h3 className="mt-3 font-semibold text-[#0B1F3A]">{type}</h3><p className="mt-3 text-sm text-slate-600">Included automatically from completed scan evidence and findings.</p><div className="mt-4"><StatusBadge value="active" /></div></Card>)}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <h2 className="font-semibold text-[#0B1F3A]">Available Scan Reports</h2>
          <p className="mt-1 text-sm text-slate-600">Every completed scan has a report. No separate report-building step is required.</p>
        </CardHeader>
        <CardContent>
          {completedScans.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-slate-500"><tr><th className="py-2">Report</th><th>Assessment</th><th>Status</th><th>Completed</th><th>Actions</th></tr></thead><tbody>{completedScans.map((scan) => <tr key={scan.id} className="border-t border-slate-100"><td className="py-3"><p className="font-semibold text-[#0B1F3A]">{scan.name}</p><p className="text-xs text-slate-500">Report ID: {scan.id}</p></td><td>{titleCase(scan.scan_category)} / {titleCase(scan.scan_depth)}</td><td><StatusBadge value="ready" /></td><td>{formatDate(scan.completed_at)}</td><td><div className="flex flex-wrap gap-2"><Link href={`/reports/generate?scan=${scan.id}`}><Button variant="secondary"><Bot className="h-4 w-4" /> Improve</Button></Link><Link href={`/reports/${scan.id}`}><Button variant="outline">Open</Button></Link></div></td></tr>)}</tbody></table></div> : <EmptyState icon={FileText} title="No reports available" description="Run a scan first. Then use Generate Report from the completed scan." action="Run Scan" href="/scans/new" />}
        </CardContent>
      </Card>
    </>
  );
}
