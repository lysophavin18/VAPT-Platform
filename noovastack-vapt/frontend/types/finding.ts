export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational' | 'info';

export interface FindingComment {
  id: string;
  finding_id: string;
  author_id?: string | null;
  author_name?: string | null;
  body: string;
  comment_type: 'comment' | 'remediation' | 'question';
  created_at?: string | null;
  updated_at?: string | null;
}

export interface Evidence {
  id: string;
  evidence_type: string;
  storage_path?: string | null;
  hash_value?: string | null;
  metadata_json?: Record<string, unknown> | null;
}

export interface Finding {
  id: string;
  scan_id: string;
  asset_id?: string | null;
  title: string;
  description: string;
  severity: Severity | string;
  status: string;
  integrity_status: string;
  owasp_category?: string | null;
  cwe_id?: string | null;
  cvss_score?: number | null;
  business_impact?: string | null;
  technical_impact?: string | null;
  remediation?: string | null;
  ai_explanation?: string | null;
  ai_remediation?: string | null;
  found_by_tool?: string | null;
  created_at?: string | null;
  first_seen?: string | null;
  last_seen?: string | null;
  evidence_items?: Evidence[];
}
