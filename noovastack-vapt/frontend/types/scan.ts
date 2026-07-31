export type ScanStatus = 'draft' | 'queued' | 'preparing' | 'pending' | 'pending_review' | 'running' | 'paused' | 'completed' | 'failed' | 'blocked' | 'cancelled' | 'killed' | 'stopped_by_safety_control';

export interface Scan {
  id: string;
  project_id: string;
  engagement_id?: string | null;
  scan_profile_id?: string;
  name: string;
  assessment_mode: string;
  scan_category: string;
  scan_depth: string;
  status: ScanStatus | string;
  progress: number;
  requested_by?: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  results_summary?: Record<string, unknown> | null;
}

export interface ScanModule {
  id?: string;
  number?: number;
  module_key?: string;
  name?: string;
  module_name: string;
  description?: string;
  status: string;
  progress?: number;
  progress_percent?: number;
  tool?: string;
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
  output_count?: number;
  warning_count?: number;
  error_message?: string | null;
  short_description?: string;
}

export interface ScanProgressPayload {
  scan_id: string;
  status: string;
  progress: number;
  modules: ScanModule[];
  events?: string[];
}

export interface ScanProfile {
  id: string;
  name: string;
  category: string;
  depth: string;
  description?: string;
  risk_level?: string;
  approval_required?: boolean;
  senior_approval_required?: boolean;
  assessment_modes?: string[];
  enabled_modules?: string[];
}

export interface ScanValidationResult {
  valid: boolean;
  blocking_reasons: string[];
  warnings: string[];
  approval_required: boolean;
  safety_controls_active: boolean;
  estimated_duration: string;
}

export interface ScanEvent {
  id: string;
  scan_id: string;
  module_run_id?: string | null;
  agent_id?: string | null;
  worker_id?: string | null;
  event_type: string;
  severity: string;
  summary: string;
  details: Record<string, unknown>;
  asset_id?: string | null;
  finding_id?: string | null;
  evidence_id?: string | null;
  created_at?: string | null;
}

export interface ScanSafetyState {
  dos_protection: string;
  rate_limiting: string;
  scope_enforcement: string;
  kill_switch_ready: string;
  out_of_scope_block: string;
  testing_window_valid: string;
  approval_gate_active: string;
  last_checked_at?: string | null;
}

export interface ScanEvidencePayload {
  counts: Record<string, number>;
  items: Array<{ id: string; finding_id: string; type: string; hash?: string | null; created_at?: string | null; summary: string }>;
}

export interface ScanProcessPayload {
  scan_id: string;
  stages: Array<{ name: string; description: string; status: string; duration_seconds?: number | null; output_count: number; warning_count: number; started_at?: string | null; completed_at?: string | null; related_tasks: string[] }>;
  snapshot: Record<string, number>;
  evidence_pipeline: Array<{ stage: string; item_count: number; status: string; errors: number; rejected_count: number; processing_time: string; agent?: string }>;
  next_actions: string[];
  approvals: Array<{ id: string; action: string; risk_level: string; status: string; requested_by?: string | null; reason?: string | null; created_at?: string | null }>;
}

export interface ScanResultsPayload {
  scan_id: string;
  status: string;
  severity_counts: Record<string, number>;
  findings: Array<{ id: string; title: string; severity: string; asset_id?: string | null; status: string; integrity_status: string; evidence_count: number; cvss_score?: number | null; created_at?: string | null }>;
  evidence: ScanEvidencePayload;
  modules: ScanModule[];
  report_url?: string | null;
}

export interface ScannerTool {
  id: string;
  name: string;
  module: string;
  category: string;
  purpose: string;
  safe_default: boolean;
}
