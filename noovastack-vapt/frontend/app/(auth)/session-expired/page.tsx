import { Clock } from 'lucide-react';
import { AuthInfoPage } from '@/components/auth/auth-info-page';

export default function SessionExpiredPage() {
  return <AuthInfoPage icon={Clock} title="Session Expired" description="Your session ended to protect platform access. Sign in again to continue working." action="Sign in again" href="/login" />;
}
