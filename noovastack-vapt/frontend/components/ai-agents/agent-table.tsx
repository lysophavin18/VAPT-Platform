'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { AgentCard } from '@/components/ai-agents/agent-card';
import { AgentRow } from '@/components/ai-agents/agent-row';
import type { AIAgent } from '@/types/ai-agent';

const statuses = ['Running', 'Reviewing', 'Completed', 'Idle', 'Paused', 'Failed', 'Blocked', 'Isolated', 'Offline'];
const types = ['Planner', 'Discovery', 'Scanner', 'Validator', 'Advisor', 'Writer', 'Context'];
const risks = ['Low', 'Medium', 'High', 'Critical'];

export function AgentTable({ agents, onAction }: { agents: AIAgent[]; onAction: (action: string, agent: AIAgent) => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [type, setType] = useState('All');
  const [risk, setRisk] = useState('All');
  const filtered = useMemo(() => agents.filter((agent) => {
    const text = `${agent.name} ${agent.currentTask} ${agent.engagement ?? ''}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (status === 'All' || agent.status === status) && (type === 'All' || agent.type === type) && (risk === 'All' || agent.riskLevel === risk);
  }), [agents, query, risk, status, type]);

  return <section className="rounded-2xl border border-[#223044] bg-[#0D1928] shadow-[0_18px_44px_rgba(0,0,0,0.25)]">
    <div className="flex flex-col gap-4 border-b border-[#223044] p-4 lg:flex-row lg:items-center lg:justify-between">
      <div><h2 className="text-lg font-semibold text-white">Pentest Automation Profiles</h2><p className="text-sm text-[#94A3B8]">{filtered.length} of {agents.length} automation profiles shown</p></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:flex">
        <label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search automation" className="w-full rounded-xl border border-[#223044] bg-[#091522] py-2 pl-9 pr-3 text-sm text-white placeholder:text-[#64748B]" /></label>
        <Filter value={status} onChange={setStatus} options={statuses} />
        <Filter value={type} onChange={setType} options={types} />
        <Filter value={risk} onChange={setRisk} options={risks} />
      </div>
    </div>
    <div className="space-y-3 p-4 md:hidden">{filtered.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[1100px] text-left">
        <thead className="bg-[#111E2E] text-xs uppercase tracking-wide text-[#64748B]"><tr>{['Automation', 'Type', 'Status', 'Task', 'Engagement', 'Risk', 'Last Activity', 'Actions'].map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead>
        <tbody>{filtered.map((agent) => <AgentRow key={agent.id} agent={agent} onAction={onAction} />)}</tbody>
      </table>
    </div>
  </section>;
}

function Filter({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-[#223044] bg-[#091522] px-3 py-2 text-sm text-white"><option>All</option>{options.map((item) => <option key={item}>{item}</option>)}</select>;
}
