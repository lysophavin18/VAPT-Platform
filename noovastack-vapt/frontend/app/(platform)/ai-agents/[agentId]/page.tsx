'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import { AgentDetailHeader, AgentDetailTabs } from '@/components/ai-agents/agent-detail-tabs';
import { AgentToolRequestPanel } from '@/components/ai-agents/agent-tool-request-panel';
import { aiAgentsApi } from '@/api/ai-agents';
import { useAiAgent } from '@/hooks/use-ai-agents';
import { useAgentPermissions } from '@/hooks/use-agent-permissions';

export default function AgentDetailPage({ params }: { params: { agentId: string } }) {
  const [toolRequestOpen, setToolRequestOpen] = useState(false);
  const agent = useAiAgent(params.agentId);
  const permissions = useAgentPermissions();
  const tasks = useQuery({ queryKey: ['ai-agent-tasks'], queryFn: aiAgentsApi.getAgentTasks });
  const recs = useQuery({ queryKey: ['ai-agent-recommendations'], queryFn: aiAgentsApi.getAgentRecommendations });
  const evidence = useQuery({ queryKey: ['ai-agent-evidence'], queryFn: aiAgentsApi.getAgentEvidence });
  const messages = useQuery({ queryKey: ['ai-agent-messages'], queryFn: aiAgentsApi.getAgentMessages });
  const controls = useQuery({ queryKey: ['ai-agent-safety'], queryFn: aiAgentsApi.getAgentSafetyStatus });
  const audit = useQuery({ queryKey: ['ai-agent-audit'], queryFn: aiAgentsApi.getAgentAuditLogs });
  return (
    <main className="agent-theme min-h-screen rounded-3xl bg-[#07111F] p-4 text-white lg:p-6">
      <div className="mb-6 flex justify-end gap-3">
        <button
          onClick={() => setToolRequestOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-[#223044] bg-[#0D1928] px-4 py-2 text-sm font-semibold hover:border-[#E51C2A]"
        >
          <Wrench className="h-4 w-4" /> Request Tool
        </button>
        <Link href="/ai-agents" className="rounded-xl border border-[#223044] px-4 py-2 text-sm font-semibold hover:border-[#E51C2A]">Back to Generative AI</Link>
      </div>
      {agent.data ? (
        <div className="space-y-6">
          <AgentDetailHeader agent={agent.data} />
          <AgentDetailTabs
            agent={agent.data}
            tasks={tasks.data ?? []}
            recommendations={recs.data ?? []}
            evidence={evidence.data ?? []}
            messages={messages.data ?? []}
            controls={controls.data ?? []}
            auditEvents={audit.data ?? []}
            canConfigure={permissions.canConfigure}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-[#223044] bg-[#0D1928] p-6 text-[#94A3B8]">Loading automation profile...</div>
      )}
      <AgentToolRequestPanel
        agentId={params.agentId}
        open={toolRequestOpen}
        onClose={() => setToolRequestOpen(false)}
      />
    </main>
  );
}
