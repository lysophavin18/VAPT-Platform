'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { NstLogo } from '@/components/branding/nst-logo';
import { BRAND } from '@/lib/branding';
import { navItems } from '@/lib/constants';
import { canAccess } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

type SidebarChild = { label: string; href: string; match?: string };
type SidebarItem = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  roles?: readonly string[];
  children?: readonly SidebarChild[];
};

export function SidebarNavigation({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const visible = navItems.filter((item) => canAccess(user?.role, item.roles)) as readonly SidebarItem[];
  const adminItem = visible.find((item) => item.href === '/administration');
  const mainItems = visible.filter((item) => item.href !== '/administration');

  return <Sidebar collapsed={collapsed}>
    <SidebarHeader collapsed={collapsed} />
    <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main navigation">
      {mainItems.map((item) => item.children?.length ? <SidebarAccordion key={item.href ?? item.label} item={item} collapsed={collapsed} pathname={pathname} searchParams={searchParams} onNavigate={onNavigate} /> : <SidebarParentItem key={item.href ?? item.label} item={item} active={isParentActive(item, pathname)} collapsed={collapsed} onNavigate={onNavigate} />)}
    </nav>
    <SidebarFooter item={adminItem} collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />
  </Sidebar>;
}

function Sidebar({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return <aside className={cn('sidebar-shell flex h-full flex-col border-r border-[#DCE3EA] bg-white opacity-100 transition-all', collapsed ? 'w-[76px]' : 'w-[264px]')}>{children}</aside>;
}

function SidebarHeader({ collapsed }: { collapsed: boolean }) {
  return <Link href="/dashboard" className="sidebar-item flex h-16 items-center gap-3 border-b border-[#DCE3EA] px-4" aria-label={BRAND.productName}>
    <NstLogo variant="mark" className="h-11 w-11 shrink-0" markClassName="h-11 w-11" showTextFallback={false} />
    {!collapsed ? <div className="min-w-0 leading-tight"><p className="sidebar-brand-title truncate font-bold text-[#102033]">{BRAND.shortName}</p><p className="sidebar-brand-subtitle text-xs font-medium text-[#667085]">{BRAND.productDescriptor}</p></div> : null}
  </Link>;
}

function SidebarAccordion({ item, collapsed, pathname, searchParams, onNavigate }: { item: SidebarItem; collapsed: boolean; pathname: string; searchParams: URLSearchParams; onNavigate?: () => void }) {
  const parentActive = isParentActive(item, pathname);
  const childActive = item.children?.some((child) => isChildActive(child, pathname, searchParams)) ?? false;
  const [expanded, setExpanded] = useState(parentActive || childActive);

  useEffect(() => {
    if (parentActive || childActive) setExpanded(true);
  }, [childActive, parentActive]);

  if (collapsed) return <SidebarParentItem item={item} active={parentActive || childActive} collapsed onNavigate={onNavigate} />;

  return <div className={cn('rounded-xl transition-colors', expanded && 'sidebar-accordion-expanded bg-[#EAF4FB] p-2')}>
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className={parentItemClass(parentActive || childActive, expanded)}>
      <SidebarParentContent item={item} collapsed={false} active={parentActive || childActive} expanded={expanded} />
    </button>
    {expanded ? <SidebarSubmenu item={item} pathname={pathname} searchParams={searchParams} onNavigate={onNavigate} /> : null}
  </div>;
}

function SidebarParentItem({ item, active, collapsed, onNavigate }: { item: SidebarItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const href = item.href ?? '#';
  return <Link href={href} title={item.label} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={parentItemClass(active, false, collapsed)}>
    <SidebarParentContent item={item} collapsed={collapsed} active={active} />
  </Link>;
}

function SidebarParentContent({ item, collapsed, active, expanded }: { item: SidebarItem; collapsed: boolean; active: boolean; expanded?: boolean }) {
  const Icon = item.icon;
  return <>
    <Icon className={cn('h-[21px] w-[21px] shrink-0 transition-colors', active ? 'text-[#0B5E9E]' : 'text-[#475467] group-hover:text-[#0B5E9E]')} />
    {!collapsed ? <span className="flex-1 truncate text-left">{item.label}</span> : null}
    {!collapsed && item.children?.length ? <ChevronDown aria-hidden="true" className={cn('h-[18px] w-[18px] shrink-0 text-[#667085] transition-transform group-hover:text-[#0B5E9E]', expanded && 'rotate-180')} /> : null}
    {!collapsed && item.children?.length ? <span className="sr-only">{expanded ? 'Collapse' : 'Expand'} {item.label}</span> : null}
  </>;
}

function SidebarSubmenu({ item, pathname, searchParams, onNavigate }: { item: SidebarItem; pathname: string; searchParams: URLSearchParams; onNavigate?: () => void }) {
  return <div className="mt-1 space-y-0.5" role="group" aria-label={`${item.label} submenu`}>
    {item.children?.map((child) => <SidebarSubmenuItem key={child.href} child={child} active={isChildActive(child, pathname, searchParams)} onNavigate={onNavigate} />)}
  </div>;
}

function SidebarSubmenuItem({ child, active, onNavigate }: { child: SidebarChild; active: boolean; onNavigate?: () => void }) {
  return <Link href={child.href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={cn('sidebar-item sidebar-submenu-item flex min-h-9 items-center rounded-md py-2 pl-[52px] pr-3 text-sm transition-colors', active ? 'sidebar-submenu-active border-l-[3px] border-[#0B5E9E] bg-[rgba(11,94,158,0.08)] font-semibold text-[#0B5E9E]' : 'border-l-[3px] border-transparent text-[#667085] hover:bg-[#F2F6FA] hover:text-[#0B5E9E]')}>
    {child.label}
  </Link>;
}

function SidebarFooter({ item, collapsed, pathname, onNavigate }: { item?: SidebarItem; collapsed: boolean; pathname: string; onNavigate?: () => void }) {
  if (!item) return null;
  return <div className="border-t border-[#DCE3EA] p-3"><SidebarParentItem item={item} active={pathname === item.href} collapsed={collapsed} onNavigate={onNavigate} /></div>;
}

function parentItemClass(active: boolean, expanded = false, collapsed = false) {
  return cn(
    'sidebar-item sidebar-parent group flex min-h-12 w-full items-center rounded-xl text-sm transition-colors',
    collapsed ? 'justify-center px-0' : 'gap-[14px] px-4',
    active ? 'sidebar-parent-active font-semibold text-[#0B5E9E]' : 'font-medium text-[#475467] hover:bg-[#F2F6FA] hover:text-[#0B5E9E]',
    expanded && 'hover:bg-transparent',
  );
}

function isParentActive(item: SidebarItem, pathname: string) {
  if (!item.href) return false;
  if (item.href === '/dashboard') return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function isChildActive(child: SidebarChild, pathname: string, searchParams: URLSearchParams) {
  const [childPath, childSearch] = (child.match ?? child.href).split('?');
  if (pathname !== childPath) return false;
  if (!childSearch) return !hasSectionQuery(searchParams);
  const expected = new URLSearchParams(childSearch);
  return Array.from(expected.entries()).every(([key, value]) => searchParams.get(key) === value);
}

function hasSectionQuery(searchParams: URLSearchParams) {
  return ['status', 'scope'].some((key) => searchParams.has(key));
}
