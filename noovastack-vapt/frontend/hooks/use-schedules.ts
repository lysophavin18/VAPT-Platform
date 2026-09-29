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

export function useScheduleActions() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['schedules'] });
  return {
    requestApproval: useMutation({ mutationFn: (id: string) => api.requestScheduleApproval(id, 'Schedule configuration is ready for controlled enable review.', token), onSuccess: refresh }),
    enable: useMutation({ mutationFn: (id: string) => api.enableSchedule(id, token), onSuccess: refresh }),
    pause: useMutation({ mutationFn: (id: string) => api.pauseSchedule(id, token), onSuccess: refresh }),
  };
}
