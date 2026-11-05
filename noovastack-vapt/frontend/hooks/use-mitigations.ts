'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function useMitigations(query = '') {
  const { token } = useAuth();
  return useQuery({ queryKey: ['mitigations', query], queryFn: () => api.mitigations(query, token), enabled: Boolean(token), refetchInterval: 30_000 });
}
export function useMitigationMetrics() {
  const { token } = useAuth();
  return useQuery({ queryKey: ['mitigation-metrics'], queryFn: () => api.mitigationMetrics(token), enabled: Boolean(token), refetchInterval: 30_000 });
}
export function useMitigation(id: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['mitigation', id], queryFn: () => api.mitigation(id, token), enabled: Boolean(token && id) });
}
export function useMitigationActions(id?: string) {
  const { token } = useAuth(); const qc = useQueryClient();
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['mitigations'] }); await qc.invalidateQueries({ queryKey: ['mitigation-metrics'] }); if (id) await qc.invalidateQueries({ queryKey: ['mitigation', id] }); };
  return {
    create: useMutation({ mutationFn: (payload: Record<string, unknown>) => api.createMitigation(payload, token), onSuccess: refresh }),
    update: useMutation({ mutationFn: (payload: Record<string, unknown>) => api.updateMitigation(id!, payload, token), onSuccess: refresh }),
    transition: useMutation({ mutationFn: ({ status, reason = '' }: { status: string; reason?: string }) => api.transitionMitigation(id!, status, reason, token), onSuccess: refresh }),
    approval: useMutation({ mutationFn: ({ approvalId, decision, comments }: { approvalId: string; decision: string; comments: string }) => api.decideMitigationApproval(id!, approvalId, decision, comments, token), onSuccess: refresh }),
    task: useMutation({ mutationFn: ({ taskId, payload }: { taskId: string; payload: Record<string, unknown> }) => api.updateMitigationTask(id!, taskId, payload, token), onSuccess: refresh }),
    evidence: useMutation({ mutationFn: (payload: Record<string, unknown>) => api.addMitigationEvidence(id!, payload, token), onSuccess: refresh }),
    verification: useMutation({ mutationFn: (payload: Record<string, unknown>) => api.verifyMitigation(id!, payload, token), onSuccess: refresh }),
    riskAcceptance: useMutation({ mutationFn: (payload: Record<string, unknown>) => api.acceptMitigationRisk(id!, payload, token), onSuccess: refresh }),
  };
}
