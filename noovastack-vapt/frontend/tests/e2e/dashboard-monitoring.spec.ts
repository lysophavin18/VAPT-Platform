import { expect, test } from '@playwright/test';

async function authenticate(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('noovastack.token', 'test-token');
    sessionStorage.setItem('noovastack.user', JSON.stringify({ id: 'u1', email: 'admin@noovastack.local', username: 'admin', full_name: 'System Administrator', role: 'admin', is_active: true }));
  });
}

async function stubDashboardApis(page) {
  await page.route('**/api/projects', (route) => route.fulfill({ json: [{ id: 'p1', name: 'Portal', environment: 'production', status: 'active' }] }));
  await page.route('**/api/projects/p1/assets', (route) => route.fulfill({ json: [{ id: 'a1', project_id: 'p1', asset_type: 'website', value: 'https://app.local', name: 'App', scope_status: 'in_scope', approval_status: 'approved', environment: 'production' }] }));
  await page.route('**/api/dashboard/metrics**', (route) => route.fulfill({ json: { range: { from: '2026-07-01T00:00:00', to: '2026-07-30T00:00:00' }, security_score: 84, asset_coverage: 74, remediation_completion: 61, metrics: ['Security Score', 'Active Projects', 'Approved Assets', 'Running Scans', 'Failed Scans', 'Open Findings', 'Critical Findings', 'Pending Approvals', 'Retests Required', 'Reports Ready', 'Active Automations', 'Policy Violations'].map((title, index) => ({ key: title.toLowerCase().replaceAll(' ', '_'), title, value: index === 0 ? 84 : index + 1, previous: index, change: 10, status: index === 6 ? 'critical' : index === 5 ? 'warning' : 'ok', href: '/findings' })) } }));
  await page.route('**/api/dashboard/timeseries**', (route) => route.fulfill({ json: { interval: '1d', range: { from: '2026-07-01T00:00:00', to: '2026-07-30T00:00:00' }, posture: [{ timestamp: '2026-07-01T00:00:00', security_score: 80, asset_coverage: 70, remediation_completion: 55, verified_finding_rate: 60 }, { timestamp: '2026-07-02T00:00:00', security_score: 84, asset_coverage: 74, remediation_completion: 61, verified_finding_rate: 66 }], findings: [{ name: 'New Findings', points: [{ timestamp: '2026-07-01T00:00:00', value: 4 }] }, { name: 'Verified Findings', points: [{ timestamp: '2026-07-01T00:00:00', value: 3 }] }], scans: [{ name: 'Scans Started', points: [{ timestamp: '2026-07-01T00:00:00', value: 2 }] }, { name: 'Scans Completed', points: [{ timestamp: '2026-07-01T00:00:00', value: 1 }] }], severity_trend: [], annotations: [] } }));
  await page.route('**/api/dashboard/panels**', (route) => route.fulfill({ json: { severity_distribution: { counts: { critical: 1, high: 2, medium: 3, low: 4, informational: 5 }, total: 15, verified: 8, flagged: 1, fixed: 3 }, active_scans: { rows: [{ scan: 'Portal Scan', scan_id: 's1', project: 'Portal', target: 'https://app.local', current_stage: 'Security Checks', progress: 65, elapsed_minutes: 12, eta_minutes: 8, candidate_findings: 4, evidence_items: 9, status: 'running' }] }, scan_success_rate: { rate: 96, successful: 10, failed: 1, blocked: 0, cancelled: 0, thresholds: { green: 95, amber: 80 } }, scan_duration: { average: 10, p50: 8, p75: 12, p90: 15, p95: 18, maximum: 20 }, highest_risk_assets: { rows: [{ asset: 'App', asset_id: 'a1', project: 'Portal', type: 'website', environment: 'production', critical: 1, high: 2, medium: 3, risk_score: 145, coverage: '30d', status: 'approved' }] }, asset_coverage: { percentage: 74, rows: [{ label: 'Scanned in last 30 days', value: 7 }, { label: 'Never scanned', value: 2 }] }, owasp_heatmap: { rows: [{ row: 'Broken Access Control', cells: [{ column: 'Portal', value: 3, href: '/findings' }] }] }, top_vulnerability_categories: { rows: [{ category: 'Broken Access Control', count: 3, assets: 1, change: 0 }] }, remediation: { open: 5, in_progress: 2, ready_for_retest: 1, fixed: 3, risk_accepted: 0, overdue: 1 }, ai_agents: { registered: 9, running: 2, idle: 7, waiting_approval: 1, failed: 0, blocked: 0, offline: 0 }, agentic_safety: { rows: [{ control: 'ASI01 Goal Hijack', status: 'healthy' }, { control: 'ASI02 Tool Misuse', status: 'warning' }] }, evidence_pipeline: { rows: [{ stage: 'Raw Tool Output', value: 10 }, { stage: 'Report Included', value: 5 }] }, validation_funnel: { rows: [{ stage: 'Raw observations', value: 10, conversion: 100 }, { stage: 'Verified findings', value: 5, conversion: 50 }] }, system_health: { rows: [{ component: 'API', status: 'operational', latency_ms: 42 }] }, activity: { rows: [{ timestamp: '2026-07-01T00:00:00', source: 'Scan', project: 'Portal', event: 'Started', severity: 'info', result: 'recorded', related_object: 's1', href: '/scans/s1' }] }, recommended_actions: { rows: [{ priority: 'Critical', count: 1, action: 'Review critical findings', reason: 'Critical findings require triage.', due_date: 'Today', role: 'Reviewer', href: '/findings?severity=critical' }] } } }));
}

test('dashboard renders Grafana-inspired monitoring workspace and filters', async ({ page }) => {
  await authenticate(page);
  await stubDashboardApis(page);
  await page.goto('/dashboard?project_id=all&environment=production&range=30d&refresh=30s');
  await expect(page.getByRole('heading', { name: 'Security Dashboard' })).toBeVisible();
  await expect(page.getByLabel('Time range')).toHaveValue('30d');
  await expect(page.getByText('Security Posture Over Time')).toBeVisible();
  await expect(page.getByText('Findings Trend')).toBeVisible();
  await expect(page.getByText('Active Scan Progress')).toBeVisible();
  await expect(page.getByText('Automation Safety Top 10')).toBeVisible();
  await page.getByLabel('Time range').selectOption('7d');
  await expect(page).toHaveURL(/range=7d/);
  await expect(page.getByLabel('Dashboard theme')).toHaveCount(0);
});

test('dashboard works on mobile without horizontal overflow', async ({ page }) => {
  await authenticate(page);
  await stubDashboardApis(page);
  await page.goto('/dashboard');
  await expect(page.getByText('Security Posture Over Time')).toBeVisible();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasOverflow).toBeFalsy();
});
