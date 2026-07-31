import Link from 'next/link';
import { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function AuthInfoPage({ icon: Icon, title, description, action, href }: { icon: LucideIcon; title: string; description: string; action: string; href: string }) {
  return (
    <Card className="mx-auto w-full max-w-md p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#EAF2FF] text-[#155EEF]"><Icon className="h-7 w-7" /></div>
      <h1 className="mt-5 text-2xl font-bold text-[#0B1F3A]">{title}</h1>
      <p className="mt-3 text-sm text-slate-600">{description}</p>
      <Link href={href}><Button className="mt-6">{action}</Button></Link>
    </Card>
  );
}
