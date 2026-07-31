'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { aiAgentsApi } from '@/api/ai-agents';
import { mockAgents } from '@/mocks/ai-agents';

const steps = ['Select Engagement', 'Select Automation', 'Define Objective', 'Permissions and Safety', 'Review and Assign'];

export function AssignAgentWizard() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ project: 'NoovaStack Test Scan', engagement: 'ENG-2025-041', authorization: 'Authorized', testingWindow: '00:00-23:59', scope: 'Valid', agentId: '', taskName: '', objective: '', inputReferences: '', expectedOutput: '', priority: 'Medium', risk: 'Low' });
  const checksPass = form.authorization === 'Authorized' && form.scope === 'Valid' && Boolean(form.agentId && form.taskName && form.objective);
  const assign = useMutation({ mutationFn: () => aiAgentsApi.assignAgent(form), onSuccess: () => toast.success('Automation assigned'), onError: (error) => toast.error(error instanceof Error ? error.message : 'Assignment failed') });

  return <div className="rounded-2xl border border-[#223044] bg-[#0D1928] p-6">
    <div className="grid gap-2 md:grid-cols-5">{steps.map((label, index) => <div key={label} className={`rounded-xl border p-3 text-xs font-semibold ${index === step ? 'border-[#E51C2A] bg-[#E51C2A]/10 text-red-200' : index < step ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-[#223044] text-[#64748B]'}`}>{index + 1}. {label}</div>)}</div>
    <div className="mt-6 text-white">
      {step === 0 ? <Panel title="Select Engagement"><Field label="Project" value={form.project} onChange={(value) => setForm({ ...form, project: value })} /><Field label="Engagement" value={form.engagement} onChange={(value) => setForm({ ...form, engagement: value })} /><Summary label="Authorization status" value={form.authorization} /><Summary label="Testing window" value={form.testingWindow} /><Summary label="Scope status" value={form.scope} /></Panel> : null}
      {step === 1 ? <Panel title="Select Automation"><div className="grid gap-3 md:grid-cols-2">{mockAgents.map((agent) => <button key={agent.id} onClick={() => setForm({ ...form, agentId: agent.id })} className={`rounded-xl border p-4 text-left ${form.agentId === agent.id ? 'border-[#E51C2A] bg-[#E51C2A]/10' : 'border-[#223044] bg-[#111E2E]'}`}><p className="font-semibold">{agent.name}</p><p className="mt-1 text-xs text-[#94A3B8]">{agent.purpose}</p></button>)}</div></Panel> : null}
      {step === 2 ? <Panel title="Define Objective"><Field label="Task name" value={form.taskName} onChange={(value) => setForm({ ...form, taskName: value })} /><Area label="Task objective" value={form.objective} onChange={(value) => setForm({ ...form, objective: value })} /><Area label="Input references" value={form.inputReferences} onChange={(value) => setForm({ ...form, inputReferences: value })} /><Field label="Expected output" value={form.expectedOutput} onChange={(value) => setForm({ ...form, expectedOutput: value })} /><SelectField label="Priority" value={form.priority} options={['Low', 'Medium', 'High']} onChange={(value) => setForm({ ...form, priority: value })} /><SelectField label="Risk" value={form.risk} options={['Low', 'Medium', 'High', 'Critical']} onChange={(value) => setForm({ ...form, risk: value })} /></Panel> : null}
      {step === 3 ? <Panel title="Permissions and Safety"><Summary label="Scope control" value="Engagement scoped" /><Summary label="Tool policy" value="Safe platform tools only" /><Summary label="Data access" value="Project evidence only" /><Summary label="Safety controls" value="Automation safety Top 10 enforced" /></Panel> : null}
      {step === 4 ? <Panel title="Review and Assign"><Summary label="Automation" value={mockAgents.find((agent) => agent.id === form.agentId)?.name ?? 'Not selected'} /><Summary label="Task" value={form.taskName || 'Missing'} /><Summary label="Objective" value={form.objective || 'Missing'} /><Summary label="Ready" value={checksPass ? 'Yes' : 'Complete required fields'} /></Panel> : null}
    </div>
    <div className="mt-6 flex justify-between"><button disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))} className="rounded-xl border border-[#223044] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Back</button>{step < steps.length - 1 ? <button onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))} className="rounded-xl bg-[#E51C2A] px-4 py-2 text-sm font-semibold text-white">Next</button> : <button disabled={!checksPass || assign.isPending} onClick={() => assign.mutate()} className="rounded-xl bg-[#E51C2A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Assign Automation</button>}</div>
  </div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <div><h2 className="mb-4 text-xl font-bold">{title}</h2><div className="grid gap-4 md:grid-cols-2">{children}</div></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm font-semibold text-[#CBD5E1]"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-[#223044] bg-[#091522] px-3 py-2 text-white" /></label>; }
function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm font-semibold text-[#CBD5E1]"><span>{label}</span><textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-[#223044] bg-[#091522] px-3 py-2 text-white" /></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="text-sm font-semibold text-[#CBD5E1]"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-[#223044] bg-[#091522] px-3 py-2 text-white">{options.map((item) => <option key={item}>{item}</option>)}</select></label>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[#223044] bg-[#111E2E] p-3"><p className="text-xs uppercase tracking-wide text-[#64748B]">{label}</p><p className="mt-1 text-sm font-semibold text-white">{value}</p></div>; }
