'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCircle, Save, Key, Mail, User } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

export default function ProfilePage() {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [profileMsg, setProfileMsg] = useState('');

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  const updateProfile = useMutation({
    mutationFn: (data: { full_name?: string; email?: string; username?: string }) =>
      api.updateMe(data, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setProfileMsg('Profile updated successfully.');
      setTimeout(() => setProfileMsg(''), 3000);
    },
    onError: (err: Error) => setProfileMsg(err.message ?? 'Update failed.'),
  });

  const changePassword = useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      api.changePassword(data, token!),
    onSuccess: () => {
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwMsg('Password changed successfully.');
      setTimeout(() => setPwMsg(''), 3000);
    },
    onError: (err: Error) => setPwMsg(err.message ?? 'Password change failed.'),
  });

  function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    updateProfile.mutate({ full_name: fullName, email, username });
  }

  function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwMsg('New passwords do not match.');
      return;
    }
    if (newPw.length < 8) {
      setPwMsg('New password must be at least 8 characters.');
      return;
    }
    changePassword.mutate({ current_password: currentPw, new_password: newPw });
  }

  const initials = (user?.full_name || user?.username || user?.email || '')
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <>
      <PageHeader
        title="My Profile"
        description="View and update your personal information and password."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-[#DCE3EA] bg-white p-6 dark:border-[#2A394D] dark:bg-[#121C2B]">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-[#EAF4FB] text-2xl font-bold text-[#0B5E9E] dark:bg-[#143A5A] dark:text-[#8CCCF0]">
            {initials || <UserCircle className="h-10 w-10" />}
          </div>
          <div className="text-center">
            <p className="font-semibold text-[#102033] dark:text-[#F1F5F9]">{user?.full_name || user?.username}</p>
            <p className="text-sm text-[#667085] dark:text-[#94A3B8]">{user?.email}</p>
            <span className="mt-2 inline-block rounded-full bg-[#EAF2FF] px-3 py-1 text-xs font-semibold text-[#155EEF] dark:bg-[#143A5A] dark:text-[#8CCCF0]">
              {user?.role?.replace('_', ' ') ?? 'User'}
            </span>
          </div>
          <div className="w-full border-t border-[#DCE3EA] pt-4 dark:border-[#2A394D]">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#667085] dark:text-[#94A3B8]">Member since</dt>
                <dd className="font-medium text-[#102033] dark:text-[#F1F5F9]">{formatDate(user?.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#667085] dark:text-[#94A3B8]">Status</dt>
                <dd className="font-medium text-green-600 dark:text-green-400">{user?.is_active ? 'Active' : 'Inactive'}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-[#0B5E9E]" />
                <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Personal Information</h2>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSave} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">Full Name</label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">Username</label>
                    <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]" />
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="pl-9" placeholder="you@example.com" />
                  </div>
                </div>
                {profileMsg && (
                  <p className={`text-sm ${profileMsg.includes('success') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{profileMsg}</p>
                )}
                <Button type="submit" disabled={updateProfile.isPending}>
                  <Save className="h-4 w-4" />
                  {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-[#0B5E9E]" />
                <h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Change Password</h2>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSave} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">Current Password</label>
                  <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="Enter current password" autoComplete="current-password" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">New Password</label>
                    <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Min 8 characters" autoComplete="new-password" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#344054] dark:text-[#B3C0D1]">Confirm New Password</label>
                    <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Repeat new password" autoComplete="new-password" />
                  </div>
                </div>
                {pwMsg && (
                  <p className={`text-sm ${pwMsg.includes('success') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{pwMsg}</p>
                )}
                <Button type="submit" disabled={changePassword.isPending || !currentPw || !newPw || !confirmPw}>
                  <Key className="h-4 w-4" />
                  {changePassword.isPending ? 'Changing...' : 'Change Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
