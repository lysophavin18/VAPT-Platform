'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { canAccess } from '@/lib/permissions';

export function PermissionGuard({ roles, children, fallback = null }: { roles: readonly string[]; children: ReactNode; fallback?: ReactNode }) {
  const { user } = useAuth();
  if (!canAccess(user?.role, roles)) return <>{fallback}</>;
  return <>{children}</>;
}
