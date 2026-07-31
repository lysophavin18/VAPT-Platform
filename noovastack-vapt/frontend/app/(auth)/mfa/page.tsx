import { ShieldCheck } from 'lucide-react';
import { AuthInfoPage } from '@/components/auth/auth-info-page';

export default function MfaPage() {
  return <AuthInfoPage icon={ShieldCheck} title="MFA Verification" description="Enter the verification code from your authenticator app. Backend MFA support is not enabled yet, so this screen is ready for the OIDC/MFA integration." action="Return to sign in" href="/login" />;
}
