'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
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

// Section groupings for visual dividers
const SECTION_BEFORE: Record<string, string> = {
  '/findings': 'Analysis',
  '/ai-agents': 'Tools',
  '/audit-logs': 'Governance',
};

export function SidebarNavigation({
  collapsed,
  onNavigate,
  mobile = false,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const visible = navItems.filter((item) =>
    canAccess(user?.role, item.roles)
  ) as readonly SidebarItem[];
  const adminItem = visible.find((item) => item.href === '/administration');
  const mainItems = visible.filter((item) => item.href !== '/administration');

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-[#0F1C2E] transition-all duration-200',
        collapsed ? 'w-[60px]' : mobile ? 'w-[220px]' : 'w-[220px] xl:w-[240px]'
      )}
    >
      {/* Logo */}
      <Link
        href="/dashboard"
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-white/10 px-4 gap-3',
        )}
        aria-label={BRAND.productName}
      >
        <NstLogo
          variant="mark"
          className="h-8 w-8 shrink-0"
          markClassName="h-8 w-8"
          showTextFallback={false}
        />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{BRAND.shortName}</p>
            <p className="truncate text-[11px] font-medium text-white/50">{BRAND.productDescriptor}</p>
          </div>
        )}
      </Link>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 space-y-0.5" aria-label="Main navigation">
        {mainItems.map((item) => {
          const sectionLabel = !collapsed ? SECTION_BEFORE[item.href ?? ''] : undefined;
          return (
            <div key={item.href ?? item.label}>
              {sectionLabel && (
                <p className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  {sectionLabel}
                </p>
              )}
              {item.children?.length ? (
                <SidebarAccordion
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname}
                  searchParams={searchParams}
                  onNavigate={onNavigate}
                />
              ) : (
                <SidebarLink
                  item={item}
                  active={isParentActive(item, pathname)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer — admin */}
      {adminItem && (
        <div className="shrink-0 border-t border-white/10 px-2 py-3">
          <SidebarLink
            item={adminItem}
            active={pathname === adminItem.href}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </aside>
  );
}

/* ── Accordion (parent with children) ───────────────────────── */
function SidebarAccordion({
  item,
  collapsed,
  pathname,
  searchParams,
  onNavigate,
}: {
  item: SidebarItem;
  collapsed: boolean;
  pathname: string;
  searchParams: URLSearchParams;
  onNavigate?: () => void;
}) {
  const parentActive = isParentActive(item, pathname);
  const childActive = item.children?.some((c) => isChildActive(c, pathname, searchParams)) ?? false;
  const anyActive = parentActive || childActive;
  const [open, setOpen] = useState(anyActive);

  useEffect(() => {
    if (anyActive) setOpen(true);
  }, [anyActive]);

  if (collapsed) {
    return <SidebarLink item={item} active={anyActive} collapsed onNavigate={onNavigate} />;
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={navItemClass(anyActive, false)}
      >
        <NavIcon Icon={item.icon} active={anyActive} />
        <span className="flex-1 truncate text-left text-[13px]">{item.label}</span>
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-white/30 transition-transform',
            open && 'rotate-90',
            anyActive && 'text-white/60',
          )}
        />
      </button>

      {open && (
        <div className="mt-0.5 mb-1 ml-3 border-l border-white/10 pl-3 space-y-0.5">
          {item.children?.map((child) => (
            <ChildLink
              key={child.href}
              child={child}
              active={isChildActive(child, pathname, searchParams)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Plain nav link ─────────────────────────────────────────── */
function SidebarLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: SidebarItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href ?? '#'}
      title={item.label}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={navItemClass(active, collapsed)}
    >
      <NavIcon Icon={item.icon} active={active} />
      {!collapsed && (
        <span className="flex-1 truncate text-[13px]">{item.label}</span>
      )}
    </Link>
  );
}

/* ── Child link ─────────────────────────────────────────────── */
function ChildLink({
  child,
  active,
  onNavigate,
}: {
  child: SidebarChild;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={child.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 items-center rounded-md px-2.5 text-[12px] transition-colors',
        active
          ? 'bg-white/10 font-semibold text-white'
          : 'font-medium text-white/50 hover:bg-white/5 hover:text-white/80',
      )}
    >
      {active && (
        <span className="mr-2 h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
      )}
      {child.label}
    </Link>
  );
}

/* ── Icon wrapper ───────────────────────────────────────────── */
function NavIcon({
  Icon,
  active,
}: {
  Icon: ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Icon
      className={cn(
        'h-[17px] w-[17px] shrink-0 transition-colors',
        active ? 'text-[#60A5FA]' : 'text-white/40 group-hover:text-white/70',
      )}
    />
  );
}

/* ── Item class ─────────────────────────────────────────────── */
function navItemClass(active: boolean, collapsed: boolean) {
  return cn(
    'group flex h-9 w-full items-center rounded-lg transition-colors',
    collapsed ? 'justify-center px-2' : 'gap-2.5 px-3',
    active
      ? 'bg-white/10 font-semibold text-white'
      : 'font-medium text-white/55 hover:bg-white/5 hover:text-white/90',
  );
}

/* ── Helpers ────────────────────────────────────────────────── */
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
  return Array.from(expected.entries()).every(([k, v]) => searchParams.get(k) === v);
}

function hasSectionQuery(sp: URLSearchParams) {
  return ['status', 'scope'].some((k) => sp.has(k));
}
