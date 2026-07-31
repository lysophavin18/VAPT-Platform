import { ReactNode } from 'react';
import { NstLogo } from '@/components/branding/nst-logo';
import { BRAND } from '@/lib/branding';
import { APP_NAME } from '@/lib/constants';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#EAF4FB,transparent_34%),linear-gradient(135deg,#F8FAFC_0%,#FFFFFF_45%,#EAF4FB_100%)]">
      <div className="mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-4 py-10 lg:grid-cols-[1fr_460px] lg:px-8">
        <section className="hidden lg:block">
          <NstLogo variant="full" className="h-20 max-w-sm" />
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.3em] text-[#0B5E9E]">{APP_NAME}</p>
          <h1 className="mt-6 max-w-2xl text-5xl font-bold tracking-tight text-[#102033]">Secure vulnerability assessment made simple.</h1>
          <p className="mt-6 max-w-xl text-lg text-slate-600">{BRAND.shortName} guides teams through safe discovery, scanning, remediation, reporting, and retesting without exposing scanner complexity.</p>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3 text-sm">
            {['Plain English Findings', 'Safe Defaults', 'Evidence Focused'].map((item) => <div key={item} className="rounded-2xl border border-blue-100 bg-white/80 p-4 font-semibold text-[#102033] shadow-soft">{item}</div>)}
          </div>
        </section>
        {children}
      </div>
    </main>
  );
}
