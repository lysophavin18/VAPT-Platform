import { Bot } from 'lucide-react';
import { AgentStatusBadge } from '@/components/ai-agents/agent-badges';
import type { AIAgentActivity } from '@/types/ai-agent';

export function AgentActivityItem({ item }: { item: AIAgentActivity }) {
  return <div className="flex gap-3 rounded-xl border border-[#223044] bg-[#111E2E] p-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#E51C2A]/10 text-[#E51C2A]"><Bot className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-white">{item.agentName}</p><span className="text-xs text-[#64748B]">{item.timestamp}</span></div><p className="mt-1 text-sm text-[#94A3B8]">{item.activity}</p><div className="mt-2"><AgentStatusBadge status={item.status} /></div></div></div>;
}

export function AgentActivityFeed({ activities }: { activities: AIAgentActivity[] }) {
  return <section className="rounded-2xl border border-[#223044] bg-[#0D1928] p-4"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-white">Automation Activity (Live)</h2><span className="h-2 w-2 rounded-full bg-green-400" aria-label="Live" /></div><div className="space-y-3">{activities.map((item) => <AgentActivityItem key={item.id} item={item} />)}</div><button className="mt-4 text-sm font-semibold text-[#E51C2A] hover:text-red-300">View Full Activity Log</button></section>;
}
