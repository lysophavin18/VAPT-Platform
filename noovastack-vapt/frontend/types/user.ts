export type UserRole = 'admin' | 'manager' | 'analyst' | 'viewer' | 'platform_admin' | 'project_owner' | 'tester' | 'developer' | 'qa_tester' | 'reviewer' | 'approver' | 'client_viewer';

export interface User {
  id: string;
  email: string;
  username: string;
  full_name?: string | null;
  role: UserRole;
  is_active?: boolean;
  last_login?: string | null;
}
