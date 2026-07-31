'use client';

import { Bell, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api-client';
import { formatDate, titleCase } from '@/lib/utils';

interface NotificationItem { id: string; event_type: string; action: string; created_at?: string | null; scan_id?: string | null; project_id?: string | null; engagement_id?: string | null; details?: Record<string, unknown> }

const LAST_READ_KEY = 'noovastack.notifications.lastReadAt';

export default function NotificationsPage() {
  const { token } = useAuth();
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => api.dashboardActivity(token) as Promise<NotificationItem[]>, enabled: Boolean(token), refetchInterval: 30000 });
  const items = notifications.data ?? [];
  const unreadCount = useMemo(() => items.filter((item) => isUnread(item, lastReadAt)).length, [items, lastReadAt]);

  useEffect(() => {
    setLastReadAt(window.localStorage.getItem(LAST_READ_KEY));
  }, []);

  function markAllRead() {
    const value = new Date().toISOString();
    window.localStorage.setItem(LAST_READ_KEY, value);
    setLastReadAt(value);
  }

  return <>
    <PageHeader title="Notifications" description="Recent platform activity from scans, reports, asset discovery, engagements, and retests." actions={<><Button variant="outline" onClick={markAllRead} disabled={!items.length}>Mark All Read</Button><Button variant="outline" onClick={() => notifications.refetch()} disabled={notifications.isFetching}>{notifications.isFetching ? 'Refreshing...' : 'Refresh'}</Button></>} />
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="p-4"><p className="text-sm text-slate-600">Total Notifications</p><p className="mt-2 text-3xl font-bold text-[#0B1F3A]">{items.length}</p></Card>
      <Card className="p-4"><p className="text-sm text-slate-600">Unread</p><p className="mt-2 text-3xl font-bold text-[#D92D20]">{unreadCount}</p></Card>
      <Card className="p-4"><p className="text-sm text-slate-600">Latest Event</p><p className="mt-2 text-lg font-semibold text-[#0B1F3A]">{items[0] ? titleCase(items[0].event_type) : 'None'}</p></Card>
    </div>
    <Card className="mt-6 p-6">
      <h2 className="font-semibold text-[#0B1F3A]">Activity Feed</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => <Link key={item.id} href={notificationHref(item)} className={`flex gap-3 rounded-2xl border p-4 transition hover:border-[#155EEF] hover:bg-[#EAF2FF]/50 ${isUnread(item, lastReadAt) ? 'border-blue-200 bg-[#EAF2FF]/60' : 'border-slate-200 bg-white'}`}><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#155EEF]"><Bell className="h-5 w-5" /></div><div><p className="font-semibold text-[#0B1F3A]">{notificationTitle(item)}</p><p className="mt-1 text-sm text-slate-500">{formatDate(item.created_at)}</p>{item.details && Object.keys(item.details).length ? <p className="mt-2 text-xs text-slate-500">{Object.entries(item.details).slice(0, 2).map(([key, value]) => `${titleCase(key)}: ${String(value)}`).join(' | ')}</p> : null}</div></Link>)}
        {!items.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No notifications yet. Platform events will appear here automatically.</p> : null}
      </div>
    </Card>
  </>;
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
