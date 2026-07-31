export interface Asset {
  id: string;
  project_id: string;
  parent_asset_id?: string | null;
  asset_type: string;
  value: string;
  name?: string | null;
  environment?: string;
  scope_status: 'in_scope' | 'out_of_scope' | 'pending' | string;
  approval_status: 'approved' | 'rejected' | 'pending' | string;
  discovery_method?: string | null;
  technology?: { server?: string | null; x_powered_by?: string | null; content_type?: string | null; [key: string]: unknown } | null;
  ports_services?: unknown[] | Record<string, unknown> | null;
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
