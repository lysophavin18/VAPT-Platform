import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#102033] placeholder:text-slate-400 focus:border-[#0B5E9E] dark:border-[#2A394D] dark:bg-[#101927] dark:text-[#F1F5F9] dark:placeholder:text-[#7F8DA3] dark:focus:border-[#49A6DF]', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#102033] placeholder:text-slate-400 focus:border-[#0B5E9E] dark:border-[#2A394D] dark:bg-[#101927] dark:text-[#F1F5F9] dark:placeholder:text-[#7F8DA3] dark:focus:border-[#49A6DF]', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#102033] focus:border-[#0B5E9E] dark:border-[#2A394D] dark:bg-[#101927] dark:text-[#F1F5F9] dark:focus:border-[#49A6DF]', className)} {...props} />;
}

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-[#102033]">
      <span>{label}</span>
      {children}
      {error ? <span className="block text-xs text-[#DC2626]">{error}</span> : null}
    </label>
  );
}
