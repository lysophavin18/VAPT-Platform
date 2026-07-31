'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function useScanProgress(scanId: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['scan-progress', scanId], queryFn: () => api.scanProgress(scanId, token), enabled: Boolean(token && scanId), refetchInterval: 2_500 });
}
