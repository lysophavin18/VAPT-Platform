import type { Asset, AssetGraph, DashboardMetricsResponse, DashboardPanelsResponse, DashboardTimeseriesResponse, Engagement, Finding, Project, ReportAIImprovements, Scan, ScanEvent, ScanEvidencePayload, ScanModule, ScanProcessPayload, ScanProgressPayload, ScanProfile, ScanResultsPayload, ScanSafetyState, ScanSchedule, ScanValidationResult, User, VulnerabilityAssessmentReport } from '@/types';

export type AdminSettings = {
  tool_policies: {
    safe_active_checks: boolean;
    allow_deep_scans: boolean;
    max_parallel_scans: number;
    request_timeout_seconds: number;
  };
  safety_policies: {
    allowed_testing_window_start: string;
    allowed_testing_window_end: string;
    rate_limit_per_minute: number;
    destructive_tests_enabled: boolean;
  };
  report_templates: {
    default_template: string;
    include_evidence_gallery: boolean;
    include_cvss_vectors: boolean;
    show_scanner_names: boolean;
  };
  platform_settings: {
    organization_name: string;
    default_environment: string;
    notification_retention_days: number;
    session_timeout_minutes: number;
  };
};

export type ScannerTool = {
  id: string;
  name: string;
  module: string;
  category: string;
  purpose: string;
  safe_default: boolean;
};

export type CVESyncStatus = {
  source: string;
  status: string;
  last_sync_at?: string | null;
  last_success_at?: string | null;
  records_synced: number;
  total_records: number;
  error?: string | null;
  metadata?: Record<string, unknown>;
};

export type LocalAIChatResponse = {
  conversation_id: string;
  message_id: string;
  role: 'assistant';
  mode: string;
  content: unknown;
  model: { provider: string; name: string };
  created_at: string;
  raw?: unknown;
};

export type AgentToolRequestPayload = {
  project_id: string;
  engagement_id?: string | null;
  asset_ids: string[];
  target: string;
  task_type?: string;
  assessment_mode?: string;
  scan_category?: string;
  scan_depth?: string;
  risk_level?: 'low' | 'medium' | 'high' | 'prohibited';
  modules: string[];
  config?: Record<string, unknown>;
  auto_launch?: boolean;
  rationale?: string | null;
};

const API_BASE = '/api';

function apiUrl(path: string) {
  if (typeof window !== 'undefined' && window.location.port === '3000' && path.startsWith('/ai-agents/local')) {
    return `http://${window.location.hostname}:8002${API_BASE}${path}`;
  }
  return `${API_BASE}${path}`;
}

function storedAuthToken() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('noovastack.token') || localStorage.getItem('noovastack.token');
}

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

