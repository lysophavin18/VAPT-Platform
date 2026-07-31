export function ProgressBar({ value, label }: { value?: number; label?: string }) {
  const safeValue = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="space-y-1" aria-label={label ?? `Progress ${safeValue}%`}>
      <div className="flex items-center justify-between text-xs text-slate-600">
        {label ? <span>{label}</span> : <span>Progress</span>}
        <span>{safeValue}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-[#0B5E9E] transition-all" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}
