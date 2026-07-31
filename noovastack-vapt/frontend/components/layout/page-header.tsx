import Link from 'next/link';
import { ReactNode } from 'react';

export function PageHeader({ title, description, actions, breadcrumbs }: { title: string; description?: string; actions?: ReactNode; breadcrumbs?: { href?: string; label: string }[] }) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {breadcrumbs ? <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-500" aria-label="Breadcrumbs">{breadcrumbs.map((crumb, index) => <span key={`${crumb.label}-${index}`}>{crumb.href ? <Link href={crumb.href} className="hover:text-[#155EEF]">{crumb.label}</Link> : crumb.label}{index < breadcrumbs.length - 1 ? <span className="mx-1">/</span> : null}</span>)}</nav> : null}
        <h1 className="text-2xl font-bold tracking-tight text-[#0B1F3A] dark:text-[#F1F5F9] sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-[#94A3B8]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
