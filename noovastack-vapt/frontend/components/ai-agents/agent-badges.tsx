import { AlertCircle, CheckCircle2, Circle, Clock, PauseCircle, PlayCircle, ShieldAlert, WifiOff } from 'lucide-react';
import type { AIAgentRisk, AIAgentStatus, AIAgentType } from '@/types/ai-agent';

const statusStyles: Record<AIAgentStatus, string> = {
  Running: 'bg-green-500/10 text-green-300 border-green-500/30',
  Reviewing: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Completed: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  Idle: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  Paused: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  Failed: 'bg-red-500/10 text-red-300 border-red-500/30',
  Blocked: 'bg-red-500/10 text-red-300 border-red-500/30',
  Isolated: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  Offline: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
};

const typeStyles: Record<AIAgentType, string> = {
  Planner: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  Discovery: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  Scanner: 'bg-red-500/10 text-red-300 border-red-500/30',
  Validator: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  Advisor: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
  Writer: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  Context: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
};

const riskStyles: Record<AIAgentRisk, string> = {
  Low: 'bg-green-500/10 text-green-300 border-green-500/30',
  Medium: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  High: 'bg-red-500/10 text-red-300 border-red-500/30',
  Critical: 'bg-rose-900/60 text-rose-100 border-rose-700',
};

function StatusIcon({ status }: { status: AIAgentStatus }) {
  if (status === 'Running') return <PlayCircle className="h-3.5 w-3.5" />;
  if (status === 'Reviewing') return <Clock className="h-3.5 w-3.5" />;
  if (status === 'Completed') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === 'Paused') return <PauseCircle className="h-3.5 w-3.5" />;
  if (status === 'Offline') return <WifiOff className="h-3.5 w-3.5" />;
  if (['Failed', 'Blocked', 'Isolated'].includes(status)) return <ShieldAlert className="h-3.5 w-3.5" />;
  return <Circle className="h-3.5 w-3.5" />;
}

export function AgentStatusBadge({ status }: { status: AIAgentStatus }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}><StatusIcon status={status} />{status}</span>;
}

export function AgentTypeBadge({ type }: { type: AIAgentType }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${typeStyles[type]}`}>Generative AI for Pentest Automation</span>;
}

export function AgentRiskBadge({ risk }: { risk: AIAgentRisk }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${riskStyles[risk]}`}><AlertCircle className="h-3.5 w-3.5" />{risk}</span>;
}
