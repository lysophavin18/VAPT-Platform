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
  { label: 'API Tokens', href: '/settings/api-tokens' },
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
    <header className="top-navigation relative flex h-16 items-center gap-3 border-b border-[#DCE3EA] bg-white px-4 lg:px-6">
      <button className="grid h-10 w-10 place-items-center rounded-lg text-[#475467] hover:bg-[#F2F6FA] hover:text-[#102033] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5E9E] dark:text-[#94A3B8] dark:hover:bg-[#1A293C] dark:hover:text-[#F1F5F9] dark:focus-visible:outline-[#49A6DF] lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
      <button className="hidden h-10 w-10 place-items-center rounded-lg text-[#475467] hover:bg-[#F2F6FA] hover:text-[#102033] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5E9E] dark:text-[#94A3B8] dark:hover:bg-[#1A293C] dark:hover:text-[#F1F5F9] dark:focus-visible:outline-[#49A6DF] lg:grid" onClick={onCollapse} aria-label="Collapse sidebar"><Menu className="h-5 w-5" /></button>
      <div className="relative flex flex-1">
        <button className="flex w-full items-center gap-2 rounded-lg border border-[#DCE3EA] bg-white px-3 py-2 text-left text-sm text-[#667085] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5E9E] dark:border-[#34455B] dark:bg-[#101927] dark:text-[#7F8DA3] dark:focus:border-[#49A6DF] dark:focus-visible:outline-[rgba(73,166,223,0.25)]" aria-label="Global search" onClick={() => setSearchOpen((value) => !value)}>
          <Search className="h-4 w-4 dark:text-[#94A3B8]" />
          <span className="hidden sm:inline dark:text-[#7F8DA3]">Search projects, assets, scans, findings...</span>
          <kbd className="ml-auto hidden rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-[#182537] dark:text-[#AAB8C9] md:inline">Ctrl K</kbd>
        </button>
        {searchOpen ? <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-[#2A394D] dark:bg-[#121C2B]">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-[#2A394D]">
            <Search className="h-4 w-4 text-slate-400 dark:text-[#94A3B8]" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a project, asset, scan, finding, or feature..." className="w-full bg-transparent text-sm text-[#0B1F3A] outline-none placeholder:text-slate-400 dark:text-[#F1F5F9] dark:placeholder:text-[#7F8DA3]" />
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {searchResults.map((result) => <Link key={`${result.group}-${result.id}`} href={result.href} onClick={() => setSearchOpen(false)} className="block rounded-xl p-3 hover:bg-slate-50 dark:hover:bg-[#1A293C]"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">{result.title}</p><p className="mt-1 text-xs text-slate-500 dark:text-[#B3C0D1]">{result.subtitle}</p></div><span className="rounded-full bg-[#EAF2FF] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#155EEF] dark:bg-[#143A5A] dark:text-[#8CCCF0]">{result.group}</span></div></Link>)}
            {!searchResults.length ? <div className="p-6 text-center text-sm text-slate-600 dark:text-[#B3C0D1]">{query.trim() ? 'No matching results.' : 'Start typing to search across the platform.'}</div> : null}
          </div>
        </div> : null}
      </div>
      <div className="relative ml-1">
        <button className="relative rounded-lg p-2 text-[#475467] hover:bg-[#F2F6FA] hover:text-[#102033] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5E9E] dark:text-[#94A3B8] dark:hover:bg-[#1A293C] dark:hover:text-[#F1F5F9] dark:focus-visible:outline-[#49A6DF]" aria-label="Notifications" onClick={() => setOpen((value) => !value)}>
          <Bell className="h-5 w-5" />
          {unreadCount ? <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#D92D20] px-1 text-[10px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}
        </button>
        {open ? <div className="absolute right-0 top-12 z-50 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-[#2A394D] dark:bg-[#121C2B]">
          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-[#2A394D]"><div><h2 className="font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">Notifications</h2><p className="text-xs text-slate-500 dark:text-[#B3C0D1]">{unreadCount} unread activity update{unreadCount === 1 ? '' : 's'}</p></div><div className="flex gap-3"><button onClick={markAllRead} className="text-xs font-semibold text-slate-600 hover:text-[#155EEF] dark:text-[#B3C0D1] dark:hover:text-[#49A6DF]">Mark read</button><Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-[#155EEF] dark:text-[#49A6DF]">View all</Link></div></div>
          <div className="max-h-96 overflow-y-auto p-2">
            {items.slice(0, 6).map((item) => <Link key={item.id} href={notificationHref(item)} onClick={() => setOpen(false)} className={`block rounded-xl p-3 hover:bg-slate-50 dark:hover:bg-[#1A293C] ${isUnread(item, lastReadAt) ? 'bg-[#EAF2FF]/60 dark:bg-[#143A5A]/60' : ''}`}><div className="flex gap-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isUnread(item, lastReadAt) ? 'bg-[#D92D20]' : 'bg-slate-300 dark:bg-[#566276]'}`} /><div><p className="text-sm font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">{notificationTitle(item)}</p><p className="mt-1 text-xs text-slate-500 dark:text-[#B3C0D1]">{formatDate(item.created_at)}</p></div></div></Link>)}
            {!items.length ? <p className="p-4 text-sm text-slate-600 dark:text-[#B3C0D1]">No notifications yet.</p> : null}
          </div>
        </div> : null}
      </div>
      <button className="rounded-lg p-2 text-[#475467] hover:bg-[#F2F6FA] hover:text-[#102033] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5E9E] dark:text-[#94A3B8] dark:hover:bg-[#1A293C] dark:hover:text-[#F1F5F9] dark:focus-visible:outline-[#49A6DF]" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      <div ref={profileRef} className="relative">
        <button ref={profileTriggerRef} type="button" aria-haspopup="menu" aria-expanded={profileOpen} onClick={() => setProfileOpen((value) => !value)} onKeyDown={onProfileTriggerKeyDown} className="flex min-h-10 items-center gap-2 rounded-lg bg-transparent p-1.5 hover:bg-[#F2F6FA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5E9E] dark:hover:bg-[#1A293C] dark:focus-visible:outline-[#49A6DF] md:px-2">
          <UserAvatar name={displayName} initials={initials} imageUrl={avatarUrl} />
          <span className="hidden min-w-0 text-left md:block">
            <span className="block max-w-[150px] truncate text-sm font-semibold leading-4 text-[#102033] dark:text-[#F1F5F9]">{displayName}</span>
            <span className="block max-w-[150px] truncate text-xs leading-4 text-[#667085] dark:text-[#94A3B8]">{displayRole}</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-[#667085] dark:text-[#94A3B8] md:block" />
        </button>
        {profileOpen ? <div role="menu" aria-label="User profile menu" className="absolute right-0 top-12 z-50 min-w-[240px] overflow-hidden rounded-[10px] border border-[#DCE3EA] bg-white shadow-lg dark:border-[#2A394D] dark:bg-[#121C2B]">
          <div className="border-b border-[#DCE3EA] px-4 py-3 dark:border-[#2A394D]">
            <p className="truncate text-sm font-semibold text-[#102033] dark:text-[#F1F5F9]">{displayName}</p>
            <p className="mt-0.5 truncate text-xs text-[#667085] dark:text-[#B3C0D1]">{user?.email}</p>
            <p className="mt-1 truncate text-xs font-medium text-[#0B5E9E] dark:text-[#8CCCF0]">{displayRole}</p>
          </div>
          <div className="p-1.5">
            {profileMenuItems.map((item, index) => <Link key={item.href} ref={(node) => { profileItemRefs.current[index] = node; }} href={item.href} role="menuitem" tabIndex={0} onClick={() => closeProfileMenu()} onKeyDown={(event) => onProfileMenuKeyDown(event, index)} className="block rounded-md px-3 py-2 text-sm font-medium text-[#102033] hover:bg-[#F2F6FA] hover:text-[#0B5E9E] focus-visible:bg-[#F2F6FA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B5E9E] dark:text-[#DCE5EF] dark:hover:bg-[#1A293C] dark:hover:text-[#49A6DF] dark:focus-visible:bg-[#1A293C] dark:focus-visible:outline-[#49A6DF]">{item.label}</Link>)}
          </div>
          <div className="border-t border-[#DCE3EA] p-1.5 dark:border-[#2A394D]">
            <button ref={(node) => { profileItemRefs.current[profileMenuItems.length] = node; }} type="button" role="menuitem" onClick={signOut} onKeyDown={(event) => onProfileMenuKeyDown(event, profileMenuItems.length)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#102033] hover:bg-red-50 hover:text-[#DC2626] focus-visible:bg-red-50 focus-visible:text-[#DC2626] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B5E9E] dark:text-[#DCE5EF] dark:hover:bg-red-950/40 dark:hover:text-[#DC2626] dark:focus-visible:bg-red-950/40 dark:focus-visible:text-[#DC2626] dark:focus-visible:outline-[#49A6DF]"><LogOut className="h-4 w-4" />Sign Out</button>
          </div>
        </div> : null}
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

function formatRole(role?: string) {
  if (!role) return 'User';
  if (role === 'admin' || role === 'platform_admin') return 'System Administrator';
  return titleCase(role);
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
