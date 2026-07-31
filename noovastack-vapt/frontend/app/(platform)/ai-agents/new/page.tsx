'use client';

import Link from 'next/link';
import { CustomAgentForm } from '@/components/ai-agents/custom-agent-form';
import { PermissionGuard } from '@/components/ai-agents/permission-guard';
import { useAgentPermissions } from '@/hooks/use-agent-permissions';

export default function NewAgentPage() {
  const permissions = useAgentPermissions();
  return <main className="agent-theme min-h-screen rounded-3xl bg-[#07111F] p-4 text-white lg:p-6"><div className="mb-6 flex items-center justify-between"><div><h1 className="text-3xl font-bold">Create Automation Profile</h1><p className="mt-2 text-[#94A3B8]">Administration-only local Generative AI automation configuration with mandatory safety controls enforced.</p></div><Link href="/ai-agents" className="rounded-xl border border-[#223044] px-4 py-2 text-sm font-semibold hover:border-[#E51C2A]">Back</Link></div><PermissionGuard allowed={permissions.canCreateCustomAgent}><CustomAgentForm /></PermissionGuard></main>;
}
