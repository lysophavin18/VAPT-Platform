'use client';

import { useMemo, useState } from 'react';
import { Calculator, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SeverityBadge } from '@/components/ui/badge';

const metricGroups = [
  { title: 'Exploitability Metrics', metrics: [
    { key: 'AV', label: 'Attack Vector', values: [['N', 'Network', 0.85], ['A', 'Adjacent', 0.62], ['L', 'Local', 0.55], ['P', 'Physical', 0.2]] },
    { key: 'AC', label: 'Attack Complexity', values: [['L', 'Low', 0.77], ['H', 'High', 0.44]] },
    { key: 'PR', label: 'Privileges Required', values: [['N', 'None', 'N'], ['L', 'Low', 'L'], ['H', 'High', 'H']] },
    { key: 'UI', label: 'User Interaction', values: [['N', 'None', 0.85], ['R', 'Required', 0.62]] },
  ] },
  { title: 'Impact Metrics', metrics: [
    { key: 'S', label: 'Scope', values: [['U', 'Unchanged', 'U'], ['C', 'Changed', 'C']] },
    { key: 'C', label: 'Confidentiality', values: [['H', 'High', 0.56], ['L', 'Low', 0.22], ['N', 'None', 0]] },
    { key: 'I', label: 'Integrity', values: [['H', 'High', 0.56], ['L', 'Low', 0.22], ['N', 'None', 0]] },
    { key: 'A', label: 'Availability', values: [['H', 'High', 0.56], ['L', 'Low', 0.22], ['N', 'None', 0]] },
  ] },
] as const;

type Metrics = Record<string, string>;

const defaults: Metrics = { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'N', I: 'N', A: 'N' };

const metricValues: Record<string, Record<string, number>> = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  C: { H: 0.56, L: 0.22, N: 0 },
  I: { H: 0.56, L: 0.22, N: 0 },
  A: { H: 0.56, L: 0.22, N: 0 },
};

export default function CvssCalculatorPage() {
  const [metrics, setMetrics] = useState<Metrics>(defaults);
  const result = useMemo(() => calculateCvss(metrics), [metrics]);

  function copyVector() {
    navigator.clipboard.writeText(result.vector);
    toast.success('CVSS vector copied');
  }

  return (
    <>
      <PageHeader title="CVSS Calculator" description="Calculate CVSS v3.1 base score and vector for verified vulnerability findings." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {metricGroups.map((group) => <Card key={group.title}><CardHeader><h2 className="font-semibold text-[#0B1F3A]">{group.title}</h2></CardHeader><CardContent className="space-y-5">{group.metrics.map((metric) => <div key={metric.key}><div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[#0B1F3A]">{metric.label}</h3><span className="text-xs text-slate-500">{metric.key}</span></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{metric.values.map(([value, label]) => <button key={value} onClick={() => setMetrics({ ...metrics, [metric.key]: String(value) })} className={`rounded-xl border px-3 py-2 text-left text-sm transition ${metrics[metric.key] === value ? 'border-[#155EEF] bg-[#EAF2FF] text-[#155EEF]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><span className="font-semibold">{value}</span><span className="ml-2">{label}</span></button>)}</div></div>)}</CardContent></Card>)}
        </div>
        <aside className="space-y-6">
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-[#155EEF]" /><h2 className="font-semibold">Base Score</h2></div></CardHeader>
            <CardContent>
              <div className="rounded-2xl bg-slate-50 p-5 text-center"><p className="text-sm text-slate-600">CVSS v3.1</p><p className="mt-2 text-5xl font-bold text-[#0B1F3A]">{result.score.toFixed(1)}</p><div className="mt-3"><SeverityBadge value={result.severity.toLowerCase()} /></div></div>
              <div className="mt-4 rounded-xl border border-slate-200 p-3 text-xs text-slate-700 break-all">{result.vector}</div>
              <Button className="mt-4 w-full" variant="outline" onClick={copyVector}><Copy className="h-4 w-4" /> Copy Vector</Button>
            </CardContent>
          </Card>
          <Card><CardHeader><h2 className="font-semibold">Scoring Notes</h2></CardHeader><CardContent className="space-y-2 text-sm text-slate-600"><p>This calculator produces the CVSS v3.1 base score only.</p><p>Temporal and environmental metrics are not included.</p><p>Use the result when manually validating or documenting findings.</p></CardContent></Card>
        </aside>
      </div>
    </>
  );
}

function calculateCvss(metrics: Metrics) {
  const av = value(metrics, 'AV');
  const ac = value(metrics, 'AC');
  const ui = value(metrics, 'UI');
  const c = value(metrics, 'C');
  const i = value(metrics, 'I');
  const a = value(metrics, 'A');
  const scopeChanged = metrics.S === 'C';
  const pr = privilegesRequired(metrics.PR, scopeChanged);
  const iscBase = 1 - ((1 - c) * (1 - i) * (1 - a));
  const impact = scopeChanged ? 7.52 * (iscBase - 0.029) - 3.25 * Math.pow(iscBase - 0.02, 15) : 6.42 * iscBase;
  const exploitability = 8.22 * av * ac * pr * ui;
  const score = impact <= 0 ? 0 : scopeChanged ? roundUp(Math.min(1.08 * (impact + exploitability), 10)) : roundUp(Math.min(impact + exploitability, 10));
  return { score, severity: severity(score), vector: `CVSS:3.1/AV:${metrics.AV}/AC:${metrics.AC}/PR:${metrics.PR}/UI:${metrics.UI}/S:${metrics.S}/C:${metrics.C}/I:${metrics.I}/A:${metrics.A}` };
}

function value(metrics: Metrics, key: string) {
  return metricValues[key]?.[metrics[key]] ?? 0;
}

function privilegesRequired(metric: string, scopeChanged: boolean) {
  if (metric === 'N') return 0.85;
  if (metric === 'L') return scopeChanged ? 0.68 : 0.62;
  return scopeChanged ? 0.5 : 0.27;
}

function roundUp(value: number) {
  return Math.ceil(value * 10) / 10;
}

function severity(score: number) {
  if (score === 0) return 'Informational';
  if (score < 4) return 'Low';
  if (score < 7) return 'Medium';
  if (score < 9) return 'High';
  return 'Critical';
}
