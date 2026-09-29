export interface AssetGroupTarget {
  value: string;
  type: string;
}

export interface AssetGroup {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  targets: AssetGroupTarget[];
  created_at?: string;
  updated_at?: string;
}
