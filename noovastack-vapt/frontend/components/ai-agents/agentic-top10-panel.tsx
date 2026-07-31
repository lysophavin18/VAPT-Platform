'use client';

import { useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import type { AIAgentSafetyControl } from '@/types/ai-agent';

export function AgenticControlItem({ control, onClick }: { control: AIAgentSafetyControl; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#223044] bg-[#111E2E] p-3 text-left hover:border-green-500/40"><div><p className="text-sm font-semibold text-white">{control.name}</p><p className="mt-1 text-xs text-[#64748B]">Last check {control.lastCheck}</p></div><span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs font-semibold text-green-300"><CheckCircle2 className="h-3.5 w-3.5" />{control.status}</span></button>;
}

export function AgenticTop10Panel({ controls }: { controls: AIAgentSafetyControl[] }) {
  const [selected, setSelected] = useState<AIAgentSafetyControl | null>(null);
  return <section className="rounded-2xl border border-[#223044] bg-[#0D1928] p-4"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-white">Automation Safety Top 10</h2><button className="text-sm font-semibold text-[#E51C2A]">View Details</button></div><div className="space-y-2">{controls.map((control) => <AgenticControlItem key={control.id} control={control} onClick={() => setSelected(control)} />)}</div>{selected ? <div className="fixed inset-0 z-50 flex justify-end bg-black/60"><aside className="h-full w-full max-w-xl overflow-y-auto border-l border-[#223044] bg-[#0D1928] p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-bold text-white">{selected.name}</h3><p className="mt-2 text-sm text-[#94A3B8]">{selected.description}</p></div><button onClick={() => setSelected(null)} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#111E2E]"><X className="h-5 w-5" /></button></div><dl className="mt-6 grid gap-4 text-sm"><Detail label="Current status" value={selected.status} /><Detail label="Last check" value={selected.lastCheck} /><Detail label="Related automation" value={selected.relatedAgents.join(', ')} /><Detail label="Detected events" value={String(selected.detectedEvents)} /><Detail label="Policy version" value={selected.policyVersion} /><Detail label="Recommended action" value={selected.recommendedAction} /></dl></aside></div> : null}</section>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[#223044] bg-[#111E2E] p-3"><dt className="text-xs uppercase tracking-wide text-[#64748B]">{label}</dt><dd className="mt-1 text-white">{value}</dd></div>;
}
