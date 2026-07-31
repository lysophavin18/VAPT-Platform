import { useQuery } from '@tanstack/react-query';
import { aiAgentsApi } from '@/api/ai-agents';

export function useAiAgents() {
  return useQuery({ queryKey: ['ai-agents'], queryFn: aiAgentsApi.getAgents });
}

export function useAiAgent(agentId: string) {
  return useQuery({ queryKey: ['ai-agent', agentId], queryFn: () => aiAgentsApi.getAgent(agentId), enabled: Boolean(agentId) });
}

export function useAgentSafetyStatus() {
  return useQuery({ queryKey: ['ai-agent-safety'], queryFn: aiAgentsApi.getAgentSafetyStatus });
}
