import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiAgentsApi } from '@/api/ai-agents';
import { AgentMetricCard } from '@/components/ai-agents/agent-metric-card';
import { AgentTable } from '@/components/ai-agents/agent-table';
import { AgentStatusBadge, AgentTypeBadge } from '@/components/ai-agents/agent-badges';
import { mockAgents } from '@/mocks/ai-agents';
import { Bot } from 'lucide-react';

describe('Generative AI automation components', () => {
  it('renders metric cards', () => {
    render(<AgentMetricCard label="Automation Profiles" value="10" helper="2 this week" icon={Bot} />);
    expect(screen.getByText('Automation Profiles')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders status and type badges with text', () => {
    render(<><AgentStatusBadge status="Running" /><AgentTypeBadge type="Validator" /></>);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Generative AI for Pentest Automation')).toBeInTheDocument();
  });

  it('filters agents by search', () => {
    render(<AgentTable agents={mockAgents} onAction={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Search automation'), { target: { value: 'Finding Judge' } });
    expect(screen.getAllByText('Finding Judge').length).toBeGreaterThan(0);
    expect(screen.queryByText('Asset Discovery')).not.toBeInTheDocument();
  });

  it('filters agents by status', () => {
    render(<AgentTable agents={mockAgents} onAction={vi.fn()} />);
    fireEvent.change(screen.getAllByDisplayValue('All')[0], { target: { value: 'Reviewing' } });
    expect(screen.getAllByText('Reviewing').length).toBeGreaterThan(0);
  });

  it('invokes pause action for running agents', () => {
    const onAction = vi.fn();
    const { container } = render(<AgentTable agents={mockAgents} onAction={onAction} />);
    const pause = container.querySelector('button[title="Pause"]');
    expect(pause).toBeTruthy();
    fireEvent.click(pause as Element);
    expect(onAction).toHaveBeenCalledWith('pause', expect.objectContaining({ status: 'Running' }));
  });
});

describe('AI agents API', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('surfaces read failures instead of returning mock agents', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('backend unavailable')));

    await expect(aiAgentsApi.getAgents()).rejects.toThrow('backend unavailable');
  });

  it('surfaces kill switch failures and uses only the session token', async () => {
    sessionStorage.setItem('noovastack.token', 'session-token');
    localStorage.setItem('noovastack.token', 'persistent-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Kill switch denied' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(aiAgentsApi.activateKillSwitch('STOP ALL AGENTS')).rejects.toThrow('Kill switch denied');
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer session-token');
  });
});
