'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import type { Project } from '@/types';

export function useProjects() {
  const { token } = useAuth();
  return useQuery({ queryKey: ['projects'], queryFn: () => api.projects(token), enabled: Boolean(token) });
}

export function useProject(id: string) {
  const { token } = useAuth();
  return useQuery({ queryKey: ['projects', id], queryFn: () => api.project(id, token), enabled: Boolean(token && id) });
}

export function useCreateProject() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (payload: Partial<Project>) => api.createProject(payload, token), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }) });
}

export function useUpdateProject(id: string) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Project>) => api.updateProject(id, payload, token),
    onSuccess: (project) => {
      queryClient.setQueryData(['projects', id], project);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteProject() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}
