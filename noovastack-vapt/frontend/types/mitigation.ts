export interface MitigationUser { id: string; name: string; email: string }
export interface MitigationTask { id: string; title: string; description?: string | null; assignee?: MitigationUser | null; due_at?: string | null; status: string; evidence: Record<string, unknown>[]; completed_at?: string | null }
export interface MitigationControl { id: string; control_type: string; description: string; implementation_requirements?: string | null; expected_effectiveness?: string | null; limitations?: string | null; verification_method?: string | null; status: string; expires_at?: string | null }
export interface MitigationApproval { id: string; stage: string; status: string; reviewer?: MitigationUser | null; comments?: string | null; decided_at?: string | null; created_at?: string | null }
export interface MitigationEvidence { id: string; evidence_type: string; title: string; reference: string; metadata: Record<string, unknown>; sha256?: string | null; created_at?: string | null }
export interface MitigationVerification { id: string; requested_by: string; verifier_id?: string | null; outcome?: string | null; comments?: string | null; residual_risk?: string | null; evidence: Record<string, unknown>[]; requested_at?: string | null; completed_at?: string | null }
export interface MitigationHistory { id: string; action: string; actor_id?: string | null; previous_status?: string | null; new_status?: string | null; details: Record<string, unknown>; created_at?: string | null }
export interface MitigationPlan {
  id: string; mitigation_id: string; project_id: string; project_name: string;
  finding_id?: string | null; finding_title?: string | null; finding_status?: string | null;
  cwe_id?: string | null; cvss_score?: number | null; title: string; description?: string | null;
  mitigation_type: string; strategy: string; custom_strategy?: string | null;
  proposed_mitigation: string; expected_outcome?: string | null; implementation_steps: string[];
  root_cause?: string | null; technical_impact?: string | null; business_criticality?: string | null;
  exposure_level?: string | null; limitations?: string | null; verification_criteria?: string | null;
  rollback_plan?: string | null; dependencies?: string | null; related_change_request?: string | null;
  potential_service_impact?: string | null; supporting_team?: string | null;
  severity: string; priority: string; status: string; blocked: boolean; blocked_reason?: string | null;
  owner?: MitigationUser | null; requester?: MitigationUser | null; verifier?: MitigationUser | null; owner_id?: string | null;
  start_date?: string | null; sla_deadline: string; temporary_expires_at?: string | null;
  permanent_remediation_required: boolean; permanent_remediation_due_at?: string | null;
  verification_outcome?: string | null; effectiveness?: string | null;
  implemented_at?: string | null; verified_at?: string | null; closed_at?: string | null;
  tasks: MitigationTask[]; controls: MitigationControl[]; approvals: MitigationApproval[];
  evidence: MitigationEvidence[]; verifications: MitigationVerification[]; risk: Record<string, string | null>;
  exceptions: Array<Record<string, unknown>>; history: MitigationHistory[];
  assets: Array<{ id: string; name: string }>; patches: Array<{ id: string; title: string; status?: string | null }>;
  overdue: boolean; sla_state: string; sla_seconds_remaining: number; temporary_expired: boolean;
  created_at?: string | null; updated_at?: string | null;
}
export interface MitigationList { items: MitigationPlan[]; total: number; page: number; page_size: number; total_pages: number }
export interface MitigationMetrics { open: number; awaiting_approval: number; in_implementation: number; awaiting_verification: number; overdue: number; completed: number; critical_without_mitigation: number; average_implementation_hours: number; effective_high_risk_percent: number; sla_compliance_percent: number; expiring_temporary: number; failed_verification: number; accepted_risks: number }
