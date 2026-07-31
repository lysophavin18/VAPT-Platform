'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConfirmationDialog({ title, description, confirmLabel, requireText, onConfirm, danger = false }: { title: string; description: string; confirmLabel: string; requireText?: string; onConfirm: () => void; danger?: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const disabled = Boolean(requireText && typed !== requireText);
  return (
    <>
      <Button variant={danger ? 'danger' : 'outline'} onClick={() => setOpen(true)}>{confirmLabel}</Button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex gap-3">
              <AlertTriangle className={danger ? 'h-6 w-6 text-[#D92D20]' : 'h-6 w-6 text-[#F5A524]'} />
              <div>
                <h2 id="confirm-title" className="text-lg font-semibold text-[#0B1F3A]">{title}</h2>
                <p className="mt-2 text-sm text-slate-600">{description}</p>
              </div>
            </div>
            {requireText ? (
              <label className="mt-4 block text-sm font-medium text-[#0B1F3A]">
                Type {requireText} to continue
                <input value={typed} onChange={(event) => setTyped(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant={danger ? 'danger' : 'primary'} disabled={disabled} onClick={() => { onConfirm(); setOpen(false); }}>{confirmLabel}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
