'use client';

import { Lock } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

export default function SecuritySettingsPage() {
  return (
    <>
      <PageHeader title="Security Settings" description="Manage your password and account security." />
      <Card className="max-w-lg">
        <CardContent className="py-8 text-center">
          <Lock className="mx-auto mb-3 h-10 w-10 text-[#0B5E9E]" />
          <p className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Security options are available in your profile.</p>
          <p className="mt-1 text-sm text-[#667085] dark:text-[#94A3B8]">Change your password and review account access from the profile page.</p>
          <Link href="/profile" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1045C9]">Go to Profile</Link>
        </CardContent>
      </Card>
    </>
  );
}
