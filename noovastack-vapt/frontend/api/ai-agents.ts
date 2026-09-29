import type { AIAgent, AIAgentActivity, AIAgentAuditEvent, AIAgentEvidence, AIAgentMessage, AIAgentRecommendation, AIAgentSafetyControl, AIAgentTask, AutonomousRun } from '@/types/ai-agent';
import type { AgentToolRequestPayload } from '@/lib/api-client';

const API_BASE = '/api/ai-agents';

function token() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('noovastack.token');
}

async function request<T>(path = '', options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const savedToken = token();
  if (savedToken) headers.set('Authorization', `Bearer ${savedToken}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, cache: 'no-store' });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? `HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function command<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : '{}' });
}

export const aiAgentsApi = {
  getAgents: () => request<AIAgent[]>(),
  getAgent: (id: string) => request<AIAgent>(`/${id}`),
  assignAgent: (payload: Record<string, unknown>) => command<{ id: string; status: string }>('/assign', payload),
  createAgent: (payload: Partial<AIAgent>) => command<AIAgent>('', payload),
  pauseAgent: (id: string) => command<{ id: string; status: string }>(`/${id}/pause`),
  resumeAgent: (id: string) => command<{ id: string; status: string }>(`/${id}/resume`),
  stopAgent: (id: string) => command<{ id: string; status: string }>(`/${id}/stop`),
  isolateAgent: (id: string) => command<{ id: string; status: string }>(`/${id}/isolate`),
  pauseAllAgents: () => command<{ status: string }>('/actions/pause-all'),
  stopAllTasks: () => command<{ status: string }>('/actions/stop-all'),
  activateKillSwitch: (confirmation: string) => command<{ status: string }>('/actions/kill-switch', { confirmation }),
  getAgentTasks: () => request<AIAgentTa-sk[]>('/tasks'),
  getAgentRecommendations: () => request<AIAgentRecommendation[]>('/recommendations'),
  acceptRecommendation: (id: string) => command<{ id: string; status: string }>(`/recommendations/${id}/accept`),
  rejectRecommendation: (id: string) => command<{ id: string; status: string }>(`/recommendations/${id}/reject`),
  requestMoreEvidence: (id: string) => command<{ id: string; status: string }>(`/recommendations/${id}/more-evidence`),
  getAgentActivity: () => request<AIAgentActivity[]>('/activity'),
  getAgentSafetyStatus: () => request<AIAgentSafetyControl[]>('/safety'),
  getAgentAuditLogs: () => request<AIAgentAuditEvent[]>('/audit-logs'),
  getAgentEvidence: () => request<AIAgentEvidence[]>('/evidence'),
  getAgentMessages: () => request<AIAgentMessage[]>('/messages'),
  requestTool: (payload: AgentToolRequestPayload) =>
    request<Record<string, unknown>>('/tool-request', { method: 'POST', body: JSON.stringify(payload) }),
  runAgent: (agentId: string, payload: { project_id: string; engagement_id?: string | null; objective: string; max_actions?: number }) =>
    request<AutonomousRun>(`/${agentId}/run`, { method: 'POST', body: JSON.stringify(payload) }),
  getRuns: () => request<AutonomousRun[]>('/runs'),
  getRun: (runId: string) => request<AutonomousRun>(`/runs/${runId}`),
  stopRun: (runId: string) => request<AutonomousRun>(`/runs/${runId}/stop`, { method: 'POST' }),
};
