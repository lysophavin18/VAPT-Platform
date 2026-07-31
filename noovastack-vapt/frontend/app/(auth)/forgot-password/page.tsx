import { KeyRound } from 'lucide-react';
import { AuthInfoPage } from '@/components/auth/auth-info-page';

export default function ForgotPasswordPage() {
  return <AuthInfoPage icon={KeyRound} title="Forgot Password" description="Password reset is prepared in the frontend. Connect an email-backed reset endpoint before enabling this in production." action="Return to sign in" href="/login" />;
}
