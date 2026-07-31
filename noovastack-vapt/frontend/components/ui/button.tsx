import { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

export function Button({ className, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variants: Record<Variant, string> = {
    primary: 'border border-transparent bg-[#0B5E9E] text-white hover:bg-[#083F6B] dark:hover:bg-[#1479B8]',
    secondary: 'bg-[#EAF4FB] text-[#0B5E9E] hover:bg-blue-100 dark:border dark:border-[#3B4D63] dark:bg-transparent dark:text-[#D7E1ED] dark:hover:bg-[#172638]',
    outline: 'border border-slate-300 bg-white text-[#102033] hover:bg-slate-50 dark:border-[#3B4D63] dark:bg-transparent dark:text-[#D7E1ED] dark:hover:bg-[#172638]',
    ghost: 'text-[#102033] hover:bg-slate-100 dark:text-[#D7E1ED] dark:hover:bg-[#172638]',
    danger: 'bg-[#DC2626] text-white hover:bg-red-700',
  };
  return <button className={cn('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50', variants[variant], className)} {...props} />;
}
