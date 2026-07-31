'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function useSchedules() {
  const { token } = useAuth();
  return useQuery({ queryKey: ['schedules'], queryFn: () => api.schedules(token), enabled: Boolean(token) });
}

export function useCreateSchedule() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (payload: Record<string, unknown>) => api.createSchedule(payload, token), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }) });
}
