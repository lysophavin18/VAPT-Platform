export interface ScanSchedule {
  id: string;
  project_id: string;
  engagement_id?: string | null;
  name: string;
  assessment_mode: string;
  scan_category: string;
  scan_depth: string;
  recurrence_rule: string;
  timezone: string;
  next_run_at?: string | null;
  status: string;
  created_at?: string;
}
