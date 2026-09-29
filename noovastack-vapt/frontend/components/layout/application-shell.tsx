'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoadingSkeleton } from '@/components/feedback/loading-skeleton';
import { SidebarNavigation } from '@/components/layout/sidebar-navigation';
import { TopNavigation } from '@/components/layout/top-navigation';
import { useAuth } from '@/hooks/use-auth';

export function ApplicationShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isAuthenticated, loading, pathname, router]);

  if (loading || !isAuthenticated) return <main className="min-h-screen p-6"><LoadingSkeleton rows={8} /></main>;

  return (
    <div className="app-shell flex h-screen overflow-hidden bg-[#F2F5F9] dark:bg-[#0B1627]">
      {/* Persistent sidebar: show from md (768px) upward */}
      <div className="hidden md:block"><SidebarNavigation collapsed={collapsed} /></div>
      {/* Mobile drawer: slide-in panel, not full-width */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />
          <div className="relative h-full w-[240px] shadow-2xl">
            <SidebarNavigation collapsed={false} onNavigate={() => setMobileOpen(false)} mobile />
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNavigation onMenu={() => setMobileOpen(true)} onCollapse={() => setCollapsed((value) => !value)} />
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
