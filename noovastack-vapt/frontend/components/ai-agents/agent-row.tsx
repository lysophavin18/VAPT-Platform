import Link from 'next/link';
import { Eye, MoreHorizontal, Pause, Play, RotateCcw, ShieldQuestion, Square } from 'lucide-react';
import { AgentRiskBadge, AgentStatusBadge, AgentTypeBadge } from '@/components/ai-agents/agent-badges';
import type { AIAgent } from '@/types/ai-agent';

export function AgentRow({ agent, onAction }: { agent: AIAgent; onAction: (action: string, agent: AIAgent) => void }) {
  return <tr className="border-b border-[#223044] hover:bg-[#111E2E]">
    <td className="px-4 py-3"><div><Link href={`/ai-agents/${agent.id}`} className="font-semibold text-[#F8FAFC] hover:text-[#E51C2A]">{agent.name}</Link><p className="mt-1 text-xs text-[#64748B]">{agent.purpose}</p></div></td>
    <td className="px-4 py-3"><AgentTypeBadge type={agent.type} /></td>
    <td className="px-4 py-3"><AgentStatusBadge status={agent.status} /></td>
    <td className="max-w-[240px] truncate px-4 py-3 text-sm text-[#CBD5E1]">{agent.currentTask}</td>
    <td className="px-4 py-3 text-sm text-[#94A3B8]">{agent.engagement ?? 'None'}</td>
    <td className="px-4 py-3"><AgentRiskBadge risk={agent.riskLevel} /></td>
    <td className="px-4 py-3 text-sm text-[#94A3B8]">{agent.lastActivity}</td>
    <td className="px-4 py-3"><div className="flex items-center gap-1">
      <Link title="View Details" href={`/ai-agents/${agent.id}`} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#0D1928] hover:text-white"><Eye className="h-4 w-4" /></Link>
      {agent.status === 'Running' ? <button title="Pause" onClick={() => onAction('pause', agent)} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#0D1928] hover:text-white"><Pause className="h-4 w-4" /></button> : null}
      {agent.status === 'Idle' || agent.status === 'Paused' ? <button title="Start" onClick={() => onAction('start', agent)} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#0D1928] hover:text-white"><Play className="h-4 w-4" /></button> : null}
      {agent.status === 'Failed' ? <button title="Retry" onClick={() => onAction('retry', agent)} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#0D1928] hover:text-white"><RotateCcw className="h-4 w-4" /></button> : null}
      {agent.status !== 'Idle' ? <button title="Stop" onClick={() => onAction('stop', agent)} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#0D1928] hover:text-white"><Square className="h-4 w-4" /></button> : null}
      <button title="Safety" onClick={() => onAction('safety', agent)} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#0D1928] hover:text-white"><ShieldQuestion className="h-4 w-4" /></button>
      <button title="More" onClick={() => onAction('more', agent)} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#0D1928] hover:text-white"><MoreHorizontal className="h-4 w-4" /></button>
    </div></td>
  </tr>;
}
