import { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function EmptyState({ icon: Icon, title, description, action, href }: { icon: LucideIcon; title: string; description: string; action?: string; href?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <Icon className="mx-auto h-10 w-10 text-[#155EEF]" aria-hidden="true" />
      <h3 className="mt-4 text-lg font-semibold text-[#0B1F3A]">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">{description}</p>
      {action && href ? <Link href={href}><Button className="mt-5">{action}</Button></Link> : null}
    </div>
  );
}
