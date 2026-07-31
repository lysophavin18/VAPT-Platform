'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, FileClock, Pause, ShieldAlert, Square, UserPlus } from 'lucide-react';
import { EmergencyKillSwitchDialog } from '@/components/ai-agents/emergency-kill-switch-dialog';

export function QuickActionsPanel({ onAction }: { onAction: (action: string, payload?: string) => void }) {
  const [killOpen, setKillOpen] = useState(false);
  function confirm(action: string, message: string) {
    if (window.confirm(message)) onAction(action);
  }
  return <section className="rounded-2xl border border-[#223044] bg-[#0D1928] p-4"><h2 className="font-semibold text-white">Quick Actions</h2><div className="mt-4 grid gap-2"><Action icon={Pause} label="Pause All Automation" onClick={() => confirm('pause-all', 'Pause all Generative AI automation?')} /><Action icon={Square} label="Stop All Tasks" onClick={() => confirm('stop-all', 'Stop all running automation tasks?')} /><Action danger icon={ShieldAlert} label="Emergency Kill Switch" onClick={() => setKillOpen(true)} /><Link href="/audit-logs" className="flex items-center gap-3 rounded-xl border border-[#223044] bg-[#111E2E] p-3 text-sm font-semibold text-white hover:border-[#E51C2A]"><FileClock className="h-4 w-4 text-[#E51C2A]" />Automation Audit Log</Link><Link href="/ai-agents/assign" className="flex items-center gap-3 rounded-xl bg-[#E51C2A] p-3 text-sm font-semibold text-white hover:bg-[#9F1239]"><UserPlus className="h-4 w-4" />Assign Automation</Link></div><EmergencyKillSwitchDialog open={killOpen} onClose={() => setKillOpen(false)} onConfirm={(text) => { onAction('kill-switch', text); setKillOpen(false); }} /></section>;
}

function Action({ icon: Icon, label, onClick, danger = false }: { icon: typeof AlertTriangle; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={`flex items-center gap-3 rounded-xl border p-3 text-left text-sm font-semibold ${danger ? 'border-red-700 bg-red-950/30 text-red-200 hover:bg-red-900/30' : 'border-[#223044] bg-[#111E2E] text-white hover:border-[#E51C2A]'}`}><Icon className="h-4 w-4" />{label}</button>;
}
