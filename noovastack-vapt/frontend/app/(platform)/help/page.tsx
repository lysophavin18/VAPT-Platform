'use client';

import { BookOpen, ExternalLink, MessageCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help and Support" description="Documentation, guides, and support resources for NoovaStack VAPT." />
      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
        <Card>
          <CardHeader><div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-[#0B5E9E]" /><h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Documentation</h2></div></CardHeader>
          <CardContent><p className="text-sm text-[#667085] dark:text-[#94A3B8]">Platform guides, scan profiles, and API reference documentation.</p></CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-[#0B5E9E]" /><h2 className="font-semibold text-[#102033] dark:text-[#F1F5F9]">Contact Support</h2></div></CardHeader>
          <CardContent><p className="text-sm text-[#667085] dark:text-[#94A3B8]">Reach the NoovaStack security team for platform assistance.</p></CardContent>
        </Card>
      </div>
    </>
  );
}
