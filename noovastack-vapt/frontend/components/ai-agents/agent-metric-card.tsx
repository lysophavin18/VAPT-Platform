import type { LucideIcon } from 'lucide-react';

export function AgentMetricCard({ label, value, helper, icon: Icon, accent = '#E51C2A', onClick }: { label: string; value: string | number; helper: string; icon: LucideIcon; accent?: string; onClick?: () => void }) {
  return <button onClick={onClick} className="rounded-2xl border border-[#223044] bg-[#0D1928] p-4 text-left shadow-[0_18px_44px_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5 hover:border-[#E51C2A]/60 focus-visible:ring-2 focus-visible:ring-[#E51C2A]"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-[#94A3B8]">{label}</p><p className="mt-3 text-3xl font-bold text-[#F8FAFC]">{value}</p></div><div className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: `${accent}22`, color: accent }}><Icon className="h-5 w-5" /></div></div><p className="mt-3 text-xs font-semibold text-[#94A3B8]">{helper}</p></button>;
}
