import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssessmentModeSelector, CandidateFindingsSummary, ScanDepthSelector, ScanTypeSelector, TargetSelection } from '@/components/scans/scan-management';
import type { Asset } from '@/types';

const assets: Asset[] = [
  { id: 'a1', project_id: 'p1', asset_type: 'website', value: 'https://app.ecommerce.com', name: 'app.ecommerce.com', scope_status: 'in_scope', approval_status: 'approved', environment: 'active' },
  { id: 'a2', project_id: 'p1', asset_type: 'api', value: 'https://api.ecommerce.com', name: 'api.ecommerce.com', scope_status: 'out_of_scope', approval_status: 'approved', environment: 'active' },
  { id: 'a3', project_id: 'p1', asset_type: 'website', value: 'https://auth.ecommerce.com', name: 'auth.ecommerce.com', scope_status: 'in_scope', approval_status: 'pending', environment: 'active' },
];

describe('Scan management workflow components', () => {
  it('renders scan type cards and selects API', () => {
    const onChange = vi.fn();
    render(<ScanTypeSelector value="vulnerability_scan" onChange={onChange} />);
    expect(screen.getByText('Vulnerability Scan')).toBeInTheDocument();
    fireEvent.click(screen.getByText('API'));
    expect(onChange).toHaveBeenCalledWith('api_security');
  });

  it('renders assessment modes and supports white box selection', () => {
    const onChange = vi.fn();
    render(<AssessmentModeSelector value="black_box" onChange={onChange} />);
    fireEvent.click(screen.getByText('White Box'));
    expect(onChange).toHaveBeenCalledWith('white_box');
  });

  it('renders scan depth cards and supports deep selection', () => {
    const onChange = vi.fn();
    render(<ScanDepthSelector value="standard" onChange={onChange} />);
    fireEvent.click(screen.getByText('Deep'));
    expect(onChange).toHaveBeenCalledWith('deep');
  });

  it('disables out-of-scope and unapproved assets', () => {
    const onChange = vi.fn();
    render(<TargetSelection assets={assets} selectedIds={[]} onChange={onChange} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).not.toBeDisabled();
    expect(checkboxes[1]).toBeDisabled();
    expect(checkboxes[2]).toBeDisabled();
    expect(screen.getByText('Asset is outside authorized scope.')).toBeInTheDocument();
    expect(screen.getByText('Asset is not approved.')).toBeInTheDocument();
  });

  it('shows candidate finding counts by severity', () => {
    render(<CandidateFindingsSummary counts={{ critical: 1, high: 2, medium: 3, low: 4, informational: 5 }} />);
    expect(screen.getByText('Candidate Findings Detected')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
