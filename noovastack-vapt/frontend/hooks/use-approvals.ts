'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function useApprovals(statusFilter?: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['approvals', statusFilter ?? 'all'],
    queryFn: () => api.approvals(statusFilter, token),
    enabled: Boolean(token),
    refetchInterval: 10000,
  });
}

export function useApprovalDecision() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: 'approved' | 'rejected' | 'more_information'; reason: string }) =>
      api.decideApproval(id, decision, reason, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approvals'] }),
  });
}
