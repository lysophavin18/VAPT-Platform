export type DashboardMetric = {
  key: string;
  title: string;
  value: number;
  unit?: string;
  previous: number;
  change: number;
  status: 'ok' | 'warning' | 'critical';
  href: string;
};

export type TimePoint = { timestamp: string; value: number };
export type TimeSeries = { name: string; points: TimePoint[] };

export type DashboardMetricsResponse = {
  range: { from: string; to: string };
  metrics: DashboardMetric[];
  security_score: number;
  asset_coverage: number;
  remediation_completion: number;
};

export type DashboardTimeseriesResponse = {
  interval: string;
  range: { from: string; to: string };
  posture: Array<{ timestamp: string; security_score: number; asset_coverage: number; remediation_completion: number; verified_finding_rate: number }>;
  findings: TimeSeries[];
  scans: TimeSeries[];
  severity_trend: TimeSeries[];
  annotations: Array<{ timestamp: string; label: string; href: string }>;
};

export type DashboardPanelsResponse = Record<string, any>;
