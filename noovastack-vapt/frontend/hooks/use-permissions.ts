'use client';

import { useAuth } from '@/hooks/use-auth';
import { canAccess, canApprove } from '@/lib/permissions';

export function usePermissions() {
  const { user } = useAuth();
  return {
    canAccess: (roles: readonly string[]) => canAccess(user?.role, roles),
    canApprove: canApprove(user?.role),
    role: user?.role,
  };
}
