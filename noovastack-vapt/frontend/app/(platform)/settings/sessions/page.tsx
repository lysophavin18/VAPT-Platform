'use client';

import { LogOut, Monitor, Shield, Clock } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { formatDate } from '@/lib/utils';

function parseJwt(token: string) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export default function SessionsPage() {
  const { user, token, logout } = useAuth();

  const jwtPayload = token ? parseJwt(token) : null;
  const issuedAt = jwtPayload?.iat ? new Date(jwtPayload.iat * 1000).toISOString() : null;
  const expiresAt = jwtPayload?.exp ? new Date(jwtPayload.exp * 1000).toISOString() : null;
  const isExpired = jwtPayload?.exp ? Date.now() > jwtPayload.exp * 1000 : false;

  return (
    <>
      <PageHeader
        title="Session Management"
        description="View your active sessions and sign out of the platform."
      />
      <div className="max-w-2xl space-y-6">

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#0B5E9E]" />
              <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Current Session</h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-[#155EEF]/30 bg-[#EAF2FF]/40 p-4 dark:border-[#49A6DF]/20 dark:bg-[#143A5A]/30">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#155EEF]/10 dark:bg-[#143A5A]">
                  <Monitor className="h-4 w-4 text-[#155EEF] dark:text-[#49A6DF]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#102033] dark:text-[#F1F5F9]">This Device</p>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700 dark:bg-green-950/50 dark:text-green-400">Active</span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-[#667085] dark:text-[#94A3B8]">Signed in as</dt>
                      <dd className="font-medium text-[#102033] dark:text-[#F1F5F9]">{user?.full_name || user?.username}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#667085] dark:text-[#94A3B8]">Email</dt>
                      <dd className="font-medium text-[#102033] dark:text-[#F1F5F9]">{user?.email}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#667085] dark:text-[#94A3B8]">Role</dt>
                      <dd className="font-medium text-[#102033] dark:text-[#F1F5F9]">{user?.role?.replace('_', ' ')}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#667085] dark:text-[#94A3B8]">Last login</dt>
                      <dd className="font-medium text-[#102033] dark:text-[#F1F5F9]">{formatDate(user?.last_login)}</dd>
                    </div>
                    {issuedAt && (
                      <div>
                        <dt className="text-xs text-[#667085] dark:text-[#94A3B8]">Token issued</dt>
                        <dd className="font-medium text-[#102033] dark:text-[#F1F5F9]">{formatDate(issuedAt)}</dd>
                      </div>
                    )}
                    {expiresAt && (
                      <div>
                        <dt className="text-xs text-[#667085] dark:text-[#94A3B8]">Token expires</dt>
                        <dd className={`font-medium ${isExpired ? 'text-red-600 dark:text-red-400' : 'text-[#102033] dark:text-[#F1F5F9]'}`}>
                          {formatDate(expiresAt)} {isExpired ? '(expired)' : ''}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#0B5E9E]" />
              <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Session Security</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[#667085] dark:text-[#94A3B8]">
              NoovaStack uses short-lived JWT tokens (1 hour) for session security. Each login creates a new session token. Signing out invalidates your current session on this device.
            </p>
            <div className="rounded-lg border border-[#DCE3EA] bg-[#F9FAFB] p-4 dark:border-[#2A394D] dark:bg-[#0D1624]">
              <p className="text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">Session token type: <span className="font-semibold text-[#102033] dark:text-[#F1F5F9]">JWT Bearer</span></p>
              <p className="mt-1 text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">Token expiry: <span className="font-semibold text-[#102033] dark:text-[#F1F5F9]">60 minutes</span></p>
            </div>
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30" onClick={() => logout()}>
              <LogOut className="h-4 w-4" />
              Sign Out of This Device
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
