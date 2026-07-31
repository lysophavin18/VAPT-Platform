import { LockKeyhole } from 'lucide-react';
import { AuthInfoPage } from '@/components/auth/auth-info-page';

export default function ResetPasswordPage() {
  return <AuthInfoPage icon={LockKeyhole} title="Reset Password" description="Use this screen after backend reset-token verification is added. Do not reuse old passwords or share reset links." action="Return to sign in" href="/login" />;
}
