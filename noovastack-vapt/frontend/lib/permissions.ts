import type { UserRole } from '@/types';

const aliases: Record<string, UserRole> = {
  platform_administrator: 'admin',
  platform_admin: 'admin',
  project_owner: 'manager',
  lead_tester: 'analyst',
  tester: 'analyst',
  developer: 'analyst',
  qa_tester: 'analyst',
  reviewer: 'analyst',
  approver: 'manager',
  client_viewer: 'viewer',
};

export function normalizeRole(role?: string): UserRole {
  if (!role) return 'viewer';
  return aliases[role] ?? (role as UserRole);
}

export function canAccess(role: string | undefined, allowed: readonly string[]) {
  return allowed.includes(normalizeRole(role));
}

export function canApprove(role?: string) {
  return ['admin', 'manager'].includes(normalizeRole(role));
}
