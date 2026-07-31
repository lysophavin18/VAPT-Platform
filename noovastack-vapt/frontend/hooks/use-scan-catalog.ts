'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function useScanCatalog() {
  const { token } = useAuth();
  return useQuery({ queryKey: ['scan-catalog'], queryFn: () => api.scanCatalog(token), enabled: Boolean(token) });
}
