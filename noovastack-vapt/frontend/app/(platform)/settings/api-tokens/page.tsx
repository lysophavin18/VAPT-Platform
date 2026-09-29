'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Key, Plus, Trash2, AlertTriangle, Check } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { api, type APITokenResponse } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

const SCOPES = ['read', 'scan:read', 'scan:write', 'finding:read', 'report:read', 'asset:read'];

export default function APITokensPage() {
  const { token } = useAuth();
  const qc = useQueryClient();

  const tokens = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => api.listTokens(token!),
    enabled: Boolean(token),
  });

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read']);
  const [expiry, setExpiry] = useState<string>('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () => api.createToken({ name, scopes, expires_days: expiry ? parseInt(expiry) : undefined }, token!),
    onSuccess: (data) => {
      setNewToken(data.token);
      setName('');
      setScopes(['read']);
      setExpiry('');
      qc.invalidateQueries({ queryKey: ['api-tokens'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeToken(id, token!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-tokens'] }),
  });

  function toggleScope(s: string) {
    setScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  async function copy() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Token name is required.'); return; }
    if (!scopes.length) { setError('Select at least one scope.'); return; }
    create.mutate();
  }

  return (
    <>
      <PageHeader title="API Tokens" description="Generate personal tokens for programmatic access to the NoovaStack API." />

      <div className="max-w-2xl space-y-6">

        {newToken && (
          <div className="rounded-xl border border-green-300 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#102033] dark:text-[#F1F5F9]">Copy your token now — it won't be shown again.</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs text-[#102033] shadow-inner dark:bg-[#0D1624] dark:text-[#F1F5F9]">
                    {newToken}
                  </code>
                  <button type="button" onClick={copy} className="flex shrink-0 items-center gap-1 rounded-lg border border-[#DCE3EA] bg-white px-3 py-2 text-xs font-semibold text-[#344054] hover:bg-[#F2F6FA] dark:border-[#2A394D] dark:bg-[#1A293C] dark:text-[#B3C0D1]">
                    {copied ? <><Check className="h-3 w-3 text-green-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                  </button>
                </div>
              </div>
            </div>
            <button type="button" onClick={() => setNewToken(null)} className="mt-3 text-xs text-[#667085] underline dark:text-[#94A3B8]">Dismiss</button>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-[#0B5E9E]" />
              <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Generate New Token</h2>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">Token Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CI Pipeline, Local Dev" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">Scopes</label>
                <div className="flex flex-wrap gap-2">
                  {SCOPES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleScope(s)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${scopes.includes(s) ? 'bg-[#155EEF] text-white dark:bg-[#49A6DF]' : 'border border-[#DCE3EA] text-[#475467] hover:border-[#aac1e4] dark:border-[#2A394D] dark:text-[#94A3B8]'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">Expiry (days, blank = no expiry)</label>
                <Input type="number" value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="30" min="1" max="365" className="w-32" />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <Button type="submit" disabled={create.isPending}>
                <Key className="h-4 w-4" />
                {create.isPending ? 'Generating...' : 'Generate Token'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-[#0B5E9E]" />
              <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Active Tokens</h2>
            </div>
          </CardHeader>
          <CardContent>
            {tokens.isLoading && <p className="text-sm text-[#667085] dark:text-[#94A3B8]">Loading tokens...</p>}
            {!tokens.isLoading && !(tokens.data?.length) && (
              <p className="rounded-lg bg-[#F9FAFB] p-4 text-sm text-[#667085] dark:bg-[#0D1624] dark:text-[#94A3B8]">
                No active tokens. Generate one above to get started.
              </p>
            )}
            <div className="space-y-3">
              {tokens.data?.map((t: APITokenResponse) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-[#DCE3EA] p-4 dark:border-[#2A394D]">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EAF4FB] dark:bg-[#143A5A]">
                    <Key className="h-4 w-4 text-[#0B5E9E] dark:text-[#49A6DF]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#102033] dark:text-[#F1F5F9]">{t.name}</p>
                    <p className="font-mono text-xs text-[#667085] dark:text-[#94A3B8]">{t.token_prefix}••••••••</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.scopes.map((s) => (
                        <span key={s} className="rounded-full bg-[#F2F4F7] px-2 py-0.5 text-[10px] font-medium text-[#475467] dark:bg-[#1E2D3D] dark:text-[#94A3B8]">{s}</span>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-[#667085] dark:text-[#94A3B8]">
                      Created {formatDate(t.created_at)}
                      {t.expires_at ? ` · Expires ${formatDate(t.expires_at)}` : ' · No expiry'}
                      {t.last_used_at ? ` · Last used ${formatDate(t.last_used_at)}` : ' · Never used'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => revoke.mutate(t.id)}
                    disabled={revoke.isPending}
                    className="ml-2 rounded-lg p-2 text-[#667085] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    title="Revoke token"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
