'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function useAssets(projectId?: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['assets', projectId], queryFn: () => api.assets(projectId!, token), enabled: Boolean(token && projectId) });
}

export function useAsset(assetId?: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['assets', 'detail', assetId], queryFn: () => api.asset(assetId!, token), enabled: Boolean(token && assetId) });
}

export function useAssetGraph(projectId?: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['asset-graph', projectId], queryFn: () => api.assetGraph(projectId!, token), enabled: Boolean(token && projectId) });
}

export function useAssetApproval(projectId?: string) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ assetId, action }: { assetId: string; action: 'approve' | 'reject' }) => action === 'approve' ? api.approveAsset(assetId, token) : api.rejectAsset(assetId, token), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets', projectId] }) });
}
