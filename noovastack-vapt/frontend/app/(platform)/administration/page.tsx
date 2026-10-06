'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Database, FileText, Lock, Settings, ShieldCheck, SlidersHorizontal, Users, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DataTable } from '@/components/tables/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { api, type AdminSettings } from '@/lib/api-client';
import type { Approval, Asset, ScanProfile, User } from '@/types';

const roles = ['admin', 'manager', 'security_team', 'analyst', 'viewer'];
const roleLabels: Record<string, string> = {
  admin:         'System Administrator',
  manager:       'Manager',
  security_team: 'Security Team',
  analyst:       'Analyst (Normal User)',
  viewer:        'Viewer (Read-only)',
};
const roleDescriptions: Record<string, string> = {
  admin:         'Full platform access — manage users, approve scans, configure settings.',
  manager:       'Manage projects and engagements, approve and launch scans.',
  security_team: 'Same level as Manager — run scans, validate findings, generate reports.',
  analyst:       'Submit scan requests and tickets; admins review and run them.',
  viewer:        'Read-only access — can view findings and reports, nothing more.',
};
const adminSections = ['Tool Policies', 'Safety Policies', 'Report Templates', 'Platform Settings'];

type UserProfileDraft = Pick<User, 'email' | 'username' | 'full_name' | 'role'> & { is_active: boolean };

