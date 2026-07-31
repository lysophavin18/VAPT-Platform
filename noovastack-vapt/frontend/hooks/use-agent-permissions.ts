import { normalizeRole } from '@/lib/permissions';
import { useAuth } from '@/hooks/use-auth';

export function useAgentPermissions() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  return {
    role,
    canCreateCustomAgent: role === 'admin',
    canUseKillSwitch: role === 'admin',
    canAssignAgent: ['admin', 'manager', 'analyst'].includes(role),
    canApprove: ['admin', 'manager'].includes(role),
    canConfigure: role === 'admin',
  };
}
