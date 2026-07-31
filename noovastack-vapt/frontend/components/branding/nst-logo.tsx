'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { BRAND } from '@/lib/branding';
import { cn } from '@/lib/utils';

type NstLogoProps = {
  variant?: 'full' | 'mark' | 'white';
  className?: string;
  markClassName?: string;
  showTextFallback?: boolean;
};

export function NstLogo({ variant = 'mark', className, markClassName, showTextFallback = true }: NstLogoProps) {
  const [missing, setMissing] = useState(false);
  const src = BRAND.assets[variant];

  if (!missing) {
    return (
      <img
        src={src}
        alt={BRAND.logoAlt}
        className={cn('block object-contain', className)}
        onError={() => setMissing(true)}
      />
    );
  }

  if (!showTextFallback) return null;

  return (
    <div className={cn('flex items-center gap-3', className)} aria-label={BRAND.logoAlt} role="img">
      <div className={cn('grid h-10 w-10 place-items-center rounded-xl bg-[#0B5E9E] text-white', markClassName)}>
        <ShieldCheck className="h-5 w-5" />
      </div>
      {variant !== 'mark' ? <div className="text-left leading-tight"><p className="font-bold text-[#102033]">NST</p><p className="text-xs text-slate-500">{BRAND.companyName}</p></div> : null}
    </div>
  );
}
