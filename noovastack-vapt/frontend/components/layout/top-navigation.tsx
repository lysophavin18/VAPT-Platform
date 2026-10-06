'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, LogOut, Menu, Moon, Search, Sun, UserCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api-client';
import { navItems, quickActions } from '@/lib/constants';
import { canAccess } from '@/lib/permissions';
import { formatDate, titleCase } from '@/lib/utils';
import type { Asset, Finding, Project, Scan } from '@/types';

interface NotificationItem { id: string; event_type: string; action: string; created_at?: string | null; scan_id?: string | null; project_id?: string | null; engagement_id?: string | null; details?: Record<string, unknown> }
interface SearchResult { id: string; title: string; subtitle: string; href: string; group: string; terms: string }

const LAST_READ_KEY = 'noovastack.notifications.lastReadAt';
const profileMenuItems = [
  { label: 'My Profile', href: '/profile' },
  { label: 'Account Settings', href: '/settings/account' },
  { label: 'Security Settings', href: '/settings/security' },
  { label: 'Multi-Factor Authentication', href: '/settings/mfa' },
  { label: 'Notification Preferences', href: '/settings/notifications' },
  { label: 'Session Management', href: '/settings/sessions' },
  { label: 'Appearance', href: '/settings/appearance' },
  { label: 'Help and Support', href: '/help' },
];

