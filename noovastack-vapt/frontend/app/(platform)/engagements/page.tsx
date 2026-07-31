'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, Field, Input, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { useProjects } from '@/hooks/use-projects';
import { useEngagementActions, useEngagements } from '@/hooks/use-engagements';
import { formatDate, titleCase } from '@/lib/utils';

export default function EngagementsPage() {
  const projects = useProjects();
  const [projectId, setProjectId] = useState('');
  const [form, setForm] = useState({ name: '', assessment_mode: 'black_box', testing_window_start: '22:00', testing_window_end: '04:00', rules_of_engagement: 'Safe, non-destructive testing only. No brute force, denial-of-service, or credential attacks.' });
  const engagements = useEngagements(projectId);
  const actions = useEngagementActions(projectId);

  useEffect(() => {
    if (!projectId && projects.data?.[0]?.id) setProjectId(projects.data[0].id);
  }, [projectId, projects.data]);

  async function create() {
    if (!projectId || !form.name.trim()) return toast.error('Choose a project and engagement name');
    await actions.mutateAsync({ action: 'create', payload: form });
    toast.success('Engagement created');
    setForm({ ...form, name: '' });
  }

  async function runAction(action: 'authorize' | 'close', id: string) {
    await actions.mutateAsync({ action, id });
    toast.success(action === 'authorize' ? 'Engagement authorized' : 'Engagement closed');
  }

  return <>
    <PageHeader title="Engagements" description="Group project assessments by authorization, testing window, scope, scans, reports, and audit history." />
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="font-semibold">Assessment Mode</h2>
          <div className="mt-4 grid gap-3">
            {[['black_box', 'Black Box', 'Public target testing with no source-code access.'], ['gray_box', 'Gray Box', 'Testing with limited credentials or architecture context.'], ['white_box', 'White Box', 'Testing with source code, documentation, or internal details.']].map(([id, title, description]) => <button key={id} onClick={() => setForm({ ...form, assessment_mode: id })} className={`rounded-2xl border p-4 text-left ${form.assessment_mode === id ? 'border-[#155EEF] bg-[#EAF2FF]' : 'border-slate-200 bg-white'}`}><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-slate-600">{description}</p></button>)}
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Create Engagement</h2>
          <div className="mt-4 space-y-4">
            <Field label="Project"><Select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Choose project</option>{projects.data?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field>
            <Field label="Engagement name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Q3 Web Application Assessment" /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Window start"><Input value={form.testing_window_start} onChange={(event) => setForm({ ...form, testing_window_start: event.target.value })} /></Field><Field label="Window end"><Input value={form.testing_window_end} onChange={(event) => setForm({ ...form, testing_window_end: event.target.value })} /></Field></div>
            <Field label="Rules of engagement"><Textarea value={form.rules_of_engagement} onChange={(event) => setForm({ ...form, rules_of_engagement: event.target.value })} /></Field>
            <Button onClick={create} disabled={actions.isPending || !projectId || !form.name.trim()}><ShieldCheck className="h-4 w-4" /> Save Engagement</Button>
          </div>
        </Card>
      </div>
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Project Engagements</h2><p className="mt-1 text-sm text-slate-600">Authorize active test windows and close completed work.</p></div><Button variant="outline" onClick={() => engagements.refetch()} disabled={!projectId || engagements.isFetching}>{engagements.isFetching ? 'Refreshing...' : 'Refresh'}</Button></div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500"><tr><th className="py-2">Name</th><th>Mode</th><th>Authorization</th><th>Status</th><th>Window</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>{(engagements.data ?? []).map((engagement) => <tr key={engagement.id} className="border-t border-slate-100"><td className="py-3 font-semibold text-[#0B1F3A]">{engagement.name}</td><td>{titleCase(engagement.assessment_mode)}</td><td><StatusBadge value={engagement.authorization_status} /></td><td><StatusBadge value={engagement.status} /></td><td>{engagement.testing_window_start ?? 'n/a'}-{engagement.testing_window_end ?? 'n/a'}</td><td>{formatDate(engagement.created_at)}</td><td><div className="flex gap-2"><Button variant="secondary" onClick={() => runAction('authorize', engagement.id)} disabled={actions.isPending || engagement.authorization_status === 'authorized'}>Authorize</Button><Button variant="outline" onClick={() => runAction('close', engagement.id)} disabled={actions.isPending || engagement.status === 'closed'}>Close</Button></div></td></tr>)}</tbody>
          </table>
        </div>
        {projectId && !engagements.isLoading && !engagements.data?.length ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No engagements for this project yet.</p> : null}
      </Card>
    </div>
  </>;
}
