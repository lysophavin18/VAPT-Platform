export interface Report {
  id: string;
  name: string;
  project?: string;
  type: string;
  status: string;
  generated_date?: string;
  generated_by?: string;
  reviewed_by?: string;
  finding_count?: number;
  export_formats?: string[];
}

export interface VulnerabilityAssessmentReport {
  report_name: string;
  report_type: string;
  classification: string;
  generated_at?: string | null;
  generated_by?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  viewed_by?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  scan: {
    id: string;
    name: string;
    status: string;
    assessment_mode: string;
    scan_category: string;
    scan_depth: string;
    started_at?: string | null;
    completed_at?: string | null;
  };
  project: {
    id?: string | null;
    name?: string | null;
    environment?: string | null;
  };
  assets: Array<{
    id: string;
    type: string;
    value: string;
    scope_status: string;
    approval_status: string;
  }>;
  summary: {
    total_findings: number;
    severity_counts: Record<string, number>;
    verified_findings: number;
    highest_severity: string;
    risk_rating: string;
    report_note: string;
  };
  findings: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    integrity_status: string;
    description?: string;
    owasp_category?: string;
    cwe_id?: string;
    cvss_score?: number;
    remediation?: string;
    found_by_tool?: string;
    affected_asset?: string | null;
    evidence?: Array<{
      id: string;
      evidence_type: string;
      summary?: string | null;
      details?: string | null;
      hash_value?: string | null;
      created_at?: string | null;
    }>;
  }>;
  sections: {
    executive_summary: {
      title: string;
      overview: string;
      risk_rating: string;
      key_observations: string[];
    };
    assessment_scope: {
      title: string;
      assessment_type: string;
      environment?: string | null;
      assets_in_scope: VulnerabilityAssessmentReport['assets'];
      authorization_note: string;
    };
    methodology: {
      title: string;
      steps: string[];
      standards: string[];
      limitations: string[];
    };
    scan_sessions: {
      title: string;
      modules: Array<{
        name: string;
        status: string;
        tool: string;
        started_at?: string | null;
        completed_at?: string | null;
        issues_found?: number;
        checks_performed?: number;
        message?: string | null;
      }>;
    };
    service_discovery: {
      title: string;
      services: Array<{
        host?: string;
        port?: number;
        service?: string;
        url?: string;
        status_code?: number;
        server?: string;
        product?: string;
        version?: string;
        detected_by?: string;
      }>;
    };
    findings_overview: {
      title: string;
      severity_counts: Record<string, number>;
    };
    evidence_gallery?: {
      title: string;
      description: string;
      items: Array<{
        id: string;
        finding_id: string;
        finding_title: string;
        severity: string;
        affected_asset?: string | null;
        evidence_type: string;
        summary?: string | null;
        details?: string | null;
        hash_value?: string | null;
        created_at?: string | null;
      }>;
    };
    remediation_plan: {
      title: string;
      priorities: Array<{ priority: string; actions: string[] }>;
    };
    conclusion: {
      title: string;
      statement: string;
    };
  };
}

export interface ReportAIImprovements {
  agent: {
    id: string;
    name: string;
    role: string;
    status: string;
    model: string;
  };
  scan_id: string;
  score: number;
  summary: string;
  checks: Array<{
    id: string;
    title: string;
    status: 'pass' | 'warning' | 'fail' | string;
    detail: string;
    recommendation: string;
  }>;
  suggested_sections: string[];
  export_ready: boolean;
}
