import { cn, titleCase } from '@/lib/utils';

const severityClass: Record<string, string> = {
  critical: 'bg-red-50 text-[#DC2626] border-red-200 dark:bg-[rgba(239,68,68,0.14)] dark:text-[#F87171] dark:border-transparent',
  high: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-[rgba(249,115,22,0.14)] dark:text-[#FB923C] dark:border-transparent',
  medium: 'bg-amber-50 text-[#B76E00] border-amber-200 dark:bg-[rgba(245,158,11,0.14)] dark:text-[#FBBF24] dark:border-transparent',
  low: 'bg-green-50 text-[#17A673] border-green-200 dark:bg-[rgba(34,197,94,0.14)] dark:text-[#4ADE80] dark:border-transparent',
  informational: 'bg-blue-50 text-[#0B5E9E] border-blue-200 dark:bg-[rgba(59,130,246,0.14)] dark:text-[#60A5FA] dark:border-transparent',
  info: 'bg-blue-50 text-[#0B5E9E] border-blue-200 dark:bg-[rgba(59,130,246,0.14)] dark:text-[#60A5FA] dark:border-transparent',
};

const statusClass: Record<string, string> = {
  running: 'bg-blue-50 text-[#0B5E9E] border-blue-200 dark:bg-[rgba(59,130,246,0.14)] dark:text-[#60A5FA] dark:border-transparent',
  completed: 'bg-green-50 text-[#17A673] border-green-200 dark:bg-[rgba(34,197,94,0.14)] dark:text-[#4ADE80] dark:border-transparent',
  active: 'bg-green-50 text-[#17A673] border-green-200 dark:bg-[rgba(34,197,94,0.14)] dark:text-[#4ADE80] dark:border-transparent',
  approved: 'bg-green-50 text-[#17A673] border-green-200 dark:bg-[rgba(34,197,94,0.14)] dark:text-[#4ADE80] dark:border-transparent',
  verified: 'bg-green-50 text-[#17A673] border-green-200 dark:bg-[rgba(34,197,94,0.14)] dark:text-[#4ADE80] dark:border-transparent',
  ok: 'bg-green-50 text-[#17A673] border-green-200 dark:bg-[rgba(34,197,94,0.14)] dark:text-[#4ADE80] dark:border-transparent',
  healthy: 'bg-green-50 text-[#17A673] border-green-200 dark:bg-[rgba(34,197,94,0.14)] dark:text-[#4ADE80] dark:border-transparent',
  warning: 'bg-amber-50 text-[#B76E00] border-amber-200 dark:bg-[rgba(245,158,11,0.14)] dark:text-[#FBBF24] dark:border-transparent',
  failed: 'bg-red-50 text-[#DC2626] border-red-200 dark:bg-[rgba(239,68,68,0.14)] dark:text-[#F87171] dark:border-transparent',
  critical: 'bg-red-50 text-[#DC2626] border-red-200 dark:bg-[rgba(239,68,68,0.14)] dark:text-[#F87171] dark:border-transparent',
  blocked: 'bg-red-50 text-[#DC2626] border-red-200 dark:bg-[rgba(239,68,68,0.14)] dark:text-[#F87171] dark:border-transparent',
  rejected: 'bg-red-50 text-[#DC2626] border-red-200 dark:bg-[rgba(239,68,68,0.14)] dark:text-[#F87171] dark:border-transparent',
  pending: 'bg-amber-50 text-[#B76E00] border-amber-200 dark:bg-[rgba(245,158,11,0.14)] dark:text-[#FBBF24] dark:border-transparent',
  pending_approval: 'bg-amber-50 text-[#B76E00] border-amber-200 dark:bg-[rgba(245,158,11,0.14)] dark:text-[#FBBF24] dark:border-transparent',
  draft: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-[#162233] dark:text-[#B3C0D1] dark:border-[#2A394D]',
};

const labelOverride: Record<string, string> = {
  pending_approval: 'Pending Review',
  approval_required: 'Review Required',
  no_approval_required: 'Standard',
};

export function Badge({ value, kind = 'status', className }: { value?: string | null; kind?: 'status' | 'severity' | 'risk' | 'integrity'; className?: string }) {
  const normalized = (value ?? 'unknown').toLowerCase();
  const classes = kind === 'severity' ? severityClass[normalized] : statusClass[normalized];
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold', classes ?? 'bg-slate-50 text-slate-600 border-slate-200', className)}>{labelOverride[normalized] ?? titleCase(value)}</span>;
}

export const SeverityBadge = ({ value }: { value?: string | null }) => <Badge value={value} kind="severity" />;
export const StatusBadge = ({ value }: { value?: string | null }) => <Badge value={value} kind="status" />;
export const IntegrityBadge = ({ value }: { value?: string | null }) => <Badge value={value} kind="integrity" />;
export const RiskBadge = ({ value }: { value?: string | null }) => <Badge value={value} kind="risk" />;
