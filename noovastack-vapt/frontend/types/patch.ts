export type PatchStatus = 'draft' | 'review' | 'approved' | 'scheduled' | 'deploying' | 'verification' | 'completed' | 'blocked' | 'failed' | 'rollback_required' | 'rolled_back' | 'rejected';

export interface PatchRecord {
  id: string;
  project_id: string;
  project_name: string;
  asset_id?: string | null;
  asset_value?: string | null;
  finding_id?: string | null;
  finding_title?: string | null;
  finding_status?: string | null;
  cve_id?: string | null;
  title: string;
  package_name?: string | null;
  installed_version?: string | null;
  fixed_version?: string | null;
  priority: string;
  status: PatchStatus | string;
  owner_id?: string | null;
  owner_name?: string | null;
  due_at?: string | null;
  maintenance_start?: string | null;
  maintenance_end?: string | null;
  remediation?: string | null;
  rollback_plan?: string | null;
  deployment_evidence?: Record<string, unknown>;
  verification_notes?: string | null;
  deployed_at?: string | null;
  verified_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}
