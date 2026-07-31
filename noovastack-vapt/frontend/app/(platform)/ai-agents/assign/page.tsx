import Link from 'next/link';
import { AssignAgentWizard } from '@/components/ai-agents/assign-agent-wizard';

export default function AssignAgentPage() {
  return <main className="agent-theme min-h-screen rounded-3xl bg-[#07111F] p-4 text-white lg:p-6"><div className="mb-6 flex items-center justify-between"><div><h1 className="text-3xl font-bold">Assign Automation</h1><p className="mt-2 text-[#94A3B8]">Assign approved local Generative AI automation only after authorization, scope, and policy checks pass.</p></div><Link href="/ai-agents" className="rounded-xl border border-[#223044] px-4 py-2 text-sm font-semibold hover:border-[#E51C2A]">Back</Link></div><AssignAgentWizard /></main>;
}
