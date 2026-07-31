'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function useFindings(query = '') {
  const { token } = useAuth();
  return useQuery({ queryKey: ['findings', query], queryFn: () => api.findings(token, query), enabled: Boolean(token) });
}

export function useFinding(id: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['findings', id], queryFn: () => api.finding(id, token), enabled: Boolean(token && id) });
}

export function useFindingActions() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ id, action, status }: { id: string; action: 'verify' | 'false-positive' | 'status'; status?: string }) => action === 'verify' ? api.verifyFinding(id, token) : action === 'false-positive' ? api.falsePositiveFinding(id, token) : api.updateFindingStatus(id, status!, token), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['findings'] }) });
}
