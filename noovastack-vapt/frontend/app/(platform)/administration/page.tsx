'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, FileText, Lock, Settings, ShieldCheck, SlidersHorizontal, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DataTable } from '@/components/tables/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { api, type AdminSettings } from '@/lib/api-client';
import type { ScanProfile, User } from '@/types';

const roles = ['admin', 'manager', 'analyst', 'viewer'];
const adminSections = ['Tool Policies', 'Safety Policies', 'Report Templates', 'Platform Settings'];

type UserProfileDraft = Pick<User, 'email' | 'username' | 'full_name' | 'role'> & { is_active: boolean };

export default function AdministrationPage() {
  const { token, user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [hiddenCards, setHiddenCards] = useState<string[]>([]);
  const [draftSettings, setDraftSettings] = useState<AdminSettings | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draftUser, setDraftUser] = useState<UserProfileDraft | null>(null);

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
  const visibleSections = adminSections.filter((section) => !hiddenCards.includes(section));
  const selectedUser = userRows.find((user) => user.id === selectedUserId) ?? null;

  function updateSection<Section extends keyof AdminSettings, FieldName extends keyof AdminSettings[Section]>(section: Section, field: FieldName, value: AdminSettings[Section][FieldName]) {
    setDraftSettings((current) => current ? { ...current, [section]: { ...current[section], [field]: value } } : current);
  }

  return (
    <>
      <PageHeader title="System Administrator" description="Manage users, roles, scan profiles, platform policies, report templates, and operational settings." actions={<Button variant="outline" onClick={() => { users.refetch(); profiles.refetch(); settings.refetch(); }}>Refresh</Button>} />
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <SummaryCard label="Users" value={String(userRows.length)} />
        <SummaryCard label="Admins" value={String(userRows.filter((item) => item.role === 'admin').length)} />
        <SummaryCard label="Active Users" value={String(userRows.filter((item) => item.is_active).length)} />
        <SummaryCard label="Scan Profiles" value={String(profileRows.length)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><div className="flex items-center gap-2"><Users className="h-5 w-5 text-[#155EEF]" /><h2 className="font-semibold">Users and Roles</h2></div></CardHeader>
          <CardContent><DataTable<User> data={userRows} columns={[{ key: 'email', header: 'User', render: (user) => <div><p className="font-semibold text-[#0B1F3A]">{user.full_name ?? user.email}</p><p className="text-xs text-slate-500">{user.email}</p></div> }, { key: 'role', header: 'Role', render: (user) => <Select value={user.role} onChange={(event) => roleMutation.mutate({ userId: user.id, role: event.target.value })} disabled={roleMutation.isPending || user.id === currentUser?.id} className="min-w-32">{roles.map((role) => <option key={role} value={role}>{role}</option>)}</Select> }, { key: 'active', header: 'Active', render: (user) => <StatusBadge value={user.is_active ? 'active' : 'disabled'} /> }, { key: 'profile', header: 'Profile', render: (user) => <Button variant={user.id === selectedUserId ? 'secondary' : 'outline'} onClick={() => setSelectedUserId(user.id)}>Profile</Button> }]} /></CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#155EEF]" /><h2 className="font-semibold">Scan Profiles</h2></div></CardHeader>
          <CardContent><DataTable<ScanProfile> data={profileRows} columns={[{ key: 'name', header: 'Profile', render: (profile) => <div><p className="font-semibold text-[#0B1F3A]">{profile.name}</p><p className="text-xs text-slate-500">{profile.description ?? 'Operational scan profile.'}</p></div> }, { key: 'category', header: 'Category', render: (profile) => profile.category }, { key: 'depth', header: 'Depth', render: (profile) => profile.depth }, { key: 'run_policy', header: 'Run Policy', render: () => <StatusBadge value="standard" /> }]} /></CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-[#155EEF]" /><h2 className="font-semibold">User Profile</h2></div>{selectedUser ? <StatusBadge value={selectedUser.is_active ? 'active' : 'disabled'} /> : null}</div></CardHeader>
        <CardContent>
          {draftUser && selectedUser ? <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Full name"><Input value={draftUser.full_name ?? ''} onChange={(event) => setDraftUser((current) => current ? { ...current, full_name: event.target.value } : current)} /></Field>
              <Field label="Username"><Input value={draftUser.username} onChange={(event) => setDraftUser((current) => current ? { ...current, username: event.target.value } : current)} /></Field>
              <Field label="Email"><Input type="email" value={draftUser.email} onChange={(event) => setDraftUser((current) => current ? { ...current, email: event.target.value } : current)} /></Field>
              <Field label="Role"><Select value={draftUser.role} disabled={selectedUser.id === currentUser?.id} onChange={(event) => setDraftUser((current) => current ? { ...current, role: event.target.value as User['role'] } : current)}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</Select></Field>
              <div className="md:col-span-2"><Toggle label="Active user account" checked={draftUser.is_active} disabled={selectedUser.id === currentUser?.id} onChange={(checked) => setDraftUser((current) => current ? { ...current, is_active: checked } : current)} /></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-[#0B1F3A]">Selected Profile</p>
              <p className="mt-2">{selectedUser.full_name ?? selectedUser.email}</p>
              <p>{selectedUser.email}</p>
              <p className="mt-2">Role: <span className="font-medium text-[#0B1F3A]">{selectedUser.role}</span></p>
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
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <Card className="p-4"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-bold text-[#0B1F3A]">{value}</p></Card>;
}

function FeatureCard({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return <Card className="relative p-5"><button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50" aria-label={`Close ${title}`}><X className="h-4 w-4" /></button><div className="mb-4 flex items-center gap-2 pr-8">{icon}<h3 className="font-semibold text-[#0B1F3A]">{title}</h3></div><div className="space-y-3">{children}</div></Card>;
}

function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-[#0B1F3A]"><span>{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[#155EEF]" /></label>;
}