type RequestOptions = RequestInit & { token?: string | null };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const authToken = options.token ?? storedAuthToken();
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  const res = await fetch(apiUrl(path), { ...options, headers, cache: 'no-store' });
  if (!res.ok) {
    const copy = res.clone();
    const body = await res.json().catch(() => null) as { detail?: string } | null;
    const fallback = body ? null : await copy.text().catch(() => null);
    throw new ApiError(res.status, body?.detail ?? fallback ?? `Request failed with HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: async (email: string, password: string) => {
    const body = new URLSearchParams({ username: email, password });
    return request<{ access_token: string; refresh_token: string; token_type: string; expires_in: number }>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  },
  logout: (token?: string | null) => request<{ message: string }>('/auth/logout', { method: 'POST', token }),
  me: (token: string) => request<User>('/auth/me', { token }),
  dashboardStats: (token?: string | null) => request<Record<string, unknown>>('/dashboard/stats', { token }),
  dashboardActivity: (token?: string | null) => request<unknown[]>('/dashboard/activity', { token }),
  dashboardMetrics: (query = '', token?: string | null) => request<DashboardMetricsResponse>(`/dashboard/metrics${query}`, { token }),
  dashboardTimeseries: (query = '', token?: string | null) => request<DashboardTimeseriesResponse>(`/dashboard/timeseries${query}`, { token }),
  dashboardPanels: (query = '', token?: string | null) => request<DashboardPanelsResponse>(`/dashboard/panels${query}`, { token }),
  dashboardPanel: (panelKey: string, query = '', token?: string | null) => request<Record<string, unknown>>(`/dashboard/panels/${panelKey}${query}`, { token }),
  projects: (token?: string | null) => request<Project[]>('/projects', { token }),
  project: (id: string, token?: string | null) => request<Project>(`/projects/${id}`, { token }),
  createProject: (payload: Partial<Project>, token?: string | null) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(payload), token }),
  engagements: (projectId: string, token?: string | null) => request<Engagement[]>(`/projects/${projectId}/engagements`, { token }),
  createEngagement: (projectId: string, payload: Record<string, unknown>, token?: string | null) => request<Engagement>(`/projects/${projectId}/engagements`, { method: 'POST', body: JSON.stringify(payload), token }),
  authorizeEngagement: (id: string, token?: string | null) => request<Engagement>(`/engagements/${id}/authorize`, { method: 'POST', token }),
  closeEngagement: (id: string, token?: string | null) => request<Engagement>(`/engagements/${id}/close`, { method: 'POST', token }),
  assets: (projectId: string, token?: string | null) => request<Asset[]>(`/projects/${projectId}/assets`, { token }),
  asset: (assetId: string, token?: string | null) => request<Asset>(`/assets/${assetId}`, { token }),
  createAsset: (projectId: string, payload: Record<string, unknown>, token?: string | null) => request<Asset>(`/projects/${projectId}/assets`, { method: 'POST', body: JSON.stringify(payload), token }),
  approveAsset: (assetId: string, token?: string | null) => request<Asset>(`/assets/${assetId}/approve`, { method: 'POST', token }),
  rejectAsset: (assetId: string, token?: string | null) => request<Asset>(`/assets/${assetId}/reject`, { method: 'POST', token }),
  discoverAssets: (projectId: string, payload: Record<string, unknown>, token?: string | null) => request<{ job_id: string; status: string; message: string }>(`/projects/${projectId}/asset-discovery`, { method: 'POST', body: JSON.stringify(payload), token }),
  assetGraph: (projectId: string, token?: string | null) => request<AssetGraph>(`/projects/${projectId}/asset-graph`, { token }),
  scans: (token?: string | null, query = '') => request<Scan[]>(`/scans${query}`, { token }),
  scan: (id: string, token?: string | null) => request<Scan>(`/scans/${id}`, { token }),
  createScan: (payload: Record<string, unknown>, token?: string | null) => request<Scan>('/scans', { method: 'POST', body: JSON.stringify(payload), token }),
  startScan: (id: string, token?: string | null) => request<Scan>(`/scans/${id}/start`, { method: 'POST', token }),
  launchScan: (id: string, token?: string | null) => request<Scan>(`/scans/${id}/launch`, { method: 'POST', token }),
  validateScan: (id: string, token?: string | null) => request<ScanValidationResult>(`/scans/${id}/validate`, { method: 'POST', token }),
  requestScanApproval: (id: string, token?: string | null) => request<{ status: string; approval_id: string }>(`/scans/${id}/request-approval`, { method: 'POST', token }),
  pauseScan: (id: string, token?: string | null) => request<Scan>(`/scans/${id}/pause`, { method: 'POST', token }),
  resumeScan: (id: string, token?: string | null) => request<Scan>(`/scans/${id}/resume`, { method: 'POST', token }),
  cancelScan: (id: string, token?: string | null) => request<Scan>(`/scans/${id}/cancel`, { method: 'POST', token }),
  killScan: (id: string, token?: string | null) => request<Scan>(`/scans/${id}/kill`, { method: 'POST', token }),
  emergencyStopScan: (id: string, confirmation: string, token?: string | null) => request<Scan>(`/scans/${id}/emergency-stop`, { method: 'POST', body: JSON.stringify({ confirmation }), token }),
  scanProgress: (id: string, token?: string | null) => request<ScanProgressPayload>(`/scans/${id}/progress`, { token }),
  scanModules: (id: string, token?: string | null) => request<ScanModule[]>(`/scans/${id}/modules`, { token }),
  scanEvents: (id: string, token?: string | null) => request<ScanEvent[]>(`/scans/${id}/events`, { token }),
  scanSafety: (id: string, token?: string | null) => request<ScanSafetyState>(`/scans/${id}/safety`, { token }),
  scanEvidence: (id: string, token?: string | null) => request<ScanEvidencePayload>(`/scans/${id}/evidence`, { token }),
  scanProcess: (id: string, token?: string | null) => request<ScanProcessPayload>(`/scans/${id}/process`, { token }),
  scanResults: (id: string, token?: string | null) => request<ScanResultsPayload>(`/scans/${id}/results`, { token }),
  generateScanReport: (id: string, token?: string | null) => request<{ status: string; report_url: string }>(`/scans/${id}/generate-report`, { method: 'POST', token }),
  createScanRetest: (id: string, findingIds: string[], token?: string | null) => request<{ status: string; retest_url: string; finding_ids: string[] }>(`/scans/${id}/create-retest`, { method: 'POST', body: JSON.stringify({ finding_ids: findingIds }), token }),
  decideApproval: (id: string, decision: 'approved' | 'rejected' | 'more_information', reason: string, token?: string | null) => request<Record<string, unknown>>(`/approvals/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, reason }), token }),
  findings: (token?: string | null, query = '') => request<Finding[]>(`/findings${query}`, { token }),
  finding: (id: string, token?: string | null) => request<Finding>(`/findings/${id}`, { token }),
  verifyFinding: (id: string, token?: string | null) => request<Finding>(`/findings/${id}/verify`, { method: 'POST', token }),
  falsePositiveFinding: (id: string, token?: string | null) => request<Finding>(`/findings/${id}/mark-false-positive`, { method: 'POST', token }),
  updateFindingStatus: (id: string, status: string, token?: string | null) => request<Finding>(`/findings/${id}/status`, { method: 'POST', body: JSON.stringify({ status }), token }),
  schedules: (token?: string | null) => request<ScanSchedule[]>('/scan-schedules', { token }),
  createSchedule: (payload: Record<string, unknown>, token?: string | null) => request<ScanSchedule>('/scan-schedules', { method: 'POST', body: JSON.stringify(payload), token }),
  scanProfiles: (token?: string | null) => request<ScanProfile[]>('/admin/scan-profiles', { token }),
  scanCatalog: (token?: string | null) => request<ScanProfile[]>('/scans/catalog', { token }),
  users: (token?: string | null) => request<User[]>('/admin/users', { token }),
  updateUserRole: (userId: string, role: string, token?: string | null) => request<{ message: string }>(`/admin/users/${userId}/role?role=${encodeURIComponent(role)}`, { method: 'PATCH', token }),
  updateUserProfile: (userId: string, payload: Pick<User, 'email' | 'username' | 'full_name' | 'role'> & { is_active: boolean }, token?: string | null) => request<User>(`/admin/users/${userId}/profile`, { method: 'PATCH', body: JSON.stringify(payload), token }),
  adminSettings: (token?: string | null) => request<AdminSettings>('/admin/settings', { token }),
  updateAdminSettings: (settings: AdminSettings, token?: string | null) => request<AdminSettings>('/admin/settings', { method: 'PATCH', body: JSON.stringify({ settings }), token }),
  scannerTools: (token?: string | null) => request<ScannerTool[]>('/admin/scanner-tools', { token }),
  localAiHealth: (token?: string | null) => request<{ provider: string; model: string; context_window: string; deployment: string; available: boolean; status: string }>('/ai-agents/local-model/health', { token }),
  localAiChat: (payload: { prompt: string; mode: string; model?: string; conversation_id?: string }, token?: string | null, signal?: AbortSignal) => request<LocalAIChatResponse>('/ai-agents/local-chat', { method: 'POST', body: JSON.stringify(payload), token, signal }),
  localAiChatStream: async (
    payload: { prompt: string; mode: string; model?: string; conversation_id?: string },
    token: string | null | undefined,
    signal: AbortSignal | undefined,
    onChunk: (chunk: { type: string; token?: string; error?: string; conversation_id?: string; message_id?: string; mode?: string; model?: { provider: string; name: string }; created_at?: string }) => void,
  ) => {
    const authToken = token ?? storedAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(apiUrl('/ai-agents/local-chat'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => null);
      throw new ApiError(res.status, text ?? `Request failed with HTTP ${res.status}`);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body available');
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      buffer += decoder.decode(value, { stream: !done });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          onChunk(parsed);
        } catch {}
      }
    }
  },
  requestAgentTool: (payload: AgentToolRequestPayload, token?: string | null) => request<Record<string, unknown>>('/ai-agents/tool-request', { method: 'POST', body: JSON.stringify(payload), token }),
  cveSyncStatus: (token?: string | null) => request<CVESyncStatus>('/cve/status', { token }),
  syncCveDatabase: (token?: string | null) => request<{ status: string; records_synced: number; source: string }>('/cve/sync?days=30&max_results=500', { method: 'POST', token }),
  auditLogs: (token?: string | null) => request<unknown[]>('/admin/audit-logs', { token }),
  generateReport: (payload: Record<string, unknown>, token?: string | null) => request<Record<string, unknown>>('/reports/generate', { method: 'POST', body: JSON.stringify(payload), token }),
  scanReportData: (scanId: string, token?: string | null) => request<VulnerabilityAssessmentReport>(`/reports/scan/${scanId}/data`, { token }),
  reportAIImprovements: (scanId: string, token?: string | null) => request<ReportAIImprovements>(`/reports/scan/${scanId}/ai-improvements`, { token }),
  scanReportExportUrl: (scanId: string, format: 'pdf' | 'html' | 'json') => `${API_BASE}/reports/scan/${scanId}/export?format=${format}`,
};