export default function AdministrationPage() {
  const { token, user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [hiddenCards, setHiddenCards] = useState<string[]>([]);
  const [draftSettings, setDraftSettings] = useState<AdminSettings | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draftUser, setDraftUser] = useState<UserProfileDraft | null>(null);
  const [approvalReasons, setApprovalReasons] = useState<Record<string, string>>(() => {
    try {
      const stored = sessionStorage.getItem('approvalReasons');
      return stored ? (JSON.parse(stored) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });
  const [assetReasons, setAssetReasons] = useState<Record<string, string>>({});
  const [confirmDialog, setConfirmDialog] = useState<{ type: 'asset-approve' | 'asset-reject' | 'approval'; id: string; decision?: 'approved' | 'rejected' | 'more_information' } | null>(null);

  function updateApprovalReason(id: string, value: string) {
    setApprovalReasons((prev) => {
      const next = { ...prev, [id]: value };
      try { sessionStorage.setItem('approvalReasons', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const approvals = useQuery({ queryKey: ['approvals'], queryFn: () => api.approvals(undefined, token), enabled: Boolean(token) });
  const pendingAssetsQuery = useQuery({ queryKey: ['pending-assets'], queryFn: () => api.pendingAssets(token), enabled: Boolean(token) });
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => api.users(token), enabled: Boolean(token) });
  const profiles = useQuery({ queryKey: ['scan-profiles'], queryFn: () => api.scanProfiles(token), enabled: Boolean(token) });
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: () => api.adminSettings(token), enabled: Boolean(token) });
  const scannerTools = useQuery({ queryKey: ['scanner-tools'], queryFn: () => api.scannerTools(token), enabled: Boolean(token) });
  const cveStatus = useQuery({ queryKey: ['cve-sync-status'], queryFn: () => api.cveSyncStatus(token), enabled: Boolean(token) });

  useEffect(() => {
    if (settings.data) setDraftSettings(settings.data);
  }, [settings.data]);

  useEffect(() => {
    const selected = users.data?.find((user) => user.id === selectedUserId) ?? users.data?.[0];
    if (!selected) return;
    setSelectedUserId(selected.id);
    setDraftUser({
      email: selected.email,
      username: selected.username,
      full_name: selected.full_name ?? '',
      role: selected.role,
      is_active: Boolean(selected.is_active),
    });
  }, [selectedUserId, users.data]);

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => api.updateUserRole(userId, role, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User role updated');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update role'),
  });

  const settingsMutation = useMutation({
    mutationFn: (payload: AdminSettings) => api.updateAdminSettings(payload, token),
    onSuccess: async (saved) => {
      setDraftSettings(saved);
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      toast.success('Administration settings saved');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save settings'),
  });

  const userProfileMutation = useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: UserProfileDraft }) => api.updateUserProfile(userId, payload, token),
    onSuccess: async (saved) => {
      setSelectedUserId(saved.id);
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User profile updated');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update user profile'),
  });

  const approveAssetMutation = useMutation({
    mutationFn: (assetId: string) => api.approveAsset(assetId, token),
    onSuccess: async (_, assetId) => {
      setAssetReasons((prev) => { const next = { ...prev }; delete next[assetId]; return next; });
      await queryClient.invalidateQueries({ queryKey: ['pending-assets'] });
      toast.success('Asset approved and marked in-scope');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Approval failed'),
  });

  const rejectAssetMutation = useMutation({
    mutationFn: (assetId: string) => api.rejectAsset(assetId, token),
    onSuccess: async (_, assetId) => {
      setAssetReasons((prev) => { const next = { ...prev }; delete next[assetId]; return next; });
      await queryClient.invalidateQueries({ queryKey: ['pending-assets'] });
      toast.success('Asset rejected and marked out-of-scope');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Rejection failed'),
  });

  const decideApprovalMutation = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: 'approved' | 'rejected' | 'more_information'; reason: string }) =>
      api.decideApproval(id, decision, reason, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['approvals'] });
      toast.success('Approval decision recorded');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Decision failed'),
  });

  const cveSyncMutation = useMutation({
    mutationFn: () => api.syncCveDatabase(token),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['cve-sync-status'] });
      toast.success(`CVE database synced: ${result.records_synced} records`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'CVE sync failed'),
  });

  const userRows = users.data ?? [];
  const profileRows = profiles.data ?? [];
  const approvalRows = approvals.data ?? [];
  const pendingApprovals = approvalRows.filter((a) => a.status === 'pending');
  const pendingAssetRows = pendingAssetsQuery.data ?? [];
  const visibleSections = adminSections.filter((section) => !hiddenCards.includes(section));
  const selectedUser = userRows.find((user) => user.id === selectedUserId) ?? null;

  function updateSection<Section extends keyof AdminSettings, FieldName extends keyof AdminSettings[Section]>(section: Section, field: FieldName, value: AdminSettings[Section][FieldName]) {
    setDraftSettings((current) => current ? { ...current, [section]: { ...current[section], [field]: value } } : current);
  }

  return (
    <>
      <PageHeader title="System Administrator" description="Manage users, roles, scan profiles, platform policies, report templates, and operational settings." actions={<Button variant="outline" onClick={() => { users.refetch(); profiles.refetch(); settings.refetch(); approvals.refetch(); pendingAssetsQuery.refetch(); }}>Refresh</Button>} />
      <div className="mb-6 grid gap-4 md:grid-cols-6">
        <SummaryCard label="Users" value={String(userRows.length)} />
        <SummaryCard label="Admins" value={String(userRows.filter((item) => item.role === 'admin').length)} />
        <SummaryCard label="Active Users" value={String(userRows.filter((item) => item.is_active).length)} />
        <SummaryCard label="Scan Profiles" value={String(profileRows.length)} />
        <SummaryCard label="Pending Assets" value={String(pendingAssetRows.length)} highlight={pendingAssetRows.length > 0} />
        <SummaryCard label="Pending Approvals" value={String(pendingApprovals.length)} highlight={pendingApprovals.length > 0} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><div className="flex items-center gap-2"><Users className="h-5 w-5 text-[#155EEF]" /><h2 className="font-semibold">Users and Roles</h2></div></CardHeader>
          <CardContent><DataTable<User> data={userRows} columns={[{ key: 'email', header: 'User', render: (user) => <div><p className="font-semibold text-[#0B1F3A]">{user.full_name ?? user.email}</p><p className="text-xs text-slate-500">{user.email}</p></div> }, { key: 'role', header: 'Role', render: (user) => <Select value={user.role} onChange={(event) => roleMutation.mutate({ userId: user.id, role: event.target.value })} disabled={roleMutation.isPending || user.id === currentUser?.id} className="min-w-48">{roles.map((role) => <option key={role} value={role}>{roleLabels[role] ?? role}</option>)}</Select> }, { key: 'active', header: 'Active', render: (user) => <StatusBadge value={user.is_active ? 'active' : 'disabled'} /> }, { key: 'profile', header: 'Profile', render: (user) => <Button variant={user.id === selectedUserId ? 'secondary' : 'outline'} onClick={() => setSelectedUserId(user.id)}>Profile</Button> }]} /></CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#155EEF]" /><h2 className="font-semibold">Scan Profiles</h2></div></CardHeader>
          <CardContent><DataTable<ScanProfile> data={profileRows} columns={[{ key: 'name', header: 'Profile', render: (profile) => <div><p className="font-semibold text-[#0B1F3A]">{profile.name}</p><p className="text-xs text-slate-500">{profile.description ?? 'Operational scan profile.'}</p></div> }, { key: 'category', header: 'Category', render: (profile) => profile.category }, { key: 'depth', header: 'Depth', render: (profile) => profile.depth }, { key: 'run_policy', header: 'Run Policy', render: () => <StatusBadge value="standard" /> }]} /></CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#155EEF]" />
            <h2 className="font-semibold">Asset Review Queue</h2>
            {pendingAssetRows.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{pendingAssetRows.length} pending</span>}
          </div>
        </CardHeader>
        <CardContent>
          {pendingAssetsQuery.isLoading ? <p className="text-sm text-slate-500">Loading pending assets...</p> : pendingAssetRows.length === 0 ? <p className="text-sm text-slate-500">No assets pending review.</p> : (
            <DataTable<Asset>
              data={pendingAssetRows}
              columns={[
                { key: 'value', header: 'Asset', render: (a) => <div><p className="font-semibold text-[#0B1F3A]">{a.value}</p><p className="text-xs text-slate-500">{a.asset_type} · {a.environment ?? 'unknown env'}</p></div> },
                { key: 'source', header: 'Source', render: (a) => <span className="capitalize">{a.source ?? '—'}</span> },
                { key: 'scope_status', header: 'Scope', render: (a) => <StatusBadge value={a.scope_status ?? 'pending_review'} /> },
                { key: 'created_at', header: 'Discovered', render: (a) => a.created_at ? new Date(a.created_at).toLocaleDateString() : '—' },
                {
                  key: 'actions', header: 'Actions', render: (a) => (
                    <div className="flex flex-col gap-1.5 min-w-[200px]">
                      <input
                        type="text"
                        placeholder="Reason (optional)"
                        value={assetReasons[a.id] ?? ''}
                        onChange={(e) => setAssetReasons((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        className="rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={approveAssetMutation.isPending || rejectAssetMutation.isPending}
                          onClick={() => setConfirmDialog({ type: 'asset-approve', id: a.id })}
                          className="flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        ><CheckCircle className="h-3 w-3" /> Approve</button>
                        <button
                          type="button"
                          disabled={approveAssetMutation.isPending || rejectAssetMutation.isPending}
                          onClick={() => setConfirmDialog({ type: 'asset-reject', id: a.id })}
                          className="flex items-center gap-1 rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        ><XCircle className="h-3 w-3" /> Reject</button>
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-[#155EEF]" /><h2 className="font-semibold">Approval Requests</h2>{pendingApprovals.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{pendingApprovals.length} pending</span>}</div></CardHeader>
        <CardContent>
          {approvals.isLoading ? <p className="text-sm text-slate-500">Loading approvals...</p> : approvalRows.length === 0 ? <p className="text-sm text-slate-500">No approval requests.</p> : (
            <DataTable<Approval>
              data={approvalRows}
              columns={[
                { key: 'action', header: 'Action', render: (a) => <div><p className="font-semibold text-[#0B1F3A]">{a.action}</p><p className="text-xs text-slate-500">{a.scan_id ? `Scan ${a.scan_id.slice(0, 8)}…` : a.schedule_id ? `Schedule ${a.schedule_id.slice(0, 8)}…` : '—'}</p></div> },
                { key: 'risk_level', header: 'Risk', render: (a) => <StatusBadge value={a.risk_level} /> },
                { key: 'status', header: 'Status', render: (a) => <StatusBadge value={a.status} /> },
                { key: 'expires_at', header: 'Expires', render: (a) => a.expires_at ? new Date(a.expires_at).toLocaleDateString() : '—' },
                {
                  key: 'decision', header: 'Decision', render: (a) => a.status !== 'pending' ? <span className="text-xs text-slate-400">Decided</span> : (
                    <div className="flex flex-col gap-1.5 min-w-[200px]">
                      <input
                        type="text"
                        placeholder="Reason (optional)"
                        value={approvalReasons[a.id] ?? ''}
                        onChange={(e) => updateApprovalReason(a.id, e.target.value)}
                        className="rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={decideApprovalMutation.isPending}
                          onClick={() => setConfirmDialog({ type: 'approval', id: a.id, decision: 'approved' })}
                          className="flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        ><CheckCircle className="h-3 w-3" /> Approve</button>
                        <button
                          type="button"
                          disabled={decideApprovalMutation.isPending}
                          onClick={() => setConfirmDialog({ type: 'approval', id: a.id, decision: 'rejected' })}
                          className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        ><XCircle className="h-3 w-3" /> Reject</button>
                        <button
                          type="button"
                          disabled={decideApprovalMutation.isPending}
                          onClick={() => setConfirmDialog({ type: 'approval', id: a.id, decision: 'more_information' })}
                          className="rounded bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                        >More Info</button>
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-[#155EEF]" /><h2 className="font-semibold">User Profile</h2></div>{selectedUser ? <StatusBadge value={selectedUser.is_active ? 'active' : 'disabled'} /> : null}</div></CardHeader>
        <CardContent>
          {draftUser && selectedUser ? <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Full name"><Input value={draftUser.full_name ?? ''} onChange={(event) => setDraftUser((current) => current ? { ...current, full_name: event.target.value } : current)} /></Field>
              <Field label="Username"><Input value={draftUser.username} onChange={(event) => setDraftUser((current) => current ? { ...current, username: event.target.value } : current)} /></Field>
              <Field label="Email"><Input type="email" value={draftUser.email} onChange={(event) => setDraftUser((current) => current ? { ...current, email: event.target.value } : current)} /></Field>
              <Field label="Role"><Select value={draftUser.role} disabled={selectedUser.id === currentUser?.id} onChange={(event) => setDraftUser((current) => current ? { ...current, role: event.target.value as User['role'] } : current)}>{roles.map((role) => <option key={role} value={role}>{roleLabels[role] ?? role}</option>)}</Select>{draftUser.role && <p className="mt-1 text-xs text-slate-500">{roleDescriptions[draftUser.role]}</p>}</Field>
              <div className="md:col-span-2"><Toggle label="Active user account" checked={draftUser.is_active} disabled={selectedUser.id === currentUser?.id} onChange={(checked) => setDraftUser((current) => current ? { ...current, is_active: checked } : current)} /></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-[#0B1F3A]">Selected Profile</p>
              <p className="mt-2">{selectedUser.full_name ?? selectedUser.email}</p>
              <p>{selectedUser.email}</p>
              <p className="mt-2">Role: <span className="font-medium text-[#0B1F3A]">{roleLabels[selectedUser.role] ?? selectedUser.role}</span></p>
              <p className="mt-1 text-xs text-slate-500">{roleDescriptions[selectedUser.role]}</p>
              {selectedUser.id === currentUser?.id ? <p className="mt-3 text-xs">Current admin account cannot be disabled or demoted.</p> : null}
              <Button className="mt-4 w-full" disabled={userProfileMutation.isPending} onClick={() => selectedUserId && userProfileMutation.mutate({ userId: selectedUserId, payload: draftUser })}>{userProfileMutation.isPending ? 'Saving...' : 'Save User Profile'}</Button>
            </div>
          </div> : <p className="text-sm text-slate-600">No user profile selected.</p>}
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#0B1F3A]">Administrative Feature Controls</h2>
          <p className="text-sm text-slate-600">These settings are saved to the platform audit trail and reloaded for administrators.</p>
        </div>
        <Button disabled={!draftSettings || settingsMutation.isPending} onClick={() => draftSettings && settingsMutation.mutate(draftSettings)}>{settingsMutation.isPending ? 'Saving...' : 'Save Settings'}</Button>
      </div>

      {settings.isLoading ? <Card className="mt-4 p-5 text-sm text-slate-600">Loading administration settings...</Card> : null}
      {draftSettings ? <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {visibleSections.includes('Tool Policies') ? <FeatureCard title="Tool Policies" icon={<SlidersHorizontal className="h-5 w-5 text-[#155EEF]" />} onClose={() => setHiddenCards((current) => [...current, 'Tool Policies'])}>
          <Toggle label="Safe active checks" checked={draftSettings.tool_policies.safe_active_checks} onChange={(value) => updateSection('tool_policies', 'safe_active_checks', value)} />
          <Toggle label="Allow deep scans" checked={draftSettings.tool_policies.allow_deep_scans} onChange={(value) => updateSection('tool_policies', 'allow_deep_scans', value)} />
          <Field label="Max parallel scans"><Input type="number" min={1} value={draftSettings.tool_policies.max_parallel_scans} onChange={(event) => updateSection('tool_policies', 'max_parallel_scans', Number(event.target.value))} /></Field>
          <Field label="Request timeout seconds"><Input type="number" min={5} value={draftSettings.tool_policies.request_timeout_seconds} onChange={(event) => updateSection('tool_policies', 'request_timeout_seconds', Number(event.target.value))} /></Field>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-[#0B1F3A]">Scanner Tool Catalog</p><p className="text-xs text-slate-500">{scannerTools.data?.length ?? 0} registered vulnerability tools</p></div><StatusBadge value="active" /></div>
            <div className="mt-3 flex flex-wrap gap-2">{(scannerTools.data ?? []).slice(0, 10).map((tool) => <span key={tool.id} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">{tool.name}</span>)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-semibold text-[#0B1F3A]"><Database className="h-4 w-4 text-[#155EEF]" /> CVE Database Sync</p><p className="mt-1 text-xs text-slate-500">{cveStatus.data?.total_records ?? 0} CVE records. Last success: {cveStatus.data?.last_success_at ?? 'Never'}</p>{cveStatus.data?.error ? <p className="mt-1 text-xs text-red-600">{cveStatus.data.error}</p> : null}</div><StatusBadge value={cveStatus.data?.status ?? 'unknown'} /></div>
            <Button className="mt-3 w-full" variant="secondary" disabled={cveSyncMutation.isPending} onClick={() => cveSyncMutation.mutate()}>{cveSyncMutation.isPending ? 'Syncing CVEs...' : 'Sync CVE Database'}</Button>
          </div>
        </FeatureCard> : null}

        {visibleSections.includes('Safety Policies') ? <FeatureCard title="Safety Policies" icon={<Lock className="h-5 w-5 text-[#155EEF]" />} onClose={() => setHiddenCards((current) => [...current, 'Safety Policies'])}>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Testing window start"><Input type="time" value={draftSettings.safety_policies.allowed_testing_window_start} onChange={(event) => updateSection('safety_policies', 'allowed_testing_window_start', event.target.value)} /></Field><Field label="Testing window end"><Input type="time" value={draftSettings.safety_policies.allowed_testing_window_end} onChange={(event) => updateSection('safety_policies', 'allowed_testing_window_end', event.target.value)} /></Field></div>
          <Field label="Rate limit per minute"><Input type="number" min={1} value={draftSettings.safety_policies.rate_limit_per_minute} onChange={(event) => updateSection('safety_policies', 'rate_limit_per_minute', Number(event.target.value))} /></Field>
          <Toggle label="Destructive tests enabled" checked={draftSettings.safety_policies.destructive_tests_enabled} onChange={(value) => updateSection('safety_policies', 'destructive_tests_enabled', value)} />
        </FeatureCard> : null}

        {visibleSections.includes('Report Templates') ? <FeatureCard title="Report Templates" icon={<FileText className="h-5 w-5 text-[#155EEF]" />} onClose={() => setHiddenCards((current) => [...current, 'Report Templates'])}>
          <Field label="Default template"><Select value={draftSettings.report_templates.default_template} onChange={(event) => updateSection('report_templates', 'default_template', event.target.value)}><option value="executive">Executive</option><option value="technical">Technical</option><option value="compliance">Compliance</option></Select></Field>
          <Toggle label="Include evidence gallery" checked={draftSettings.report_templates.include_evidence_gallery} onChange={(value) => updateSection('report_templates', 'include_evidence_gallery', value)} />
          <Toggle label="Include CVSS vectors" checked={draftSettings.report_templates.include_cvss_vectors} onChange={(value) => updateSection('report_templates', 'include_cvss_vectors', value)} />
          <Toggle label="Show scanner names" checked={draftSettings.report_templates.show_scanner_names} onChange={(value) => updateSection('report_templates', 'show_scanner_names', value)} disabled />
        </FeatureCard> : null}

        {visibleSections.includes('Platform Settings') ? <FeatureCard title="Platform Settings" icon={<Settings className="h-5 w-5 text-[#155EEF]" />} onClose={() => setHiddenCards((current) => [...current, 'Platform Settings'])}>
          <Field label="Organization name"><Input value={draftSettings.platform_settings.organization_name} onChange={(event) => updateSection('platform_settings', 'organization_name', event.target.value)} /></Field>
          <Field label="Default environment"><Select value={draftSettings.platform_settings.default_environment} onChange={(event) => updateSection('platform_settings', 'default_environment', event.target.value)}><option value="testing">Testing</option><option value="staging">Staging</option><option value="production">Production</option></Select></Field>
          <Field label="Notification retention days"><Input type="number" min={1} value={draftSettings.platform_settings.notification_retention_days} onChange={(event) => updateSection('platform_settings', 'notification_retention_days', Number(event.target.value))} /></Field>
          <Field label="Session timeout minutes"><Input type="number" min={5} value={draftSettings.platform_settings.session_timeout_minutes} onChange={(event) => updateSection('platform_settings', 'session_timeout_minutes', Number(event.target.value))} /></Field>
        </FeatureCard> : null}
      </div> : null}

      {hiddenCards.length ? <Button className="mt-4" variant="outline" onClick={() => setHiddenCards([])}>Show Closed Cards</Button> : null}

      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="font-semibold text-[#0B1F3A]">Confirm action</h3>
            <p className="mt-2 text-sm text-slate-600">
              {confirmDialog.type === 'asset-approve' && 'Approve this asset and mark it in-scope?'}
              {confirmDialog.type === 'asset-reject' && 'Reject this asset and mark it out-of-scope?'}
              {confirmDialog.type === 'approval' && confirmDialog.decision === 'approved' && 'Approve this request?'}
              {confirmDialog.type === 'approval' && confirmDialog.decision === 'rejected' && 'Reject this request?'}
              {confirmDialog.type === 'approval' && confirmDialog.decision === 'more_information' && 'Request more information?'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  const { type, id, decision } = confirmDialog;
                  if (type === 'asset-approve') approveAssetMutation.mutate(id);
                  else if (type === 'asset-reject') rejectAssetMutation.mutate(id);
                  else if (type === 'approval' && decision) decideApprovalMutation.mutate({ id, decision, reason: approvalReasons[id] ?? '' });
                  setConfirmDialog(null);
                }}
              >Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SummaryCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <Card className={`p-4 ${highlight ? 'border-amber-300 bg-amber-50' : ''}`}><p className="text-sm text-slate-600">{label}</p><p className={`mt-2 text-3xl font-bold ${highlight ? 'text-amber-700' : 'text-[#0B1F3A]'}`}>{value}</p></Card>;
}

function FeatureCard({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return <Card className="relative p-5"><button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50" aria-label={`Close ${title}`}><X className="h-4 w-4" /></button><div className="mb-4 flex items-center gap-2 pr-8">{icon}<h3 className="font-semibold text-[#0B1F3A]">{title}</h3></div><div className="space-y-3">{children}</div></Card>;
}

function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-[#0B1F3A]"><span>{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[#155EEF]" /></label>;
}
