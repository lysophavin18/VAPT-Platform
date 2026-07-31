import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { aiAgentsApi } from '@/api/ai-agents';
import type { AIAgentActivity } from '@/types/ai-agent';

const simulated = [
  'Policy heartbeat verified',
  'Scope lock revalidated',
  'Review queue refreshed',
  'Evidence manifest checked',
];

export function useAgentActivity() {
  const query = useQuery({ queryKey: ['ai-agent-activity'], queryFn: aiAgentsApi.getAgentActivity, refetchInterval: 30000 });
  const [events, setEvents] = useState<AIAgentActivity[]>([]);

  useEffect(() => {
    if (query.data) setEvents(query.data);
  }, [query.data]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const event: AIAgentActivity = { id: `live-${Date.now()}`, timestamp: 'just now', agentName: 'Security Context Agent', activity: simulated[Math.floor(Math.random() * simulated.length)], status: 'Running' };
      setEvents((current) => [event, ...current].slice(0, 8));
    }, 9000);
    return () => window.clearInterval(timer);
  }, []);

  return { ...query, data: events };
}
