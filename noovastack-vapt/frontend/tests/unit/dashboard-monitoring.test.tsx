import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DashboardPanel, DashboardToolbar, StatPanel, TimeSeriesPanel, type DashboardFilters } from '@/components/dashboard/grafana-style-dashboard';
import type { DashboardMetric, TimeSeries } from '@/types';

const filters: DashboardFilters = { project_id: 'all', environment: 'all', asset_id: 'all', scan_type: 'all', severity: 'all', status: 'all', range: '30d', refresh: '30s' };

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverMock, configurable: true });
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:dashboard'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

afterEach(() => cleanup());

describe('Grafana-style dashboard components', () => {
  it('renders toolbar filters and updates time range', () => {
    const onChange = vi.fn();
    render(<DashboardToolbar filters={filters} onChange={onChange} onRefresh={vi.fn()} lastRefreshed="8 seconds ago" liveStatus="Connected" autoRefresh onAutoRefreshChange={vi.fn()} projects={[{ id: 'p1', name: 'Portal' }]} assets={[{ id: 'a1', value: 'https://app.local' }]} />);
    fireEvent.change(screen.getByLabelText('Time range'), { target: { value: '7d' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ range: '7d' }));
    expect(screen.queryByLabelText('Dashboard theme')).not.toBeInTheDocument();
    expect(screen.getByText(/Live updates:/)).toBeInTheDocument();
    expect(screen.getByText(/Connected/)).toBeInTheDocument();
  });

  it('renders stat panel with drill-down link and trend', () => {
    const metric: DashboardMetric = { key: 'open_findings', title: 'Open Findings', value: 38, previous: 30, change: 26.7, status: 'warning', href: '/findings?status=open' };
    render(<StatPanel metric={metric} />);
    expect(screen.getByText('Open Findings')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/findings?status=open');
  });

  it('renders panel empty and error states', () => {
    const { rerender } = render(<DashboardPanel title="Severity Distribution" empty><div>content</div></DashboardPanel>);
    expect(screen.getByText('No data for the selected filters and time range.')).toBeInTheDocument();
    rerender(<DashboardPanel title="Findings Trend" error={new Error('boom')}><div>content</div></DashboardPanel>);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('opens fullscreen mode and exports CSV', () => {
    const createObjectURL = vi.mocked(URL.createObjectURL);
    render(<DashboardPanel title="Active Scan Progress" data={[{ scan: 'Run 1', progress: 50 }]}><div>panel body</div></DashboardPanel>);
    fireEvent.click(screen.getAllByLabelText('Fullscreen')[0]);
    expect(screen.getAllByText('Active Scan Progress').length).toBeGreaterThan(1);
    fireEvent.click(screen.getAllByLabelText('Export CSV')[0]);
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('supports legend toggles for time-series panels', () => {
    const series: TimeSeries[] = [{ name: 'New Findings', points: [{ timestamp: '2026-07-01T00:00:00', value: 4 }] }];
    render(<TimeSeriesPanel series={series} />);
    const legend = screen.getByText('New Findings');
    fireEvent.click(legend);
    expect(legend.closest('button')).toHaveClass('opacity-40');
  });
});
