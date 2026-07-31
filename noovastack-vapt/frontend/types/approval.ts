export interface Approval {
  id: string;
  scan_id?: string | null;
  schedule_id?: string | null;
  action: string;
  risk_level: string;
  status: string;
  requested_by: string;
  approved_by?: string | null;
  reason?: string | null;
  expires_at?: string | null;
  decided_at?: string | null;
  created_at?: string;
}
