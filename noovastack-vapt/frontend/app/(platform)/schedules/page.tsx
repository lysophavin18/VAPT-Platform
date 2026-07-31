'use client';

import { CalendarClock, Plus } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { useCreateSchedule, useSchedules } from '@/hooks/use-schedules';
import { useProjects } from '@/hooks/use-projects';
import { formatDate, titleCase } from '@/lib/utils';
import type { ScanSchedule } from '@/types';
import { useState } from 'react';

export default function SchedulesPage() {
  const schedules = useSchedules();
  const projects = useProjects();
  const create = useCreateSchedule();
  const [form, setForm] = useState({ name: '', project_id: '', recurrence_rule: 'weekly', scan_category: 'website', scan_depth: 'standard' });
  return <><PageHeader title="Schedules" description="Calendar, upcoming scans, recurring scans, and run history with blocked-run explanations." /><div className="grid gap-6 xl:grid-cols-[420px_1fr]"><Card className="p-6"><h2 className="font-semibold">Create Schedule</h2><div className="mt-4 space-y-4"><Field label="Schedule name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="Project"><Select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}><option value="">Choose project</option>{projects.data?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field><Field label="Recurrence"><Select value={form.recurrence_rule} onChange={(e) => setForm({ ...form, recurrence_rule: e.target.value })}><option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Select></Field><Field label="Start time"><Input type="datetime-local" /></Field><Field label="Testing window"><Input placeholder="22:00-04:00 UTC" /></Field><Button onClick={() => create.mutate({ ...form, assessment_mode: 'black_box', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, status: 'active' })} disabled={!form.name || !form.project_id}><Plus className="h-4 w-4" /> Save Schedule</Button></div></Card><div><div className="mb-5 grid gap-3 md:grid-cols-3">{['Month View', 'Week View', 'List View'].map((view) => <Card key={view} className="p-4 text-sm font-semibold text-[#0B1F3A]">{view}</Card>)}</div><DataTable<ScanSchedule> data={schedules.data ?? []} empty={<EmptyState icon={CalendarClock} title="No schedules yet" description="Create weekly, daily, monthly, deployment-triggered, or custom scan schedules with testing windows." />} columns={[{ key: 'name', header: 'Schedule', render: (schedule) => schedule.name }, { key: 'project', header: 'Project', render: (schedule) => schedule.project_id }, { key: 'next', header: 'Next Run', render: (schedule) => formatDate(schedule.next_run_at) }, { key: 'frequency', header: 'Frequency', render: (schedule) => titleCase(schedule.recurrence_rule) }, { key: 'profile', header: 'Scan Profile', render: (schedule) => `${titleCase(schedule.scan_category)} / ${titleCase(schedule.scan_depth)}` }, { key: 'status', header: 'Status', render: (schedule) => <StatusBadge value={schedule.status} /> }]} /></div></div></>;
}
