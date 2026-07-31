'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function useGenerateReport() {
  const { token } = useAuth();
  return useMutation({ mutationFn: (payload: Record<string, unknown>) => api.generateReport(payload, token) });
}

export function useScanReportData(scanId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['scan-report-data', scanId],
    queryFn: () => api.scanReportData(scanId, token),
    enabled: Boolean(scanId),
  });
}

export function useReportAIImprovements(scanId: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['report-ai-improvements', scanId],
    queryFn: () => api.reportAIImprovements(scanId, token),
    enabled: Boolean(scanId),
  });
}
