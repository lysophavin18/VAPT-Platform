'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Boxes, Plus, Radar, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/feedback/empty-state';
import { ProjectPicker } from '@/components/shared/project-picker';
import { useProjects } from '@/hooks/use-projects';
import { useAssetGroupActions, useAssetGroups } from '@/hooks/use-asset-groups';
import { formatDate } from '@/lib/utils';
import type { AssetGroupTarget } from '@/types';

export default function AssetGroupsPage() {
  const search = useSearchParams();
  const projects = useProjects();
  const [projectId, setProjectId] = useState(search.get('project') ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetsText, setTargetsText] = useState('');

  const groups = useAssetGroups(projectId);
  const actions = useAssetGroupActions(projectId);

  useEffect(() => {
    if (!projectId && projects.data?.[0]?.id) {
      setProjectId(projects.data[0].id);
    }
  }, [projectId, projects.data]);

  function parseTargets(text: string): AssetGroupTarget[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((value) => ({ value, type: inferType(value) }));
  }

  async function createGroup() {
    if (!projectId || !name.trim()) {
      toast.error('Choose a project and name the group');
      return;
    }
    const targets = parseTargets(targetsText);
    try {
      await actions.create.mutateAsync({ name: name.trim(), description: description.trim() || undefined, targets });
      toast.success('Asset group created');
      setName('');
      setDescription('');
      setTargetsText('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create asset group');
    }
  }

  async function registerAssets(groupId: string) {
    try {
      const result = await actions.registerAssets.mutateAsync(groupId);
      toast.success(result.created.length ? `${result.created.length} new asset(s) added for review` : 'All targets are already registered as assets');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to register assets');
    }
  }

  async function removeGroup(groupId: string) {
    try {
      await actions.remove.mutateAsync(groupId);
      toast.success('Asset group deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete asset group');
    }
  }

  return <>
    <PageHeader
      title="Asset Groups"
      description="Create and manage saved bundles of domains and IP ranges. Grouping doesn't change scope by itself — register a group's targets when you're ready to bring them into review."
      breadcrumbs={[{ href: '/assets', label: 'Assets' }, { label: 'Groups' }]}
    />
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Groups</h2>
        <p className="mt-1 text-sm text-slate-600">{projectId ? `${groups.data?.length ?? 0} group(s) in this project` : 'Choose a project to see its groups'}</p>
        <div className="mt-5 space-y-3">
          {(groups.data ?? []).map((group) => (
            <div key={group.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#0B1F3A]">{group.name}</p>
                  {group.description ? <p className="mt-1 text-sm text-slate-600">{group.description}</p> : null}
                  <p className="mt-2 text-xs text-slate-500">{group.targets.length} target{group.targets.length === 1 ? '' : 's'} &middot; Created {formatDate(group.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => registerAssets(group.id)} disabled={actions.registerAssets.isPending}>
                    <Radar className="h-4 w-4" /> Register as assets
                  </Button>
                  <Button variant="outline" onClick={() => removeGroup(group.id)} disabled={actions.remove.isPending}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {group.targets.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.targets.slice(0, 12).map((target) => (
                    <span key={target.value} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">{target.value}</span>
                  ))}
                  {group.targets.length > 12 ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">+{group.targets.length - 12} more</span> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {!projectId ? <div className="mt-4"><EmptyState icon={Boxes} title="Choose a project" description="Pick a project on the right to view or create its asset groups." /></div> : null}
        {projectId && !groups.isLoading && !(groups.data ?? []).length ? (
          <div className="mt-4"><EmptyState icon={Boxes} title="No asset groups yet" description="Create a group to organize domains or IP ranges you plan to bring into scope together." /></div>
        ) : null}
      </Card>
      <Card className="p-6">
        <h2 className="font-semibold">New Group</h2>
        <div className="mt-4 space-y-4">
          <ProjectPicker projects={projects.data ?? []} value={projectId} onChange={setProjectId} />
          <Field label="Group name">
            <Input placeholder="e.g. Marketing sites" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Description (optional)">
            <Input placeholder="What is this group for?" value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Field label="Domains or IP ranges">
            <Textarea
              rows={6}
              placeholder={'One per line, e.g.\nexample.com\n198.51.100.0/24\n203.0.113.5'}
              value={targetsText}
              onChange={(event) => setTargetsText(event.target.value)}
            />
          </Field>
          <Button className="w-full" onClick={createGroup} disabled={actions.create.isPending}>
            <Plus className="h-4 w-4" /> Create Group
          </Button>
        </div>
      </Card>
    </div>
  </>;
}

function inferType(value: string): string {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return 'public_ip';
  if (value.includes('/')) return 'cidr';
  if (value.startsWith('http://') || value.startsWith('https://')) return 'website_url';
  return 'root_domain';
}
