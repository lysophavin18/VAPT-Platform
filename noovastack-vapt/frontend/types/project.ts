export type Environment = 'development' | 'testing' | 'staging' | 'production';

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  owner_id?: string;
  owner?: string;
  environment: Environment | string;
  status: string;
  asset_count?: number;
  open_findings?: number;
  last_scan?: string | null;
  next_scheduled_scan?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Engagement {
  id: string;
  project_id: string;
  name: string;
  assessment_mode: 'black_box' | 'gray_box' | 'white_box' | string;
  authorization_status: string;
  start_date?: string | null;
  end_date?: string | null;
  testing_window_start?: string | null;
  testing_window_end?: string | null;
  status: string;
  created_at?: string | null;
}
