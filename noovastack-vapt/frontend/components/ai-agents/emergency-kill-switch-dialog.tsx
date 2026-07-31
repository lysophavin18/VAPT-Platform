'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export function EmergencyKillSwitchDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (text: string) => void }) {
  const [text, setText] = useState('');
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="w-full max-w-lg rounded-2xl border border-red-700 bg-[#0D1928] p-6 shadow-2xl"><div className="flex items-center gap-3 text-red-300"><AlertTriangle className="h-6 w-6" /><h2 className="text-xl font-bold">Emergency Kill Switch</h2></div><p className="mt-4 text-sm leading-6 text-[#CBD5E1]">This action immediately stops all running Generative AI automation tasks, blocks new tasks, revokes active automation credentials, and preserves audit records.</p><p className="mt-4 text-sm font-semibold text-white">Type STOP ALL AUTOMATION to continue.</p><input value={text} onChange={(event) => setText(event.target.value)} className="mt-2 w-full rounded-xl border border-[#223044] bg-[#091522] px-3 py-2 text-white" /><div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="rounded-xl border border-[#223044] px-4 py-2 text-sm font-semibold text-white hover:bg-[#111E2E]">Cancel</button><button disabled={text !== 'STOP ALL AUTOMATION'} onClick={() => onConfirm(text)} className="rounded-xl bg-[#E51C2A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9F1239] disabled:opacity-50">Activate Kill Switch</button></div></div></div>;
}
