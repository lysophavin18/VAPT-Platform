export interface AssetTechnology {
  server?: string | null;
  title?: string | null;
  status_code?: number | null;
  content_type?: string | null;
  tech_stack?: string | null;
  cdn?: string | null;
  waf?: string | null;
  cms?: string | null;
  frameworks?: string[];
  language?: string | null;
  x_powered_by?: string | null;
  /** DNS records: { a: string[], aaaa: string[], cname: string[], mx: string[], txt: string[], ns: string[] } */
  dns_records?: {
    a?: string[];
    aaaa?: string[];
    cname?: string[];
    mx?: string[];
    txt?: string[];
    ns?: string[];
  } | null;
  resolved_from?: string | null;
  [key: string]: unknown;
}

export interface AssetPortService {
  url?: string;
  scheme?: string;
  status_code?: number;
  service?: string;
  port?: number;
}

export interface Asset {
  id: string;
  project_id: string;
  parent_asset_id?: string | null;
  asset_type: string;
  value: string;
  name?: string | null;
  source?: string | null;
  environment?: string;
  scope_status: 'in_scope' | 'out_of_scope' | 'pending_review' | string;
  approval_status: 'approved' | 'rejected' | 'pending' | string;
  discovery_method?: string | null;
  technology?: AssetTechnology | null;
  ports_services?: Record<string, AssetPortService> | null;
  tags?: string[] | null;
  last_observed?: string | null;
  last_observed_at?: string | null;
  first_discovered_at?: string | null;
  created_at?: string;
}

export interface AssetGraphNode {
  id: string;
  label: string;
  type: string;
  scope_status?: string;
}

export interface AssetGraphEdge {
  source: string;
  target: string;
  relationship?: string;
}

export interface AssetGraph {
  nodes: AssetGraphNode[];
  edges: AssetGraphEdge[];
}

// ── Discovery job status ──

export interface DiscoveryAssetResult {
  type: string;
  value: string;
  discovery_method: string;
  technology?: AssetTechnology | null;
  ports_services?: Record<string, AssetPortService> | null;
  dns_records?: AssetTechnology['dns_records'];
}

export interface DiscoveryJobStatus {
  job_id: string;
  /** Celery state: PENDING | STARTED | SUCCESS | FAILURE | RETRY */
  state: string;
  /** Friendly status: started | running | completed | failed */
  status: string;
  assets_found: number;
  assets: DiscoveryAssetResult[];
  error?: string | null;
}

// ── Domain Monitoring ──

export interface DomainMonitorEvent {
  id: string;
  monitor_id: string;
  event_type: string;    // new_subdomain | removed_subdomain | ip_changed | port_added | port_removed | tech_changed | status_code_changed | new_asset
  severity: 'info' | 'warning' | 'critical' | string;
  asset_value?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  detected_at?: string | null;
  acknowledged_at?: string | null;
}

export interface DomainMonitor {
  id: string;
  project_id: string;
  domain: string;
  label?: string | null;
  status: 'active' | 'paused' | 'stopped' | string;
  check_interval_hours: number;
  discovery_types: string[];
  last_checked_at?: string | null;
  next_check_at?: string | null;
  created_at?: string;
  events: DomainMonitorEvent[];
}
