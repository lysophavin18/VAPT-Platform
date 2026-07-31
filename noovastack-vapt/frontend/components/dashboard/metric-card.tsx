import { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function MetricCard({ label, value, icon: Icon, description }: { label: string; value: string | number; icon: LucideIcon; description?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[#0B1F3A]">{value}</p>
          {description ? <p className="mt-2 text-xs text-slate-500">{description}</p> : null}
        </div>
        <div className="rounded-xl bg-[#EAF2FF] p-3 text-[#155EEF]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
