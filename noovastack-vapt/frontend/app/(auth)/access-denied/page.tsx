import { ShieldX } from 'lucide-react';
import { AuthInfoPage } from '@/components/auth/auth-info-page';

export default function AccessDeniedPage() {
  return <AuthInfoPage icon={ShieldX} title="Access Denied" description="Your role does not allow this action. Ask a project owner or platform administrator if you need access." action="Go to dashboard" href="/dashboard" />;
}
