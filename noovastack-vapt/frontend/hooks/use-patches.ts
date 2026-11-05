'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function usePatches() {
  const { token } = useAuth();
  return useQuery({ queryKey: ['patches'], queryFn: () => api.patches(token), enabled: Boolean(token), refetchInterval: 30_000 });
}

export function usePatchActions() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['patches'] });
  const create = useMutation({ mutationFn: (payload: Record<string, unknown>) => api.createPatch(payload, token), onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.updatePatch(id, payload, token), onSuccess: refresh });
  const transition = useMutation({ mutationFn: ({ id, status, payload = {} }: { id: string; status: string; payload?: Record<string, unknown> }) => api.transitionPatch(id, status, payload, token), onSuccess: refresh });
  const fromFinding = useMutation({ mutationFn: (findingId: string) => api.createPatchFromFinding(findingId, token), onSuccess: refresh });
  const syncFindings = useMutation({ mutationFn: () => api.syncPatchFindings(token), onSuccess: refresh });
  return { create, update, transition, fromFinding, syncFindings };
}
