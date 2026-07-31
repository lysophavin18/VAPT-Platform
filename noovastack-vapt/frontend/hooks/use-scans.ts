'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function useScans(query = '') {
  const { token } = useAuth();
  return useQuery({ queryKey: ['scans', query], queryFn: () => api.scans(token, query), enabled: Boolean(token), refetchInterval: 10_000 });
}

export function useScan(id: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['scans', id], queryFn: () => api.scan(id, token), enabled: Boolean(token && id), refetchInterval: 5_000 });
}

export function useScanActions() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'launch' | 'pause' | 'resume' | 'cancel' | 'kill' }) => {
      if (action === 'start') return api.startScan(id, token);
      if (action === 'launch') return api.launchScan(id, token);
      if (action === 'pause') return api.pauseScan(id, token);
      if (action === 'resume') return api.resumeScan(id, token);
      if (action === 'kill') return api.killScan(id, token);
      return api.cancelScan(id, token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scans'] }),
  });
}

export function useScanValidation(id?: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['scan-validation', id], queryFn: () => api.validateScan(id!, token), enabled: Boolean(token && id) });
}

export function useScanModules(id?: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['scan-modules', id], queryFn: () => api.scanModules(id!, token), enabled: Boolean(token && id), refetchInterval: 5000 });
}

export function useScanEvents(id?: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['scan-events', id], queryFn: () => api.scanEvents(id!, token), enabled: Boolean(token && id), refetchInterval: 5000 });
}

export function useScanSafety(id?: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['scan-safety', id], queryFn: () => api.scanSafety(id!, token), enabled: Boolean(token && id), refetchInterval: 5000 });
}

export function useScanEvidence(id?: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['scan-evidence', id], queryFn: () => api.scanEvidence(id!, token), enabled: Boolean(token && id), refetchInterval: 5000 });
}

export function useScanProcess(id?: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['scan-process', id], queryFn: () => api.scanProcess(id!, token), enabled: Boolean(token && id), refetchInterval: 10000 });
}

export function useScanResults(id?: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['scan-results', id], queryFn: () => api.scanResults(id!, token), enabled: Boolean(token && id), refetchInterval: 10000 });
}

export function useCreateScan() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (payload: Record<string, unknown>) => api.createScan(payload, token), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scans'] }) });
}
