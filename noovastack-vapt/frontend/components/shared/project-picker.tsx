'use client';

import { useState } from 'react';
import { CheckCircle, FolderKanban, Search } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { titleCase } from '@/lib/utils';
import type { Project } from '@/types';

export function ProjectPicker({ projects, value, onChange }: { projects: Project[]; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = projects.find((project) => project.id === value);
  const filtered = projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <label className="block text-sm font-medium text-[#102033] dark:text-[#F1F5F9]">Project</label>
      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={open ? query : (selected?.name ?? '')}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects by name"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-[#102033] placeholder:text-slate-400 focus:border-[#0B5E9E] dark:border-[#2A394D] dark:bg-[#101927] dark:text-[#F1F5F9]"
        />
      </div>
      {open ? (
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5 dark:border-[#2A394D]">
          {filtered.length ? filtered.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => { onChange(project.id); setOpen(false); setQuery(''); }}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition ${value === project.id ? 'bg-[#EAF2FF] ring-1 ring-[#155EEF] dark:bg-[#172638]' : 'hover:bg-slate-50 dark:hover:bg-[#172638]'}`}
            >
              <div className="flex items-center gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EAF2FF] text-[#155EEF] dark:bg-[#101927]"><FolderKanban className="h-4 w-4" /></div>
                <div>
                  <p className="text-sm font-semibold text-[#0B1F3A] dark:text-[#F1F5F9]">{project.name}</p>
                  <p className="text-xs text-slate-500">{titleCase(project.environment)} &middot; {project.asset_count ?? 0} asset{project.asset_count === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge value={project.status} />
                {value === project.id ? <CheckCircle className="h-4 w-4 text-[#155EEF]" /> : null}
              </div>
            </button>
          )) : <p className="p-3 text-sm text-slate-500">No projects match &quot;{query}&quot;.</p>}
        </div>
      ) : null}
    </div>
  );
}
