import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { ProgressBar } from '@/components/ui/progress';
import type { ScanModule } from '@/types';
import { titleCase } from '@/lib/utils';

export function ModuleTimeline({ modules }: { modules: ScanModule[] }) {
  return (
    <div className="space-y-3">
      {modules.map((module, index) => {
        const done = module.status === 'completed';
        const running = module.status === 'running';
        const Icon = done ? CheckCircle2 : running ? Loader2 : Clock;
        return (
          <div key={`${module.module_name ?? module.name}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <Icon className={running ? 'mt-0.5 h-5 w-5 animate-spin text-[#155EEF]' : done ? 'mt-0.5 h-5 w-5 text-[#17A673]' : 'mt-0.5 h-5 w-5 text-slate-400'} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-[#0B1F3A]">{titleCase(module.module_name ?? module.name)}</h3>
                  <span className="text-xs text-slate-500">{titleCase(module.status)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{module.short_description ?? 'NoovaStack is processing this stage with safe platform defaults.'}</p>
                <div className="mt-3"><ProgressBar value={module.progress ?? (done ? 100 : running ? 55 : 0)} /></div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
