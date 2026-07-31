import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';

describe('badges', () => {
  it('renders plain severity text', () => {
    render(<SeverityBadge value="critical" />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('renders workflow status text', () => {
    render(<StatusBadge value="pending_approval" />);
    expect(screen.getByText('Pending Review')).toBeInTheDocument();
  });
});