export function TopNavigation({ onMenu, onCollapse }: { onMenu: () => void; onCollapse: () => void }) {
  const { token, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const profileItemRefs = useRef<Array<HTMLAnchorElement | HTMLButtonElement | null>>([]);
  const notifications = useQuery({ queryKey: ['notifications', 'topbar'], queryFn: () => api.dashboardActivity(token) as Promise<NotificationItem[]>, enabled: Boolean(token), refetchInterval: 30000 });
  const projects = useQuery({ queryKey: ['global-search', 'projects'], queryFn: () => api.projects(token), enabled: Boolean(token && searchOpen) });
  const scans = useQuery({ queryKey: ['global-search', 'scans'], queryFn: () => api.scans(token), enabled: Boolean(token && searchOpen) });
  const findings = useQuery({ queryKey: ['global-search', 'findings'], queryFn: () => api.findings(token), enabled: Boolean(token && searchOpen) });
  const assets = useQuery({
    queryKey: ['global-search', 'assets', projects.data?.map((project) => project.id).join(',')],
    queryFn: async () => {
      const projectRows = projects.data ?? [];
      const batches = await Promise.all(projectRows.slice(0, 25).map((project) => api.assets(project.id, token).catch(() => [] as Asset[])));
      return batches.flat();
    },
    enabled: Boolean(token && searchOpen && projects.data?.length),
  });
  const items = notifications.data ?? [];
  const unreadCount = useMemo(() => items.filter((item) => isUnread(item, lastReadAt)).length, [items, lastReadAt]);
  const searchResults = useMemo(() => buildSearchResults({ projects: projects.data ?? [], scans: scans.data ?? [], findings: findings.data ?? [], assets: assets.data ?? [], role: user?.role }).filter((item) => matchesQuery(item, query)).slice(0, 12), [assets.data, findings.data, projects.data, query, scans.data, user?.role]);

  useEffect(() => {
    setLastReadAt(window.localStorage.getItem(LAST_READ_KEY));
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        closeProfileMenu(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  function markAllRead() {
    const value = new Date().toISOString();
    window.localStorage.setItem(LAST_READ_KEY, value);
    setLastReadAt(value);
  }

  function openProfileMenu(focusFirst = false) {
    setProfileOpen(true);
    if (focusFirst) window.setTimeout(() => profileItemRefs.current[0]?.focus(), 0);
  }

  function closeProfileMenu(focusTrigger = false) {
    setProfileOpen(false);
    if (focusTrigger) window.setTimeout(() => profileTriggerRef.current?.focus(), 0);
  }

  function onProfileTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      profileOpen ? closeProfileMenu() : openProfileMenu(true);
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openProfileMenu(true);
    }
  }

  function onProfileMenuKeyDown(event: ReactKeyboardEvent<HTMLElement>, index: number) {
    const items = profileItemRefs.current.filter(Boolean);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeProfileMenu(true);
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    }
    if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    }
    if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  async function signOut() {
    closeProfileMenu();
    await logout();
  }

  const displayName = user?.full_name || user?.username || user?.email || 'User';
  const displayRole = formatRole(user?.role);
  const avatarUrl = getAvatarUrl(user);
  const initials = getInitials(user?.full_name || user?.username || user?.email);
  return (
    <header className="top-navigation relative flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-[#0D1728] sm:gap-3 sm:px-4">

      {/* Mobile menu button */}
      <button
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 md:hidden"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Collapse sidebar button (desktop) */}
      <button
        className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 md:grid"
        onClick={onCollapse}
        aria-label="Collapse sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search — capped width so right items never get pushed off */}
      <div className="relative min-w-0 flex-1 max-w-xl">
        <button
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-400 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500 dark:hover:bg-slate-800"
          aria-label="Global search"
          onClick={() => setSearchOpen((v) => !v)}
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden flex-1 truncate sm:block">Search projects, assets, scans, findings...</span>
          <kbd className="ml-auto hidden shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-700 dark:text-slate-400 sm:inline">
            Ctrl K
          </kbd>
        </button>

        {searchOpen && (
          <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#121C2B]">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type to search…" className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100" />
            </div>
            <div className="max-h-[400px] overflow-y-auto p-2">
              {searchResults.map((r) => (
                <Link key={`${r.group}-${r.id}`} href={r.href} onClick={() => setSearchOpen(false)} className="flex items-center justify-between gap-3 rounded-xl p-3 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.title}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{r.subtitle}</p></div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">{r.group}</span>
                </Link>
              ))}
              {!searchResults.length && (
                <div className="p-6 text-center text-sm text-slate-500">{query.trim() ? 'No results.' : 'Start typing to search.'}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right side — shrink-0 ensures these never disappear */}
      <div className="ml-auto flex shrink-0 items-center gap-1">

        {/* Notifications */}
        <div className="relative">
          <button
            className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Notifications"
            onClick={() => setOpen((v) => !v)}
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </button>
          {open && (
            <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#121C2B]">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">Notifications</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{unreadCount} unread</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={markAllRead} className="text-xs font-semibold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400">Mark read</button>
                  <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-blue-600 dark:text-blue-400">View all</Link>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {items.slice(0, 6).map((item) => (
                  <Link key={item.id} href={notificationHref(item)} onClick={() => setOpen(false)} className={`flex gap-2 rounded-xl p-3 hover:bg-slate-50 dark:hover:bg-slate-800 ${isUnread(item, lastReadAt) ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isUnread(item, lastReadAt) ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{notificationTitle(item)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatDate(item.created_at)}</p>
                    </div>
                  </Link>
                ))}
                {!items.length && <p className="p-4 text-sm text-slate-500">No notifications yet.</p>}
              </div>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>

        {/* Divider */}
        <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

        {/* Profile */}
        <div ref={profileRef} className="relative">
          <button
            ref={profileTriggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((v) => !v)}
            onKeyDown={onProfileTriggerKeyDown}
            className="flex h-9 items-center gap-2 rounded-lg px-2 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <UserAvatar name={displayName} initials={initials} imageUrl={avatarUrl} />
            <div className="hidden text-left md:block">
              <p className="max-w-[120px] truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{displayName}</p>
              <p className="max-w-[120px] truncate text-[11px] text-slate-500 dark:text-slate-400">{displayRole}</p>
            </div>
            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 md:block" />
          </button>

          {profileOpen && (
            <div role="menu" aria-label="User profile menu" className="absolute right-0 top-11 z-50 min-w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-[#121C2B]">
              <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{displayName}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
                <span className="mt-1.5 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">{displayRole}</span>
              </div>
              <div className="p-1.5">
                {profileMenuItems.map((item, index) => (
                  <Link
                    key={item.href}
                    ref={(node) => { profileItemRefs.current[index] = node; }}
                    href={item.href}
                    role="menuitem"
                    tabIndex={0}
                    onClick={() => closeProfileMenu()}
                    onKeyDown={(e) => onProfileMenuKeyDown(e, index)}
                    className="block rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <div className="border-t border-slate-100 p-1.5 dark:border-slate-700">
                <button
                  ref={(node) => { profileItemRefs.current[profileMenuItems.length] = node; }}
                  type="button"
                  role="menuitem"
                  onClick={signOut}
                  onKeyDown={(e) => onProfileMenuKeyDown(e, profileMenuItems.length)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-red-50 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function UserAvatar({ name, initials, imageUrl }: { name: string; initials: string; imageUrl?: string | null }) {
  if (imageUrl) return <img src={imageUrl} alt={`${name} profile`} className="h-9 w-9 rounded-full border border-[#DCE3EA] object-cover dark:border-[#3B4D63]" />;
  if (initials) return <span className="grid h-9 w-9 place-items-center rounded-full bg-[#EAF4FB] text-sm font-bold text-[#0B5E9E] dark:bg-[#B7D9EE] dark:text-[#083F6B]">{initials}</span>;
  return <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-[#667085] dark:bg-[#B7D9EE] dark:text-[#083F6B]"><UserCircle className="h-6 w-6" /></span>;
}

function getInitials(value?: string | null) {
  if (!value) return '';
  const parts = value.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function getAvatarUrl(user: unknown) {
  if (!user || typeof user !== 'object') return null;
  const candidate = user as { avatar_url?: string | null; avatarUrl?: string | null; profile_image_url?: string | null; profileImageUrl?: string | null; image?: string | null };
  return candidate.avatar_url ?? candidate.avatarUrl ?? candidate.profile_image_url ?? candidate.profileImageUrl ?? candidate.image ?? null;
}

const ROLE_LABELS: Record<string, string> = {
  admin:         'System Administrator',
  manager:       'Manager',
  security_team: 'Security Team',
  analyst:       'Analyst',
  viewer:        'Viewer',
};

function formatRole(role?: string) {
  if (!role) return 'User';
  return ROLE_LABELS[role] ?? titleCase(role);
}

function buildSearchResults(data: { projects: Project[]; scans: Scan[]; findings: Finding[]; assets: Asset[]; role?: string }): SearchResult[] {
  const projectById = new Map(data.projects.map((project) => [project.id, project.name]));
  const featureItems = [...navItems.filter((item) => canAccess(data.role, item.roles)), ...quickActions].filter((item, index, rows) => rows.findIndex((candidate) => candidate.href === item.href) === index);
  const featureResults = featureItems.map((item) => ({
    id: item.href,
    title: item.label,
    subtitle: `Open ${item.label}`,
    href: item.href,
    group: 'Feature',
    terms: `${item.label} ${item.href}`,
  }));
  const projectResults = data.projects.map((project) => ({ id: project.id, title: project.name, subtitle: `${titleCase(project.environment)} project - ${titleCase(project.status)}`, href: `/projects/${project.id}`, group: 'Project', terms: `${project.name} ${project.description ?? ''} ${project.environment} ${project.status}` }));
  const assetResults = data.assets.map((asset) => ({ id: asset.id, title: asset.name || asset.value, subtitle: `${titleCase(asset.asset_type)} in ${projectById.get(asset.project_id) ?? 'project'}`, href: `/assets/${asset.id}`, group: 'Asset', terms: `${asset.name ?? ''} ${asset.value} ${asset.asset_type} ${asset.environment ?? ''} ${asset.tags?.join(' ') ?? ''}` }));
  const scanResults = data.scans.map((scan) => ({ id: scan.id, title: scan.name, subtitle: `${titleCase(scan.status)} ${titleCase(scan.scan_category)} scan`, href: `/scans/${scan.id}`, group: 'Scan', terms: `${scan.name} ${scan.status} ${scan.scan_category} ${scan.scan_depth} ${projectById.get(scan.project_id) ?? ''}` }));
  const findingResults = data.findings.map((finding) => ({ id: finding.id, title: finding.title, subtitle: `${titleCase(finding.severity)} finding - ${titleCase(finding.status)}`, href: `/findings/${finding.id}`, group: 'Finding', terms: `${finding.title} ${finding.description ?? ''} ${finding.severity} ${finding.status} ${finding.cwe_id ?? ''} ${finding.owasp_category ?? ''}` }));
  return [...featureResults, ...projectResults, ...assetResults, ...scanResults, ...findingResults];
}

function matchesQuery(item: SearchResult, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return item.group === 'Feature';
  return item.terms.toLowerCase().includes(normalized) || item.title.toLowerCase().includes(normalized) || item.subtitle.toLowerCase().includes(normalized);
}

function isUnread(item: NotificationItem, lastReadAt: string | null) {
  if (!item.created_at) return false;
  if (!lastReadAt) return true;
  return new Date(item.created_at).getTime() > new Date(lastReadAt).getTime();
}

function notificationTitle(item: NotificationItem) {
  if (item.event_type === 'finding' && item.action === 'status_updated') return 'Finding retest status updated';
  if (item.event_type === 'asset_discovery') return 'Asset discovery started';
  if (item.event_type === 'engagement') return `Engagement ${titleCase(item.action)}`;
  if (item.event_type === 'approval' && item.action === 'approval_approved') return 'Security Team approved your scan';
  if (item.event_type === 'approval' && item.action === 'approval_rejected') return 'Security Team rejected your scan';
  if (item.event_type === 'approval') return `Approval ${titleCase(item.action.replace('approval_', ''))}`;
  if (item.event_type === 'scan' && item.action === 'scan_completed') return 'Scan completed — report ready';
  if (item.event_type === 'scan') return `Scan ${titleCase(item.action)}`;
  return `${titleCase(item.event_type)} ${titleCase(item.action)}`;
}

function notificationHref(item: NotificationItem) {
  if (item.scan_id) return item.event_type === 'finding' ? '/retests' : `/scans/${item.scan_id}`;
  if (item.project_id) return `/projects/${item.project_id}`;
  if (item.event_type === 'asset_discovery') return '/assets/discovery';
  if (item.event_type === 'engagement') return '/engagements';
  return '/notifications';
}
