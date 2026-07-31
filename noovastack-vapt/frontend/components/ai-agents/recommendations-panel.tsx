'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { AgentRiskBadge } from '@/components/ai-agents/agent-badges';
import type { AIAgentRecommendation } from '@/types/ai-agent';

export function RecommendationCard({ recommendation, onReview }: { recommendation: AIAgentRecommendation; onReview: () => void }) {
  return <div className="rounded-xl border border-[#223044] bg-[#111E2E] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">{recommendation.id}</p><p className="mt-1 text-sm text-[#CBD5E1]">{recommendation.title}</p></div><AgentRiskBadge risk={recommendation.severity} /></div><p className="mt-2 text-xs text-[#64748B]">Automation: {recommendation.agent} - {recommendation.age}</p><button onClick={onReview} className="mt-3 rounded-lg border border-[#223044] px-3 py-1.5 text-xs font-semibold text-white hover:border-[#E51C2A]">Review</button></div>;
}

export function RecommendationList({ recommendations }: { recommendations: AIAgentRecommendation[] }) {
  const [selected, setSelected] = useState<AIAgentRecommendation | null>(null);
  return <section className="rounded-2xl border border-[#223044] bg-[#0D1928] p-4"><h2 className="font-semibold text-white">Automation Recommendations</h2><div className="mt-4 space-y-3">{recommendations.map((item) => <RecommendationCard key={item.id} recommendation={item} onReview={() => setSelected(item)} />)}</div>{selected ? <div className="fixed inset-0 z-50 flex justify-end bg-black/60"><aside className="h-full w-full max-w-lg border-l border-[#223044] bg-[#0D1928] p-6"><div className="flex justify-between gap-4"><div><h3 className="text-xl font-bold text-white">{selected.id}</h3><p className="mt-2 text-[#CBD5E1]">{selected.title}</p></div><button onClick={() => setSelected(null)} className="text-[#94A3B8]"><X className="h-5 w-5" /></button></div><div className="mt-6 space-y-3 text-sm text-[#CBD5E1]"><p>Reason: {selected.reason}</p><p>Evidence used: {selected.evidenceUsed.join(', ')}</p><p>Confidence: {selected.confidence}%</p><p>Human review status: {selected.reviewStatus}</p></div></aside></div> : null}</section>;
}
