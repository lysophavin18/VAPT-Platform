import { mockActivities, mockAgents, mockAuditEvents, mockEvidence, mockMessages, mockRecommendations, mockSafetyControls, mockTasks } from '@/mocks/ai-agents';
import type { AIAgent, AIAgentActivity, AIAgentAuditEvent, AIAgentEvidence, AIAgentMessage, AIAgentRecommendation, AIAgentSafetyControl, AIAgentTask } from '@/types/ai-agent';
import type { AgentToolRequestPayload } from '@/lib/api-client';

const API_BASE = '/api/ai-agents';

function token() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('noovastack.token') || localStorage.getItem('noovastack.token');
}

async function request<T>(path = '', options: RequestInit = {}, fallback: T): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const savedToken = token();
  if (savedToken) headers.set('Authorization', `Bearer ${savedToken}`);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers, cache: 'no-store' });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? `HTTP ${response.status}`);
    return response.json() as Promise<T>;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.warn('AI Agents API fallback:', error);
    return fallback;
  }
}

async function command<T>(path: string, fallback: T, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : '{}' }, fallback);
}

export const aiAgentsApi = {
  getAgents: () => request<AIAgent[]>('', {}, mockAgents),
  getAgent: async (id: string) => request<AIAgent>(`/${id}`, {}, mockAgents.find((item) => item.id === id) ?? mockAgents[0]),
  assignAgent: (payload: Record<string, unknown>) => command('/assign', { id: 'TASK-NEW', status: 'Assigned' }, payload),
  createAgent: (payload: Partial<AIAgent>) => command('', { ...mockAgents[0], ...payload, id: String(payload.name ?? 'custom-agent').toLowerCase().replaceAll(' ', '-') } as AIAgent, payload),
  pauseAgent: (id: string) => command(`/${id}/pause`, { id, status: 'Paused' }),
  resumeAgent: (id: string) => command(`/${id}/resume`, { id, status: 'Running' }),
  stopAgent: (id: string) => command(`/${id}/stop`, { id, status: 'Idle' }),
  isolateAgent: (id: string) => command(`/${id}/isolate`, { id, status: 'Isolated' }),
  pauseAllAgents: () => command('/actions/pause-all', { status: 'Paused' }),
  stopAllTasks: () => command('/actions/stop-all', { status: 'Stopped' }),
  activateKillSwitch: (confirmation: string) => command('/actions/kill-switch', { status: ['STOP ALL AGENTS', 'STOP ALL AUTOMATION'].includes(confirmation) ? 'Kill switch activated' : 'Rejected' }, { confirmation }),
  getAgentTasks: () => request<AIAgentTask[]>('/tasks', {}, mockTasks),
  getAgentRecommendations: () => request<AIAgentRecommendation[]>('/recommendations', {}, mockRecommendations),
  acceptRecommendation: (id: string) => command(`/recommendations/${id}/accept`, { id, status: 'Accepted' }),
  rejectRecommendation: (id: string) => command(`/recommendations/${id}/reject`, { id, status: 'Rejected' }),
  requestMoreEvidence: (id: string) => command(`/recommendations/${id}/more-evidence`, { id, status: 'Needs Evidence' }),
  getAgentActivity: () => request<AIAgentActivity[]>('/activity', {}, mockActivities),
  getAgentSafetyStatus: () => request<AIAgentSafetyControl[]>('/safety', {}, mockSafetyControls),
  getAgentAuditLogs: () => request<AIAgentAuditEvent[]>('/audit-logs', {}, mockAuditEvents),
  getAgentEvidence: () => request<AIAgentEvidence[]>('/evidence', {}, mockEvidence),
  getAgentMessages: () => request<AIAgentMessage[]>('/messages', {}, mockMessages),
  requestTool: (payload: AgentToolRequestPayload) =>
    request<Record<string, unknown>>('/tool-request', { method: 'POST', body: JSON.stringify(payload) }, {}),
};
