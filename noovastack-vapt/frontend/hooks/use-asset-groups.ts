'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function useAssetGroups(projectId?: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['asset-groups', projectId],
    queryFn: () => api.assetGroups(projectId!, token),
    enabled: Boolean(token && projectId),
  });
}

export function useAssetGroupActions(projectId?: string) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['asset-groups', projectId] });
  return {
    create: useMutation({
      mutationFn: (payload: Record<string, unknown>) => api.createAssetGroup(projectId!, payload, token),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.updateAssetGroup(id, payload, token),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.deleteAssetGroup(id, token),
      onSuccess: refresh,
    }),
    registerAssets: useMutation({
      mutationFn: (id: string) => api.registerAssetGroupAssets(id, token),
      onSuccess: () => {
        refresh();
        queryClient.invalidateQueries({ queryKey: ['assets'] });
      },
    }),
  };
}
