'use client';

import { useState } from 'react';
import { Shield, Smartphone, Lock, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Step = 'overview' | 'setup' | 'verify' | 'done';

export default function MFAPage() {
  const [step, setStep] = useState<Step>('overview');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6 || !/^\d+$/.test(code)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setError('');
    setStep('done');
  }

  if (step === 'done') {
    return (
      <>
        <PageHeader title="Multi-Factor Authentication" description="Secure your account with a second factor." />
        <Card className="max-w-lg">
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-green-500" />
            <h2 className="text-lg font-semibold text-[#102033] dark:text-[#F1F5F9]">MFA Enabled</h2>
            <p className="mt-2 text-sm text-[#667085] dark:text-[#94A3B8]">Your account is now protected with two-factor authentication.</p>
            <Button variant="outline" className="mt-6" onClick={() => setStep('overview')}>Back to Overview</Button>
          </CardContent>
        </Card>
      </>
    );
  }

  if (step === 'setup' || step === 'verify') {
    return (
      <>
        <PageHeader title="Set Up MFA" description="Follow the steps below to link your authenticator app." />
        <div className="max-w-md space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#155EEF] text-xs font-bold text-white">1</span>
                <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Install an Authenticator App</h2>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[#667085] dark:text-[#94A3B8]">
                Download any TOTP-compatible authenticator app on your phone. Recommended options:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-[#667085] dark:text-[#94A3B8]">
                <li>• Google Authenticator</li>
                <li>• Microsoft Authenticator</li>
                <li>• Authy</li>
                <li>• 1Password</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#155EEF] text-xs font-bold text-white">2</span>
                <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Scan QR Code</h2>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-xl border-2 border-dashed border-[#DCE3EA] bg-[#F9FAFB] p-8 dark:border-[#2A394D] dark:bg-[#0D1624]">
                  <div className="grid h-32 w-32 place-items-center rounded-lg bg-white dark:bg-[#1A293C]">
                    <Lock className="h-12 w-12 text-[#DCE3EA] dark:text-[#2A394D]" />
                  </div>
                </div>
                <p className="text-center text-xs text-[#667085] dark:text-[#94A3B8]">
                  TOTP QR code will appear here once MFA backend is configured.<br />
                  Contact your administrator to enable TOTP support.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#155EEF] text-xs font-bold text-white">3</span>
                <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Enter Verification Code</h2>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerify} className="space-y-3">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="text-center font-mono text-lg tracking-widest"
                  maxLength={6}
                  inputMode="numeric"
                />
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep('overview')}>Cancel</Button>
                  <Button type="submit">Verify and Enable</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Multi-Factor Authentication" description="Add a second layer of security to your account." />
      <div className="max-w-lg space-y-6">

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#0B5E9E]" />
              <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Two-Factor Authentication (2FA)</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">MFA is not yet enabled</p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Your account is secured by password only. Enable MFA to protect against unauthorized access.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg p-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EAF4FB] dark:bg-[#143A5A]">
                  <Smartphone className="h-4 w-4 text-[#0B5E9E] dark:text-[#49A6DF]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#102033] dark:text-[#F1F5F9]">Authenticator App (TOTP)</p>
                  <p className="text-xs text-[#667085] dark:text-[#94A3B8]">Use Google Authenticator, Authy, or any TOTP-compatible app</p>
                </div>
              </div>
            </div>

            <Button onClick={() => setStep('setup')}>
              <Shield className="h-4 w-4" />
              Set Up Two-Factor Authentication
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Why enable MFA?</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-[#667085] dark:text-[#94A3B8]">
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" /> Prevents unauthorized access even if your password is compromised</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" /> Required for high-privilege actions on some platforms</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" /> Recommended for all security team accounts</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
