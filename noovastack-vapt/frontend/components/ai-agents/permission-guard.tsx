import { ReactNode } from 'react';
import Link from 'next/link';

export function PermissionGuard({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  if (allowed) return <>{children}</>;
  return <div className="rounded-2xl border border-[#223044] bg-[#0D1928] p-8 text-center"><h1 className="text-2xl font-bold text-white">Permission denied</h1><p className="mt-2 text-[#94A3B8]">Your role cannot access this Generative AI automation function.</p><Link href="/ai-agents" className="mt-5 inline-flex rounded-xl bg-[#E51C2A] px-4 py-2 text-sm font-semibold text-white">Back to Generative AI</Link></div>;
}
