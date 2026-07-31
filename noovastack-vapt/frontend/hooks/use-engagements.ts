'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function useEngagements(projectId?: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['engagements', projectId], queryFn: () => api.engagements(projectId!, token), enabled: Boolean(token && projectId) });
}

export function useEngagementActions(projectId?: string) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, id, payload }: { action: 'create' | 'authorize' | 'close'; id?: string; payload?: Record<string, unknown> }) => {
      if (action === 'create') return api.createEngagement(projectId!, payload ?? {}, token);
      if (action === 'authorize') return api.authorizeEngagement(id!, token);
      return api.closeEngagement(id!, token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['engagements'] }),
  });
}
