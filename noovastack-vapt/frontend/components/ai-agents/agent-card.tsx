import Link from 'next/link';
import { AgentRiskBadge, AgentStatusBadge, AgentTypeBadge } from '@/components/ai-agents/agent-badges';
import type { AIAgent } from '@/types/ai-agent';

export function AgentCard({ agent }: { agent: AIAgent }) {
  return <Link href={`/ai-agents/${agent.id}`} className="block rounded-2xl border border-[#223044] bg-[#0D1928] p-4 md:hidden"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{agent.name}</h3><p className="mt-1 text-xs text-[#94A3B8]">{agent.purpose}</p></div><AgentStatusBadge status={agent.status} /></div><div className="mt-4 flex flex-wrap gap-2"><AgentTypeBadge type={agent.type} /><AgentRiskBadge risk={agent.riskLevel} /></div><p className="mt-3 text-sm text-[#CBD5E1]">{agent.currentTask}</p></Link>;
}
